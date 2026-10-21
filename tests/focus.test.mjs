import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import * as engine from '../src/engine.js';
import * as io from '../src/io.js';
import * as explain from '../src/explain.js';
import * as writer from '../src/writer.js';

// Run the actual UI controller against a small DOM adapter. Replacing innerHTML
// discards focus just as the browser does; selectors resolve real rendered tags.
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8').replace(/^import .+;\r?\n/gm,'');
async function harness() {
  const body={tagName:'BODY',dataset:{},closest:()=>null};
  const document={activeElement:body,documentElement:{}};
  const listeners={};let html='';
  const root={
    addEventListener(type,listener){listeners[type]=listener;},
    set innerHTML(value){html=value;document.activeElement=body;},get innerHTML(){return html;},
    querySelector(selector){
      const expected=[...selector.matchAll(/\[([^=]+)="([^"]+)"\]/g)].map(v=>[v[1],v[2]]);
      for(const match of html.matchAll(/<(button|input|select|textarea)\b([^>]*)>/g)){
        const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(v=>[v[1],v[2]]));
        if(!expected.length||!expected.every(([key,value])=>attrs[key]===value))continue;
        const node={tagName:match[1].toUpperCase(),dataset:{},disabled:/\bdisabled\b/.test(match[2]),attrs,
          closest(value){return value==='[data-action]'&&this.dataset.action?this:null;},
          focus(options){document.activeElement=this;this.focusOptions=options;}};
        for(const [key,value]of Object.entries(attrs))if(key.startsWith('data-'))node.dataset[key.slice(5)]=value;
        return node;
      }
      return null;
    }
  };
  document.querySelector=selector=>selector==='#app'?root:null;
  const records=new Map();const storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
  const data=engine.demo();data.items=data.items.slice(0,1);data.suppliers=data.suppliers.slice(0,2);data.lang='en';
  io.saveLocal(storage,data);
  const context={...engine,...io,...explain,...writer,navigator:{locks:{request:(name,options,fn)=>Promise.resolve(fn({name}))}},document,window:{addEventListener(){}},localStorage:storage,crypto:{randomUUID},structuredClone,Intl,setTimeout,URL,Blob};
  vm.runInNewContext(source+'\nglobalThis.__ready=ready;',context);
  await context.__ready;
  function click(selector){const node=root.querySelector(selector);assert.ok(node,selector);assert.equal(node.disabled,false);node.focus();listeners.click({target:node});return document.activeElement;}
  return {click,active:()=>document.activeElement,state:()=>io.readLocal(storage),enter(){const node=document.activeElement;assert.ok(node.dataset.action,'active control has no action');assert.equal(node.disabled,false);listeners.click({target:node});return document.activeElement;}};
}
test('Repeated supplier activation adds third and fourth, then focuses the new name field',async()=>{
  const ui=await harness();ui.click('[data-action="edit"]');
  let focus=ui.click('[data-action="add-supplier"]');
  assert.equal(ui.state().suppliers.length,3);assert.equal(focus.dataset.action,'add-supplier');
  focus=ui.enter();assert.equal(ui.state().suppliers.length,4);assert.equal(focus.dataset.scope,'supplier');assert.equal(focus.dataset.field,'name');assert.equal(focus.dataset.id,ui.state().suppliers.at(-1).id);
});
test('item additions retain the add action, with a usable new name field at the 12-item limit',async()=>{
  const ui=await harness();ui.click('[data-action="edit"]');ui.click('[data-action="add-item"]');
  while(ui.state().items.length<12){assert.equal(ui.active().dataset.action,'add-item');ui.enter();}
  assert.equal(ui.active().dataset.scope,'item');assert.equal(ui.active().dataset.field,'name');assert.equal(ui.active().dataset.id,ui.state().items.at(-1).id);
});
test('supplier removal focuses adjacent removal action, then enabled add action at the minimum',async()=>{
  const ui=await harness();ui.click('[data-action="edit"]');ui.click('[data-action="add-supplier"]');ui.enter();
  const id=ui.state().suppliers.at(-1).id;
  ui.click(`[data-action="remove-supplier"][data-id="${id}"]`);assert.equal(ui.state().suppliers.length,3);assert.equal(ui.active().dataset.action,'remove-supplier');
  ui.enter();assert.equal(ui.state().suppliers.length,2);assert.equal(ui.active().dataset.action,'add-supplier');
  ui.enter();assert.equal(ui.state().suppliers.length,3);
});
test('item removal focuses adjacent removal action, then enabled add action for the last item',async()=>{
  const ui=await harness();ui.click('[data-action="edit"]');ui.click('[data-action="add-item"]');ui.enter();
  const id=ui.state().items.at(-1).id;
  ui.click(`[data-action="remove-item"][data-id="${id}"]`);assert.equal(ui.state().items.length,2);assert.equal(ui.active().dataset.action,'remove-item');
  ui.enter();assert.equal(ui.state().items.length,1);assert.equal(ui.active().dataset.action,'add-item');
  ui.enter();assert.equal(ui.state().items.length,2);
});
test('navigation retains focus on its rendered tab instead of BODY',async()=>{
  const ui=await harness();for(const action of ['edit','compare','files','method','compare']){ui.click(`[data-action="${action}"]`);assert.equal(ui.active().dataset.action,action);}
});
