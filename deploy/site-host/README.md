# freeinf.org on an OVH VPS (leaving Vercel)

Option A of the hosting cost plan: the Next.js site moves to a cheap OVH VPS and Supabase
stays as it is. Vercel stays live until the cutover has held for a week.

```
GitHub push → Actions builds .next/standalone → scp to VPS → releases/<sha> → current symlink
Visitor → Cloudflare (cache, DDoS) → Caddy :443 (TLS) → node server.js :3000 → Supabase
```

| File | Goes to |
|---|---|
| `setup-server.sh` | run once as root on the VPS |
| `Caddyfile` | `/etc/caddy/Caddyfile` |
| `freeinf-site.service` | `/etc/systemd/system/` |
| `freeinf-cron@.service`, `freeinf-cron@*.timer` | `/etc/systemd/system/` |
| `site.env.example` | template for `/etc/freeinf/site.env` |
| `../../.github/workflows/deploy-site.yml` | the deploy job |

## 1. Before you start

- [ ] **Copy the production env vars out of Vercel** (Project → Settings → Environment
      Variables, or `vercel env pull --environment=production .env.vercel`). Vercel has more
      than `.env.local`. Keep the file out of git.
- [x] **What calls the crons:** serverB's `freeinfantry` crontab, every 30 min for
      `snapshot-zone-population` and every minute for `zone-pop-reporter.py`. Both use
      `https://www.freeinf.org`, so they follow DNS to the VPS with no change.
- [ ] Lower the TTL on the `freeinf.org` / `www` DNS records to 300s a day ahead.

## 2. Buy and set up the VPS

1. OVH **VPS-1** (2 vCore / 4 GB / 40 GB NVMe, from $4.54/mo, Nov 2026), US East
   (Vint Hill, same region as serverB), Ubuntu 24.04. Add your SSH key at order time.
   Builds run in GitHub Actions, so the box only serves the site (~0.5-1 GB RAM).
2. Make a deploy key pair on your PC (no passphrase):
   `ssh-keygen -t ed25519 -f ~/.ssh/freeinf_deploy -N "" -C freeinf-deploy`
3. Copy this folder up and run the setup:
   ```
   scp -r deploy/site-host root@<VPS>:/root/site-host
   ssh root@<VPS> "bash /root/site-host/setup-server.sh '$(cat ~/.ssh/freeinf_deploy.pub)'"
   ```
4. Fill `/etc/freeinf/site.env` on the server with the values from step 1
   (`nano /etc/freeinf/site.env`).

## 3. GitHub secrets

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `SITE_SSH_HOST` | VPS IP |
| `SITE_SSH_KEY` | contents of `~/.ssh/freeinf_deploy` (the private half) |
| `SITE_ENV` | the same contents as `/etc/freeinf/site.env` |

Then Actions → **Deploy site (OVH)** → Run workflow. From then on, every push to `main`
deploys to both Vercel and the VPS, until Vercel is switched off.

## 4. Test before switching DNS

DNS still points at Vercel, so Caddy can't get a certificate yet. Test the app directly:

```
ssh root@<VPS> "curl -sI http://127.0.0.1:3000/ | head -1; journalctl -u freeinf-site -n 30"
ssh -L 3000:127.0.0.1:3000 root@<VPS>     # then open http://localhost:3000 on your PC
```

Click through: home, login (email), squads, messages (realtime), map vote, an admin page.
Google sign-in comes back to the real domain, so test that after cutover.

## 5. Cutover

1. **Cloudflare (free):** add the `freeinf.org` site, copy every existing DNS record, then
   point `freeinf.org`, `www` and `origin` A records at the VPS. Keep them **DNS only (grey
   cloud)** for now. Switch the domain's nameservers to Cloudflare at the registrar.
2. Within minutes Caddy issues certificates (`journalctl -u caddy -f`). Check
   `https://www.freeinf.org` works and the apex redirects to www.
3. Turn on **Proxied (orange cloud)** for `freeinf.org` and `www` (leave `origin` grey).
   SSL/TLS mode **Full (strict)**. Add a Cache Rule: `/_next/static/*` and `/cdn/*`
   → eligible for cache, respect origin headers.
4. Check the zone hosts still report population (they post to `https://www.freeinf.org`),
   a USL mix ingest arrives, Google sign-in works, and a Ko-fi test webhook lands.
5. The snapshot cron keeps running from serverB. Only if you'd rather it lived on the VPS:
   remove the `*/30 … snapshot-zone-population` line from serverB's crontab, then
   `systemctl enable --now freeinf-cron@snapshot-zone-population.timer` here.
6. Long admin jobs (USL mix recompute / fix-accuracy / set-rated, up to 300s) fail through
   Cloudflare's 100s limit. Run them from `https://origin.freeinf.org/...`.

**Rollback:** point the DNS records back at Vercel. Leave the Vercel project running for a
week, then drop it to Hobby (or delete it) to stop the bill.

## Day-to-day

| Task | Command (on the VPS) |
|---|---|
| Logs | `journalctl -u freeinf-site -f` |
| Restart | `systemctl restart freeinf-site` |
| Roll back a deploy | `cd /srv/freeinf && ls -t releases` → `ln -sfn releases/<sha> current && systemctl restart freeinf-site` |
| Change an env var | edit `/etc/freeinf/site.env` **and** the `SITE_ENV` secret, then restart |
| Cron runs | `systemctl list-timers 'freeinf-cron@*'`, `journalctl -u 'freeinf-cron@*'` |

Monitoring: a free UptimeRobot (or Healthchecks.io) check on `https://www.freeinf.org/`.
Run only one instance of the site: some caches live in memory.
