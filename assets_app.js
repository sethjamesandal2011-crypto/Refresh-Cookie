/* Cookie Refresher — bootstrap + orchestration */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const toast = (msg, kind = '') => {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  };

  const modal = html => {
    $('#modalBox').innerHTML = html;
    $('#modal').hidden = false;
  };
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').hidden = true; });

  /* ---------- tabs ---------- */
  $$('#tabs .tab').forEach(t => t.addEventListener('click', () => {
    $$('#tabs .tab').forEach(x => x.classList.toggle('is-active', x === t));
    $$('.view').forEach(v => v.hidden = true);
    $('#view-' + t.dataset.tab).hidden = false;
    if (t.dataset.tab === 'vault') renderVault();
  }));

  /* ---------- toggles ---------- */
  const TOGGLE_DEFS = [
    ['robux', 'Robux', 'always on', true],
    ['premium', 'Premium', '', false],
    ['twofa', '2FA', '', false],
    ['email', 'Email', '', false],
    ['rap', 'RAP', 'slower', false],
    ['spent', 'Spent / yr', 'slower', false],
    ['games', 'Games played', '', false],
    ['inventory', 'Inventory', 'slower', false]
  ];

  function renderToggles() {
    const s = Store.settings().toggles;
    $('#singleToggles').innerHTML = TOGGLE_DEFS.map(([k, l, sub, lock]) =>
      Views.toggle(k, l, sub, s[k], 'toggles', lock)).join('');
    $('#bulkToggles').innerHTML = TOGGLE_DEFS.map(([k, l, sub, lock]) =>
      Views.toggle(k, l, sub, s[k], 'toggles', lock)).join('');
  }

  document.addEventListener('click', e => {
    const sw = e.target.closest('.sw');
    if (sw && !sw.classList.contains('locked')) {
      const { group, key } = sw.dataset;
      const now = !Store.settings()[group][key];
      Store.setToggle(group, key, now);
      renderToggles();
      updateSpeedHint();
    }
  });

  function updateSpeedHint() {
    const t = Store.settings().toggles;
    const heavy = ['rap', 'spent', 'inventory'].filter(k => t[k]).length;
    $('#speedHint').textContent = heavy === 0 ? 'Quick mode — light data only.' : `Deep mode — ${heavy} slow request(s) enabled.`;
  }

  /* ---------- concurrency ---------- */
  $('#bulkConc').addEventListener('input', e => {
    $('#concVal').textContent = e.target.value;
    Store.setSetting({ concurrency: +e.target.value });
  });

  /* ---------- single ---------- */
  const COOKIE_RE = /_?\|?WARNING[^|]*\|[\s\S]*/;

  function cleanCookie(raw) {
    let c = String(raw || '').trim();
    c = c.replace(/^\.ROBLOSECURITY\s*=\s*/i, '');
    c = c.split(/\r?\n/)[0].trim();
    return c.replace(/^["']|["']$/g, '');
  }

  $('#btnPaste').addEventListener('click', async () => {
    try { $('#cookieInput').value = cleanCookie(await navigator.clipboard.readText()); }
    catch { toast('Clipboard blocked', 'bad'); }
  });
  $('#btnClearSingle').addEventListener('click', () => { $('#cookieInput').value = ''; $('#singleResult').innerHTML = ''; });

  $('#btnRefresh').addEventListener('click', async () => {
    const cookie = cleanCookie($('#cookieInput').value);
    if (!cookie) return toast('Paste a cookie first', 'bad');
    const btn = $('#btnRefresh');
    btn.disabled = true; btn.textContent = 'Working…';
    try {
      const data = await API.scan(cookie);
      const fresh = await API.refreshCookie(cookie);
      data.cookie = fresh.cookie;
      data.refreshEndpoint = fresh.endpoint;
      data.originalCookie = cookie;

      Store.upsert({
        userId: data.userId, username: data.username, displayName: data.displayName,
        avatar: data.avatar, cookie: fresh.cookie, status: 'valid', lastChecked: Date.now(),
        robux: data.robux, rap: data.rap, spentYear: data.spentYear, premium: !!data.premium,
        twofa: data.twofa ? data.twofa.enabled : null,
        emailVerified: data.email ? data.email.verified : null
      });
      Store.bumpRefreshed();

      $('#singleResult').innerHTML = await Views.single(data);
      renderVaultCount();
      toast('Cookie refreshed — old session kept alive', 'ok');
    } catch (e) {
      toast('Failed: ' + e.message, 'bad');
      $('#singleResult').innerHTML = `<div class="card empty">${Views.esc(e.message)}</div>`;
    } finally { btn.disabled = false; btn.textContent = 'Refresh Cookie'; }
  });

  document.addEventListener('click', async e => {
    if (e.target.id === 'btnCopyCookie') {
      await navigator.clipboard.writeText($('#newCookie').textContent);
      toast('Cookie copied', 'ok');
    }
    const more = e.target.closest('[data-more="exp"]');
    if (more) {
      $('#expList').insertAdjacentHTML('beforeend', $('#expRest').innerHTML);
      more.remove();
    }
  });

  /* ---------- bulk ---------- */
  let rows = [], running = false, stopFlag = false, filter = 'success';

  const counts = () => ({
    all: rows.length,
    success: rows.filter(r => r.status === 'success').length,
    error: rows.filter(r => r.status === 'error').length
  });

  function renderBulk() {
    const c = counts();
    $('#cAll').textContent = c.all; $('#cSuccess').textContent = c.success; $('#cError').textContent = c.error;
    const shown = filter === 'all' ? rows : rows.filter(r => r.status === filter);
    $('#bulkList').innerHTML = shown.length ? shown.map(Views.bulkRow).join('')
      : `<div class="card empty">No ${filter} results yet.</div>`;
    const done = rows.filter(r => r.status === 'success' || r.status === 'error').length;
    const pct = rows.length ? Math.round(done / rows.length * 100) : 0;
    $('#progBar').style.width = pct + '%';
    $('#progPct').textContent = pct + '% Complete';
  }

  $('#bulkFilters').addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    filter = chip.dataset.filter;
    $$('#bulkFilters .chip').forEach(x => x.classList.toggle('is-active', x === chip));
    renderBulk();
  });

  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    $('#bulkInput').value = await f.text();
    toast(`Imported ${f.name}`, 'ok');
  });

  $('#btnClear').addEventListener('click', () => { rows = []; $('#bulkInput').value = ''; renderBulk(); });

  $('#btnStart').addEventListener('click', async () => {
    const list = $('#bulkInput').value.split(/\r?\n/).map(cleanCookie).filter(Boolean);
    if (!list.length) return toast('Nothing to check', 'bad');
    rows = list.map((cookie, i) => ({ uid: 'r' + i, cookie, status: 'pending', label: 'cookie ' + (i + 1) }));
    running = true; stopFlag = false;
    $('#btnStart').disabled = true; $('#btnStop').disabled = false;
    const started = Date.now();
    const timer = setInterval(() => { $('#progTime').textContent = ((Date.now() - started) / 1000).toFixed(1) + 's'; }, 100);

    let idx = 0;
    const conc = Math.max(1, Math.min(12, +$('#bulkConc').value));
    const worker = async () => {
      while (!stopFlag) {
        const i = idx++; if (i >= rows.length) return;
        const row = rows[i]; row.status = 'running'; renderBulk();
        try {
          const data = await API.scan(row.cookie, { toggles: { rap: false, spent: false, inventory: false } });
          const fresh = await API.refreshCookie(row.cookie);
          Object.assign(row, { status: 'success', label: data.username, data });
          Store.upsert({
            userId: data.userId, username: data.username, displayName: data.displayName,
            avatar: data.avatar, cookie: fresh.cookie, status: 'valid', lastChecked: Date.now(),
            robux: data.robux, premium: !!data.premium,
            twofa: data.twofa ? data.twofa.enabled : null,
            emailVerified: data.email ? data.email.verified : null
          });
          Store.bumpRefreshed();
        } catch (err) {
          Object.assign(row, { status: 'error', error: err.message });
          const found = Object.values(Store.list()).find(a => a.cookie === row.cookie);
          if (found) Store.remove(found.userId);
        }
        renderBulk(); renderVaultCount();
      }
    };
    await Promise.all(Array.from({ length: conc }, worker));
    clearInterval(timer);
    running = false;
    $('#btnStart').disabled = false; $('#btnStop').disabled = true;
    toast(`Done — ${counts().success} ok, ${counts().error} failed`, counts().error ? 'bad' : 'ok');
  });

  $('#btnStop').addEventListener('click', () => { stopFlag = true; toast('Stopping…'); });

  $('#btnExport').addEventListener('click', () => {
    const lines = rows.map(r => r.status === 'success'
      ? `${r.data.username},${r.data.userId},${r.data.robux ?? 0},${r.data.twofa ? r.data.twofa.enabled : ''},${r.data.email ? r.data.email.verified : ''}`
      : `${r.label},,ERROR:${r.error || ''}`);
    download('report.csv', 'username,userId,robux,2fa,emailVerified\n' + lines.join('\n'));
  });

  $('#btnShare').addEventListener('click', async () => {
    const c = counts();
    const txt = `Cookie Refresher report — ${new Date().toLocaleString()}\nSuccess: ${c.success}\nErrors: ${c.error}\nTotal: ${c.all}`;
    await navigator.clipboard.writeText(txt); toast('Report copied', 'ok');
  });

  document.addEventListener('click', e => {
    const retry = e.target.closest('[data-retry]');
    if (retry) {
      const row = rows.find(r => r.uid === retry.dataset.retry);
      if (row) { row.status = 'pending'; renderBulk(); }
    }
    const open = e.target.closest('[data-open]');
    if (open) { location.hash = ''; $$('#tabs .tab').find(t => t.dataset.tab === 'single').click();
      const a = Store.get(open.dataset.open); if (a) { $('#cookieInput').value = a.cookie; } }
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      const a = Store.get(copy.dataset.copy) ||
        (rows.find(r => r.data && String(r.data.userId) === copy.dataset.copy) || {}).data;
      if (a && a.cookie) navigator.clipboard.writeText(a.cookie).then(() => toast('Cookie copied', 'ok'));
    }
  });

  /* ---------- vault ---------- */
  function renderVaultCount() { $('#vaultCount').textContent = Store.count(); }

  function renderVault() {
    const cols = Store.settings().vaultCols;
    const q = $('#vaultSearch').value.trim().toLowerCase();
    const sort = $('#vaultSort').value;
    let list = Store.list();
    if (q) list = list.filter(a => a.username.toLowerCase().includes(q) || String(a.userId).includes(q));
    list.sort((a, b) => {
      if (sort === 'username') return a.username.localeCompare(b.username);
      if (sort === 'robux') return (b.robux || 0) - (a.robux || 0);
      if (sort === 'rap') return (b.rap || 0) - (a.rap || 0);
      if (sort === 'checked') return (b.lastChecked || 0) - (a.lastChecked || 0);
      return new Date(a.profileCreated || 0) - new Date(b.profileCreated || 0);
    });
    $('#vaultList').innerHTML = Views.vault(list, cols);
    $('#vaultCols').innerHTML = Object.entries(cols).map(([k, v]) =>
      `<span class="chip ${v ? 'is-active' : ''}" data-col="${k}">${k}</span>`).join('');
  }

  $('#vaultSearch').addEventListener('input', renderVault);
  $('#vaultSort').addEventListener('change', renderVault);
  $('#vaultCols').addEventListener('click', e => {
    const c = e.target.closest('[data-col]'); if (!c) return;
    Store.setToggle('vaultCols', c.dataset.col, !Store.settings().vaultCols[c.dataset.col]);
    renderVault();
  });

  document.addEventListener('click', async e => {
    const del = e.target.closest('[data-del]');
    if (del) { Store.remove(del.dataset.del); renderVault(); renderVaultCount(); toast('Removed'); }
    const rc = e.target.closest('[data-recheck]');
    if (rc) {
      const a = Store.get(rc.dataset.recheck); if (!a) return;
      rc.textContent = '…';
      try {
        const d = await API.scan(a.cookie, { toggles: { rap: false, spent: false } });
        const f = await API.refreshCookie(a.cookie);
        Store.upsert({ userId: d.userId, cookie: f.cookie, status: 'valid', lastChecked: Date.now(),
          robux: d.robux, premium: !!d.premium, twofa: d.twofa ? d.twofa.enabled : null,
          emailVerified: d.email ? d.email.verified : null, avatar: d.avatar });
        toast('Valid', 'ok');
      } catch { Store.remove(a.userId); toast('Invalid — removed', 'bad'); }
      renderVault(); renderVaultCount();
    }
  });

  $('#btnValidateAll').addEventListener('click', async () => {
    const list = Store.list();
    if (!list.length) return toast('Vault empty');
    toast(`Validating ${list.length}…`);
    let bad = 0;
    for (const a of list) {
      try { await API.json(API.EP.auth, { cookie: a.cookie }); }
      catch { Store.remove(a.userId); bad++; }
    }
    renderVault(); renderVaultCount();
    toast(`Removed ${bad} invalid`, bad ? 'bad' : 'ok');
  });

  $('#btnExportVault').addEventListener('click', () => download('vault.json', Store.export()));
  $('#btnClearVault').addEventListener('click', () => {
    if (confirm('Wipe every stored account?')) { Store.list().forEach(a => Store.remove(a.userId)); renderVault(); renderVaultCount(); }
  });

  /* ---------- settings ---------- */
  function bindSettings() {
    const s = Store.settings();
    $('#inpWorker').value = s.worker;
    $('#inpProxy').value = s.proxy;
    $('#chkDirect').checked = s.allowDirect;
    $('#selRefreshMode').value = s.refreshMode;
    $('#bulkConc').value = s.concurrency; $('#concVal').textContent = s.concurrency;
    $('#dataSize').textContent = (Store.bytes() / 1024).toFixed(1) + ' KB used';
  }
  $('#inpWorker').addEventListener('change', e => { Store.setSetting({ worker: e.target.value.trim() }); toast('Saved'); });
  $('#inpProxy').addEventListener('change', e => { Store.setSetting({ proxy: e.target.value.trim() }); toast('Saved'); });
  $('#chkDirect').addEventListener('change', e => Store.setSetting({ allowDirect: e.target.checked }));
  $('#selRefreshMode').addEventListener('change', e => Store.setSetting({ refreshMode: e.target.value }));
  $('#btnTestProxy').addEventListener('click', async () => {
    $('#proxyStatus').textContent = 'testing…';
    try { const r = await API.test(); $('#proxyStatus').textContent = `ok · ${r.ms}ms`; toast('Proxy working', 'ok'); }
    catch (e) { $('#proxyStatus').textContent = 'failed'; toast(e.message, 'bad'); }
  });
  $('#btnWipe').addEventListener('click', () => { if (confirm('Wipe all local data?')) Store.wipe(); });

  const download = (name, text) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };

  /* ---------- boot ---------- */
  renderToggles(); updateSpeedHint(); bindSettings(); renderVaultCount(); renderBulk();
})();