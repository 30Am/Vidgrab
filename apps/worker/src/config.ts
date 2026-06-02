import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  WORKER_CONCURRENCY: z.coerce.number().default(4),
  TMP_DIR: z.string().default("/tmp/vidgrab"),

  YTDLP_PATH: z.string().default("yt-dlp"),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  YTDLP_AUTO_UPDATE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // S3 / R2
  S3_ENDPOINT: z.string(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("vidgrab-downloads"),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  S3_PUBLIC_BASE_URL: z.string().default(""),

  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().default(3600),
  OBJECT_TTL_HOURS: z.coerce.number().default(24),

  MAX_FILESIZE_BYTES: z.coerce.number().default(3221225472),
  MAX_DURATION_SECONDS: z.coerce.number().default(14400),

  PROXY_URLS: z.string().default(""),
  INSTAGRAM_COOKIES_FILE: z.string().default(""),
});

export type WorkerConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  const env = EnvSchema.parse(process.env);
  return {
    ...env,
    proxyUrls: env.PROXY_URLS.split(",").map((s) => s.trim()).filter(Boolean),
  };
}
