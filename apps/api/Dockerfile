# ── VidGrab API service ──────────────────────────────────────
# Multi-stage build for the Fastify API. Includes yt-dlp for the
# metadata-only probe path (no ffmpeg needed here — that's the worker).
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Copy workspace manifests first for cached installs.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @vidgrab/shared --filter @vidgrab/db --filter @vidgrab/queue build \
 && pnpm --filter @vidgrab/api build
RUN pnpm --filter @vidgrab/api deploy --legacy --prod /app

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# yt-dlp for probes + python runtime it needs.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ca-certificates curl \
 && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/server.js"]
