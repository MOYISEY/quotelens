import { demo, compare, money, CURRENCIES, UNITS, blankLine, blankSupplier, MAX_ITEMS, MAX_SUPPLIERS } from './engine.js';
import { backup, restore, saveLocal, readLocal, exportInputCSV, importInputCSV, report, reportCSV, prepareImportText, STORAGE_KEY } from './io.js';

const root = document.querySelector('#app');
let state, tab = 'compare', activeSupplier = null, staged = null, importText = '', importError = '', toast = '', previous = null, storageBlocked = false, storageError = false, storageConflict = false;
try { state = readLocal(localStorage) || demo(); } catch { state = demo(); storageBlocked = true; }
try { const old = localStorage.getItem('quotelens.previous.v1'); if (old) previous = restore(old); } catch { /* optional undo snapshot */ }
const t = (ru, en) => state.lang === 'ru' ? ru : en;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = prefix => `${prefix}_${crypto.randomUUID().slice(0,8)}`;
const unit = value => ({ pcs: t('шт.', 'pcs'), pair: t('пар', 'pairs'), set: t('наборов', 'sets') }[value] || value);
const cash = (value, currency = state.currency) => money(value, currency, state.lang);
const symbol = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="14" height="14" rx="2"/><path d="M8 9h6M8 13h4m5 4 4 4"/></svg>`;

function issueText(issue) {
  const map = {
    currency: t('Валюта отличается. Пересчёта курсов нет.', 'Different currency. No exchange conversion.'),
    quantity: t('Требуемое количество: целое число от 1 до 1 000 000.', 'Required quantity must be an integer from 1 to 1,000,000.'),
    itemSpec: t('Укажите название и спецификацию товара.', 'Enter the item name and specification.'),
    unit: t('Единицы не совпадают. Подтвердите данные вручную.', 'Units do not match. Review the source manually.'),
    supplierName: t('Укажите название поставщика.', 'Enter a supplier name.'),
    missing: t('Нет предложения на товар.', 'Missing item offer.'),
    lineNumbers: t('Проверьте цену (до 4 знаков), упаковку ≥ 1 и MOQ ≥ 0. Количества целые.', 'Check price (up to 4 decimals), pack ≥ 1 and MOQ ≥ 0. Quantities must be integers.'),
    confirm: t('Подтвердите одинаковый товар и качество.', 'Confirm the same product and quality.'),
    shipping: t('Доставка неизвестна или некорректна. Для бесплатной укажите 0.', 'Delivery is unknown or invalid. Enter 0 for free delivery.'),
    fees: t('Обязательные сборы неизвестны или некорректны.', 'Mandatory fees are unknown or invalid.'),
    minimum: t('Минимальная сумма товаров неизвестна или некорректна.', 'Minimum goods amount is unknown or invalid.'),
    discount: t('Скидка должна быть от 0 до 100%, до 2 знаков.', 'Discount must be 0–100%, up to 2 decimals.'),
    costs: t('Не подтверждена полнота обязательных расходов.', 'Completeness of mandatory costs is not confirmed.'),
    minimumUnmet: t('Минимальная сумма заказа не достигнута. Автодобора нет.', 'Minimum goods order is not met. No automatic top-up.'),
    stock: t('Недостаточно доступного количества с учётом упаковок.', 'Available stock cannot cover the required packs.'),
    stockNumber: t('Наличие: целое число ≥ 0 или пустое поле.', 'Stock must be an integer ≥ 0, or blank.')
  };
  const item = state.items.find(v => v.id === issue.itemId);
  return `${item ? item.name + ': ' : ''}${map[issue.code] || issue.code}`;
}
function persist() {
  if (!storageBlocked) storageError = !saveLocal(localStorage, state);
}
function options(values, current, label = v => v) { return values.map(v => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(label(v))}</option>`).join(''); }
function field(label, value, attrs = '', hint = '') {
  return `<label class="field"><span>${label}</span><input value="${esc(value)}" ${attrs} maxlength="${attrs.includes('inputmode') ? 30 : 150}">${hint ? `<small>${hint}</small>` : ''}</label>`;
}
function select(label, content, attrs) { return `<label class="field"><span>${label}</span><select ${attrs}>${content}</select></label>`; }
function checkbox(label, checked, attrs) { return `<label class="check"><input type="checkbox" ${checked ? 'checked' : ''} ${attrs}><span>${label}</span></label>`; }
function button(label, action, className = 'button', attrs = '') { return `<button class="${className}" data-action="${action}" ${attrs}>${label}</button>`; }

