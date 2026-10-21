import { blankSupplier } from '../src/engine.js';

export function everydayBasket() {
  const items = [
    { id: 'notebook', name: 'Блокнот / Notebook', spec: 'A5, 80 sheets, model N80', quantity: '24', unit: 'pcs' },
    { id: 'pen', name: 'Ручка / Pen', spec: 'Blue, 0.7 mm, model P07', quantity: '10', unit: 'pcs' },
    { id: 'folder', name: 'Папка / Folder', spec: 'A4, model F01', quantity: '5', unit: 'pcs' }
  ];
  const suppliers = ['north','box','budget'].map(id => ({ ...blankSupplier(id,'RUB',items), name: {north:'North Supply',box:'Box Depot',budget:'Budget Works'}[id], shipping:{north:'10',box:'90',budget:''}[id], costsConfirmed:true }));
  const prices = [['12.5','3','4'],['100','5','10'],['10','1.8','2']];
  suppliers.forEach((supplier,index) => items.forEach((item,i) => {
    supplier.lines[item.id] = { price:prices[index][i],basis:index===1&&i===0?'pack':'unit',pack:index===1&&i===0?'12':'1',moq:'0',available:'',unit:'pcs',spec:item.spec,confirmed:true };
  }));
  return {version:1,title:'Разница полной корзины / Full basket difference',currency:'RUB',lang:'ru',demo:false,items,suppliers};
}
