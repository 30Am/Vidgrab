/**
 * Cleanup worker (section 4.3): processes the `cleanup` queue. Deletes R2 objects
 * older than the TTL and prunes job rows older than the retention window.
 *
 * The R2 bucket lifecycle rule is the primary delete mechanism; this is a belt-
 * and-braces sweep plus the DB-row pruning that lifecycle rules can't do.
 *
 * Schedule it with a BullMQ repeatable job (see scheduleCleanup) or an external cron.
 */
import { Worker, Queue, type Job } from "bullmq";
import { lt } from "drizzle-orm";
import { createDb, jobs as jobsTable } from "@vidgrab/db";
import {
  createRedisConnection,
  QUEUE_NAMES,
  type CleanupJobData,
} from "@vidgrab/queue";
import { loadConfig } from "./config.js";
import { Storage } from "./storage/r2.js";

async function main() {
  const config = loadConfig();
  const { db, close: closeDb } = createDb(config.DATABASE_URL);
  const connection = createRedisConnection(config.REDIS_URL);

  const storage = new Storage({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    publicBaseUrl: config.S3_PUBLIC_BASE_URL,
  });

  // Schedule the nightly run (idempotent — same repeat key).
  const queue = new Queue<CleanupJobData>(QUEUE_NAMES.cleanup, { connection });
  await queue.add(
    "nightly",
    { objectTtlHours: config.OBJECT_TTL_HOURS, jobRowRetentionDays: 30 },
    {
      repeat: { pattern: "0 3 * * *" }, // 03:00 daily
      removeOnComplete: true,
      removeOnFail: 10,
    },
  );

  const worker = new Worker<CleanupJobData>(
    QUEUE_NAMES.cleanup,
    async (job: Job<CleanupJobData>) => {
      const now = Date.now();
      const objectsBefore = new Date(now - job.data.objectTtlHours * 3600 * 1000);
      const rowsBefore = new Date(now - job.data.jobRowRetentionDays * 86400 * 1000);

      const expiredKeys = await storage.listExpired("jobs/", objectsBefore);
      await storage.deleteKeys(expiredKeys);

      const deleted = await db
        .delete(jobsTable)
        .where(lt(jobsTable.createdAt, rowsBefore))
        .returning({ id: jobsTable.id });

      console.log(
        `[cleanup] removed ${expiredKeys.length} objects, pruned ${deleted.length} job rows`,
      );
    },
    { connection },
  );

  worker.on("failed", (_job, err) => console.error("[cleanup] failed:", err.message));

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await connection.quit();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("[cleanup] ready — nightly sweep scheduled (03:00)");
}

main().catch((err) => {
  console.error("[cleanup] fatal:", err);
  process.exit(1);
});