function actionFocus(action, id) {
  return `[data-action="${action}"]${id ? `[data-id="${id}"]` : ''}`;
}
function render(focusSelector) {
  const focused = document.activeElement?.closest('[data-action]');
  const restoreFocus = focusSelector || (focused ? actionFocus(focused.dataset.action, focused.dataset.id) : null);
  const result = compare(state);
  document.documentElement.lang = state.lang;
  document.title = t('QuoteLens — Полная стоимость корзины', 'QuoteLens — Full basket cost');
  root.innerHTML = `
    <header class="topbar"><div class="topbar-inner"><a class="brand" href="#" aria-label="QuoteLens">${symbol}<span>QuoteLens<span class="version">LOCAL / 0.1</span></span></a>
      <div class="top-actions"><span class="local-dot">${t('Данные на этом устройстве','Data on this device')}</span><div class="language" aria-label="Language">${button('RU','ru',state.lang === 'ru' ? 'selected' : '', 'aria-pressed="'+(state.lang==='ru')+'"')}${button('EN','en',state.lang === 'en' ? 'selected' : '', 'aria-pressed="'+(state.lang==='en')+'"')}</div></div></div></header>
    <main id="main" class="shell">
      <section class="page-heading"><div><p class="eyebrow">${t('РАБОЧАЯ КОРЗИНА','COMPARISON WORKSPACE')}</p><h1>${t('Смотрите на полный итог.','See the whole cost.')}</h1><p class="intro">${t('Одинаковая корзина. Все упаковки, условия и расходы — в одном расчёте.','Same basket. Every pack, condition and cost in one calculation.')}</p></div>
        <div class="heading-actions">${button(t('Новая корзина','New basket'),'new','button secondary')}${button(t('↓ Экспорт','↓ Export'),'export','button primary')}</div></section>
      ${storageBlocked ? `<div class="alert danger" role="alert">${storageConflict?t('Корзина изменена в другой вкладке. Автосохранение здесь остановлено. Скачайте текущий JSON, затем перезагрузите страницу для загрузки последней версии.','The basket changed in another tab. Autosave is stopped here. Download your current JSON, then reload to load the latest version.'):t('Сохранение недоступно или сохранённые данные повреждены. Показано демо; исходное хранилище не перезаписано. Экспортируйте данные, затем создайте новую корзину или восстановите JSON.','Storage is unavailable or saved data is damaged. Showing demo; the original storage has not been overwritten. Export, then create a new basket or restore JSON.')}</div>` : ''}
      ${storageError ? `<div class="alert danger" role="alert">${t('Не удалось сохранить в браузере. Скачайте JSON-копию перед закрытием.','Browser save failed. Download a JSON backup before closing.')}</div>` : ''}
      ${toast ? `<div class="alert notification" role="status">${esc(toast)}${button('×','dismiss','icon-button',`aria-label="${t('Закрыть уведомление','Dismiss notification')}"`)}</div>` : ''}
      <div class="workspace-bar"><div class="workspace-name"><span class="folder-icon">▤</span><strong>${esc(state.title) || t('Без названия','Untitled')}</strong>${state.demo ? `<span class="badge neutral">${t('Демо · вымышленные данные','Demo · fictional data')}</span>` : ''}</div><span class="save-status">${storageBlocked || storageError ? t('Только в памяти','In memory only') : t('Сохраняется в браузере','Saved in this browser')}</span></div>
      <nav class="tabs" aria-label="${t('Разделы корзины','Workspace sections')}">${[['compare',t('Сравнение','Comparison')],['edit',t('Товары и предложения','Items & quotes')],['files',t('Импорт и файлы','Import & files')],['method',t('Как считаем','How it works')]].map(([key,label]) => button(label,key,tab === key ? 'tab active' : 'tab',`aria-current="${tab === key ? 'page' : 'false'}"`)).join('')}</nav>
      ${tab === 'compare' ? comparison(result) : tab === 'edit' ? editor(result) : tab === 'files' ? files() : method()}
      <footer><span>QuoteLens <span class="muted">/ MVP 0.1</span></span><p>${t('Инструмент оценки, не гарантия выгодности покупки. Условия и качество подтверждаете вы.','An estimation tool, not a guarantee of a good purchase. You verify terms and quality.')}</p><span class="footer-local">${t('Без аккаунта · без отправки данных','No account · no data uploads')}</span></footer>
    </main>`;
  const target = restoreFocus && root.querySelector(restoreFocus);
  if (target && !target.disabled) target.focus();
}

