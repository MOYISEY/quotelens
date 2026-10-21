import { readFile } from 'node:fs/promises';
import {
  test, expect, basket, cleanStart, files, importBasket, applyImport, editSupplier,
  supplierField, lineField, expectBaseline, downloadFile, screenshot, expectNoOverflow,
} from './helpers.mjs';

test.beforeEach(async ({ page }) => cleanStart(page));
test.beforeAll(async ({ browser }) => {
  console.log(`Smoke runtime: browser ${browser.version()}, Node ${process.version}, ${process.platform}`);
});

test('clean build: RU/EN demo, correct complete minimum and excluded partial quote', async ({ page }, info) => {
  await expect(page.getByTestId('best-total')).toHaveText('1,658.00 RUB');
  await expect(page.getByTestId('offer-river')).toContainText('Lowest total');
  await expect(page.getByTestId('offer-atlas')).toContainText('2,060.00 RUB');
  await expect(page.getByTestId('explained-delta')).toHaveText('+402.00 RUB');
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Quick Quote', exact: true }) })).toContainText('Full total unknown');
  await expect(page.getByTestId('cost-explanation')).toContainText('Excluded: Quick Quote');
  await page.getByRole('button', { name: 'RU', exact: true }).click();
  await expect(page.getByTestId('best-total')).toHaveText('1 658,00 RUB');
  await expect(page.getByRole('heading', { name: 'Почему этот итог ниже', exact: true })).toBeVisible();
  await screenshot(page, info, 'clean-demo-ru.png');
});

test('exact explanation: goods, delivery, rounded fees/discounts, tie and insufficient states', async ({ page }) => {
  await importBasket(page);
  await expectBaseline(page);
  await editSupplier(page, 'north');
  await supplierField(page, 'north', 'fees').fill('1.23');
  await supplierField(page, 'north', 'discount').fill('10.01');
  await editSupplier(page, 'box');
  await supplierField(page, 'box', 'fees').fill('4.56');
  await supplierField(page, 'box', 'discount').fill('5.01');
  await page.getByRole('button', { name: 'Comparison', exact: true }).click();
  await expect(page.getByTestId('best-total')).toHaveText('326.19 RUB');
  const explanation = page.getByTestId('cost-explanation');
  await expect(explanation.locator('[data-contribution="fees"]')).toHaveText('+3.33 RUB');
  await expect(explanation.locator('[data-contribution="discount"]')).toHaveText('+20.01 RUB');
  await expect(page.getByTestId('explained-delta')).toHaveText('+53.34 RUB');

  const tie = structuredClone(basket);
  tie.suppliers[1].shipping = '60';
  await importBasket(page, tie);
  await expect(explanation.getByRole('heading')).toHaveText('Tie: North Supply, Box Depot');
  await expect(explanation).toContainText('There is no single lowest quote.');
  await expect(page.getByTestId('explained-delta')).toHaveText('0.00 RUB');

  tie.suppliers[1].currency = 'USD';
  await importBasket(page, tie);
  await expect(explanation).toContainText('Complete quote: North Supply');
  await expect(page.getByTestId('explained-delta')).toHaveCount(0);
  tie.suppliers[0].costsConfirmed = false;
  await importBasket(page, tie);
  await expect(explanation).toContainText('There are no complete comparable quotes yet.');
  await expect(page.getByTestId('explained-delta')).toHaveCount(0);
});

test('unknown delivery -> explicit zero -> unknown; mismatched unit is excluded', async ({ page }) => {
  await importBasket(page);
  await expectBaseline(page);
  await editSupplier(page, 'budget');
  await supplierField(page, 'budget', 'shipping').fill('0');
  await page.getByRole('button', { name: 'Comparison', exact: true }).click();
  await expect(page.getByTestId('best-total')).toHaveText('268.00 RUB');
  await expect(page.getByTestId('offer-budget')).toContainText('Lowest total');
  await editSupplier(page, 'budget');
  await supplierField(page, 'budget', 'shipping').fill('');
  await page.getByRole('button', { name: 'Comparison', exact: true }).click();
  await expectBaseline(page);
  await editSupplier(page, 'box');
  await lineField(page, 'box', 'notebook', 'unit').selectOption('pair');
  await expect(lineField(page, 'box', 'notebook', 'confirmed')).not.toBeChecked();
  await page.getByRole('button', { name: 'Comparison', exact: true }).click();
  await expect(page.getByTestId('offer-box')).toContainText('Units do not match');
  await expect(page.getByTestId('explained-delta')).toHaveCount(0);
});

