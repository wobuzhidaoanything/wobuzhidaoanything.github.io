// Where designs live. With `npm start` they're files on this device (userdata/ folder,
// shared with AI agents through MCP). Opened any other way, the browser's storage is used.
import { migrate, normalize } from './design.js';

const LS = { designs: 'roomcraft.v2.designs', library: 'roomcraft.v2.library', active: 'roomcraft.v2.active', v1: 'roomcraft.state.v1' };
const ls = {
  get(k, d = null) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

async function json(url, opts) {
  let r;
  try {
    r = await fetch(url, { cache: 'no-store', ...opts, headers: { 'content-type': 'application/json', ...(opts?.headers || {}) } });
  } catch {
    throw Object.assign(new Error('Roomcraft’s local server isn’t reachable'), { offline: true });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), j);
  return j;
}

export async function openStorage() {
  let server = false;
  try {
    server = (await json('health')).service === 'roomcraft-local';
  } catch {}
  return server ? serverStore() : await browserStore();
}

function serverStore() {
  return {
    kind: 'device',
    list: async () => (await json('api/designs')).designs,
    getActive: async () => (await json('api/active')).id,
    setActive: (id) => json('api/active', { method: 'PUT', body: JSON.stringify({ id }) }),
    load: async (id) => migrate(await json(`api/designs/${encodeURIComponent(id)}`)),
    // `base`: the version this change started from (the server refuses to overwrite newer work)
    save: async (d, base) => (await json(`api/designs/${encodeURIComponent(d.id)}`, { method: 'PUT', body: JSON.stringify(d), headers: base ? { 'x-base': base } : {} })).updatedAt,
    history: async (id) => (await json(`api/history/${encodeURIComponent(id)}`)).versions,
    version: async (id, v) => migrate(await json(`api/history/${encodeURIComponent(id)}?version=${encodeURIComponent(v)}`)),
    keep: (d) => json(`api/history/${encodeURIComponent(d.id)}`, { method: 'POST', body: JSON.stringify(d) }),
    remove: (id) => json(`api/designs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    loadLibrary: () => json('api/library'),
    saveLibrary: (lib) => json('api/library', { method: 'PUT', body: JSON.stringify(lib) }),
    subscribe(cb) {
      const es = new EventSource('api/events');
      es.onmessage = (e) => {
        try {
          cb(JSON.parse(e.data));
        } catch {}
      };
      return () => es.close();
    },
  };
}

async function browserStore() {
  const designs = ls.get(LS.designs, {});
  if (!Object.keys(designs).length) {
    // Seed: an older single-room project from this browser, else the sample house.
    const v1 = ls.get(LS.v1);
    if (v1?.room) {
      const d = migrate({ ...v1, name: 'My room' });
      designs[d.id] = d;
    } else {
      try {
        const d = normalize(await (await fetch('assets/sample-house.json')).json());
        designs[d.id] = d;
      } catch {}
    }
    ls.set(LS.designs, designs);
  }
  let lib = ls.get(LS.library);
  if (!lib) {
    const v1 = ls.get(LS.v1);
    let shipped = [];
    try {
      shipped = (await (await fetch('assets/library.json')).json()).items || [];
    } catch {}
    const ids = new Set(shipped.map((i) => i.id));
    lib = { items: [...shipped, ...(v1?.inventory || []).filter((i) => !ids.has(i.id))] };
    ls.set(LS.library, lib);
  }
  return {
    kind: 'browser',
    list: async () =>
      Object.values(ls.get(LS.designs, {}))
        .map((d) => ({ id: d.id, name: d.name, updatedAt: d.updatedAt, floors: d.floors.length }))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    getActive: async () => ls.get(LS.active) || Object.keys(ls.get(LS.designs, {}))[0],
    setActive: async (id) => ls.set(LS.active, id),
    load: async (id) => {
      const d = ls.get(LS.designs, {})[id];
      if (!d) throw new Error('Design not found');
      return migrate(d);
    },
    save: async (d) => {
      const all = ls.get(LS.designs, {});
      d.updatedAt = new Date().toISOString();
      all[d.id] = d;
      ls.set(LS.designs, all);
      return d.updatedAt;
    },
    remove: async (id) => {
      const all = ls.get(LS.designs, {});
      delete all[id];
      ls.set(LS.designs, all);
    },
    loadLibrary: async () => ls.get(LS.library, { items: [] }),
    saveLibrary: async (l) => ls.set(LS.library, l),
    subscribe: () => () => {},
  };
}