function comparison(result) {
  const eligible = result.offers.filter(o => o.eligible);
  const max = eligible.reduce((n,o) => o.total > n ? o.total : n, 0n);
  return `<section class="stats" aria-label="${t('Итоги','Summary')}">
    <div class="stat"><span>${t('Минимум полной корзины','Lowest complete basket')}</span><strong data-testid="best-total">${result.best === null ? '—' : cash(result.best)}</strong><small>${result.best === null ? t('Нужны 2 полных сопоставимых предложения','Need 2 complete, comparable offers') : result.winners.length > 1 ? t('Одинаковый итог у нескольких поставщиков','Several suppliers have the same total') : esc(state.suppliers.find(s => s.id === result.winners[0]).name)}</small></div>
    <div class="stat"><span>${t('Допущено к сравнению','Ready to compare')}</span><strong>${result.eligibleCount}<em> / ${state.suppliers.length}</em></strong><small>${t('Полная корзина и известные расходы','Full basket and known costs')}</small></div>
    <div class="stat"><span>${t('Разница полных предложений','Complete offer spread')}</span><strong>${result.best === null ? '—' : cash(max - result.best)}</strong><small>${t('От минимума до максимума','From lowest to highest total')}</small></div>
  </section>
  ${state.demo ? `<div class="demo-note"><span class="note-icon">i</span><p><strong>${t('Низкая цена за штуку — ещё не низкий итог.','A low unit price is only part of the story.')}</strong> ${t('Atlas проигрывает после доставки, Bulk закупает лишнее из-за MOQ, а дешёвый Quick Quote исключён: условия неполные.','Atlas loses after delivery, Bulk buys extra because of MOQ, and cheap Quick Quote is excluded: terms are incomplete.')}</p></div>` : ''}
  <section class="section"><div class="section-title"><div><h2>${t('Предложения поставщиков','Supplier quotes')}</h2><p>${t('Сравниваем всю корзину у одного поставщика.','Comparing the whole basket from one supplier.')}</p></div>${button(t('Редактировать →','Edit quotes →'),'edit','text-button')}</div>
    <div class="offer-grid">${state.suppliers.map((s,i) => offerCard(s, result.offers[i], result)).join('')}</div>
  </section>
  <section class="basket-summary panel"><div class="section-title"><div><h2>${t('Что нужно купить','What you need')}</h2><p>${state.items.length} ${t('позиции · спецификация обязательна','items · specification required')}</p></div>${button(t('Изменить корзину','Edit basket'),'edit','text-button')}</div><div class="basket-lines">${state.items.map((item,i) => `<div class="basket-line"><span class="item-index">${String(i+1).padStart(2,'0')}</span><div><strong>${esc(item.name)||'—'}</strong><p>${esc(item.spec)||t('Спецификация не указана','Missing specification')}</p></div><span class="quantity">${esc(item.quantity)||'—'} <small>${unit(item.unit)}</small></span></div>`).join('')}</div></section>`;
}
function offerCard(s, o, result) {
  const best = result.winners.includes(s.id);
  const status = !o.eligible ? t('Вне сравнения','Excluded') : best ? result.winners.length > 1 ? t('Равный минимум','Tied lowest') : t('Минимальный итог','Lowest total') : t('Полное предложение','Complete quote');
  return `<article class="offer ${best ? 'best' : ''} ${o.eligible ? '' : 'excluded'}" data-testid="offer-${esc(s.id)}">
    <div class="offer-status"><span class="badge ${best ? 'green' : o.eligible ? 'neutral' : 'amber'}">${status}</span><span class="supplier-number">${String(state.suppliers.indexOf(s)+1).padStart(2,'0')}</span></div>
    <h3>${esc(s.name)||t('Новый поставщик','New supplier')}</h3><div class="offer-total" data-testid="total-${esc(s.id)}">${cash(o.total,s.currency)}</div><p class="total-caption">${o.total === null ? t('Полный итог неизвестен','Full total unknown') : !o.eligible ? t('Известная сумма · условия не проверены','Known sum · terms not verified') : t('За всю корзину с расходами','Whole basket, costs included')}</p>
    <dl class="cost-list"><div><dt>${t('Товары','Goods')}</dt><dd>${cash(o.goods,s.currency)}</dd></div><div><dt>${t('Скидка на товары','Goods discount')}</dt><dd>${o.discount === null ? '—' : '−' + cash(o.discount,s.currency)}</dd></div><div><dt>${t('Доставка','Delivery')}</dt><dd class="${o.shipping === null ? 'unknown' : ''}">${o.shipping === null ? t('Неизвестно','Unknown') : cash(o.shipping,s.currency)}</dd></div><div><dt>${t('Прочие сборы','Other fees')}</dt><dd>${o.fees === null ? t('Неизвестно','Unknown') : cash(o.fees,s.currency)}</dd></div></dl>
    <div class="delta ${best ? 'is-best' : ''}">${o.delta === null ? t('Не ранжируется','Not ranked') : o.delta === 0n ? t('Минимум среди полных','Lowest among complete quotes') : '+' + cash(o.delta,s.currency) + t(' к минимуму',' above lowest')}</div>
    ${o.issues.length ? `<details class="issues"><summary>${o.issues.length} ${t('причин исключения','exclusion reasons')}</summary><ul>${o.issues.map(v => `<li>${esc(issueText(v))}</li>`).join('')}</ul></details>` : ''}
    <details class="calculation"><summary>${t('Формулы и количество','Formulas & quantities')}</summary><div class="formula-lines">${state.items.map(item => {
      const line = o.lines.find(v => v.itemId === item.id), q = s.lines[item.id];
      return `<div class="formula-line"><strong>${esc(item.name)}</strong>${line ? `<p>${t('Нужно','Need')} ${line.required} ${unit(item.unit)} → <b>${line.packs} ${t('уп.','packs')} × ${line.pack} = ${line.bought} ${unit(item.unit)}</b></p><p class="surplus">${t('Излишек','Surplus')}: +${line.surplus} ${unit(item.unit)} · MOQ ${line.moq}</p><code>ceil(max(${line.required}, ${line.moq}) / ${line.pack}) = ${line.packs}</code><code>${q.basis === 'pack' ? line.packs : line.bought} × ${esc(q.price)} = ${cash(line.cost,s.currency)}</code>` : `<p>${t('Расчёт строки недоступен','Line cannot be calculated')}</p>`}</div>`;
    }).join('')}<div class="total-formula"><strong>${t('Итог','Total')}</strong><code>${cash(o.goods,s.currency)} − ${cash(o.discount,s.currency)} + ${cash(o.shipping,s.currency)} + ${cash(o.fees,s.currency)} = ${cash(o.total,s.currency)}</code><p>${t('Минимум товаров до скидки','Minimum goods before discount')}: ${cash(o.minimum,s.currency)}</p><p>${t('Срок','Lead time')}: ${esc(s.lead)||t('Не указан','Not provided')}</p><p>${esc(s.terms)||t('Другие условия не указаны','No other terms provided')}</p><p>${t('Неуказанное наличие не проверяется.','Stock is not checked when left blank.')}</p></div></div></details>
    ${button(t('Редактировать','Edit quote'),'edit-supplier','button card-button',`data-id="${esc(s.id)}"`)}
  </article>`;
}

