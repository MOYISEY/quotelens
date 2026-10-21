import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const fixtureURL = new URL('./fixtures/basket.json', import.meta.url);
export const basket = JSON.parse(await readFile(fixtureURL, 'utf8'));

export const test = base.extend({
  runtimeChecks: [async ({ context, page, baseURL }, use) => {
    const failures = [];
    const requests = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) failures.push(message.text());
    });
    // The only network target permitted by this test harness is its own static server.
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === baseURL || ['blob:', 'data:'].includes(url.protocol)) {
        await route.continue();
      } else {
        requests.push(url.origin);
        await route.abort('blockedbyclient');
      }
    });
    await use();
    expect(requests, 'App must not attempt requests outside the isolated loopback origin').toEqual([]);
    expect(failures, 'Browser console and uncaught page errors must be empty').toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function cleanStart(page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'RU', exact: true }), 'Fresh context starts with RU demo').toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'See the whole cost.', exact: true })).toBeVisible();
}

export async function files(page) {
  await page.getByRole('button', { name: 'Import & files', exact: true }).click();
}

export async function importBasket(page, value = basket) {
  await files(page);
  await page.locator('#file-input').setInputFiles({
    name: 'isolated-smoke-basket.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await applyImport(page);
}

export async function applyImport(page) {
  await expect(page.getByText('Ready to replace the basket', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apply import', exact: true }).click();
  await expect(page.getByTestId('cost-explanation')).toBeVisible();
}

export async function editSupplier(page, id) {
  await page.getByRole('button', { name: 'Comparison', exact: true }).click();
  await page.getByTestId(`offer-${id}`).getByRole('button', { name: 'Edit quote', exact: true }).click();
  const editor = page.locator(`.supplier-editor[data-supplier="${id}"]`);
  await expect(editor).toHaveAttribute('open', '');
  return editor;
}

export const supplierField = (page, id, field) => page.locator(`[data-scope="supplier"][data-id="${id}"][data-field="${field}"]`);
export const lineField = (page, id, item, field) => page.locator(`[data-scope="line"][data-id="${id}"][data-item="${item}"][data-field="${field}"]`);

export async function expectBaseline(page) {
  await expect(page.getByTestId('best-total')).toHaveText('360.00 RUB');
  const explanation = page.getByTestId('cost-explanation');
  await expect(explanation).toContainText('North Supply costs less than Box Depot by 30.00 RUB');
  await expect(explanation.locator('[data-contribution="goods"]')).toHaveText('−50.00 RUB');
  await expect(explanation.locator('[data-contribution="shipping"]')).toHaveText('+80.00 RUB');
  await expect(explanation.locator('[data-contribution="fees"]')).toHaveText('0.00 RUB');
  await expect(explanation.locator('[data-contribution="discount"]')).toHaveText('0.00 RUB');
  await expect(page.getByTestId('explained-delta')).toHaveText('+30.00 RUB');
  await expect(explanation).toContainText('Excluded: Budget Works');
  await expect(page.getByTestId('offer-budget')).toContainText('Full total unknown');
  await expect(page.getByTestId('offer-budget')).toContainText('Not ranked');
}

export async function downloadFile(page, testInfo, buttonName, filename) {
  const pending = page.waitForEvent('download', { timeout: 10_000 });
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename(), `${buttonName}: correct suggested filename`).toBe(filename);
  expect(await download.failure(), `${buttonName}: download must complete`).toBeNull();
  const path = testInfo.outputPath(filename);
  await download.saveAs(path);
  const text = await readFile(path, 'utf8');
  expect(text.length, `${buttonName}: file must contain data`).toBeGreaterThan(100);
  await testInfo.attach(filename, { path });
  return { path, text };
}

export async function screenshot(page, testInfo, name) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

export async function expectNoOverflow(page) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  expect(size.content, `Horizontal overflow: content ${size.content}, viewport ${size.viewport}`).toBeLessThanOrEqual(size.viewport);
}
