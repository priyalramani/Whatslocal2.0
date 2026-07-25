# Deployment

## Live infra (first deploy: 2026-06-24 · domain + SSL: 2026-06-24)
WhatsLocal 2.0 is live at **https://whatslocal.in**, deployed on the **RG ERP EC2** (co-tenant, shared box).

| What | Value |
|---|---|
| **Public URL** | **https://whatslocal.in** (+ `https://www.whatslocal.in`). `http://` → 301 to https. |
| Host | EC2 `ap-south-1` — `ubuntu@15.206.166.172` (same box as RG ERP). SSH key `retail-grid.pem` (operator machine: `E:\DATA\DESKTOP\retailgrid\retail-grid.pem`). |
| API | NestJS, **pm2 `wl-api`**, runs `node dist/main.js`, **port 9100** (localhost). Code at `/home/ubuntu/whatslocal/backend`. `.env` there (`CORS_ORIGINS=https://whatslocal.in,https://www.whatslocal.in`). `trust proxy = 1` set in `main.ts` so `req.ip` is the real client IP behind nginx. |
| Web | Vite static `dist/` at `/var/www/whatslocal2/dist` (nginx, `www-data`). Calls same-origin `/api/v1` — no rebuild needed when the domain/origin changes. **Build-time env:** `apps/web/.env` carries `VITE_MSG91_WIDGET_ID` + `VITE_MSG91_TOKEN_AUTH` (public OTP-widget keys baked into the bundle). |
| Social link unfurl | nginx `whatslocal.in` vhost has a `map $http_user_agent $wl_is_bot` + `location / { error_page 418 → @bot }` that `rewrite`s bot requests to `/api/v1/og` (passing `X-Og-Path: $request_uri`); humans get the SPA. A media-extension `location` serves images/fonts/favicon directly. Editing this config: write locally, scp, `cp` over `/etc/nginx/sites-available/whatslocal.in` (a timestamped `.bak.*` is taken), `nginx -t` then `systemctl reload nginx` (auto-rollback on test fail). Live since 2026-06-25. |
| OTP (MSG91) | Real SMS via MSG91 headless widget. Backend `.env` needs **`MSG91_AUTH_KEY`** (secret, MSG91 "ServerAuthKey") — added in place, never via the deploy tarball. Captcha toggled in MSG91 Widget Settings. Authkey IP-Security ON, whitelisting the box IP `15.206.166.172`. See AUTH.md + memory `whatslocal2-otp-msg91`. |
| Nginx | **`/etc/nginx/sites-available/whatslocal.in`** → `:443` SSL (certbot-managed) + `:80`→https redirect, `server_name whatslocal.in www.whatslocal.in`, serves web + proxies `/api/v1/` → `localhost:9100`, sets `X-Forwarded-*`. SPA fallback + hashed-asset cache headers. (Legacy `/etc/nginx/sites-available/whatslocal2` on `:8090` still enabled but redundant — see below.) |
| DNS | GoDaddy: `A @ → 15.206.166.172`, `CNAME www → whatslocal.in`. NS stay GoDaddy (`domaincontrol.com`). |
| SSL | Let's Encrypt via certbot 2.9.0, cert `/etc/letsencrypt/live/whatslocal.in/`, covers apex + www, **expires 2026-09-22**, auto-renew scheduled. |
| DB | MongoDB Atlas cluster `vzpoiol` (shared with RG ERP), DB **`whatslocal2_0`**. Box IP already allow-listed (health shows `db.state:1`). |
| Reboot | pm2 startup (systemd, ubuntu user) is enabled + `pm2 save` done → `wl-api` resurrects on reboot. |

### Share cards + photos — runtime deps, dirs, nginx (2026-06-26)
Rendering share cards (OG) and processing photo uploads needs extra pieces on the box:
- **Extra web-served dirs (ubuntu-owned, OUTSIDE the web dist):** `/var/www/whatslocal-og` (pre-rendered share-card JPEGs) and `/var/www/whatslocal-media` (uploaded photo `view`/`thumb` derivatives). Do NOT put these under `/var/www/whatslocal2/dist` (a redeploy wipes the dist).
- **`sharp`** (image rendering/re-encode) is installed **manually** on the box: the box's backend can't `npm install` cleanly (workspace `workspace:` protocol) and its apt is partly broken, so sharp was **copied in from a temp install**.
- **Fonts** are hand-placed under `/usr/local/share/fonts`: **DejaVu** (text + the ₹ glyph) and **monochrome Noto Emoji** (category icons render as white silhouettes on the teal disc — colour-emoji fonts render unreliably in the SVG rasteriser). Needed because apt font packages wouldn't install.
- **nginx** has the extra locations: `/og/` and `/media/` (regex/`^~` static, serving the two dirs, with an `@oggen` Node fallback for OG misses that also writes the file) plus the bot-routing `location` (see the Social-link-unfurl row above).
- **Env vars of note** (backend `.env`, edited **in place** — never in the tarball): `FB_SCRAPE_TOKEN="APP_ID|APP_SECRET"` (optional; enables social pre-warm on approve/edit — no-op if unset), `INFLATE_BASE` / `INFLATE_MULTIPLIER` (public visitor-count inflation, currently 613 / 7.63), `MONGODB_URI`, `PUBLIC_BASE_URL` (default `https://whatslocal.in`). Optional dir overrides: `OG_CACHE_DIR`, `MEDIA_DIR`.

