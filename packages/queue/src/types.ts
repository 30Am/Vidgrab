import type { Container, VideoSourceT } from "@vidgrab/shared";

/** Names of the two BullMQ queues (section 4.3). */
export const QUEUE_NAMES = {
  download: "download",
  cleanup: "cleanup",
} as const;

/**
 * Payload for a download job (section 4.3). jobId doubles as the R2 object key
 * prefix so workers and the cleanup job can locate artifacts.
 */
export interface DownloadJobData {
  jobId: string; // also the R2 object key prefix
  url: string;
  source: VideoSourceT;
  formatId: string; // yt-dlp format selector, e.g. 'bv*+ba/b'
  audioOnly: boolean;
  container: Container;
  requestedAt: string; // ISO8601
  ipHash: string; // for abuse correlation only
}

/** Payload for the nightly cleanup job. */
export interface CleanupJobData {
  /** Delete R2 objects older than this many hours. */
  objectTtlHours: number;
  /** Prune job rows older than this many days. */
  jobRowRetentionDays: number;
}

/** Progress event the worker pushes; the API surfaces percent + status. */
export interface DownloadJobProgress {
  percent: number;
  stage: "running" | "merging" | "uploading";
}
