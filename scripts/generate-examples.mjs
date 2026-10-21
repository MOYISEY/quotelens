// Synthetic examples only. Never reads personal files.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { demo, blankSupplier } from '../src/engine.js';
import { backup, exportInputCSV } from '../src/io.js';
const folder=resolve(import.meta.dirname,'../examples');await mkdir(folder,{recursive:true});
await writeFile(resolve(folder,'demo-backup.json'),backup(demo()));
await writeFile(resolve(folder,'template.csv'),exportInputCSV(demo()));
const item={id:'part',name:'Деталь T / Part T',spec:'Model T, grade 1 / модель T, сорт 1',quantity:'20',unit:'pcs'};
const state={version:1,title:'Эталон 20 единиц / 20-unit reference',currency:'RUB',lang:'ru',demo:false,items:[item],suppliers:[]};
for(const id of ['A','B','C','D']){
  const supplier={...blankSupplier(id,'RUB',[item]),name:`Supplier ${id}`,shipping:'20000',costsConfirmed:true};
  supplier.lines.part={price:'18000',basis:'unit',pack:'1',moq:'0',available:'',unit:'pcs',spec:item.spec,confirmed:true};state.suppliers.push(supplier);
}
state.suppliers[1].lines.part.price='17000';state.suppliers[1].shipping='50000';
state.suppliers[2].lines.part={...state.suppliers[2].lines.part,price:'92000',basis:'pack',pack:'6'};
state.suppliers[3].lines.part={...state.suppliers[3].lines.part,price:'16000',available:'18'};
await writeFile(resolve(folder,'reference-20-units.json'),backup(state));
console.log('Created 3 synthetic examples in examples/');
