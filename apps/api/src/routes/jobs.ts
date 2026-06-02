import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  AppError,
  CreateJobRequestSchema,
  detectSource,
  type Container,
  type CreateJobResponse,
  type JobStatus,
  type JobStatusResponse,
} from "@vidgrab/shared";
import { jobs } from "@vidgrab/db";
import { enqueueDownload, QUEUE_NAMES } from "@vidgrab/queue";
import type { AppContext } from "../context.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { ipHashOf } from "../lib/ip.js";

function defaultContainer(audioOnly: boolean, requested?: Container): Container {
  if (requested) return requested;
  return audioOnly ? "m4a" : "mp4";
}

export function registerJobRoutes(app: FastifyInstance, ctx: AppContext) {
  // POST /api/jobs — create + enqueue a download job.
  app.post("/api/jobs", async (req, reply) => {
    const parsed = CreateJobRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("INVALID_URL");
    }
    const { url, formatId, audioOnly = false, container, turnstileToken } = parsed.data;

    const source = detectSource(url);
    if (!source) throw new AppError("UNSUPPORTED_SOURCE");

    await verifyTurnstile(ctx.config.TURNSTILE_SECRET, turnstileToken, req.ip);

    const ipHash = ipHashOf(req);

    // Per-IP token bucket (section 4.2 / 6.4).
    const rl = await ctx.rateLimiter.consume(ipHash, 1);
    if (!rl.allowed) {
      throw new AppError("RATE_LIMITED");
    }

    // Global circuit breaker on queue depth (section 6.4).
    const waiting = await ctx.downloadQueue.getWaitingCount();
    if (waiting >= ctx.config.QUEUE_CIRCUIT_BREAKER_MAX) {
      throw new AppError("QUEUE_FULL");
    }

    const chosenContainer = defaultContainer(audioOnly, container);
    const expiresAt = new Date(Date.now() + ctx.config.OBJECT_TTL_HOURS * 3600 * 1000);

    const [row] = await ctx.db
      .insert(jobs)
      .values({
        url,
        source,
        formatId,
        audioOnly,
        container: chosenContainer,
        status: "queued",
        progress: 0,
        ipHash,
        expiresAt,
      })
      .returning({ id: jobs.id });

    if (!row) throw new AppError("INTERNAL");

    await enqueueDownload(ctx.downloadQueue, {
      jobId: row.id,
      url,
      source,
      formatId,
      audioOnly,
      container: chosenContainer,
      requestedAt: new Date().toISOString(),
      ipHash,
    });

    req.log.info({ jobId: row.id, source, formatId, queue: QUEUE_NAMES.download }, "job enqueued");

    const body: CreateJobResponse = { jobId: row.id };
    reply.code(202);
    return body;
  });

  // GET /api/jobs/:id — poll status.
  app.get<{ Params: { id: string } }>("/api/jobs/:id", async (req) => {
    const { id } = req.params;
    const [row] = await ctx.db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    if (!row) throw new AppError("NOT_FOUND");

    const downloadUrl =
      row.status === "ready" && row.storageKey
        ? `${ctx.config.PUBLIC_BASE_URL}/api/download/${row.id}`
        : undefined;

    const body: JobStatusResponse = {
      jobId: row.id,
      status: row.status as JobStatus,
      progress: row.progress,
      ...(downloadUrl ? { downloadUrl } : {}),
      ...(row.fileSize != null ? { fileSize: row.fileSize } : {}),
      ...(row.status === "failed"
        ? { error: { code: row.errorCode ?? "INTERNAL", message: row.error ?? "Download failed." } }
        : {}),
      ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
    };
    return body;
  });
}