### ⚠️ Shared box — disk is the hazard
Root volume is **6.8 GB (~75% full, ~1.7 GB free)** and hosts **live RG ERP** + marketing + IoT. A full disk breaks RG ERP photo uploads (see RG `DEPLOYMENT.md` §disk-full). The whatslocal footprint is small (~80 MB incl. node_modules), but **uploaded photos + share cards now grow over time** under `/var/www/whatslocal-media` and `/var/www/whatslocal-og` — the orphan-media sweep reclaims abandoned uploads, but watch the media dir as usage grows. **Always `df -h /` before/after a deploy.** Never run anything that bloats the disk.

### Domain + SSL setup (done 2026-06-24, for reference)
1. GoDaddy DNS: `A @ → 15.206.166.172`, `CNAME www → whatslocal.in`.
2. nginx `:80` `server_name whatslocal.in www.whatslocal.in` block (web root + `/api/v1` proxy) created & enabled.
3. `sudo certbot --nginx -d whatslocal.in -d www.whatslocal.in --non-interactive --agree-tos -m btgondia@gmail.com --redirect` → issued cert, added `:443`, forced http→https.
4. `.env` `CORS_ORIGINS=https://whatslocal.in,https://www.whatslocal.in` (backed up to `.env.bak`), `pm2 restart wl-api --update-env`.
5. Verified: apex/www 200, http→https 301, `/api/v1/health` `ok:true`/`db.state:1`.

### Resolved / history
- ✅ **`trust proxy`** — `app.getHttpAdapter().getInstance().set('trust proxy', 1)` in `main.ts` (after `setGlobalPrefix`, before helmet). Shipped 2026-06-24. Without it the throttler buckets all users as `127.0.0.1`.
- ✅ **Domain + SSL** — done (see above). Replaced the interim plan.
- ⏳ **Legacy `:8090` block** is still enabled but now redundant (the AWS SG port 8090 was never opened, so it was never publicly reachable). Safe to leave; can be removed by `sudo rm /etc/nginx/sites-enabled/whatslocal2 && sudo systemctl reload nginx` if you want it gone.

## Redeploy (fast path — code only, deps unchanged)
This is what the 2026-06-24 feature+OTP deploy used. Deps didn't change, so **dist-only**:
```bash
# build locally (web build reads apps/web/.env → bakes in VITE_MSG91_* widget keys)
pnpm --filter @whatslocal/types build && pnpm --filter @whatslocal/backend build && pnpm --filter @whatslocal/web build
# stage backend dist + types dist + web dist; tar; scp to box
# on box: overwrite backend/dist + backend/types/dist; replace /var/www/whatslocal2/dist
# add the OTP secret in place (never overwrite the rest of .env):
grep -q '^MSG91_AUTH_KEY=' ~/whatslocal/backend/.env || echo 'MSG91_AUTH_KEY=…' >> ~/whatslocal/backend/.env
pm2 restart wl-api      # re-reads .env via dotenv on restart
```
Verify: `/api/v1/health` ok, a `POST /auth/otp/widget-verify {}` → 400 (route live), and the served `index-*.js` hash matches the local build.

## Deploy procedure (build local → ship → install on box) — full bundle (deps changed)
Box has **npm only** (no pnpm/tsx) and the backend is a pnpm-workspace that imports `@whatslocal/types` (`workspace:*`). So we build locally and ship a self-contained bundle where the workspace dep is rewritten to a local `file:./types`. **`MSG91_AUTH_KEY` and the box `.env` are never in the tarball** — edit the key in place (above).

```bash
# 1. Build locally (uses RG .tools toolchain on this machine)
pnpm --filter @whatslocal/types build
pnpm --filter @whatslocal/backend build
pnpm --filter @whatslocal/web build

# 2. Stage a self-contained bundle (_deploy/)
#    _deploy/backend/{dist, types/(dist+package.json), package.json (types→file:./types), .env}
#    _deploy/web/  ← apps/web/dist
#    (prod .env: copy local .env, swap JWT_SECRET to a fresh prod one, CORS_ORIGINS to the live origin)

# 3. tar + scp
tar -czf _wl-deploy.tgz -C _deploy backend web
scp -i retail-grid.pem _wl-deploy.tgz ubuntu@15.206.166.172:/home/ubuntu/

# 4. On the box
ssh -i retail-grid.pem ubuntu@15.206.166.172
. ~/.nvm/nvm.sh
rm -rf ~/whatslocal && mkdir -p ~/whatslocal
tar -xzf ~/_wl-deploy.tgz -C ~/whatslocal
cd ~/whatslocal/backend && npm install --omit=dev --no-audit --no-fund && npm cache clean --force
sudo rm -rf /var/www/whatslocal2/dist/* && sudo cp -r ~/whatslocal/web/. /var/www/whatslocal2/dist/
sudo chown -R www-data:www-data /var/www/whatslocal2
pm2 restart wl-api || pm2 start dist/main.js --name wl-api --cwd ~/whatslocal/backend
pm2 save
# verify
curl -s http://localhost:9100/api/v1/health   # {"ok":true,...,"db":{...,"state":1}}
df -h /

# 5. nginx is already configured (/etc/nginx/sites-available/whatslocal.in,
#    :443 SSL + :80 redirect, proxy /api/v1/ -> localhost:9100, SPA fallback).
#    Redeploys don't touch it. If you ever change LISTEN PORTS, use
#    `sudo systemctl restart nginx` not reload (reload may not bind a brand-new
#    port — that bit us on the original :8090 first deploy).
```

The `.env` on the box is **not** in the tarball — never overwrite it on redeploys.
