/* Cloudflare Worker — CORS proxy for Roblox APIs
   Deploy: dash.cloudflare.com → Workers → Create → paste → Deploy
   Then paste the *.workers.dev URL into the app's Settings page. */

const SKIP_REQ = new Set(['host','origin','referer','cf-connecting-ip','x-forwarded-for','x-real-ip','accept-encoding','content-length','cf-ray','cf-ipcountry','cf-visitor','cdn-loop']);
const SKIP_RES = new Set(['content-encoding','content-length','transfer-encoding','connection','set-cookie','access-control-allow-origin','access-control-allow-credentials','access-control-expose-headers']);

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Expose-Headers': 'set-cookie,x-set-cookie,x-csrf-token,retry-after,x-ratelimit-remaining,content-type'
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const u = new URL(request.url);
    let target = u.searchParams.get('url');
    if (!target) {
      const rest = request.url.replace(u.origin, '').replace(/^\/+/, '');
      if (rest && rest !== 'favicon.ico') target = decodeURIComponent(rest);
    }
    if (!target) return new Response('Usage: ?url=https://...', { status: 400, headers: cors });
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

    const headers = new Headers();
    for (const [k, v] of request.headers) if (!SKIP_REQ.has(k.toLowerCase())) headers.set(k, v);

    const init = { method: request.method, headers, redirect: 'follow' };
    if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();

    let resp;
    try { resp = await fetch(target, init); }
    catch (e) { return new Response('Upstream error: ' + e.message, { status: 502, headers: cors }); }

    const out = new Headers(cors);
    resp.headers.forEach((v, k) => { if (!SKIP_RES.has(k.toLowerCase())) out.set(k, v); });

    const sc = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
    if (sc.length) { out.set('x-set-cookie', sc.join('\n')); out.set('set-cookie', sc.join(', ')); }

    return new Response(resp.body, { status: resp.status, headers: out });
  }
};