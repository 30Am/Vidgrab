# ── VidGrab download worker ──────────────────────────────────
# FROM node:22 + yt-dlp + ffmpeg (section 8). Runs yt-dlp/FFmpeg and uploads to R2.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @vidgrab/shared --filter @vidgrab/db --filter @vidgrab/queue build \
 && pnpm --filter @vidgrab/worker build
RUN pnpm --filter @vidgrab/worker deploy --legacy --prod /app

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# ffmpeg (muxing) + python3 + yt-dlp standalone binary (self-updatable).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl \
 && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
ENV NODE_ENV=production
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV FFMPEG_PATH=ffmpeg
ENV TMP_DIR=/tmp/vidgrab
CMD ["node", "dist/worker.js"]
