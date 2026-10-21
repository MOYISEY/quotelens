import { CURRENCIES, UNITS, MAX_ITEMS, MAX_SUPPLIERS, blankSupplier, blankLine, amount, compare } from './engine.js';
export const STORAGE_KEY = 'quotelens.v1';
export const MAX_IMPORT_CHARS = 1000000;
export function prepareImportText(value) {
  if (typeof value !== 'string' || value.length > MAX_IMPORT_CHARS) return { text: '', error: 'Maximum 1,000,000 characters / Максимум 1 000 000 символов' };
  return { text: value, error: '' };
}
const safeString = (v, max = 500) => {
  if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new Error('Invalid text / Некорректный текст');
  return v;
};
const id = v => {
  if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(v) || ['__proto__', 'constructor', 'prototype'].includes(v)) throw new Error('Invalid ID / Некорректный ID');
  return v;
};
const oneOf = (v, values) => { if (!values.includes(v)) throw new Error(`Unsupported value / Неподдерживаемое значение: ${String(v).slice(0,40)}`); return v; };
const bool = v => { if (typeof v !== 'boolean') throw new Error('Expected true/false'); return v; };

// Whitelist all persisted fields. Numeric drafts stay strings, so empty/invalid values are never coerced to zero.
export function validateState(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.items) || !Array.isArray(input.suppliers) || input.items.length < 1 || input.items.length > MAX_ITEMS || input.suppliers.length < 2 || input.suppliers.length > MAX_SUPPLIERS) throw new Error('Expected v1, 1–12 items and 2–4 suppliers / Нужны v1, 1–12 товаров и 2–4 поставщика');
  const items = input.items.map(v => ({ id: id(v.id), name: safeString(v.name, 150), spec: safeString(v.spec), quantity: safeString(v.quantity, 30), unit: oneOf(v.unit, UNITS) }));
  if (new Set(items.map(v => v.id)).size !== items.length) throw new Error('Duplicate item ID / Повтор ID товара');
  const suppliers = input.suppliers.map(v => ({
    id: id(v.id), name: safeString(v.name, 150), currency: oneOf(v.currency, CURRENCIES), shipping: safeString(v.shipping, 30), fees: safeString(v.fees, 30), discount: safeString(v.discount, 30), minimum: safeString(v.minimum, 30), lead: safeString(v.lead, 150), terms: safeString(v.terms), costsConfirmed: bool(v.costsConfirmed),
    lines: Object.fromEntries(items.map(item => {
      const q = v.lines?.[item.id];
      if (!q) return [item.id, blankLine(item.unit)];
      return [item.id, { price: safeString(q.price, 30), basis: oneOf(q.basis, ['unit', 'pack']), pack: safeString(q.pack, 30), moq: safeString(q.moq, 30), available: safeString(q.available, 30), unit: oneOf(q.unit, UNITS), spec: safeString(q.spec), confirmed: bool(q.confirmed) }];
    }))
  }));
  if (new Set(suppliers.map(v => v.id)).size !== suppliers.length) throw new Error('Duplicate supplier ID / Повтор ID поставщика');
  return { version: 1, title: safeString(input.title, 150), currency: oneOf(input.currency, CURRENCIES), lang: oneOf(input.lang, ['ru', 'en']), demo: bool(input.demo), items, suppliers };
}

export function backup(state) { return JSON.stringify(validateState(state), null, 2); }
export function restore(text) {
  if (text.length > 1000000) throw new Error('Maximum 1 MB / Максимум 1 МБ');
  return validateState(JSON.parse(text));
}
export function saveLocal(storage, state) {
  try { storage.setItem(STORAGE_KEY, backup(state)); return true; } catch { return false; }
}
export function readLocal(storage) {
  const value = storage.getItem(STORAGE_KEY);
  return value === null ? null : restore(value);
}

export const HEADERS = ['comparison_currency','item_id','item_name','item_spec','required_qty','required_unit','supplier_id','supplier_name','supplier_currency','price','price_basis','pack_qty','moq_units','available_units','offer_unit','offer_spec','shipping','fees','discount_pct','min_goods','lead_time','terms'];
// Spreadsheet programs can evaluate formula-like cells; prefix text on every CSV export.
function cell(value) {
  let s = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(s) || /^[\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
export const writeCSV = rows => '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n');

export function parseCSV(text) {
  if (text.length > 1000000) throw new Error('Maximum 1 MB / Максимум 1 МБ');
  text = text.replace(/^\ufeff/, '');
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  const push = () => { row.push(field); field = ''; closed = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      push();
      if (c !== ',') { if (c === '\r' && text[i + 1] === '\n') i++; rows.push(row); row = []; }
    } else if (c === '"' && field === '' && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error('Malformed CSV quotes / Ошибка кавычек CSV'); field += c; }
    if (field.length > 5000 || rows.length > 60) throw new Error('CSV too large / Слишком большой CSV');
  }
  if (quoted) throw new Error('Unclosed CSV quote / Незакрытая кавычка CSV');
  if (field !== '' || row.length > 0 || closed) { push(); rows.push(row); }
  return rows.filter(r => r.some(v => v !== ''));
}

