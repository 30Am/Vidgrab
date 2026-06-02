# VidGrab

Public, ad-free video downloader for **YouTube** and **Instagram**. Paste a link, pick a
format, download the file — video, merged video+audio, or audio-only — in the highest
quality the source offers.

This repo implements the architecture in `VidGrab_Architecture.docx`: a pnpm monorepo with
a Next.js frontend, a stateless Fastify API, a Redis/BullMQ job queue, and an autoscalable
worker pool that shells out to `yt-dlp` + `FFmpeg` and uploads finished files to
S3-compatible storage (MinIO locally, Cloudflare R2 in production).

## Architecture

```
Browser → Cloudflare (CDN/WAF/Turnstile) → Next.js (web)
                                          → API (Fastify, stateless)
                                              ├─ Postgres (jobs, metrics)
                                              ├─ Redis (probe cache + BullMQ)
                                              └─ enqueue → Worker pool (yt-dlp + FFmpeg + proxy rotator)
                                                              └─ R2 / MinIO (presigned URLs) → CDN download
```

The Node tier never streams the file bytes — the browser downloads straight from object
storage via a short-lived presigned URL.

## Layout

```
apps/
  web/      Next.js 15 frontend (App Router, Tailwind)
  api/      Fastify HTTP service: /api/probe, /api/jobs, /api/jobs/:id, /api/health, /api/stats
  worker/   BullMQ worker: yt-dlp → FFmpeg → R2 upload → presign; plus nightly cleanup worker
packages/
  shared/   Zod schemas, API contract types, error codes, URL detection
  db/       Drizzle schema + migrations (jobs, rate_limits, proxy_health)
  queue/    BullMQ queue definitions and job payload types
infra/      docker-compose (local), Fly.io configs
```

## Prerequisites

- Node 22+ and pnpm 11+
- Docker (for the local Postgres/Redis/MinIO stack)
- `yt-dlp` and `ffmpeg` on your PATH (the worker shells out to them)
  - macOS: `brew install yt-dlp ffmpeg`

## Quick start (local)

```bash
# 1. Install dependencies
pnpm install

# 2. Configure env
cp .env.example .env        # defaults already point at the local docker stack

# 3. Start Postgres + Redis + MinIO (creates the bucket automatically)
pnpm infra:up

# 4. Build shared packages + run DB migrations
pnpm --filter "./packages/*" build
pnpm db:migrate

# 5. Run the three apps (in separate terminals, or all at once)
pnpm dev:api      # http://localhost:4000
pnpm dev:worker
pnpm dev:web      # http://localhost:3000
```

Open http://localhost:3000, paste a YouTube or Instagram link, pick a format, and download.
MinIO console is at http://localhost:9001 (user `vidgrab` / pass `vidgrabsecret`).

> Environment variables (including which steps to load `.env`) are read from the process
> environment. For local dev, export them or use a tool like `direnv`/`dotenv`. Each app
> reads `process.env` directly and validates with Zod at boot.

## Key endpoints (see `packages/shared/src/schemas.ts` for full contracts)

| Endpoint            | Method | Purpose                                                   |
| ------------------- | ------ | --------------------------------------------------------- |
| `/api/probe`        | POST   | Metadata-only yt-dlp probe; returns formats. Cached 1h.   |
| `/api/jobs`         | POST   | Create + enqueue a download job. Returns `{ jobId }`.     |
| `/api/jobs/:id`     | GET    | Poll status/progress; returns presigned URL when ready.   |
| `/api/health`       | GET    | Liveness probe.                                           |
| `/api/stats`        | GET    | Public "downloads today" counter.                         |

## Production notes (the hard part — see doc §6)

- **Proxies**: set `PROXY_URLS` to a residential pool (Bright Data / Smartproxy / Oxylabs).
  Datacenter IPs get blocked within hours. The worker rotates per request and auto-bans a
  proxy for 1h after 3 consecutive failures (`proxy_health` table).
- **yt-dlp upkeep**: set `YTDLP_AUTO_UPDATE=true` so workers self-update on boot; also run
  an hourly cron. Subscribe to yt-dlp releases.
- **Instagram**: set `INSTAGRAM_COOKIES_FILE` to a `cookies.txt` from a burner account for
  non-public posts/stories. Rotate weekly.
- **Abuse**: Turnstile (`TURNSTILE_SECRET`), per-IP token bucket
  (`RATE_LIMIT_JOBS_PER_HOUR`), max filesize/duration caps, and a queue-depth circuit
  breaker (`QUEUE_CIRCUIT_BREAKER_MAX`).
- **Storage**: swap MinIO for R2 by changing the `S3_*` vars; set a 24h lifecycle rule on
  the bucket. The cleanup worker also prunes job rows older than 30 days.

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `pnpm build`        | Build packages then apps                      |
| `pnpm typecheck`    | Typecheck every package/app                   |
| `pnpm test`         | Run unit tests                                |
| `pnpm db:migrate`   | Apply Drizzle migrations                      |
| `pnpm db:generate`  | Generate a new migration from schema changes  |
| `pnpm infra:up`     | Start local Postgres/Redis/MinIO              |
| `pnpm infra:down`   | Stop the local stack                          |
