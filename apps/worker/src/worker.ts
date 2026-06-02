/**
 * VidGrab download worker (sections 4.4, 5).
 *
 * Per job: lease proxy → yt-dlp to /tmp → stream file to R2 → presign URL →
 * mark job ready. The Node tier never holds the bytes in memory; the browser
 * downloads straight from the CDN.
 */
import { mkdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { createDb } from "@vidgrab/db";
import { jobs as jobsTable } from "@vidgrab/db";
import {
  createRedisConnection,
  downloadBackoffStrategy,
  QUEUE_NAMES,
  type DownloadJobData,
} from "@vidgrab/queue";
import { AppError, ErrorCode } from "@vidgrab/shared";
import { loadConfig } from "./config.js";
import { ProxyRotator } from "./proxy/rotator.js";
import { Storage } from "./storage/r2.js";
import { downloadWithYtDlp } from "./extractors/ytdlp.js";
import { extractorOptionsFor } from "./extractors/index.js";
import { contentTypeForExt, safeFilename } from "./lib/content-type.js";
import { updateYtDlp } from "./lib/ytdlp-update.js";
import { ensureQuickTimeCompatible } from "./lib/transcode.js";

async function main() {
  const config = loadConfig();
  const { db, close: closeDb } = createDb(config.DATABASE_URL);
  const connection = createRedisConnection(config.REDIS_URL);

  const rotator = new ProxyRotator(db, config.proxyUrls);
  await rotator.hydrate();

  const storage = new Storage({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    publicBaseUrl: config.S3_PUBLIC_BASE_URL,
  });

  await mkdir(config.TMP_DIR, { recursive: true });

  // Aborts in-flight yt-dlp processes on shutdown.
  const shutdownController = new AbortController();

  if (config.YTDLP_AUTO_UPDATE) {
    console.log("[worker] updating yt-dlp...");
    await updateYtDlp(config.YTDLP_PATH);
  }

  const worker = new Worker<DownloadJobData>(
    QUEUE_NAMES.download,
    (job) => processJob(job),
    {
      connection,
      concurrency: config.WORKER_CONCURRENCY,
      settings: { backoffStrategy: downloadBackoffStrategy },
    },
  );

  worker.on("completed", (job) => console.log(`[worker] job ${job.id} completed`));
  worker.on("failed", (job, err) =>
    console.error(`[worker] job ${job?.id} failed:`, err.message),
  );

  async function setStatus(
    jobId: string,
    fields: Partial<typeof jobsTable.$inferInsert>,
  ): Promise<void> {
    await db.update(jobsTable).set(fields).where(eq(jobsTable.id, jobId));
  }

  async function processJob(job: Job<DownloadJobData>): Promise<void> {
    const data = job.data;
    const jobDir = join(config.TMP_DIR, data.jobId);
    const lease = rotator.next();

    await mkdir(jobDir, { recursive: true });
    await setStatus(data.jobId, { status: "running", progress: 0 });

    try {
      const extractorOpts = extractorOptionsFor(data.source, config);

      const result = await downloadWithYtDlp({
        ytdlpPath: config.YTDLP_PATH,
        ffmpegPath: config.FFMPEG_PATH,
        url: data.url,
        formatId: data.formatId,
        outDir: jobDir,
        basename: data.jobId,
        audioOnly: data.audioOnly,
        container: data.container,
        proxyUrl: lease?.url,
        cookiesFile: extractorOpts.cookiesFile,
        maxFilesizeBytes: config.MAX_FILESIZE_BYTES,
        signal: shutdownController.signal,
        onProgress: (percent, stage) => {
          void job.updateProgress({ percent, stage });
          void setStatus(data.jobId, {
            status: stage === "merging" ? "merging" : "running",
            progress: Math.min(99, Math.round(percent)),
          });
        },
      });

      if (lease) await rotator.reportSuccess(lease);

      // Ensure broad playback compatibility (e.g. re-encode Instagram's VP9 to
      // H.264 so the MP4 opens in QuickTime). No-op for already-compatible files.
      if (!data.audioOnly && data.container === "mp4") {
        const reencoded = await ensureQuickTimeCompatible(
          result.filePath,
          { ffmpegPath: config.FFMPEG_PATH, ffprobePath: config.FFPROBE_PATH },
          () => void setStatus(data.jobId, { status: "merging", progress: 99 }),
        );
        if (reencoded) console.log(`[worker] job ${data.jobId} re-encoded to H.264 for compatibility`);
      }

      // Upload to object storage (status: uploading).
      await setStatus(data.jobId, { status: "uploading", progress: 99 });
      const ext = extname(result.filename).replace(/^\./, "") || data.container;
      const dateDir = new Date().toISOString().slice(0, 10);
      const downloadName = safeFilename(data.jobId, ext);
      const key = `jobs/${dateDir}/${data.jobId}/${downloadName}`;

      const fileSize = await storage.uploadFile(
        result.filePath,
        key,
        contentTypeForExt(ext),
      );

      // The API streams the file from storage (keeps object storage internal and
      // behind the same auth). It builds the download URL from the storage key.
      await setStatus(data.jobId, {
        status: "ready",
        progress: 100,
        storageKey: key,
        fileSize,
        completedAt: new Date(),
      });
    } catch (err) {
      if (lease) await rotator.reportFailure(lease);

      const appErr =
        err instanceof AppError ? err : new AppError(ErrorCode.EXTRACTION_FAILED, undefined, String(err));

      // Only mark the row failed on the final attempt; BullMQ will retry otherwise.
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await setStatus(data.jobId, {
          status: "failed",
          error: appErr.message,
          errorCode: appErr.code,
          completedAt: new Date(),
        });
      }
      throw appErr; // let BullMQ record + schedule retry
    } finally {
      await rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, draining...`);
    shutdownController.abort();
    await worker.close();
    await connection.quit();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  console.log(
    `[worker] ready — concurrency=${config.WORKER_CONCURRENCY}, proxies=${config.proxyUrls.length}`,
  );
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