export function exportInputCSV(state) {
  const rows = [HEADERS];
  for (const supplier of state.suppliers) for (const item of state.items) {
    const q = supplier.lines[item.id];
    rows.push([state.currency,item.id,item.name,item.spec,item.quantity,item.unit,supplier.id,supplier.name,supplier.currency,q.price,q.basis,q.pack,q.moq,q.available,q.unit,q.spec,supplier.shipping,supplier.fees,supplier.discount,supplier.minimum,supplier.lead,supplier.terms]);
  }
  return writeCSV(rows);
}

export function importInputCSV(text, lang = 'ru') {
  const [header, ...rows] = parseCSV(text);
  if (!header || header.join(',') !== HEADERS.join(',')) throw new Error('Use the exact template header and comma delimiter / Нужны заголовок шаблона и разделитель-запятая');
  const items = new Map(), suppliers = new Map(), seen = new Set(); let currency;
  for (const [index, row] of rows.entries()) {
    if (row.length !== HEADERS.length) throw new Error(`Row / Строка ${index + 2}: expected / нужно ${HEADERS.length} columns`);
    const r = Object.fromEntries(HEADERS.map((h, i) => [h, row[i]]));
    if (currency !== undefined && currency !== r.comparison_currency) throw new Error('Conflicting comparison currencies / Разные валюты сравнения');
    currency = r.comparison_currency;
    id(r.item_id); id(r.supplier_id);
    const pair = `${r.supplier_id}:${r.item_id}`;
    if (seen.has(pair)) throw new Error(`Duplicate row / Повтор строки: ${pair}`);
    seen.add(pair);
    const item = { id: r.item_id, name: r.item_name, spec: r.item_spec, quantity: r.required_qty, unit: r.required_unit };
    if (items.has(item.id) && JSON.stringify(items.get(item.id)) !== JSON.stringify(item)) throw new Error(`Conflicting item / Разные данные товара: ${item.id}`);
    items.set(item.id, item);
    const fields = { id: r.supplier_id, name: r.supplier_name, currency: r.supplier_currency, shipping: r.shipping, fees: r.fees, discount: r.discount_pct, minimum: r.min_goods, lead: r.lead_time, terms: r.terms, costsConfirmed: false };
    if (suppliers.has(fields.id)) {
      const { lines, ...previous } = suppliers.get(fields.id);
      if (JSON.stringify(previous) !== JSON.stringify(fields)) throw new Error(`Conflicting supplier / Разные условия поставщика: ${fields.id}`);
    } else suppliers.set(fields.id, { ...fields, lines: {} });
    suppliers.get(fields.id).lines[item.id] = { price: r.price, basis: r.price_basis, pack: r.pack_qty, moq: r.moq_units, available: r.available_units, unit: r.offer_unit, spec: r.offer_spec, confirmed: false };
  }
  if (seen.size !== items.size * suppliers.size) throw new Error('Missing supplier/item rows / Нужна строка каждого товара для каждого поставщика');
  return validateState({ version: 1, title: lang === 'ru' ? 'Импорт CSV' : 'CSV import', currency, lang, demo: false, items: [...items.values()], suppliers: [...suppliers.values()] });
}

export function report(state) {
  const result = compare(state);
  return JSON.stringify({ format: 'quotelens-calculation-v1', generatedAt: new Date().toISOString(), disclaimer: 'Estimate only. Manual comparability and complete costs required. No split orders or currency conversion.', rounding: 'Each line half-up to 0.01; discount half-up on goods subtotal; delivery/fees added after discount; minimum goods before discount.', input: validateState(state), calculation: result }, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2);
}

export function reportCSV(state) {
  const result = compare(state), rows = [['supplier','currency','eligible','issues','item','required','packs','bought','surplus','line_cost','goods','discount','shipping','fees','total','delta','conditions']];
  for (const offer of result.offers) {
    const s = state.suppliers.find(v => v.id === offer.id);
    for (const item of state.items) {
      const line = offer.lines.find(v => v.itemId === item.id);
      rows.push([s.name,s.currency,offer.eligible,offer.issues.map(v => `${v.code}${v.itemId ? ':' + v.itemId : ''}`).join('; '),item.name,item.quantity,line?.packs ?? '',line?.bought ?? '',line?.surplus ?? '',amount(line?.cost),amount(offer.goods),amount(offer.discount),amount(offer.shipping),amount(offer.fees),amount(offer.total),amount(offer.delta),s.terms]);
    }
  }
  return writeCSV(rows);
}