test('pack preview: native keyboard, decimal rounding, invalid/zero, save and reload', async ({ page }) => {
  await importBasket(page);
  await editSupplier(page, 'box');
  const preview = page.getByTestId('preview:box:notebook');
  const basis = lineField(page, 'box', 'notebook', 'basis');
  const price = lineField(page, 'box', 'notebook', 'price');
  await expect(preview).toContainText('100 RUB per pack (12 pcs)');
  await expect(preview).toContainText('Buy 2 packs × 12 = 24 pcs');
  await expect(preview).toContainText('Exact line cost: 200.00 RUB');
  await expect(preview).toContainText('8.3333 RUB/pcs');
  await expect(preview).toContainText('indicative only');
  await basis.focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Tab');
  await expect(lineField(page, 'box', 'notebook', 'unit')).toBeFocused();
  await expect(preview).toContainText('Exact line cost: 2,400.00 RUB');
  await basis.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(preview).toContainText('Exact line cost: 200.00 RUB');
  for (const value of ['', '-1']) {
    await price.fill(value);
    await expect(price).toBeFocused();
    await expect(preview).toContainText('Enter a valid price');
    await expect(preview).not.toContainText('Exact line cost');
  }
  await price.fill('0');
  await expect(preview).toContainText('Exact line cost: 0.00 RUB');
  await price.fill('100,0050');
  await expect(preview).toContainText('Exact line cost: 200.01 RUB');
  await lineField(page, 'box', 'notebook', 'moq').fill('25');
  await expect(preview).toContainText('Buy 3 packs × 12 = 36 pcs');
  await expect(preview).toContainText('surplus 12 pcs');
  await expect(preview).toContainText('Exact line cost: 300.02 RUB');
  await page.reload();
  await expect(page.getByTestId('offer-box')).toContainText('490.02 RUB');
  await editSupplier(page, 'box');
  await expect(price).toHaveValue('100,0050');
  await expect(basis).toHaveValue('pack');
  await expect(preview).toContainText('Exact line cost: 300.02 RUB');
});

test('new isolated backup download -> real file import -> reload; calculation report', async ({ page }, info) => {
  // This local context/fixture has no relation to the earlier uncertain public-session download.
  await importBasket(page);
  await expectBaseline(page);
  await files(page);
  const backup = await downloadFile(page, info, 'Download JSON', 'quotelens-backup.json');
  expect(JSON.parse(backup.text), 'Backup retains every input, Unicode, quote/comma text, zero and unknown').toEqual(basket);
  const report = await downloadFile(page, info, 'Calculation JSON', 'quotelens-calculation.json');
  const result = JSON.parse(report.text);
  expect(result.input).toEqual(basket);
  expect(result.calculation.best).toBe('36000');
  const [north, box, budget] = result.calculation.offers;
  expect([north.total, box.total, budget.total]).toEqual(['36000', '39000', null]);
  expect(box.lines[0]).toMatchObject({ packs: '2', bought: '24', surplus: '0', cost: '20000', basis: 'pack' });
  expect(budget).toMatchObject({ eligible: false, shipping: null, delta: null });
  await page.getByRole('button', { name: 'New basket', exact: true }).click();
  await files(page);
  await page.locator('#file-input').setInputFiles(backup.path);
  await applyImport(page);
  await expectBaseline(page);
  await page.reload();
  await expectBaseline(page);
});

test('real CSV exports: quoted Unicode and formula guard, file import clears trust, edit, undo', async ({ page }, info) => {
  await importBasket(page);
  await files(page);
  const input = await downloadFile(page, info, 'Download CSV template', 'quotelens-input.csv');
  const results = await downloadFile(page, info, 'Results CSV', 'quotelens-results.csv');
  const resultLines = results.text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  expect(resultLines, 'Three suppliers times three items plus header').toHaveLength(10);
  expect(resultLines[0].split(',')).toHaveLength(17);
  expect(input.text.replace(/^\uFEFF/, '').split(/\r?\n/)[0].split(',')).toHaveLength(22);
  for (const text of [input.text, results.text]) {
    expect(text).toContain('"Блокнот ""A5"", набор / Notebook"');
    expect(text).toContain('"\'=HYPERLINK(""https://example.invalid"",""synthetic"")"');
  }
  expect(resultLines.find(line => line.startsWith('Box Depot,') && line.includes(',24,2,24,0,'))).toContain(',200.00,300.00,0.00,90.00,0.00,390.00,30.00,');
  expect(resultLines.filter(line => line.startsWith('Budget Works,'))).toHaveLength(3);
  expect(resultLines.find(line => line.startsWith('Budget Works,') && line.includes(',24,24,24,0,'))).toContain(',240.00,268.00,0.00,,0.00,,,');
  await page.locator('#file-input').setInputFiles(input.path);
  await applyImport(page);
  await expect(page.getByTestId('cost-explanation')).toContainText('There are no complete comparable quotes yet.');
  await expect(page.getByTestId('explained-delta')).toHaveCount(0);
  await editSupplier(page, 'box');
  await expect(lineField(page, 'box', 'notebook', 'basis')).toHaveValue('pack');
  await expect(lineField(page, 'box', 'notebook', 'confirmed')).not.toBeChecked();
  await supplierField(page, 'box', 'shipping').fill('0');
  await supplierField(page, 'box', 'costsConfirmed').check();
  for (const id of ['notebook', 'pen', 'folder']) await lineField(page, 'box', id, 'confirmed').check();
  await editSupplier(page, 'north');
  await supplierField(page, 'north', 'costsConfirmed').check();
  for (const id of ['notebook', 'pen', 'folder']) await lineField(page, 'north', id, 'confirmed').check();
  await page.reload();
  await expect(page.getByTestId('best-total')).toHaveText('300.00 RUB');
  await expect(page.getByTestId('offer-box')).toContainText('Lowest total');
  await files(page);
  await page.getByRole('button', { name: '↶ Restore basket before last replacement', exact: true }).click();
  await page.getByRole('button', { name: 'Comparison', exact: true }).click();
  await expectBaseline(page);
});

