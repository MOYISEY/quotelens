import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as engine from '../../src/engine.js';
import * as io from '../../src/io.js';
import * as explain from '../../src/explain.js';
import * as writer from '../../src/writer.js';

export function lockManager() {
  let held = null;
  return {
    requests: [],
    request(name, options, callback) {
      this.requests.push({ name, ...options });
      if (held) return Promise.resolve(callback(null));
      const token = {};
      held = token;
      return Promise.resolve(callback({ name })).finally(() => { if (held === token) held = null; });
    },
  };
}

export function storageHub(initial, locks = lockManager()) {
  return {
    records: new Map(initial ? [[io.STORAGE_KEY, io.backup(initial)]] : []), locks,
    clients: [], events: [], writes: [], denyRead: false, denyWrite: false, denyPrevious: false,
    deliver() { for (const item of this.events.splice(0)) item.client.handlers.get('storage')?.(item.event); },
  };
}

export async function boot(hub, extra = {}) {
  const handlers = new Map(), listeners = new Map(), downloads = [];
  const client = { handlers }; hub.clients.push(client);
  const root = { innerHTML: '', addEventListener: (name, fn) => listeners.set(name, fn), querySelector: () => null };
  const storage = {
    getItem(key) { if (hub.denyRead) throw Error('synthetic read denial'); return hub.records.get(key) ?? null; },
    setItem(key, value) {
      if (hub.denyWrite || (hub.denyPrevious && key === 'quotelens.previous.v1')) throw Error('synthetic quota');
      const oldValue = hub.records.get(key) ?? null; hub.records.set(key, value);
      hub.writes.push({ client: hub.clients.indexOf(client), key, value });
      for (const other of hub.clients) if (other !== client && oldValue !== value) {
        hub.events.push({ client: other, event: { key, oldValue, newValue: value } });
      }
    },
  };
  const document = {
    querySelector: () => root, documentElement: {},
    createElement: () => ({ click() { downloads.at(-1).handedOff = true; } }),
  };
  const context = vm.createContext({
    ...engine, ...io, ...explain, ...writer, ...extra, document, localStorage: storage,
    navigator: { locks: hub.locks }, window: { addEventListener: (name, fn) => handlers.set(name, fn) },
    crypto: { randomUUID }, structuredClone, Blob, Intl, Promise,
    URL: { createObjectURL(blob) { downloads.push({ blob, handedOff: false }); return 'blob:synthetic'; }, revokeObjectURL() {} },
    setTimeout() {},
  });
  const source = (await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')).replace(/^import .+;\r?\n/gm, '');
  vm.runInContext(source + `
    globalThis.inspect = () => ({state, previous, storageBlocked, storageError, storageConflict,
      dirty: typeof dirty !== 'undefined' && dirty, owns: typeof writer !== 'undefined' && writer.owns});
    globalThis.readyNow = () => typeof ready === 'undefined' ? Promise.resolve() : ready;
    globalThis.directPersist = () => persist(); globalThis.directCheckpoint = () => checkpoint();
  `, context);
  await context.readyNow();
  const click = action => listeners.get('click')({ target: { closest: () => ({ disabled: false, dataset: { action } }) } });
  const replace = value => {
    click('files'); listeners.get('input')({ target: { id: 'import-text', value: JSON.stringify(value), dataset: {} } });
    click('review-import'); click('apply-import');
  };
  return {
    root, handlers, downloads, click, replace, context,
    inspect: () => context.inspect(), ready: () => context.readyNow(),
    unload() { const e = { prevented: false, preventDefault() { this.prevented = true; } }; handlers.get('beforeunload')?.(e); return e; },
    release() { handlers.get('pagehide')?.({ persisted: false }); },
  };
}