function editor(result) {
  return `<section class="panel editor-panel"><div class="section-title"><div><p class="eyebrow">01 / ${t('ПОТРЕБНОСТЬ','REQUIREMENTS')}</p><h2>${t('Одна корзина для всех','One basket for everyone')}</h2></div>${button(t('+ Добавить товар','+ Add item'),'add-item','button secondary',state.items.length>=MAX_ITEMS?'disabled':'')}</div>
    <div class="form-grid setup-grid">${field(t('Название расчёта','Comparison name'),state.title,'data-scope="state" data-field="title"')}${select(t('Валюта сравнения','Comparison currency'),options(CURRENCIES,state.currency),'data-scope="state" data-field="currency"')}</div>
    <p class="form-note">${t('Только дискретные товары: шт., пары, наборы. Единицы должны совпадать точно. При смене спецификации подтверждения качества сбрасываются.','Discrete goods only: pieces, pairs, sets. Units must match exactly. Specification changes reset quality confirmations.')}</p>
    ${state.items.map((item,index) => `<div class="item-editor"><div class="item-edit-title"><strong>${String(index+1).padStart(2,'0')} / ${t('Товар','Item')}</strong>${button(t('Удалить','Remove'),'remove-item','text-button danger-text',`data-id="${esc(item.id)}" ${state.items.length<=1?'disabled':''}`)}</div><div class="form-grid item-grid">
      ${field(t('Название товара','Item name'),item.name,`data-scope="item" data-id="${esc(item.id)}" data-field="name"`)}
      ${field(t('Количество','Required quantity'),item.quantity,`inputmode="numeric" data-scope="item" data-id="${esc(item.id)}" data-field="quantity"`)}
      ${select(t('Единица','Unit'),options(UNITS,item.unit,unit),`data-scope="item" data-id="${esc(item.id)}" data-field="unit"`)}
      ${field(t('Спецификация / модель / качество','Specification / model / quality'),item.spec,`data-scope="item" data-id="${esc(item.id)}" data-field="spec"`)}
    </div></div>`).join('')}
    ${result.basketIssues.length ? `<div class="alert danger">${result.basketIssues.map(i => esc(issueText(i))).join('<br>')}</div>`:''}</section>
    <section class="section"><div class="section-title"><div><p class="eyebrow">02 / ${t('УСЛОВИЯ','TERMS')}</p><h2>${t('Предложения · от 2 до 4','Quotes · 2 to 4 suppliers')}</h2><p>${t('Пустой расход означает «неизвестно». Ноль вводится явно. Расчёт обновляется при вводе.','Blank cost means “unknown”. Enter zero explicitly. Calculations update as you type.')}</p></div>${button(t('+ Поставщик','+ Supplier'),'add-supplier','button secondary',state.suppliers.length>=MAX_SUPPLIERS?'disabled':'')}</div>
    <div class="supplier-editors">${state.suppliers.map((s,index) => supplierEditor(s,result.offers[index])).join('')}</div></section>`;
}
function supplierEditor(s,o) {
  const attrs = key => `data-scope="supplier" data-id="${esc(s.id)}" data-field="${key}"`;
  return `<details class="supplier-editor panel" ${activeSupplier===s.id?'open':''} data-supplier="${esc(s.id)}"><summary><span class="supplier-avatar">${esc(s.name.charAt(0).toUpperCase()||'?')}</span><span class="supplier-summary"><strong>${esc(s.name)||t('Новый поставщик','New supplier')}</strong><small>${o.eligible?t('Готов к сравнению','Ready to compare'):t('Требует проверки','Needs review')}</small></span><span class="badge ${o.eligible?'green':'amber'}">${o.eligible?cash(o.total,s.currency):o.issues.length+' '+t('проверок','checks')}</span></summary>
    <div class="supplier-fields"><div class="form-grid terms-grid">
    ${field(t('Название поставщика','Supplier name'),s.name,attrs('name'))}${select(t('Валюта предложения','Quote currency'),options(CURRENCIES,s.currency),attrs('currency'))}
    ${field(t('Доставка за заказ','Delivery per order'),s.shipping,`inputmode="decimal" placeholder="${t('Неизвестно','Unknown')}" ${attrs('shipping')}`)}
    ${field(t('Все прочие обязательные сборы','All other mandatory fees'),s.fees,`inputmode="decimal" placeholder="${t('Неизвестно','Unknown')}" ${attrs('fees')}`)}
    ${field(t('Скидка на товары, %','Goods discount, %'),s.discount,`inputmode="decimal" ${attrs('discount')}`)}
    ${field(t('Минимум суммы товаров до скидки','Minimum goods before discount'),s.minimum,`inputmode="decimal" ${attrs('minimum')}`)}
    ${field(t('Срок (необязательно)','Lead time (optional)'),s.lead,attrs('lead'))}${field(t('Условия / состав сборов','Terms / fee breakdown'),s.terms,attrs('terms'))}</div>
    ${checkbox(t('Все обязательные расходы учтены: доставка и сборы известны, остальные условия проверены.','All mandatory costs are included: delivery and fees are known, remaining terms reviewed.'),s.costsConfirmed,attrs('costsConfirmed'))}
    ${state.items.map(item => { const q=s.lines[item.id]; const a=key=>`data-scope="line" data-id="${esc(s.id)}" data-item="${esc(item.id)}" data-field="${key}"`; return `<fieldset class="quote-line"><legend>${esc(item.name)||t('Товар','Item')} <span>· ${t('нужно','need')} ${esc(item.quantity)} ${unit(item.unit)}</span></legend><p class="required-spec">${t('Требование','Requirement')}: ${esc(item.spec)||'—'}</p><div class="form-grid quote-grid">
      ${field(t('Цена (до 4 знаков)','Price (up to 4 decimals)'),q.price,`inputmode="decimal" ${a('price')}`)}
      ${select(t('Цена указана за','Price is per'),options(['unit','pack'],q.basis,v=>v==='unit'?t('1 единицу','1 unit'):t('1 упаковку','1 pack')),a('basis'))}
      ${select(t('Единица предложения','Quote unit'),options(UNITS,q.unit,unit),a('unit'))}
      ${field(t('Единиц в упаковке','Units per pack'),q.pack,`inputmode="numeric" ${a('pack')}`)}
      ${field(t('MOQ, единиц (0 = нет)','MOQ, units (0 = none)'),q.moq,`inputmode="numeric" ${a('moq')}`)}
      ${field(t('Доступно, единиц (необязательно)','Available units (optional)'),q.available,`inputmode="numeric" placeholder="${t('Не проверяется','Not checked')}" ${a('available')}`)}
    </div><label class="field"><span>${t('Предлагаемый товар / модель / качество','Offered product / model / quality')}</span><textarea rows="2" maxlength="500" ${a('spec')}>${esc(q.spec)}</textarea></label>
    ${checkbox(t('Я проверил(а): это тот же товар, спецификация и качество сопоставимы.','I checked: this is the same product, with comparable specification and quality.'),q.confirmed,a('confirmed'))}
    </fieldset>`; }).join('')}
    ${o.issues.length?`<div class="validation"><strong>${t('Перед сравнением проверьте','Check before comparing')}</strong><ul>${o.issues.map(v=>`<li>${esc(issueText(v))}</li>`).join('')}</ul></div>`:''}
    <div class="editor-bottom">${button(t('Вернуться к сравнению →','Back to comparison →'),'compare','button primary')}${button(t('Удалить поставщика','Remove supplier'),'remove-supplier','text-button danger-text',`data-id="${esc(s.id)}" ${state.suppliers.length<=2?'disabled':''}`)}</div></div></details>`;
}

