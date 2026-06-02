CREATE TABLE IF NOT EXISTS "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"format_id" text NOT NULL,
	"audio_only" boolean DEFAULT false NOT NULL,
	"container" text NOT NULL,
	"status" text NOT NULL,
	"progress" smallint DEFAULT 0 NOT NULL,
	"download_url" text,
	"file_size" bigint,
	"error" text,
	"error_code" text,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"ip_hash" text PRIMARY KEY NOT NULL,
	"bucket_tokens" real NOT NULL,
	"last_refill_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proxy_health" (
	"proxy_id" text PRIMARY KEY NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone,
	"banned_until" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jobs_status" ON "jobs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jobs_ip_hash_created" ON "jobs" USING btree ("ip_hash","created_at" DESC);
