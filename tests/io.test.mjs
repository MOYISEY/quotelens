import test from 'node:test';
import assert from 'node:assert/strict';
import { demo, compare } from '../src/engine.js';
import { backup, restore, validateState, parseCSV, writeCSV, HEADERS, exportInputCSV, importInputCSV, saveLocal, readLocal, report, reportCSV, prepareImportText } from '../src/io.js';

test('oversized pasted input is discarded before retained state or HTML rendering',()=>{
  const rejected=prepareImportText('z'.repeat(1000001));assert.equal(rejected.text,'');assert.ok(rejected.error.length<200);
  assert.equal(prepareImportText('z'.repeat(1000000)).text.length,1000000);
  assert.deepEqual(prepareImportText(''),{text:'',error:''});
});

test('JSON roundtrip preserves Unicode, quotes, commas, zero, unknowns and booleans',()=>{
  const s=demo();s.title='Корзина, "é 🖊"';s.suppliers[0].terms='line1\nline2, "стоимость"';
  const restored=restore(backup(s));assert.deepEqual(restored,s);
  assert.equal(restored.suppliers[3].shipping,'');assert.equal(restored.suppliers[0].fees,'0');
  assert.deepEqual(compare(restored),compare(s));
});
test('CSV roundtrip retains input values, Unicode, multiline fields, comma prices; resets trust',()=>{
  const s=demo();s.items[0].name='Ручка, "модель" 🖊';s.suppliers[0].terms='Line 1\nLine 2';s.suppliers[0].lines.notebook.price='80,1250';
  const csv=exportInputCSV(s), imported=importInputCSV(csv);
  assert.deepEqual(imported.items,s.items);assert.equal(imported.suppliers[0].terms,'Line 1\nLine 2');assert.equal(imported.suppliers[0].lines.notebook.price,'80,1250');
  assert.equal(imported.suppliers[3].shipping,'');assert.equal(imported.suppliers[0].fees,'0');
  assert.equal(compare(imported).eligibleCount,0);
  assert.ok(imported.suppliers.every(v=>!v.costsConfirmed&&Object.values(v.lines).every(q=>!q.confirmed)));
});
test('edits after CSV import recalculate; restoring confirmations enables new totals',()=>{
  const s=importInputCSV(exportInputCSV(demo()));
  for(const supplier of s.suppliers){supplier.costsConfirmed=true;for(const q of Object.values(supplier.lines))q.confirmed=true;}
  assert.equal(compare(s).best,165800n);
  s.suppliers[0].shipping='0';assert.deepEqual(compare(s).winners,['atlas']);
  s.suppliers[0].shipping='';assert.deepEqual(compare(s).winners,['river']);
});
test('CSV parser rejects malformed quotes, wrong header/delimiter, duplicates, missing rows',()=>{
  assert.throws(()=>parseCSV('"oops'));
  assert.throws(()=>parseCSV('a"b,c'));
  assert.throws(()=>parseCSV('"a"x,c'));
  assert.throws(()=>importInputCSV('wrong,headers\n1,2'));
  const rows=parseCSV(exportInputCSV(demo()));
  assert.throws(()=>importInputCSV(writeCSV([...rows,rows[1]])),/Duplicate/);
  assert.throws(()=>importInputCSV(writeCSV(rows.slice(0,-1))),/Missing/);
  const short=structuredClone(rows);short[1].pop();assert.throws(()=>importInputCSV(writeCSV(short)),/columns/);
});
test('CSV rejects conflicting repeated basket or supplier data without a partial import',()=>{
  const rows=parseCSV(exportInputCSV(demo()));
  for(const [row,column,value] of [[3,'item_name','Other'],[2,'shipping','999'],[2,'comparison_currency','EUR']]) {
    const clone=structuredClone(rows);clone[row][HEADERS.indexOf(column)]=value;
    assert.throws(()=>importInputCSV(writeCSV(clone)),/Conflicting/);
  }
});
test('CSV exports neutralize spreadsheet formula-like cells, including leading whitespace',()=>{
  for(const text of ['=SUM(A1:A2)','+cmd','-cmd','@evil','  =HYPERLINK("x")','\t=1','\r=1']) {
    const s=demo();s.items[0].name=text;s.suppliers[0].terms=text;
    const rows=parseCSV(exportInputCSV(s));assert.ok(rows[1][2].startsWith("'"));assert.ok(rows[1].at(-1).startsWith("'"));
    const results=parseCSV(reportCSV(s));assert.ok(results[1][4].startsWith("'"));assert.ok(results[1].at(-1).startsWith("'"));
  }
});
test('untrusted backup is whitelisted; prototype-like IDs rejected',()=>{
  const s=demo();s.extra='untrusted';assert.equal(validateState(s).extra,undefined);
  for(const key of ['__proto__','constructor','prototype']){const x=demo();x.items[0].id=key;assert.throws(()=>validateState(x));}
});
test('JSON limits and schema: malformed, unknown version, bad type, too many suppliers/items',()=>{
  assert.throws(()=>restore('not json'));assert.throws(()=>restore('x'.repeat(1000001)));
  for(const mutate of [s=>s.version=2,s=>s.currency='JPY',s=>s.items=[],s=>s.suppliers=s.suppliers.slice(0,1),s=>s.suppliers.push({...s.suppliers[0],id:'new'}),s=>s.items[0].quantity=20,s=>s.suppliers[0].costsConfirmed='true',s=>s.suppliers[1].id=s.suppliers[0].id]) {
    const s=demo();mutate(s);assert.throws(()=>validateState(s));
  }
});
test('draft invalid numbers are preserved as text and excluded, never sanitized to zero',()=>{
  const s=demo();s.suppliers[0].shipping='-10';
  const restored=restore(backup(s));assert.equal(restored.suppliers[0].shipping,'-10');assert.equal(compare(restored).offers[0].total,null);
});
test('local persistence roundtrip, missing record, corrupt record, quota failure',()=>{
  const map=new Map();const storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};
  assert.equal(readLocal(storage),null);assert.equal(saveLocal(storage,demo()),true);assert.deepEqual(readLocal(storage),demo());
  storage.setItem('quotelens.v1','{broken');assert.throws(()=>readLocal(storage));
  assert.equal(saveLocal({setItem(){throw new Error('quota');}},demo()),false);
});
test('report exports exact integer strings; unknown stays null and excluded has no delta',()=>{
  const output=JSON.parse(report(demo()));
  assert.equal(output.calculation.best,'165800');assert.equal(output.calculation.offers[3].shipping,null);assert.equal(output.input.suppliers[3].shipping,'');assert.equal(output.calculation.offers[3].delta,null);
  const rows=parseCSV(reportCSV(demo()));assert.equal(rows.length,9);assert.equal(rows[1][14],'2060.00');assert.equal(rows[7][14],'');
});
