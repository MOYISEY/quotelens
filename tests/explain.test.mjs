import test from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../src/engine.js';
import { explainComparison, previewQuote, decimalText } from '../src/explain.js';
import { backup, restore, exportInputCSV, importInputCSV, report, saveLocal, readLocal } from '../src/io.js';
import { everydayBasket } from './fixtures.mjs';
const sum = object => Object.values(object).reduce((n,v)=>n+v,0n);

test('A360 vs B390: goods -50 + delivery80 = total30; unknown Budget is not the competitor',()=>{
  const state=everydayBasket(), before=backup(state), result=compare(state), view=explainComparison(result);
  assert.deepEqual(result.offers.map(o=>o.total),[36000n,39000n,null]);
  assert.equal(view.kind,'lowest');assert.equal(view.referenceId,'north');assert.equal(view.competitorId,'box');assert.deepEqual(view.excluded,['budget']);
  assert.deepEqual(view.contributions,{goods:-5000n,shipping:8000n,fees:0n,discount:0n});assert.equal(view.delta,3000n);assert.equal(sum(view.contributions),view.delta);assert.equal(backup(state),before);
});
test('all fees and rounded discounts contribute with the cost sign and sum exactly',()=>{
  const state=everydayBasket();state.suppliers[0].fees='1.23';state.suppliers[1].fees='4.56';state.suppliers[0].discount='10.01';state.suppliers[1].discount='5.01';
  const result=compare(state), view=explainComparison(result);
  assert.equal(result.offers[0].discount,3504n);assert.equal(result.offers[1].discount,1503n);
  assert.deepEqual(view.contributions,{goods:-5000n,shipping:8000n,fees:333n,discount:2001n});assert.equal(view.delta,5334n);assert.equal(sum(view.contributions),view.delta);
});
test('larger competitor discount is a negative contribution and not a positive fee',()=>{
  const state=everydayBasket();state.suppliers[1].discount='10';
  const view=explainComparison(compare(state));assert.equal(view.kind,'tie');assert.equal(view.contributions.discount,-3000n);assert.equal(view.delta,0n);assert.equal(sum(view.contributions),0n);
});
test('tie has all tied leaders; no unique winner is invented',()=>{
  const state=everydayBasket();state.suppliers[1].shipping='60';state.suppliers[2].shipping='92';
  const view=explainComparison(compare(state));assert.equal(view.kind,'tie');assert.deepEqual(view.leaders,['north','box','budget']);assert.equal(view.delta,0n);assert.equal(sum(view.contributions),0n);
});
test('one or zero complete quotes has no competitor, winner, delta or decomposition',()=>{
  const state=everydayBasket();state.suppliers[1].currency='USD';
  let view=explainComparison(compare(state));assert.equal(view.kind,'insufficient');assert.deepEqual(view.eligible,['north']);assert.equal(view.competitorId,undefined);assert.equal(view.delta,undefined);
  state.suppliers[0].costsConfirmed=false;view=explainComparison(compare(state));assert.deepEqual(view.eligible,[]);assert.equal(view.contributions,undefined);
});
test('nearest complete competitor follows totals, not source order or a cheap excluded subtotal',()=>{
  const state=everydayBasket();state.suppliers[2].shipping='97';
  let view=explainComparison(compare(state));assert.equal(view.competitorId,'budget');assert.equal(view.delta,500n);
  state.suppliers[2].lines.notebook.confirmed=false;view=explainComparison(compare(state));assert.equal(view.competitorId,'box');assert.equal(view.delta,3000n);
});
test('normalized pack vs unit previews show 2 packs ×12, with exact costs200 vs2400',()=>{
  const state=everydayBasket(),item=state.items[0],q=state.suppliers[1].lines.notebook;
  let preview=previewQuote(item,q);assert.equal(preview.kind,'valid');assert.equal(preview.line.packs,2n);assert.equal(preview.line.bought,24n);assert.equal(preview.line.cost,20000n);assert.equal(preview.indicativeUnitPrice,83333n);
  preview=previewQuote(item,{...q,basis:'unit'});assert.equal(preview.line.cost,240000n);assert.equal(preview.indicativeUnitPrice,null);assert.equal(q.basis,'pack');assert.equal(q.price,'100');
});
test('indicative unit price is never multiplied into exact pack cost, including a repeating division',()=>{
  const state=everydayBasket(),item=state.items[0],q=state.suppliers[1].lines.notebook;
  const preview=previewQuote({...item,quantity:'36'},q);assert.equal(preview.line.cost,30000n);assert.equal(preview.line.packs,3n);assert.equal(preview.indicativeUnitPrice,83333n);
  assert.notEqual(preview.line.cost,preview.indicativeUnitPrice*preview.line.bought/100n);
});
test('preview responds to price, basis, pack, MOQ and quantity using the existing calculator',()=>{
  const state=everydayBasket(),item=state.items[0],q=state.suppliers[1].lines.notebook;
  assert.equal(previewQuote(item,{...q,price:'100.0050'}).line.cost,20001n);
  assert.equal(previewQuote(item,{...q,moq:'25'}).line.bought,36n);
  assert.equal(previewQuote(item,{...q,pack:'10'}).line.bought,30n);
  assert.equal(previewQuote({...item,quantity:'13'},q).line.surplus,11n);
});
test('empty and invalid preview fields never become a fictitious zero',()=>{
  const state=everydayBasket(),item=state.items[0],q=state.suppliers[1].lines.notebook;
  for(const patch of [{price:''},{price:'-1'},{pack:'0'},{moq:''},{basis:'other'}])assert.deepEqual(previewQuote(item,{...q,...patch}),{kind:'invalid',reason:'numbers'});
  assert.deepEqual(previewQuote(item,{...q,unit:'pair'}),{kind:'invalid',reason:'unit'});assert.equal(previewQuote({...item,quantity:'0'},q).kind,'invalid');assert.equal(previewQuote(item,{...q,price:'0'}).line.cost,0n);
});
test('scaled price display uses exact BigInt and localized decimal separators',()=>{
  assert.equal(decimalText(1000000n,4,'ru'),'100');assert.equal(decimalText(83333n,4,'ru'),'8,3333');assert.equal(decimalText(83333n,4,'en'),'8.3333');assert.equal(decimalText(0n,4,'en'),'0');
  assert.equal(decimalText(1000000000000n,4,'en'),'100,000,000');
});
test('JSON/report/CSV/save roundtrips retain exact explanation and original pack inputs',()=>{
  const state=everydayBasket(),expected=explainComparison(compare(state));assert.deepEqual(explainComparison(compare(restore(backup(state)))),expected);
  const exported=JSON.parse(report(state));assert.equal(exported.input.suppliers[1].lines.notebook.price,'100');assert.equal(exported.input.suppliers[1].lines.notebook.basis,'pack');assert.equal(exported.calculation.offers[1].total,'39000');
  const csv=importInputCSV(exportInputCSV(state));assert.equal(explainComparison(compare(csv)).kind,'insufficient');for(const supplier of csv.suppliers){supplier.costsConfirmed=true;for(const q of Object.values(supplier.lines))q.confirmed=true;}assert.deepEqual(explainComparison(compare(csv)),expected);
  const saved=new Map(),storage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};assert.equal(saveLocal(storage,state),true);assert.deepEqual(explainComparison(compare(readLocal(storage))),expected);
});