function files() {
  return `<section class="files-grid"><div class="panel file-panel"><p class="eyebrow">${t('ЛОКАЛЬНЫЕ ФАЙЛЫ','LOCAL FILES')}</p><h2>${t('Возьмите расчёт с собой','Take your calculation with you')}</h2><p>${t('Файлы создаются в браузере. Ничего не загружается на сервер.','Files are created in your browser. Nothing is uploaded to a server.')}</p><div class="export-list">
    <div><strong>${t('Резервная копия JSON','JSON backup')}</strong><p>${t('Все поля, неизвестные значения и ручные подтверждения. Для восстановления.','Every field, unknown value and manual confirmation. Use to restore.')}</p>${button(t('Скачать JSON','Download JSON'),'download-backup','button secondary')}</div>
    <div><strong>${t('Расчёт JSON + CSV','Calculation JSON + CSV')}</strong><p>${t('JSON — входные данные, формулы и точные значения в копейках/центах; CSV — удобная таблица результатов.','JSON includes inputs and exact amounts in minor units; CSV gives a readable results table.')}</p><div class="row-actions">${button(t('Расчёт JSON','Calculation JSON'),'download-report','button secondary')}${button(t('Результат CSV','Results CSV'),'download-results','button secondary')}</div></div>
    <div><strong>${t('Шаблон CSV','CSV template')}</strong><p>${t('Текущая корзина в формате импорта: строка на товар × поставщик. Понятная схема — ниже.','Current basket in import format: one row per item × supplier. Schema explained below.')}</p>${button(t('Скачать шаблон CSV','Download CSV template'),'download-template','button secondary')}</div></div></div>
    <div class="panel file-panel"><p class="eyebrow">${t('ИМПОРТ С ПРОВЕРКОЙ','REVIEWED IMPORT')}</p><h2>${t('Восстановить или импортировать','Restore or import')}</h2><p>${t('JSON сохраняет подтверждения. CSV сбрасывает их: качество и полноту расходов нужно проверить заново.','JSON preserves confirmations. CSV resets them: review quality and cost completeness again.')}</p>
      <label class="file-picker"><span>${t('Выбрать CSV или JSON (до 1 МБ)','Choose CSV or JSON (up to 1 MB)')}</span><input id="file-input" type="file" accept=".csv,.json,text/csv,application/json"></label>
      <label class="field"><span>${t('Или вставить CSV / JSON','Or paste CSV / JSON')}</span><textarea id="import-text" rows="7" maxlength="1000000" spellcheck="false" placeholder="comparison_currency,item_id,…">${esc(importText)}</textarea></label>
      <div class="row-actions">${button(t('Проверить импорт','Review import'),'review-import','button primary')}${button(t('Показать текущий CSV','Show current CSV'),'show-csv','text-button')}</div>
      ${importError?`<div class="alert danger" role="alert">${esc(importError)}</div>`:''}
      ${staged?`<div class="import-preview"><strong>${t('Готово к замене корзины','Ready to replace the basket')}</strong><p>${staged.items.length} ${t('товаров','items')} · ${staged.suppliers.length} ${t('поставщиков','suppliers')} · ${esc(staged.currency)}</p><p>${t('Текущая версия сохранится для отмены. Неполные данные останутся вне сравнения.','The current version is saved for undo. Incomplete quotes stay excluded.')}</p>${button(t('Применить импорт','Apply import'),'apply-import','button primary')}${button(t('Отмена','Cancel'),'cancel-import','text-button')}</div>`:''}
      ${previous?`<div class="undo-row">${button(t('↶ Вернуть корзину до последней замены','↶ Restore basket before last replacement'),'undo-import','text-button')}</div>`:''}
    </div></section>
    <details class="panel schema"><summary>${t('Как заполнить CSV · 22 столбца','How to fill CSV · 22 columns')}</summary><p>${t('UTF-8, разделитель — запятая; десятичная точка или запятая в кавычках. Заголовок менять нельзя. Повторяйте условия поставщика одинаково во всех строках. Для каждого поставщика нужна строка каждого товара.','UTF-8, comma delimiter; decimal point, or a quoted decimal comma. Keep the header unchanged. Repeat supplier terms identically on every row. Each supplier needs one row for every item.')}</p>
    <dl class="schema-list"><div><dt>comparison_currency</dt><dd>${t('RUB, USD, EUR или GBP. Одна валюта сравнения.','RUB, USD, EUR or GBP. One comparison currency.')}</dd></div><div><dt>item_id, item_name, item_spec</dt><dd>${t('Уникальный ID, название и точная спецификация.','Unique ID, name and exact specification.')}</dd></div><div><dt>required_qty, required_unit</dt><dd>${t('Целое количество ≥ 1; pcs, pair или set.','Integer quantity ≥ 1; pcs, pair or set.')}</dd></div><div><dt>supplier_id, supplier_name, supplier_currency</dt><dd>${t('ID, имя и валюта предложения; несовпадение валют исключает его.','ID, name and quote currency; a currency mismatch excludes the quote.')}</dd></div><div><dt>price, price_basis, pack_qty, moq_units</dt><dd>${t('Цена ≥ 0 (до 4 знаков); unit или pack; целая упаковка ≥ 1; MOQ в единицах ≥ 0.','Price ≥ 0 (up to 4 decimals); unit or pack; integer pack ≥ 1; MOQ in units ≥ 0.')}</dd></div><div><dt>available_units, offer_unit, offer_spec</dt><dd>${t('Необязательное известное наличие; единица и спецификация предложения.','Optional known stock; quote unit and offered specification.')}</dd></div><div><dt>shipping, fees, discount_pct, min_goods</dt><dd>${t('Доставка и сумма всех обязательных сборов; скидка на товары 0–100%; минимум товаров до скидки. До 2 знаков. Пусто = неизвестно, 0 = явно нет.','Delivery, sum of all mandatory fees; goods discount 0–100%; minimum goods before discount. Up to 2 decimals. Blank = unknown, 0 = explicitly none.')}</dd></div><div><dt>lead_time, terms</dt><dd>${t('Необязательные сроки и условия. Формулы не исполняются. Экспорт экранирует формулоподобные значения апострофом. Для точной копии используйте JSON.','Optional lead time and terms. Formulas are never evaluated. Export prefixes formula-like values with an apostrophe. Use JSON for an exact copy.')}</dd></div></dl></details>`;
}

