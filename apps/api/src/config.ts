/** Environment configuration for the API service, validated at boot. */
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.string().default("info"),

  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  // Externally reachable base URL of the API (used to build download links).
  PUBLIC_BASE_URL: z.string().default("http://localhost:4000"),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  RATE_LIMIT_JOBS_PER_HOUR: z.coerce.number().default(10),
  MAX_DURATION_SECONDS: z.coerce.number().default(14400),
  QUEUE_CIRCUIT_BREAKER_MAX: z.coerce.number().default(500),

  TURNSTILE_SECRET: z.string().default(""),

  OBJECT_TTL_HOURS: z.coerce.number().default(24),

  // yt-dlp probe (metadata only — no download)
  YTDLP_PATH: z.string().default("yt-dlp"),
  PROXY_URLS: z.string().default(""),

  // Object storage (read side — the API streams finished files to the browser).
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("vidgrab-downloads"),
  S3_ACCESS_KEY_ID: z.string().default("vidgrab"),
  S3_SECRET_ACCESS_KEY: z.string().default("vidgrabsecret"),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
});

export type ApiConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  const env = EnvSchema.parse(process.env);
  return {
    ...env,
    corsOrigins: env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
    proxyUrls: env.PROXY_URLS.split(",").map((s) => s.trim()).filter(Boolean),
    turnstileEnabled: env.TURNSTILE_SECRET.length > 0,
  };
}
