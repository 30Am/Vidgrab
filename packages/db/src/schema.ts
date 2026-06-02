/**
 * Drizzle schema — mirrors section 4.6 of the architecture doc.
 * Tables: jobs, rate_limits, proxy_health.
 */
import {
  pgTable,
  uuid,
  text,
  boolean,
  smallint,
  bigint,
  timestamp,
  real,
  integer,
  index,
} from "drizzle-orm/pg-core";

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: text("url").notNull(),
    source: text("source").notNull(), // 'youtube' | 'instagram'
    formatId: text("format_id").notNull(),
    audioOnly: boolean("audio_only").notNull().default(false),
    container: text("container").notNull(),
    status: text("status").notNull(), // queued|running|merging|uploading|ready|failed
    progress: smallint("progress").notNull().default(0),
    downloadUrl: text("download_url"),
    // Object-storage key of the finished file; the API streams from it.
    storageKey: text("storage_key"),
    fileSize: bigint("file_size", { mode: "number" }),
    error: text("error"),
    errorCode: text("error_code"),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("idx_jobs_status").on(t.status),
    index("idx_jobs_ip_hash_created").on(t.ipHash, t.createdAt.desc()),
  ],
);

export const rateLimits = pgTable("rate_limits", {
  ipHash: text("ip_hash").primaryKey(),
  bucketTokens: real("bucket_tokens").notNull(),
  lastRefillAt: timestamp("last_refill_at", { withTimezone: true }).notNull(),
});

export const proxyHealth = pgTable("proxy_health", {
  proxyId: text("proxy_id").primaryKey(),
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  bannedUntil: timestamp("banned_until", { withTimezone: true }),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type RateLimit = typeof rateLimits.$inferSelect;
export type ProxyHealth = typeof proxyHealth.$inferSelect;
