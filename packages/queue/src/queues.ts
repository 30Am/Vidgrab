import { Queue, type ConnectionOptions } from "bullmq";
import { QUEUE_NAMES, type CleanupJobData, type DownloadJobData } from "./types.js";

/** Default retry policy from section 4.3: 3 attempts, backoff 5s / 30s / 2m. */
export const DOWNLOAD_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "custom" as const },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 86400 },
} as const;

/** Backoff strategy registered on the Worker: 5s, 30s, then 2m. */
export function downloadBackoffStrategy(attemptsMade: number): number {
  const schedule = [5_000, 30_000, 120_000];
  return schedule[Math.min(attemptsMade - 1, schedule.length - 1)] ?? 120_000;
}

export function createDownloadQueue(connection: ConnectionOptions): Queue<DownloadJobData> {
  return new Queue<DownloadJobData>(QUEUE_NAMES.download, { connection });
}

export function createCleanupQueue(connection: ConnectionOptions): Queue<CleanupJobData> {
  return new Queue<CleanupJobData>(QUEUE_NAMES.cleanup, { connection });
}

/**
 * Enqueues a download job using its jobId as the BullMQ job id so the API can
 * look jobs up by id and so duplicate enqueues are idempotent.
 */
export async function enqueueDownload(
  queue: Queue<DownloadJobData>,
  data: DownloadJobData,
): Promise<void> {
  await queue.add("download", data, {
    ...DOWNLOAD_JOB_OPTS,
    jobId: data.jobId,
  });
}
