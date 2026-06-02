# Deploying VidGrab internally (single host, password-protected)

This runs the **entire** stack (web, API, worker, cleanup worker, Postgres, Redis,
MinIO) on one Linux server behind a [Caddy](https://caddyserver.com) reverse proxy
that provides **automatic HTTPS** and an **HTTP basic-auth login**. Only your team
(anyone with the password) can reach it. Nothing else is exposed to the internet.

```
teammate ──HTTPS+login──> Caddy ─┬─ /api/* ─> api ─┬─ postgres
                                 │                 ├─ redis
                                 └─ /*    ─> web   └─ minio (internal only)
                                                    worker ─> yt-dlp + ffmpeg ─> minio
download: browser ─> /api/download/:id ─> api streams the file from minio
```

Downloads are streamed **through the API**, so MinIO never needs to be public and
everything stays behind the one login.

---

## Prerequisites

- A Linux server (2 vCPU / 2–4 GB RAM is plenty for a team) with a **public IP**.
- **Docker** + the **Docker Compose plugin** installed.
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```
- A **domain/subdomain** pointed at the server:
  - Add a DNS **A record** (and AAAA if you have IPv6) for e.g. `vidgrab.yourcompany.com` → server IP.
  - Open inbound **ports 80 and 443** (Caddy needs 80 to obtain the TLS cert).

---

## 1. Get the code onto the server

```bash
git clone <your-repo-url> vidgrab && cd vidgrab
# (or rsync/scp the project directory up)
```

## 2. Create the production env file

```bash
cp infra/.env.prod.example infra/.env.prod
```

Edit `infra/.env.prod` and set, at minimum:

| Variable | What to put |
|----------|-------------|
| `DOMAIN` | your domain, e.g. `vidgrab.yourcompany.com` |
| `ACME_EMAIL` | your email (Let's Encrypt notices) |
| `PUBLIC_BASE_URL` | `https://<DOMAIN>` |
| `CORS_ORIGIN` | `https://<DOMAIN>` |
| `BASIC_AUTH_USER` | a username, e.g. `team` |
| `BASIC_AUTH_HASH` | bcrypt hash — see next step |
| `POSTGRES_PASSWORD` + the password inside `DATABASE_URL` | a strong password (must match) |
| `S3_SECRET_ACCESS_KEY` | a strong secret |

### Generate the login password hash

Docker Compose performs `$`-interpolation on env files, so every `$` in the bcrypt
hash must be **doubled to `$$`**. Generate an already-escaped value in one step:

```bash
docker run --rm caddy caddy hash-password --plaintext 'choose-a-strong-password' | sed 's/\$/$$/g'
```

Paste that output as `BASIC_AUTH_HASH` (it will look like `$$2a$$14$$…`). Compose
collapses each `$$` back to `$` before handing it to Caddy, so the actual hash is
correct. Log in with `BASIC_AUTH_USER` + the plaintext password you chose.

> If Caddy logs `variable is not set, defaulting to blank` and the login fails,
> the `$` weren't doubled.

> Keep `infra/.env.prod` secret — it's gitignored. Anyone with it has full access.

## 3. Launch

From the repo root:

```bash
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d --build
```

This builds the three app images, starts Postgres/Redis/MinIO, runs DB migrations
(the one-shot `migrate` service), creates the private bucket, and brings Caddy up.
The first request triggers TLS issuance (a few seconds).

Check everything is healthy:

```bash
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml ps
```

Then open `https://<DOMAIN>` — your browser will prompt for the username/password.

## 4. Verify

```bash
# Health (through the proxy, with the login)
curl -u team:'your-password' https://<DOMAIN>/api/health
```

In the browser, paste a YouTube or Instagram link, pick a format, and download.

---

## Operating it

**Logs**
```bash
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml logs -f worker
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml logs -f api
```

**Update to a new version**
```bash
git pull
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d --build
```
Migrations run automatically on each `up` via the `migrate` service.

**Scale the worker** (more concurrent downloads)
```bash
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d --scale worker=2
```
…or raise `WORKER_CONCURRENCY` in `infra/.env.prod`.

**Stop / start**
```bash
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml down      # stop (keeps data volumes)
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d      # start again
```

**Add/rotate the login**: change `BASIC_AUTH_USER` / regenerate `BASIC_AUTH_HASH`,
then `up -d` the `caddy` service (`… up -d caddy`).

---

## Notes & limits

- **Files auto-delete after 24 h** (`OBJECT_TTL_HOURS`); the cleanup worker also
  prunes old job rows nightly. Downloads are short-lived by design.
- **No residential proxies** are configured (fine for low internal volume). If
  YouTube/Instagram start blocking the server's IP, add comma-separated
  `PROXY_URLS` in `infra/.env.prod` and restart — the worker already rotates them.
- **Instagram VP9** clips are re-encoded to H.264 automatically so they play in
  QuickTime; this uses CPU on the worker for those downloads.
- **Private Instagram** content needs a logged-in cookie file — set
  `INSTAGRAM_COOKIES_FILE` and mount it into the worker.
- **Backups**: the only durable state is the `pgdata` volume (job history). The
  `miniodata` volume is ephemeral (24 h files). Back up `pgdata` if you care about
  history; otherwise nothing here is precious.
- This is an **internal** tool. It intentionally omits the public-scale defenses
  (Turnstile, WAF, aggressive rate limits). Don't put it on a public URL without
  re-enabling those — see the architecture doc §6.
