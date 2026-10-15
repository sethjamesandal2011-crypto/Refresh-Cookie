/* Cookie Refresher — Roblox API layer */
const API = (() => {
  const TEST = 'https://users.roblox.com/v1/users/1';
  const PUBLIC = [
    'https://corsproxy.io/?url={url}',
    'https://api.allorigins.win/raw?url={url}',
    'https://api.codetabs.com/v1/proxy?quest={url}'
  ];

  let resolved = null, resolving = null;

  function candidates() {
    const s = Store.settings(), out = [];
    if (s.proxy) out.push(s.proxy);
    if (s.worker) out.push(s.worker.replace(/\/+$/, '') + '?url={url}');
    out.push(...PUBLIC);
    if (s.allowDirect) out.push('{url}');
    return out;
  }
  const urlFor = (tpl, target) => tpl === '{url}' ? target : tpl.replace('{url}', encodeURIComponent(target));

  async function resolve(force) {
    if (force) { resolved = null; }
    if (resolved) return resolved;
    if (resolving) return resolving;
    resolving = (async () => {
      for (const c of candidates()) {
        try {
          const r = await fetch(urlFor(c, TEST), { signal: AbortSignal.timeout(9000) });
          if (r.ok) { resolved = c; return c; }
        } catch {}
      }
      throw new Error('No working proxy. Deploy worker.js and paste its URL in Settings.');
    })();
    try { return await resolving; } finally { resolving = null; }
  }

  async function test(tpl) {
    const t = tpl || (await resolve(true));
    const started = Date.now();
    const r = await fetch(urlFor(t, TEST), { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await r.json();
    return { proxy: t, ms: Date.now() - started };
  }

  async function req(target, o = {}) {
    const h = Object.assign({}, o.headers);
    if (o.cookie) h['Cookie'] = '.ROBLOSECURITY=' + o.cookie;
    if (o.csrf) h['x-csrf-token'] = o.csrf;
    let body;
    if (o.body !== undefined && o.body !== null) {
      h['Content-Type'] = h['Content-Type'] || 'application/json';
      body = typeof o.body === 'string' ? o.body : JSON.stringify(o.body);
    }
    const url = o.noProxy ? target : urlFor(await resolve(), target);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), o.timeout || 20000);
    try {
      const res = await fetch(url, { method: o.method || 'GET', headers: h, body, signal: ctrl.signal, redirect: 'follow' });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { ok: res.ok, status: res.status, headers: res.headers, text, json };
    } finally { clearTimeout(t); }
  }

  async function json(target, o = {}) {
    const r = await req(target, o);
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return r.json;
  }

  /* ---------- helpers ---------- */
  const pick = (obj, ...keys) => {
    if (!obj) return undefined;
    const lower = {};
    for (const k in obj) lower[k.toLowerCase()] = obj[k];
    for (const k of keys) { if (obj[k] !== undefined) return obj[k]; if (lower[k.toLowerCase()] !== undefined) return lower[k.toLowerCase()]; }
  };
  const bool = v => v === true || v === 'true' || v === 1 || v === 'True';

  async function csrf(cookie) {
    const r = await req('https://auth.roblox.com/v2/logout', { method: 'POST', cookie });
    return r.headers.get('x-csrf-token') || r.headers.get('X-CSRF-TOKEN') || null;
  }

  /* ---------- endpoints ---------- */
  const EP = {
    auth: 'https://users.roblox.com/v1/users/authenticated',
    user: id => `https://users.roblox.com/v1/users/${id}`,
    currency: id => `https://economy.roblox.com/v1/users/${id}/currency`,
    collectibles: (id, c) => `https://inventory.roblox.com/v1/users/${id}/assets/collectibles?sortOrder=Asc&limit=100${c ? '&cursor=' + c : ''}`,
    email: 'https://accountsettings.roblox.com/v1/email',
    birthdate: 'https://accountinformation.roblox.com/v1/birthdate',
    phone: 'https://accountinformation.roblox.com/v1/phone',
    pin: 'https://auth.roblox.com/v1/account/pin',
    twofa: id => `https://twostepverification.roblox.com/v1/users/${id}/configuration`,
    premium: id => `https://premiumfeatures.roblox.com/v1/users/${id}/validate-membership`,
    tx: (id, type, c) => `https://economy.roblox.com/v2/users/${id}/transactions?transactionType=${type}&limit=100${c ? '&cursor=' + c : ''}`,
    headshot: id => `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`,
    assetThumbs: ids => `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(',')}&size=150x150&format=Png`,
    gameThumbs: uids => `https://thumbnails.roblox.com/v1/games/icons?universeIds=${uids.join(',')}&size=150x150&format=Png`
  };

  const refreshEndpoints = mode => mode === 'replace'
    ? ['https://auth.roblox.com/v2/session/refresh', 'https://auth.roblox.com/v1/session/refresh']
    : ['https://auth.roblox.com/v1/authentication/refresh', 'https://www.roblox.com/authentication/refresh'];

  /* ---------- refresh ---------- */
  async function refreshCookie(cookie, mode) {
    const order = [...refreshEndpoints(mode || Store.settings().refreshMode),
                   ...refreshEndpoints('preserve'), ...refreshEndpoints('replace')];
    const seen = new Set(); let last = null;
    for (const url of order) {
      if (seen.has(url)) continue; seen.add(url);
      try {
        let r = await req(url, { method: 'POST', cookie, timeout: 20000 });
        if (r.status === 403) {
          const tok = r.headers.get('x-csrf-token');
          if (tok) r = await req(url, { method: 'POST', cookie, csrf: tok, timeout: 20000 });
        }
        const raw = [r.headers.get('set-cookie'), r.headers.get('x-set-cookie')].filter(Boolean).join(';');
        const m = /\.ROBLOSECURITY=([^;,\s]+)/.exec(raw);
        if (m && m[1] && m[1] !== cookie) return { cookie: m[1], endpoint: url };
        last = new Error(`${url} → HTTP ${r.status}, no new cookie`);
      } catch (e) { last = e; }
    }
    throw last || new Error('Cookie refresh failed');
  }

  /* ---------- account bundle (one-shot settings source) ---------- */
  async function bundle(cookie) {
    for (const u of ['https://www.roblox.com/my/account/json', 'https://www.roblox.com/my/settings/json']) {
      try { const j = await json(u, { cookie }); if (j && typeof j === 'object' && Object.keys(j).length) return j; } catch {}
    }
    return null;
  }

  async function idVerified(id, cookie) {
    const tries = [
      `https://apis.roblox.com/user-verification-api/v1/users/${id}/verification`,
      `https://apis.roblox.com/verification-service/v1/users/${id}/status`,
      `https://accountinformation.roblox.com/v1/users/${id}/verification`
    ];
    for (const u of tries) {
      try {
        const j = await json(u, { cookie });
        const v = pick(j, 'isVerified', 'verified', 'status', 'verificationStatus');
        if (v !== undefined) return bool(v) || String(v).toLowerCase().includes('verif');
      } catch {}
    }
    return null;
  }

  async function twofa(id) {
    try {
      const j = await json(EP.twofa(id), {});
      const methods = pick(j, 'methods', 'mediaTypes', 'verificationMethods') || [];
      const flag = pick(j, 'enabled', 'isEnabled');
      const enabled = flag !== undefined ? bool(flag) : (Array.isArray(methods) && methods.length > 0);
      return { enabled, methods: Array.isArray(methods) ? methods.length : 0 };
    } catch { return null; }
  }

  async function collectibles(id, cookie) {
    let cursor = '', items = [], guard = 0;
    do {
      const j = await json(EP.collectibles(id, cursor), { cookie });
      items = items.concat(j.data || []);
      cursor = j.nextPageCursor || '';
    } while (cursor && ++guard < 12);
    const rap = items.reduce((s, i) => s + (i.recentAveragePrice || 0), 0);
    return { rap, items };
  }

  const SPEND = ['Purchase', 'BillablePurchase', 'AdSpend', 'SendRobux'];

  async function transactions(id, cookie, types, { maxPages = 25, sinceMs = 0 } = {}) {
    const out = [];
    for (const type of types) {
      let cursor = '', page = 0, stop = false;
      while (!stop && page++ < maxPages) {
        let j;
        try { j = await json(EP.tx(id, type, cursor), { cookie }); } catch { break; }
        const items = j.data || [];
        for (const it of items) {
          if (sinceMs && it.created && new Date(it.created).getTime() < sinceMs) { stop = true; }
          out.push(it);
        }
        cursor = j.nextPageCursor || '';
        if (!cursor || !items.length) stop = true;
      }
    }
    return out;
  }

  const amountOf = it =>
    Math.abs((it.currency && it.currency.amount) ?? it.robux ?? 0);

  /* ---------- experiences (probe chain) ---------- */
  function deepEntries(node, out = [], depth = 0) {
    if (!node || depth > 8) return out;
    if (Array.isArray(node)) { for (const n of node) deepEntries(n, out, depth + 1); return out; }
    if (typeof node === 'object') {
      const name = pick(node, 'name', 'displayName', 'experienceName', 'title');
      const uid = pick(node, 'universeId', 'universeID', 'id');
      const place = pick(node, 'placeId', 'placeID', 'rootPlaceId');
      if (typeof name === 'string' && name && (typeof uid === 'number' || typeof place === 'number')) {
        out.push({
          name,
          universeId: typeof uid === 'number' ? uid : null,
          placeId: typeof place === 'number' ? place : null,
          minutes: pick(node, 'minutes', 'playTimeMinutes', 'timeSpentMinutes', 'playTime') ?? null,
          lastPlayed: pick(node, 'lastPlayed', 'lastPlayedAt', 'lastPlayedDate', 'lastPlayedTime') ?? null
        });
      }
      for (const k in node) deepEntries(node[k], out, depth + 1);
    }
    return out;
  }

  async function experiences(id, cookie) {
    const tries = [
      `https://apis.roblox.com/user-experiences-api/v1/users/${id}/top-experiences`,
      `https://apis.roblox.com/screen-time-api/v1/users/${id}/top-experiences`,
      `https://games.roblox.com/v2/users/${id}/recently-played-games?limit=50`,
      `https://www.roblox.com/users/profile/playergames-json?userId=${id}`,
      `https://games.roblox.com/v2/users/${id}/games?accessFilter=Public&limit=50&sortOrder=Desc`
    ];
    for (const u of tries) {
      try {
        const j = await json(u, { cookie });
        const found = deepEntries(j);
        const seen = new Set();
        const clean = found.filter(e => {
          const key = e.universeId || e.placeId;
          if (seen.has(key)) return false; seen.add(key); return true;
        });
        if (clean.length) return { source: u, items: clean.slice(0, 20) };
      } catch {}
    }
    return { source: null, items: [] };
  }

  /* ---------- main scan ---------- */
  async function scan(cookie, opts = {}) {
    const tg = Object.assign({}, Store.settings().toggles, opts.toggles || {});
    const r = { ok: false, errors: [], at: Date.now() };

    const auth = await json(EP.auth, { cookie });   // throws on invalid
    const id = String(auth.id);
    r.userId = id; r.username = auth.name; r.displayName = auth.displayName;

    const [bnd, profile] = await Promise.allSettled([bundle(cookie), json(EP.user(id), { cookie })]);
    const b = bnd.status === 'fulfilled' ? bnd.value : null;
    if (profile.status === 'fulfilled') r.profile = profile.value;

    r.avatar = await EP.headshot(id);

    const tasks = [];
    const add = (key, p, map) => tasks.push(
      Promise.resolve(p).then(v => { const m = map ? map(v) : v; if (m !== undefined && m !== null) r[key] = m; })
        .catch(() => r.errors.push(key))
    );

    // security — bundle first, individual endpoints as fallback
    if (tg.email) add('email', (async () => {
      const bv = pick(b, 'emailAddress', 'EmailAddress');
      if (bv) return { address: bv, verified: bool(pick(b, 'isEmailVerified', 'EmailVerified', 'emailVerified')) };
      const j = await json(EP.email, { cookie });
      return { address: pick(j, 'emailAddress'), verified: bool(pick(j, 'verified', 'isVerified')) };
    })());

    if (tg.twofa) add('twofa', (async () => {
      const bv = pick(b, 'twoStepLogin', 'TwoStepLogin', 'isTwoStepLoginEnabled');
      if (bv !== undefined) return { enabled: bool(bv), methods: bool(bv) ? 1 : 0 };
      return twofa(id);
    })());

    add('premium', (async () => {
      const bv = pick(b, 'isPremium', 'IsPremium', 'premium');
      if (bv !== undefined) return bool(bv);
      return bool(await json(EP.premium(id), { cookie }));
    })());

    add('pin', (async () => {
      const bv = pick(b, 'accountPinEnabled', 'IsAccountPinEnabled', 'pinEnabled');
      if (bv !== undefined) return bool(bv);
      return bool(pick(await json(EP.pin, { cookie }), 'isEnabled'));
    })());

    add('birthdate', (async () => {
      const bv = pick(b, 'birthday', 'Birthday', 'birthdate');
      if (bv && typeof bv === 'object') return bv;
      return json(EP.birthdate, { cookie });
    })());

    add('phone', (async () => {
      const bv = pick(b, 'phoneNumber', 'PhoneNumber');
      if (bv) return { phone: bv, verified: true };
      const j = await json(EP.phone, { cookie });
      return { phone: pick(j, 'phone', 'phoneNumber'), verified: bool(pick(j, 'isVerified', 'verified')) };
    })());

    add('idVerified', (async () => {
      const bv = pick(b, 'isIdentityVerified', 'IsIdentityVerified', 'identityVerified', 'isVerified');
      if (bv !== undefined) return bool(bv);
      return idVerified(id, cookie);
    })());

    if (tg.robux) add('robux', json(EP.currency(id), { cookie }).then(j => pick(j, 'robux')));
    if (tg.rap) add('rap', collectibles(id, cookie).then(c => c.rap));
    if (tg.inventory) add('inventory', collectibles(id, cookie).then(c => c.items));

    if (tg.spent || tg.games) add('tx', transactions(id, cookie, SPEND, {
      maxPages: tg.spent ? 25 : 8,
      sinceMs: tg.spent ? Date.now() - 365 * 864e5 : 0
    }));

    if (tg.games) add('experiences', experiences(id, cookie).then(x => x.items));

    await Promise.allSettled(tasks);

    if (r.tx) {
      const yearAgo = Date.now() - 365 * 864e5;
      r.spentYear = r.tx.filter(t => !t.created || new Date(t.created).getTime() >= yearAgo).reduce((s, t) => s + amountOf(t), 0);
      const byName = {};
      for (const t of r.tx) {
        const d = t.details; if (!d || !d.name) continue;
        const k = d.name + '|' + (d.id || '');
        byName[k] = byName[k] || { name: d.name, id: d.id, type: d.type, count: 0, robux: 0 };
        byName[k].count++; byName[k].robux += amountOf(t);
      }
      r.topSpent = Object.values(byName).sort((a, b2) => b2.robux - a.robux).slice(0, 5);
      delete r.tx;
    }

    r.ok = true;
    return r;
  }

  /* ---------- thumbnails ---------- */
  async function assetIcons(ids) {
    if (!ids.length) return {};
    try {
      const j = await json(EP.assetThumbs(ids.slice(0, 50)), { noProxy: true });
      const m = {};
      for (const d of j.data || []) m[d.targetId] = d.imageUrl;
      return m;
    } catch { return {}; }
  }
  async function gameIcons(uids) {
    const list = uids.filter(Boolean).slice(0, 50);
    if (!list.length) return {};
    try {
      const j = await json(EP.gameThumbs(list), { noProxy: true });
      const m = {};
      for (const d of j.data || []) m[d.targetId] = d.imageUrl;
      return m;
    } catch { return {}; }
  }

  return { req, json, resolve, test, scan, refreshCookie, csrf, assetIcons, gameIcons, EP, pick, bool, amountOf };
})();