// One cooperative writer per origin. No localStorage lease: check-then-set is not atomic.
export function createWriterSession(locks) {
  let owns = false, status = 'checking', pending = null, unlock = null, cancelReady = null, generation = 0;
  return {
    get owns() { return owns; },
    get status() { return status; },
    acquire() {
      if (owns) return Promise.resolve(true);
      if (pending) return pending;
      if (!locks || typeof locks.request !== 'function') {
        status = 'unsupported';
        return Promise.resolve(false);
      }
      status = 'checking';
      const epoch = ++generation;
      let settle;
      const ready = new Promise(resolve => { settle = resolve; });
      pending = ready; cancelReady = settle;
      const failed = () => {
        if (epoch === generation) { owns = false; status = 'unavailable'; }
        settle(false);
      };
      try {
        Promise.resolve(locks.request('quotelens.writer.v1', { ifAvailable: true }, lock => {
          if (epoch !== generation) { settle(false); return; }
          if (!lock) { status = 'readonly'; settle(false); return; }
          owns = true; status = 'writer';
          const held = new Promise(resolve => { unlock = resolve; });
          settle(true);
          return held;
        })).catch(failed);
      } catch { failed(); }
      ready.then(() => { if (pending === ready) { pending = null; cancelReady = null; } });
      return ready;
    },
    release() {
      ++generation; owns = false; status = 'readonly';
      unlock?.(); unlock = null; cancelReady?.(false); cancelReady = null; pending = null;
    },
  };
}
