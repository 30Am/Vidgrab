/**
 * Zod schemas + inferred types for the public API contract.
 * These mirror section 9 of the architecture doc and are the single source of
 * truth for request/response shapes across web, api, and worker.
 */
import { z } from "zod";

export const VideoSourceSchema = z.enum(["youtube", "instagram"]);
export type VideoSourceT = z.infer<typeof VideoSourceSchema>;

export const ContainerSchema = z.enum(["mp4", "mkv", "mp3", "m4a"]);
export type Container = z.infer<typeof ContainerSchema>;

export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "merging",
  "uploading",
  "ready",
  "failed",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

// ── POST /api/probe ──────────────────────────────────────────
export const ProbeRequestSchema = z.object({
  url: z.string().url().max(2048),
  turnstileToken: z.string().max(4096).optional(),
});
export type ProbeRequest = z.infer<typeof ProbeRequestSchema>;

export const FormatSchema = z.object({
  id: z.string(), // yt-dlp format id / selector
  label: z.string(), // '1080p (mp4, video+audio)'
  // 'best' = recommended merge, 'video' = a video+audio result, 'audio' = audio-only.
  kind: z.enum(["best", "video", "audio"]).default("video"),
  resolution: z.string().optional(), // '1920x1080'
  fps: z.number().optional(),
  codec: z.string().optional(),
  hasAudio: z.boolean(),
  sizeBytes: z.number().optional(),
});
export type Format = z.infer<typeof FormatSchema>;

export const ProbeResponseSchema = z.object({
  source: VideoSourceSchema,
  title: z.string(),
  thumbnailUrl: z.string(),
  durationSec: z.number(),
  formats: z.array(FormatSchema),
});
export type ProbeResponse = z.infer<typeof ProbeResponseSchema>;

// ── POST /api/jobs ───────────────────────────────────────────
export const CreateJobRequestSchema = z.object({
  url: z.string().url().max(2048),
  formatId: z.string().min(1).max(256),
  audioOnly: z.boolean().optional(),
  container: ContainerSchema.optional(),
  turnstileToken: z.string().max(4096).optional(),
});
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;

export const CreateJobResponseSchema = z.object({
  jobId: z.string(),
});
export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>;

// ── GET /api/jobs/:id ────────────────────────────────────────
export const JobStatusResponseSchema = z.object({
  jobId: z.string(),
  status: JobStatusSchema,
  progress: z.number().min(0).max(100),
  downloadUrl: z.string().optional(),
  fileSize: z.number().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  expiresAt: z.string().optional(),
});
export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;

// ── GET /api/stats ───────────────────────────────────────────
export const StatsResponseSchema = z.object({
  downloadsToday: z.number(),
});
export type StatsResponse = z.infer<typeof StatsResponseSchema>;