function method() {
  return `<section class="panel method"><p class="eyebrow">${t('ПРОВЕРЯЕМАЯ АРИФМЕТИКА','AUDITABLE ARITHMETIC')}</p><h2>${t('От потребности к полной сумме','From requirement to full total')}</h2><ol class="method-steps"><li><strong>${t('Сначала упаковки и MOQ','Packs and MOQ first')}</strong><code>packs = ceil(max(required, MOQ) / pack_size)<br>buy = packs × pack_size<br>surplus = buy − required</code><p>${t('MOQ задаётся в единицах товара. Упаковки всегда целые. Известное наличие должно покрывать всё количество к покупке.','MOQ is in item units. Packs are always whole. Known stock must cover the entire purchase quantity.')}</p></li>
    <li><strong>${t('Затем стоимость строк','Then line costs')}</strong><code>line = round_half_up(buy × unit_price, 2)<br>${t('или','or')} line = round_half_up(packs × pack_price, 2)</code><p>${t('Цена: 0–100 000 000, до 4 десятичных знаков. Количества: целые, до 1 000 000. Цена 0 допустима и требует такого же ручного подтверждения.','Price: 0–100,000,000, up to 4 decimals. Quantities: integers, up to 1,000,000. A zero price is allowed and requires the same manual verification.')}</p></li>
    <li><strong>${t('Скидка и все расходы','Discount and all costs')}</strong><code>goods = sum(rounded_lines)<br>discount = round_half_up(goods × percent / 100, 2)<br>total = goods − discount + delivery + fees</code><p>${t('Скидка применяется только к товарам; доставка и сборы — после неё. Минимальная сумма проверяется по товарам до скидки; недостающие товары не добавляются. Деньги считаются целыми BigInt, без ошибок 0.1 + 0.2.','Discount applies to goods only; delivery and fees are added after it. Minimum order is checked on goods before discount; no extra goods are added automatically. Money uses integer BigInt arithmetic, avoiding 0.1 + 0.2 errors.')}</p></li>
    <li><strong>${t('Сравниваем только подтверждённое','Compare only verified quotes')}</strong><p>${t('Каждая строка должна покрывать тот же товар и качество, единицы и валюта должны совпадать. Все обязательные расходы должны быть известны. Нужны минимум два допущенных предложения; равенство показывается явно.','Each line must cover the same product and quality, with matching units and currency. All mandatory costs must be known. At least two eligible quotes are needed; ties are shown explicitly.')}</p></li></ol>
    <div class="alert neutral-alert"><strong>${t('Границы первого релиза','First release limits')}</strong><p>${t('1–12 дискретных товаров, 2–4 поставщика, одна полная корзина у одного поставщика. RUB / USD / EUR / GBP с 2 знаками. Нет весовых единиц, конвертаций, ценовых ступеней, автоматических порогов бесплатной доставки, налоговых рекомендаций или разделения заказа. Условные скидки и сборы внесите вручную по действующим условиям. Наличие без значения не проверяется.','1–12 discrete items, 2–4 suppliers, one full basket per supplier. RUB / USD / EUR / GBP with 2 decimal places. No weight units, conversions, price tiers, automatic free-delivery thresholds, tax guidance or split orders. Enter conditional discounts and charges manually for the applicable terms. Blank availability is not verified.')}</p><p>${t('Без OCR, ИИ, аккаунта, API, аналитики и сетевой отправки. Хранилище привязано к браузеру и адресу; очистка данных или смена порта может скрыть корзину. Экспортируйте JSON.','No OCR, AI, account, API, analytics or network uploads. Storage belongs to this browser and origin; clearing data or changing ports can hide the basket. Export JSON backups.')}</p></div></section>`;
}

