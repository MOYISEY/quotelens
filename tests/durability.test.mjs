import test from 'node:test';
import assert from 'node:assert/strict';
import { demo } from '../src/engine.js';
import { STORAGE_KEY, restore } from '../src/io.js';
import { boot, storageHub } from './support/controller-harness.mjs';
import { createWriterSession } from '../src/writer.js';

const basket = title => ({ ...demo(), title, lang: 'en' });

test('DATA-01: second tab cannot overwrite primary or undo before storage events arrive', async () => {
  const hub = storageHub(basket('INITIAL_SYNTHETIC'));
  const a = await boot(hub), b = await boot(hub);
  a.replace(basket('A_SYNTHETIC_EDIT'));
  const writes = hub.writes.length;
  b.replace(basket('B_SYNTHETIC_EDIT'));
  b.context.directPersist(); b.context.directCheckpoint();
  assert.equal(restore(hub.records.get(STORAGE_KEY)).title, 'A_SYNTHETIC_EDIT');
  assert.equal(hub.writes.length, writes, 'non-owner must not write current or previous snapshots');
});

test('DATA-02: quota failure keeps exportable memory work dirty and requests unload warning', async () => {
  const hub = storageHub(basket('INITIAL_SYNTHETIC')), app = await boot(hub);
  hub.denyWrite = true;
  app.replace(basket('UNSAVED_SYNTHETIC_BASKET'));
  assert.equal(app.inspect().state.title, 'UNSAVED_SYNTHETIC_BASKET');
  assert.equal(restore(hub.records.get(STORAGE_KEY)).title, 'INITIAL_SYNTHETIC');
  assert.equal(app.unload().prevented, true);
  app.click('download-backup');
  assert.equal(JSON.parse(await app.downloads.at(-1).blob.text()).title, 'UNSAVED_SYNTHETIC_BASKET');
  assert.equal(app.unload().prevented, true, 'download handoff does not prove durable backup');
  assert.equal(app.unload().returnValue, '');
  hub.denyWrite = false; app.click('retry-save');
  assert.equal(restore(hub.records.get(STORAGE_KEY)).title, 'UNSAVED_SYNTHETIC_BASKET');
  assert.equal(app.inspect().dirty, false);
  assert.equal(app.unload().prevented, false);
});

test('new owner loads current saved state after release without persisting its stale view', async () => {
  const hub = storageHub(basket('INITIAL')), a = await boot(hub), b = await boot(hub);
  a.replace(basket('LATEST_FROM_A'));
  assert.equal(b.inspect().state.title, 'INITIAL');
  a.release(); await new Promise(setImmediate);
  const count = hub.writes.length;
  b.click('retry-writer'); await b.ready();
  assert.equal(b.inspect().owns, true);
  assert.equal(b.inspect().state.title, 'LATEST_FROM_A');
  assert.equal(hub.writes.length, count, 'acquisition only loads; it must not autosave stale memory');
  b.replace(basket('B_AFTER_ACQUIRE'));
  assert.equal(restore(hub.records.get(STORAGE_KEY)).title, 'B_AFTER_ACQUIRE');
});

test('missing or rejected Web Locks fails closed; explicit memory mode never writes', async () => {
  for (const locks of [null, { request() { return Promise.reject(Error('synthetic lock rejection')); } }]) {
    const hub = storageHub(basket('ORIGINAL'), locks), app = await boot(hub);
    assert.equal(app.inspect().owns, false);
    app.replace(basket('BLOCKED'));
    assert.equal(app.inspect().state.title, 'ORIGINAL');
    assert.match(app.root.innerHTML, /Read only/);
    app.click('memory-only'); app.replace(basket('MEMORY_ONLY'));
    assert.equal(app.inspect().state.title, 'MEMORY_ONLY');
    assert.equal(app.inspect().dirty, true); assert.equal(app.unload().prevented, true);
    assert.equal(hub.writes.length, 0);
    assert.equal(restore(hub.records.get(STORAGE_KEY)).title, 'ORIGINAL');
    app.click('download-backup');
    assert.equal(JSON.parse(await app.downloads.at(-1).blob.text()).title, 'MEMORY_ONLY');
  }
});

test('undo checkpoint quota failure blocks primary replacement until both saves succeed', async () => {
  const hub = storageHub(basket('ORIGINAL')), app = await boot(hub);
  hub.denyPrevious = true;
  app.replace(basket('NEW_MEMORY'));
  assert.equal(app.inspect().dirty, true); assert.equal(hub.writes.length, 0);
  assert.equal(restore(hub.records.get(STORAGE_KEY)).title, 'ORIGINAL');
  hub.denyPrevious = false; app.click('retry-save');
  assert.equal(restore(hub.records.get('quotelens.previous.v1')).title, 'ORIGINAL');
  assert.equal(restore(hub.records.get(STORAGE_KEY)).title, 'NEW_MEMORY');
  assert.equal(app.unload().prevented, false);
});

test('external conflict keeps current version exportable and dirty; reload needs explicit confirmation', async () => {
  const hub = storageHub(basket('ORIGINAL')), app = await boot(hub);
  app.replace(basket('MY_WORK'));
  const external = JSON.stringify(basket('EXTERNAL_WORK'));
  hub.records.set(STORAGE_KEY, external);
  app.handlers.get('storage')({ key: STORAGE_KEY, newValue: external });
  await new Promise(setImmediate);
  assert.equal(app.inspect().owns, false); assert.equal(app.inspect().dirty, true);
  const count = hub.writes.length;
  app.context.directPersist(); app.context.directCheckpoint();
  assert.equal(hub.writes.length, count);
  app.click('retry-writer');
  assert.equal(app.inspect().state.title, 'MY_WORK');
  assert.match(app.root.innerHTML, /replace this in-memory version/);
  app.click('cancel-reload'); assert.equal(app.unload().prevented, true);
  app.click('download-backup');
  assert.equal(JSON.parse(await app.downloads.at(-1).blob.text()).title, 'MY_WORK');
  app.click('retry-writer'); app.click('confirm-reload'); await app.ready();
  assert.equal(app.inspect().state.title, 'EXTERNAL_WORK');
  assert.equal(app.inspect().dirty, false); assert.equal(hub.writes.length, count);
});

test('corrupt or unreadable storage is not overwritten on boot', async () => {
  for (const denied of [true, false]) {
    const hub = storageHub(); hub.records.set(STORAGE_KEY, '{broken'); hub.denyRead = denied;
    const app = await boot(hub);
    assert.equal(app.inspect().storageBlocked, true);
    assert.equal(hub.writes.length, 0); assert.equal(hub.records.get(STORAGE_KEY), '{broken');
  }
});

test('lock acquisition deduplicates pending requests and release prevents writes before re-acquisition', async () => {
  let callback, count = 0;
  const writer = createWriterSession({ request(name, options, fn) { count++; callback = fn; return new Promise(() => {}); } });
  const first = writer.acquire(), second = writer.acquire();
  assert.equal(first, second); assert.equal(count, 1); assert.equal(writer.owns, false);
  callback({ name: 'synthetic' }); assert.equal(await first, true);
  writer.release(); assert.equal(writer.owns, false);
});
