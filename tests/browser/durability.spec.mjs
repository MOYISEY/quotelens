import { test, expect, basket, cleanStart, importBasket, files, editSupplier, downloadFile, screenshot, expectNoOverflow } from './helpers.mjs';

test('native Web Locks: second tab is read only; takeover loads fresh state without stale writes', async ({ page, context }) => {
  await cleanStart(page); await importBasket(page);
  const second = await context.newPage(); await second.goto('/');
  await expect(second.getByTestId('save-status')).toHaveAttribute('data-mode', 'readonly');
  await expect(second.locator('#storage-notice')).toContainText('Another tab is editing QuoteLens');
  await expect(second.getByRole('button', { name: 'New basket', exact: true })).toBeDisabled();
  await second.getByRole('button', { name: 'Items & quotes', exact: true }).click();
  await expect(second.getByRole('textbox', { name: 'Comparison name', exact: true })).toBeDisabled();
  await files(second); await expect(second.locator('#file-input')).toBeDisabled();

  await editSupplier(page, 'box');
  await page.getByRole('textbox', { name: 'Comparison name', exact: true }).fill('A_LATEST_NATIVE');
  await expect(page.getByTestId('save-status')).toHaveText('Saved in this browser');
  await expect.poll(() => second.evaluate(() => JSON.parse(localStorage.getItem('quotelens.v1')).title)).toBe('A_LATEST_NATIVE');
  await page.close();
  await second.getByRole('button', { name: 'Try editing here', exact: true }).click();
  await expect(second.getByTestId('save-status')).toHaveAttribute('data-mode', 'writer');
  await second.getByRole('button', { name: 'Items & quotes', exact: true }).click();
  const name = second.getByRole('textbox', { name: 'Comparison name', exact: true });
  await expect(name).toHaveValue('A_LATEST_NATIVE');
  await expect.poll(() => second.evaluate(() => JSON.parse(localStorage.getItem('quotelens.v1')).title)).toBe('A_LATEST_NATIVE');
  await name.fill('B_AFTER_NATIVE_TAKEOVER');
  await expect.poll(() => second.evaluate(() => JSON.parse(localStorage.getItem('quotelens.v1')).title)).toBe('B_AFTER_NATIVE_TAKEOVER');
});

test('no Web Locks: explicit memory mode exports its work and never writes localStorage', async ({ page, context }, info) => {
  await context.addInitScript(() => { Object.defineProperty(navigator, 'locks', { value: undefined }); });
  await page.goto('/');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-mode', 'unsupported');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New basket', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Work without autosave', exact: true }).click();
  await importBasket(page);
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  expect(await page.evaluate(() => localStorage.getItem('quotelens.v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('quotelens.previous.v1'))).toBeNull();
  await files(page);
  const backup = await downloadFile(page, info, 'Download JSON', 'quotelens-backup.json');
  expect(JSON.parse(backup.text)).toEqual(basket);
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
});

test('quota failure: visible dirty status, real backup, native leave prompt, successful retry clears guard', async ({ page }, info) => {
  await cleanStart(page); await importBasket(page);
  // Synthetic storage fault in this isolated profile; actual native beforeunload handling below.
  await page.evaluate(() => {
    window.__quotaDenied = true;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (window.__quotaDenied && key.startsWith('quotelens.')) throw new DOMException('Synthetic quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await editSupplier(page, 'box');
  const name = page.getByRole('textbox', { name: 'Comparison name', exact: true });
  await name.fill('UNSAVED_NATIVE_QUOTA');
  await expect(name).toBeFocused();
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  await expect(page.locator('#storage-notice')).toContainText('Browser save failed.');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('quotelens.v1')).title)).toBe(basket.title);
  await files(page);
  const backup = await downloadFile(page, info, 'Download JSON', 'quotelens-backup.json');
  expect(JSON.parse(backup.text).title).toBe('UNSAVED_NATIVE_QUOTA');
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoOverflow(page);
  await page.locator('#storage-notice').scrollIntoViewIfNeeded();
  await screenshot(page, info, 'quota-unsaved-mobile390.png');

  const pending = page.waitForEvent('dialog', { timeout: 5_000 });
  await page.close({ runBeforeUnload: true });
  const dialog = await pending;
  expect(dialog.type(), 'Dirty native close must request the normal beforeunload dialog').toBe('beforeunload');
  await dialog.dismiss();
  expect(page.isClosed()).toBe(false);
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  await page.evaluate(() => { window.__quotaDenied = false; });
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved in this browser');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('quotelens.v1')).title)).toBe('UNSAVED_NATIVE_QUOTA');
  let unexpectedDialog = false;
  page.on('dialog', async prompt => { unexpectedDialog = true; await prompt.dismiss(); });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(unexpectedDialog, 'A successful save clears the dirty leave guard').toBe(false);
});