function checkpoint() {
  previous = structuredClone(state);
  try { localStorage.setItem('quotelens.previous.v1',backup(previous)); } catch { /* in-memory undo still works */ }
}
function download(content, filename, type) {
  const url=URL.createObjectURL(new Blob([content],{type})); const link=document.createElement('a');
  link.href=url; link.download=filename; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast=t('Файл подготовлен. Проверьте загрузки браузера.','File prepared. Check your browser downloads.'); render();
}
function reviewImport() {
  staged=null; importError='';
  try { staged=importText.trim().startsWith('{') ? restore(importText) : importInputCSV(importText,state.lang); }
  catch(e) { importError=e.message; }
  render();
}
// Keep edited controls mounted: a blur/change must never swallow the next button click.
function refreshEditor() {
  const fresh=document.createElement('div'); fresh.innerHTML=editor(compare(state));
  for(const current of root.querySelectorAll('.supplier-editor')) {
    const next=fresh.querySelector(`[data-supplier="${current.dataset.supplier}"]`);
    current.querySelector('summary').innerHTML=next.querySelector('summary').innerHTML;
    const oldValidation=current.querySelector('.validation'), nextValidation=next.querySelector('.validation');
    if(oldValidation)oldValidation.remove();
    if(nextValidation)current.querySelector('.editor-bottom').before(nextValidation);
    const legends=current.querySelectorAll('.quote-line legend'), specs=current.querySelectorAll('.required-spec');
    next.querySelectorAll('.quote-line legend').forEach((v,i)=>legends[i].innerHTML=v.innerHTML);
    next.querySelectorAll('.required-spec').forEach((v,i)=>specs[i].innerHTML=v.innerHTML);
  }
  for(const el of root.querySelectorAll('[data-scope="line"][data-field="confirmed"]'))el.checked=state.suppliers.find(s=>s.id===el.dataset.id).lines[el.dataset.item].confirmed;
  const oldIssues=root.querySelector('.editor-panel > .alert'), newIssues=fresh.querySelector('.editor-panel > .alert');
  if(oldIssues)oldIssues.remove();
  if(newIssues)root.querySelector('.editor-panel').append(newIssues);
  root.querySelector('.workspace-name > strong').textContent=state.title||t('Без названия','Untitled');
  if(!state.demo)root.querySelector('.workspace-name .badge')?.remove();
  const status=root.querySelector('.save-status'); status.textContent=storageBlocked||storageError?t('Только в памяти','In memory only'):t('Сохраняется в браузере','Saved in this browser');
  if(storageError&&!root.querySelector('.storage-failure')) {
    const warning=document.createElement('div');warning.className='alert danger storage-failure';warning.role='alert';warning.textContent=t('Сохранение не удалось. Скачайте JSON перед закрытием.','Save failed. Download JSON before closing.');root.querySelector('.workspace-bar').before(warning);
  }
}
root.addEventListener('input',e=>{
  if(e.target.id==='import-text') {
    const draft=prepareImportText(e.target.value);importText=draft.text;staged=null;
    const preview=root.querySelector('.import-preview');if(preview)preview.remove();
    if(draft.error){e.target.value='';importError=draft.error;render();}
  }
  if(e.target.dataset.scope)updateField(e.target);
});
root.addEventListener('change',async e=>{
  const el=e.target;
  if(el.id==='file-input') {
    const file=el.files[0]; if(!file)return;
    if(file.size>1000000) { importError=t('Максимум 1 МБ.','Maximum 1 MB.'); staged=null; render(); return; }
    try {const draft=prepareImportText(await file.text());importText=draft.text;if(draft.error){importError=draft.error;staged=null;render();}else reviewImport();} catch { importError=t('Не удалось прочитать файл.','Cannot read file.'); render(); } return;
  }
  if(el.dataset.scope)updateField(el);
});
function updateField(el) {
  const {scope,id:targetId,item: itemId,field:key}=el.dataset; if(!scope)return;
  const value=el.type==='checkbox'?el.checked:el.value;
  if(scope==='state') state[key]=value;
  if(scope==='item') {
    const item=state.items.find(v=>v.id===targetId); item[key]=value;
    if(['name','spec','unit'].includes(key)) for(const s of state.suppliers) s.lines[item.id].confirmed=false;
  }
  if(scope==='supplier') { const s=state.suppliers.find(v=>v.id===targetId); s[key]=value; activeSupplier=targetId; }
  if(scope==='line') { const q=state.suppliers.find(v=>v.id===targetId).lines[itemId]; q[key]=value; if(['spec','unit'].includes(key))q.confirmed=false; activeSupplier=targetId; }
  if(key!=='lang')state.demo=false;
  persist(); refreshEditor();
}
root.addEventListener('toggle',e=>{if(e.target.matches('.supplier-editor')) {if(e.target.open)activeSupplier=e.target.dataset.supplier;else if(activeSupplier===e.target.dataset.supplier)activeSupplier=null;}},true);
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY||e.key===null){storageBlocked=true;storageConflict=true;render();}});
root.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]'); if(!el||el.disabled)return;
  const action=el.dataset.action; toast='';
  let focusSelector=actionFocus(action,el.dataset.id);
  if(['compare','edit','files','method'].includes(action)) {tab=action;staged=null;}
  else if(action==='ru'||action==='en') {state.lang=action;persist();}
  else if(action==='edit-supplier') {tab='edit';activeSupplier=el.dataset.id;focusSelector=`[data-scope="supplier"][data-id="${activeSupplier}"][data-field="name"]`;}
  else if(action==='export')tab='files';
  else if(action==='new') {
    checkpoint();storageBlocked=false;storageConflict=false;
    const items=[{id:uid('item'),name:'',spec:'',quantity:'1',unit:'pcs'}];
    state={version:1,title:t('Новая корзина','New basket'),currency:state.currency,lang:state.lang,demo:false,items,suppliers:[blankSupplier(uid('supplier'),state.currency,items),blankSupplier(uid('supplier'),state.currency,items)]};
    tab='edit';activeSupplier=state.suppliers[0].id;persist();
    toast=t('Создана новая корзина. Предыдущую можно вернуть в разделе «Импорт и файлы».','New basket created. Restore the previous one in Import & files.');
  }
  else if(action==='add-item'&&state.items.length<MAX_ITEMS) {
    const item={id:uid('item'),name:'',spec:'',quantity:'1',unit:'pcs'};state.items.push(item);for(const s of state.suppliers)s.lines[item.id]=blankLine();state.demo=false;persist();
    if(state.items.length===MAX_ITEMS)focusSelector=`[data-scope="item"][data-id="${item.id}"][data-field="name"]`;
  }
  else if(action==='remove-item'&&state.items.length>1) {
    const index=state.items.findIndex(v=>v.id===el.dataset.id);checkpoint();state.items=state.items.filter(v=>v.id!==el.dataset.id);for(const s of state.suppliers)delete s.lines[el.dataset.id];state.demo=false;persist();
    focusSelector=state.items.length>1?actionFocus('remove-item',state.items[Math.min(index,state.items.length-1)].id):actionFocus('add-item');
  }
  else if(action==='add-supplier'&&state.suppliers.length<MAX_SUPPLIERS) {
    const s=blankSupplier(uid('supplier'),state.currency,state.items);state.suppliers.push(s);activeSupplier=s.id;state.demo=false;persist();
    if(state.suppliers.length===MAX_SUPPLIERS)focusSelector=`[data-scope="supplier"][data-id="${s.id}"][data-field="name"]`;
  }
  else if(action==='remove-supplier'&&state.suppliers.length>2) {
    const index=state.suppliers.findIndex(s=>s.id===el.dataset.id);checkpoint();state.suppliers=state.suppliers.filter(s=>s.id!==el.dataset.id);state.demo=false;persist();
    if(state.suppliers.length>2){activeSupplier=state.suppliers[Math.min(index,state.suppliers.length-1)].id;focusSelector=actionFocus('remove-supplier',activeSupplier);}
    else focusSelector=actionFocus('add-supplier');
  }
  else if(action==='show-csv') {importText=exportInputCSV(state);staged=null;importError='';}
  else if(action==='review-import') {reviewImport();return;}
  else if(action==='cancel-import')staged=null;
  else if(action==='apply-import'&&staged) {checkpoint();state=staged;staged=null;storageBlocked=false;storageConflict=false;persist();tab='compare';toast=t('Импорт применён. Проверьте сопоставимость и расходы каждого предложения.','Import applied. Review comparability and costs for every quote.');}
  else if(action==='undo-import'&&previous) {const next=previous;checkpoint();state=next;storageBlocked=false;storageConflict=false;persist();toast=t('Предыдущая корзина восстановлена.','Previous basket restored.');}
  else if(action==='download-backup') {download(backup(state),'quotelens-backup.json','application/json');return;}
  else if(action==='download-report') {download(report(state),'quotelens-calculation.json','application/json');return;}
  else if(action==='download-results') {download(reportCSV(state),'quotelens-results.csv','text/csv;charset=utf-8');return;}
  else if(action==='download-template') {download(exportInputCSV(state),'quotelens-input.csv','text/csv;charset=utf-8');return;}
  render(focusSelector);
});
render();