test('reference 20 units: packs, surplus, stock and full-basket winner', async ({ page }) => {
  const reference = JSON.parse(await readFile(new URL('../../examples/reference-20-units.json', import.meta.url), 'utf8'));
  reference.lang = 'en';
  await importBasket(page, reference);
  await expect(page.getByTestId('best-total')).toHaveText('380,000.00 RUB');
  await expect(page.getByTestId('offer-A')).toContainText('Lowest total');
  await expect(page.getByTestId('offer-B')).toContainText('390,000.00 RUB');
  await expect(page.getByTestId('offer-C')).toContainText('388,000.00 RUB');
  await expect(page.getByTestId('offer-D')).toContainText('Not ranked');
  await editSupplier(page, 'C');
  const preview = page.getByTestId('preview:C:part');
  await expect(preview).toContainText('Buy 4 packs × 6 = 24 pcs');
  await expect(preview).toContainText('surplus 4 pcs');
});

test.describe('390px keyboard', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('RU/EN explanation, unit/pack and repeat Enter add/remove focus', async ({ page }, info) => {
    await importBasket(page);
    await expectBaseline(page);
    await page.getByRole('button', { name: 'RU', exact: true }).click();
    await expect(page.getByTestId('explained-delta')).toHaveText('+30,00 RUB');
    await expectNoOverflow(page);
    await page.getByTestId('cost-explanation').scrollIntoViewIfNeeded();
    await screenshot(page, info, 'mobile390-explanation-ru.png');
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await editSupplier(page, 'box');
    const basis = lineField(page, 'box', 'notebook', 'basis');
    await basis.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Tab');
    await expect(lineField(page, 'box', 'notebook', 'unit')).toBeFocused();
    await expect(page.getByTestId('preview:box:notebook')).toContainText('2,400.00 RUB');
    await basis.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('preview:box:notebook')).toContainText('200.00 RUB');
    await expectNoOverflow(page);
    await page.getByTestId('preview:box:notebook').scrollIntoViewIfNeeded();
    await screenshot(page, info, 'mobile390-pack-preview-en.png');

    await page.getByRole('button', { name: 'New basket', exact: true }).click();
    const addSupplier = page.getByRole('button', { name: '+ Supplier', exact: true });
    await addSupplier.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.supplier-editor')).toHaveCount(3);
    await expect(addSupplier).toBeFocused();
    await page.keyboard.press('Enter'); // Actual focus; do not find/focus the button again.
    await expect(page.locator('.supplier-editor')).toHaveCount(4);
    await expect(addSupplier).toBeDisabled();
    const fourth = page.locator('.supplier-editor').last();
    await expect(fourth.getByRole('textbox', { name: 'Supplier name', exact: true })).toBeFocused();
    await fourth.getByRole('button', { name: 'Remove supplier', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.supplier-editor')).toHaveCount(3);
    await expect(page.locator(':focus')).toHaveText('Remove supplier');
    await page.keyboard.press('Enter');
    await expect(page.locator('.supplier-editor')).toHaveCount(2);
    await expect(addSupplier).toBeFocused();
    const addItem = page.getByRole('button', { name: '+ Add item', exact: true });
    await addItem.focus();
    await page.keyboard.press('Enter');
    await expect(addItem).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Item name', exact: true })).toHaveCount(3);
    await page.locator('[data-action="remove-item"]').last().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(':focus')).toHaveText('Remove');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Item name', exact: true })).toHaveCount(1);
    await expect(addItem).toBeFocused();
    await expectNoOverflow(page);
  });
});
