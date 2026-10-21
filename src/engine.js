// Pure calculation module. No floating-point money, IO, or implicit conversions.
export const CURRENCIES = ['RUB', 'USD', 'EUR', 'GBP'];
export const UNITS = ['pcs', 'pair', 'set'];
export const MAX_ITEMS = 12;
export const MAX_SUPPLIERS = 4;
const pow10 = n => 10n ** BigInt(n);

export function decimal(value, places, { positive = false, max = 100000000n } = {}) {
  if (typeof value !== 'string') throw new Error('number');
  const clean = value.trim().replace(',', '.');
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(clean)) throw new Error('number');
  const [whole, fraction = ''] = clean.split('.');
  const amount = BigInt(whole) * pow10(places) + BigInt(fraction.padEnd(places, '0'));
  if (amount > max * pow10(places) || (positive && amount === 0n)) throw new Error('range');
  return amount;
}

export function integer(value, { positive = false } = {}) {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) throw new Error('integer');
  const amount = BigInt(value.trim());
  if (amount > 1000000n || (positive && amount === 0n)) throw new Error('range');
  return amount;
}

export function roundHalfUp(numerator, denominator) {
  if (numerator < 0n || denominator <= 0n) throw new Error('nonnegative amounts only');
  return (numerator + denominator / 2n) / denominator;
}

export function calculateLine(item, quote) {
  const required = integer(item.quantity, { positive: true });
  const pack = integer(quote.pack, { positive: true });
  const moq = integer(quote.moq);
  const price = decimal(quote.price, 4);
  if (!UNITS.includes(item.unit) || item.unit !== quote.unit) throw new Error('unit');
  if (!['unit', 'pack'].includes(quote.basis)) throw new Error('basis');
  const target = required > moq ? required : moq;
  const packs = (target + pack - 1n) / pack;
  const bought = packs * pack;
  const cost = roundHalfUp(price * (quote.basis === 'pack' ? packs : bought), 100n);
  return { required, pack, moq, packs, bought, surplus: bought - required, price, cost, basis: quote.basis };
}

export function compare(state) {
  const basketIssues = [];
  if (!CURRENCIES.includes(state.currency)) basketIssues.push({ code: 'currency' });
  for (const item of state.items) {
    try { integer(item.quantity, { positive: true }); } catch { basketIssues.push({ code: 'quantity', itemId: item.id }); }
    if (!item.name.trim() || !item.spec.trim()) basketIssues.push({ code: 'itemSpec', itemId: item.id });
    if (!UNITS.includes(item.unit)) basketIssues.push({ code: 'unit', itemId: item.id });
  }
  const offers = state.suppliers.map(supplier => {
    const issues = [...basketIssues];
    const lines = [];
    if (!supplier.name.trim()) issues.push({ code: 'supplierName' });
    if (supplier.currency !== state.currency) issues.push({ code: 'currency' });
    for (const item of state.items) {
      const quote = supplier.lines[item.id];
      if (!quote) { issues.push({ code: 'missing', itemId: item.id }); continue; }
      try {
        const line = calculateLine(item, quote);
        lines.push({ itemId: item.id, ...line });
        if (quote.available !== '') {
          try { if (integer(quote.available) < line.bought) issues.push({ code: 'stock', itemId: item.id }); }
          catch { issues.push({ code: 'stockNumber', itemId: item.id }); }
        }
      }
      catch (e) { issues.push({ code: e.message === 'unit' ? 'unit' : 'lineNumbers', itemId: item.id }); }
      if (!quote.confirmed || !quote.spec.trim()) issues.push({ code: 'confirm', itemId: item.id });
    }
    let shipping = null, fees = null, discountBps = null, minimum = null;
    for (const [key, code] of [['shipping', 'shipping'], ['fees', 'fees'], ['minimum', 'minimum'], ['discount', 'discount']]) {
      try {
        const v = decimal(supplier[key], 2, { max: key === 'discount' ? 100n : 100000000n });
        if (key === 'shipping') shipping = v;
        if (key === 'fees') fees = v;
        if (key === 'minimum') minimum = v;
        if (key === 'discount') discountBps = v;
      } catch { issues.push({ code }); }
    }
    if (!supplier.costsConfirmed) issues.push({ code: 'costs' });
    const goods = lines.length === state.items.length ? lines.reduce((sum, line) => sum + line.cost, 0n) : null;
    const discount = goods !== null && discountBps !== null ? roundHalfUp(goods * discountBps, 10000n) : null;
    if (goods !== null && minimum !== null && goods < minimum) issues.push({ code: 'minimumUnmet' });
    const total = goods !== null && discount !== null && shipping !== null && fees !== null ? goods - discount + shipping + fees : null;
    return { id: supplier.id, lines, issues, goods, discount, shipping, fees, minimum, total, eligible: issues.length === 0, delta: null };
  });
  const eligible = offers.filter(offer => offer.eligible);
  const best = eligible.length >= 2 ? eligible.reduce((min, offer) => offer.total < min ? offer.total : min, eligible[0].total) : null;
  const winners = best === null ? [] : eligible.filter(offer => offer.total === best).map(offer => offer.id);
  for (const offer of eligible) if (best !== null) offer.delta = offer.total - best;
  return { offers, eligibleCount: eligible.length, best, winners, basketIssues };
}

