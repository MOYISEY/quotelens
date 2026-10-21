import test from 'node:test';
import assert from 'node:assert/strict';
import { decimal, integer, roundHalfUp, calculateLine, compare, demo, amount, money, blankSupplier } from '../src/engine.js';

const item={id:'i',name:'Part',spec:'Model T, grade 1',quantity:'20',unit:'pcs'};
const line={price:'18000',basis:'unit',pack:'1',moq:'0',available:'',unit:'pcs',spec:item.spec,confirmed:true};
function fixture() {
  const state={version:1,title:'Reference',lang:'en',demo:false,currency:'RUB',items:[{...item}],suppliers:[]};
  for(const name of ['A','B','C','D'])state.suppliers.push({...blankSupplier(name,'RUB',state.items),name,shipping:'20000',costsConfirmed:true,lines:{i:{...line}}});
  state.suppliers[1].shipping='50000';state.suppliers[1].lines.i.price='17000';
  state.suppliers[2].lines.i={...line,basis:'pack',price:'92000',pack:'6'};
  state.suppliers[3].lines.i={...line,price:'16000',available:'18'};
  return state;
}
test('reference: A 380000 beats B 390000 and C 388000; D stock 18 is excluded',()=>{
  const result=compare(fixture());
  assert.deepEqual(result.offers.map(v=>v.total),[38000000n,39000000n,38800000n,34000000n]);
  assert.deepEqual(result.winners,['A']);assert.equal(result.best,38000000n);
  assert.equal(result.offers[2].lines[0].packs,4n);assert.equal(result.offers[2].lines[0].surplus,4n);
  assert.equal(result.offers[3].eligible,false);assert.equal(result.offers[3].delta,null);assert.ok(result.offers[3].issues.some(v=>v.code==='stock'));
});
test('demo: delivery reverses Atlas vs River; Bulk MOQ buys 40/50; unknown excluded',()=>{
  const result=compare(demo());
  assert.equal(result.offers[0].goods,146000n);assert.equal(result.offers[0].total,206000n);
  assert.equal(result.offers[1].total,165800n);assert.equal(result.offers[2].total,360000n);
  assert.deepEqual(result.offers[2].lines.map(v=>v.bought),[40n,50n]);
  assert.equal(result.offers[3].total,null);assert.deepEqual(result.winners,['river']);
});
test('decimal parsing accepts comma and exact 4 decimals, never floats',()=>{
  assert.equal(decimal('0,1000',4),1000n);assert.equal(decimal('0.2',4),2000n);assert.equal(decimal(' 001.25 ',2),125n);
  assert.equal(decimal('0',2),0n);assert.equal(integer('0'),0n);
});
for(const value of ['', ' ', '-1','+1','1e2','NaN','Infinity','1,2.3','1 000','1.00001','100000001','0x10'])test(`invalid decimal ${JSON.stringify(value)}`,()=>assert.throws(()=>decimal(value,4)));
for(const value of ['','-1','0','1.5','1,5','1000001'])test(`invalid positive quantity ${JSON.stringify(value)}`,()=>assert.throws(()=>integer(value,{positive:true})));
test('money round half up at line level, then discount (not float or bankers rounding)',()=>{
  assert.equal(roundHalfUp(1005n,10n),101n);
  const small={...item,quantity:'3'};
  assert.equal(calculateLine(small,{...line,price:'0.335'}).cost,101n);
  assert.equal(calculateLine({...item,quantity:'1'},{...line,price:'0.0049'}).cost,0n);
  assert.equal(calculateLine({...item,quantity:'1'},{...line,price:'0.005'}).cost,1n);
  const state=fixture();state.suppliers[0].discount='12.50';state.suppliers[0].fees='0.01';
  assert.equal(compare(state).offers[0].total,33500001n);
});
test('pack count and MOQ: round max(required,MOQ) up to full packs',()=>{
  const v=calculateLine({...item,quantity:'7'},{...line,price:'10',pack:'6',moq:'13'});
  assert.equal(v.packs,3n);assert.equal(v.bought,18n);assert.equal(v.surplus,11n);assert.equal(v.cost,18000n);
  assert.equal(calculateLine(item,{...line,price:'92',basis:'pack',pack:'6'}).cost,36800n);
});
test('zero price allowed; zero pack invalid; negative MOQ invalid; blank price invalid',()=>{
  assert.equal(calculateLine(item,{...line,price:'0'}).cost,0n);
  for(const patch of [{pack:'0'},{moq:'-1'},{price:''},{price:'-1'},{pack:'1.5'},{moq:''}])assert.throws(()=>calculateLine(item,{...line,...patch}));
});
test('unit matching is exact: no pairs/pieces or set conversions',()=>{
  assert.throws(()=>calculateLine(item,{...line,unit:'pair'}),/unit/);
  const s=fixture();s.suppliers[0].lines.i.unit='pair';assert.ok(compare(s).offers[0].issues.some(v=>v.code==='unit'));
});
test('currency mismatch excluded even if cheaper',()=>{
  const s=fixture();s.suppliers[0].currency='USD';
  const r=compare(s);assert.equal(r.offers[0].eligible,false);assert.deepEqual(r.winners,['C']);
});
test('manual comparability and explicit complete cost confirmation are mandatory',()=>{
  const s=fixture();s.suppliers[0].lines.i.confirmed=false;s.suppliers[1].costsConfirmed=false;
  const r=compare(s);assert.equal(r.eligibleCount,1);assert.equal(r.best,null);assert.deepEqual(r.winners,[]);
});
test('minimum goods order checks before discount; no automatic top-up',()=>{
  const s=fixture();s.suppliers[0].minimum='360001';
  assert.ok(compare(s).offers[0].issues.some(v=>v.code==='minimumUnmet'));
  s.suppliers[0].minimum='360000';s.suppliers[0].discount='100';
  assert.equal(compare(s).offers[0].eligible,true);assert.equal(compare(s).offers[0].total,2000000n);
});
test('discount above 100 or negative excluded and total cannot be negative',()=>{
  for(const discount of ['100.01','-1','', 'NaN']){const s=fixture();s.suppliers[0].discount=discount;const o=compare(s).offers[0];assert.equal(o.eligible,false);assert.equal(o.total,null);}
});
test('ties and unknown delivery transitions: unknown → 0 → unknown',()=>{
  const s=fixture();s.suppliers=s.suppliers.slice(0,3);
  s.suppliers[1].lines.i.price='18000';s.suppliers[1].shipping='20000';
  s.suppliers[2].lines.i={...line,price:'1'};s.suppliers[2].shipping='';
  let r=compare(s);assert.deepEqual(r.winners,['A','B']);assert.equal(r.offers[2].total,null);
  s.suppliers[2].shipping='0';r=compare(s);assert.deepEqual(r.winners,['C']);assert.equal(r.offers[2].eligible,true);
  s.suppliers[2].shipping='';r=compare(s);assert.deepEqual(r.winners,['A','B']);assert.equal(r.offers[2].eligible,false);
});
test('blank fees/minimum/discount are unknown rather than implicit zero; negative costs invalid',()=>{
  for(const field of ['fees','minimum','discount','shipping'])for(const value of ['','-1','0.001']){const s=fixture();s.suppliers[0][field]=value;assert.equal(compare(s).offers[0].eligible,false,`${field}=${value}`);}
});
test('missing line, empty product spec or quantity exclude whole basket',()=>{
  const s=fixture();delete s.suppliers[0].lines.i;assert.equal(compare(s).offers[0].total,null);
  s.items[0].spec='';assert.equal(compare(s).eligibleCount,0);
  s.items[0].spec='Model';s.items[0].quantity='0';assert.equal(compare(s).eligibleCount,0);
});
test('availability must cover full packs, not just required units',()=>{
  const s=fixture();s.suppliers[0].lines.i.pack='6';s.suppliers[0].lines.i.available='22';
  assert.equal(compare(s).offers[0].eligible,false);s.suppliers[0].lines.i.available='24';assert.equal(compare(s).offers[0].eligible,true);
  s.suppliers[0].lines.i.available='-1';assert.ok(compare(s).offers[0].issues.some(v=>v.code==='stockNumber'));
});
test('large boundary numbers retain exact cents',()=>{
  const v=calculateLine({...item,quantity:'1000000'},{...line,price:'100000000',pack:'1000000',moq:'1000000'});
  assert.equal(v.cost,10000000000000000n);assert.equal(amount(v.cost),'100000000000000.00');
  assert.equal(money(12345n,'RUB','ru'),'123,45 RUB');assert.equal(money(null,'RUB'),'—');
});
export { fixture };
