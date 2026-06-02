# Deploying VidGrab — Vercel (web) + Railway (API/worker/data)

Vercel hosts the **web frontend**; Railway hosts the **API**, the **worker** (long-running
`yt-dlp` + `ffmpeg`), the **cleanup worker**, and the **Postgres + Redis** data stores.
Object storage is **Cloudflare R2** (recommended) or a MinIO service on Railway.

```
browser ──> Vercel (Next.js web)  ──fetch /api──>  Railway: API (Fastify, public URL)
                                                     ├─ Postgres   (Railway plugin)
                                                     ├─ Redis      (Railway plugin)
                                                     └─ enqueue ─> Railway: worker (yt-dlp+ffmpeg)
download: browser ─> Railway API /api/download/:id ─streams─> R2 / MinIO  <─uploads─ worker
```

> **Auth note (read this):** Unlike the single-host setup, there's no Caddy basic-auth
> gate here. The API is reachable at its Railway URL. For an internal tool, protect the
> **web** with Vercel's **Deployment Protection → Password** (Project → Settings →
> Deployment Protection), and rely on the API's per-IP rate limits. If you need the API
> itself locked down, tell me and I'll add a shared-secret header check.

---

## Part A — Railway (API + worker + data)

You'll do the browser login and project creation; I can drive the rest via the Railway CLI
once you're logged in (`railway login`).

### A1. Create the project + data plugins
1. https://railway.app → **New Project**.
2. **+ New → Database → Add PostgreSQL**. Railway exposes `DATABASE_URL`.
3. **+ New → Database → Add Redis**. Railway exposes `REDIS_URL`.

### A2. Storage — pick one

**Option 1 (recommended): Cloudflare R2**
1. Cloudflare dashboard → R2 → create bucket `vidgrab-downloads`.
2. Create an R2 API token (Object Read & Write). Note the **Access Key ID**, **Secret**,
   and the **S3 endpoint** `https://<accountid>.r2.cloudflarestorage.com`.

**Option 2: MinIO service on Railway (no extra account)**
1. **+ New → Empty Service**, image `minio/minio`.
2. Start command: `server /data --address ":9000"` (the `:9000` binds IPv6 for Railway's
   private network).
3. **Variables:** `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`.
4. **Volume:** mount at `/data`.
5. Create the bucket once: in the service shell, `mc alias set local http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD && mc mb local/vidgrab-downloads`.
6. Internal endpoint for the apps: `http://<minio-service-name>.railway.internal:9000`.

### A3. API service
1. **+ New → GitHub Repo → `30Am/Vidgrab`**.
2. Service **Variables**:
   - `RAILWAY_DOCKERFILE_PATH` = `apps/api/Dockerfile`  ← tells Railway which Dockerfile
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = reference the Postgres plugin var
   - `REDIS_URL` = reference the Redis plugin var
   - `PUBLIC_BASE_URL` = `https://<api-public-domain>` (from step A3.4 — set after domain is generated)
   - `CORS_ORIGIN` = `https://<your-vercel-domain>` (set after Part B)
   - `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET=vidgrab-downloads`,
     `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`
     (R2: endpoint = your r2 endpoint, path-style `false`; MinIO: internal URL, path-style `true`)
   - `RATE_LIMIT_JOBS_PER_HOUR=200`, `MAX_FILESIZE_BYTES=5368709120`, `MAX_DURATION_SECONDS=21600`
   - `TURNSTILE_SECRET=` (empty), `PROXY_URLS=` (empty)
3. **Pre-deploy command** (Settings → Deploy): `node node_modules/@vidgrab/db/dist/migrate.js`
   — applies DB migrations before each release.
4. **Networking → Generate Domain.** Copy it → set `PUBLIC_BASE_URL` to it.

### A4. Worker service
1. **+ New → GitHub Repo → `30Am/Vidgrab`** (same repo, new service).
2. **Variables:** `RAILWAY_DOCKERFILE_PATH` = `apps/worker/Dockerfile`, plus the same
   `DATABASE_URL`, `REDIS_URL`, all `S3_*`, `MAX_*`, `PROXY_URLS=`, `YTDLP_AUTO_UPDATE=true`,
   `WORKER_CONCURRENCY=2`. **No public domain.**

### A5. Cleanup worker service
1. Same repo, `RAILWAY_DOCKERFILE_PATH` = `apps/worker/Dockerfile`, same data/S3 vars.
2. **Custom Start Command:** `node dist/cleanup.js`. No domain.

---

## Part B — Vercel (web)

1. https://vercel.com → **Add New → Project → import `30Am/Vidgrab`**.
2. **Root Directory:** `apps/web` (Vercel reads `apps/web/vercel.json` for build/install).
3. **Environment Variable:** `NEXT_PUBLIC_API_BASE_URL` = your Railway **API** public URL
   (e.g. `https://vidgrab-api-production.up.railway.app`).
4. **Deploy.** Note the resulting Vercel URL.
5. (Recommended) **Settings → Deployment Protection → Password** to gate the UI.

---

## Part C — Wire them together
1. Back in Railway → **API** service → set `CORS_ORIGIN` = your Vercel URL → redeploy.
2. Confirm `PUBLIC_BASE_URL` (API) is the API's own public URL.
3. Open the Vercel URL, paste a link, download. The browser calls the Railway API
   (CORS-allowed), and the download streams from the API.

---

## Driving it via CLI (optional — I can do this once you log in)
```bash
railway login            # opens browser — you do this
railway link             # pick the project
railway variables --set CORS_ORIGIN=https://<vercel-url> --service api
railway up --service api # deploy
```
For Vercel: `npx vercel login` then `npx vercel --cwd apps/web`.

---

## Costs
- Vercel Hobby: free for this. Deployment Protection password needs Pro ($20/mo) — or use
  the API rate limits + unguessable URLs for a free internal setup.
- Railway: usage-based, ~$5–20/mo for API + worker + Postgres + Redis at low volume.
- R2: a few dollars; free egress.

## Caveat
Railway/Vercel egress IPs are datacenter ranges, so YouTube/Instagram may challenge them
(see architecture doc §6.1). At low internal volume it usually works; if it degrades, add
residential `PROXY_URLS` to the worker + API services.