export function amount(cents) {
  if (cents === null || cents === undefined) return '';
  const sign = cents < 0n ? '-' : '';
  const v = cents < 0n ? -cents : cents;
  return `${sign}${v / 100n}.${String(v % 100n).padStart(2, '0')}`;
}

export function money(cents, currency, lang = 'ru') {
  if (cents === null || cents === undefined) return '—';
  const sign = cents < 0n ? '−' : '';
  const v = cents < 0n ? -cents : cents;
  return `${sign}${new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-GB').format(v / 100n)}${lang === 'ru' ? ',' : '.'}${String(v % 100n).padStart(2, '0')} ${currency}`;
}

export const blankLine = (unit = 'pcs') => ({ price: '', basis: 'unit', pack: '1', moq: '0', available: '', unit, spec: '', confirmed: false });
export const blankSupplier = (id, currency, items) => ({ id, name: '', currency, shipping: '', fees: '0', discount: '0', minimum: '0', lead: '', terms: '', costsConfirmed: false, lines: Object.fromEntries(items.map(item => [item.id, blankLine(item.unit)])) });

export function demo() {
  const items = [
    { id: 'notebook', name: 'Блокнот A5 / A5 notebook', spec: 'A5, 80 листов / sheets, 80 г/м², клетка / squared', quantity: '12', unit: 'pcs' },
    { id: 'pen', name: 'Ручка / Ballpoint pen', spec: 'Синяя / blue, 0.7 mm, модель / model P07', quantity: '20', unit: 'pcs' }
  ];
  const suppliers = [
    { ...blankSupplier('atlas', 'RUB', items), name: 'Atlas Supply', shipping: '600', lead: '3–5 дней / days', terms: 'Фиксированная доставка / Fixed delivery', costsConfirmed: true },
    { ...blankSupplier('river', 'RUB', items), name: 'River Office', shipping: '100', discount: '5', lead: '2–3 дня / days', terms: 'Скидка 5% только на товары / 5% off goods only', costsConfirmed: true },
    { ...blankSupplier('bulk', 'RUB', items), name: 'Bulk Direct', shipping: '0', lead: '5–7 дней / days', terms: 'Большие упаковки и MOQ / Large packs & MOQ', costsConfirmed: true },
    { ...blankSupplier('unknown', 'RUB', items), name: 'Quick Quote', shipping: '', lead: '', terms: 'Доставку и сборы уточнить / Delivery & fees pending' }
  ];
  const offers = [['80', '25', '6', '10', '12', '20'], ['90', '28', '1', '1', '0', '0'], ['65', '20', '20', '50', '40', '0'], ['55', '18', '1', '1', '0', '0']];
  suppliers.forEach((s, index) => {
    items.forEach((item, i) => { s.lines[item.id] = { price: offers[index][i], basis: 'unit', pack: offers[index][i + 2], moq: offers[index][i + 4], available: '', unit: 'pcs', spec: item.spec, confirmed: index < 3 }; });
  });
  return { version: 1, title: 'Office essentials / Канцелярия', currency: 'RUB', lang: 'ru', demo: true, items, suppliers };
}
