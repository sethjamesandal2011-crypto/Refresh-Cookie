/* Cookie Refresher — local storage layer (nothing leaves the browser) */
const Store = (() => {
  const KEY = 'rcr.v3';
  const BASE = {
    settings: {
      worker: '', proxy: '', allowDirect: false, refreshMode: 'preserve', concurrency: 4,
      toggles:  { robux:true, premium:true, twofa:true, email:true, rap:false, spent:false, games:true, inventory:false },
      vaultCols:{ robux:true, premium:true, twofa:true, email:true, rap:false, spent:false }
    },
    accounts: {},
    meta: { created: 0, refreshed: 0 }
  };

  const merge = (a, b) => {
    for (const k in b) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) { a[k] = merge(a[k] || {}, b[k]); }
      else a[k] = b[k];
    }
    return a;
  };

  let state;
  try { state = merge(structuredClone(BASE), JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch { state = structuredClone(BASE); }
  if (!state.meta.created) state.meta.created = Date.now();

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) { console.warn('Storage full', e); }
    }, 120);
  }

  return {
    settings: () => state.settings,
    setSetting(patch) { Object.assign(state.settings, patch); save(); },
    setToggle(group, key, val) { state.settings[group][key] = val; save(); },

    list() {
      return Object.values(state.accounts).sort((a, b) => (b.lastChecked || 0) - (a.lastChecked || 0));
    },
    get: id => state.accounts[id] || null,
    count: () => Object.keys(state.accounts).length,

    upsert(rec) {
      const prev = state.accounts[rec.userId] || {};
      state.accounts[rec.userId] = merge(prev, rec);
      state.accounts[rec.userId].userId = String(rec.userId);
      save();
      return state.accounts[rec.userId];
    },
    patch(id, patch) {
      if (!state.accounts[id]) return null;
      Object.assign(state.accounts[id], patch);
      save();
      return state.accounts[id];
    },
    remove(id) { delete state.accounts[id]; save(); },

    bumpRefreshed() { state.meta.refreshed++; save(); },
    bytes: () => new Blob([localStorage.getItem(KEY) || '']).size,

    export() { return JSON.stringify(state, null, 2); },
    import(json) {
      const p = JSON.parse(json);
      state = merge(state, p);
      save();
    },
    wipe() { localStorage.removeItem(KEY); location.reload(); }
  };
})();