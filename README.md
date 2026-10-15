# Cookie Refresher

Browser-only Roblox `.ROBLOSECURITY` refresher and account inspector. No backend, no logging, nothing leaves your machine.

## Deploy (GitHub Pages)

1. Create a repo, upload every file (keep the `assets/` folder).
2. Settings → Pages → Source: `main` / root → Save.
3. Open `https://<you>.github.io/<repo>/`.

## Deploy the proxy (2 minutes, free)

Roblox sends no CORS headers, so requests are proxied.

1. Go to `dash.cloudflare.com` → Workers & Pages → Create → Worker.
2. Replace the sample code with `worker.js` → Deploy.
3. Copy the `*.workers.dev` URL.
4. Paste it into the app → **Settings → Cloudflare Worker URL**.

Without a worker the app falls back to public proxies (slower, rate-limited).

## Refresh behaviour

| Mode | Endpoint | Effect |
|---|---|---|
| Preserve (default) | `/v1/authentication/refresh` | Issues a new cookie, **leaves your other sessions signed in** |
| Replace | `/v2/session/refresh` | Rotates the current session |

The app tries the primary endpoint, then fallbacks, retrying with `x-csrf-token` on 403.

## Endpoints used

| Data | Endpoint |
|---|---|
| Identity | `users.roblox.com/v1/users/authenticated` |
| Join date | `users.roblox.com/v1/users/{id}` |
| Balance | `economy.roblox.com/v1/users/{id}/currency` |
| Premium | `premiumfeatures.roblox.com/v1/users/{id}/validate-membership` |
| Email + verified | `accountsettings.roblox.com/v1/email` |
| Birthdate | `accountinformation.roblox.com/v1/birthdate` |
| Phone | `accountinformation.roblox.com/v1/phone` |
| Account PIN | `auth.roblox.com/v1/account/pin` |
| 2FA config | `twostepverification.roblox.com/v1/users/{id}/configuration` |
| RAP / collectibles | `inventory.roblox.com/v1/users/{id}/assets/collectibles` |
| Transactions | `economy.roblox.com/v2/users/{id}/transactions` |
| Thumbnails | `thumbnails.roblox.com/v1/*` (CORS-enabled, direct) |

**Top experiences / playtime** has no documented endpoint. The app probes several candidates (`user-experiences-api`, `screen-time-api`, `recently-played-games`, `playergames-json`) and uses the first that returns parseable data. If none work, the section is hidden rather than showing wrong numbers.

## Notes

- Cookies live in `localStorage` only. Export a backup from Settings or the Vault.
- RAP, Spent/yr and Inventory are off by default — they paginate and are slow.
- Bulk mode runs at your chosen concurrency; 4–6 is safe before Roblox rate-limits you.