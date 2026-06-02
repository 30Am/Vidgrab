import type { Redis } from "ioredis";
import type { Queue } from "bullmq";
import { createDb, type Database } from "@vidgrab/db";
import {
  createDownloadQueue,
  createRedisConnection,
  type DownloadJobData,
} from "@vidgrab/queue";
import type { ApiConfig } from "./config.js";
import { createCacheRedis } from "./lib/redis.js";
import { RateLimiter } from "./lib/ratelimit.js";
import { StorageReader } from "./lib/storage.js";

/** Shared runtime dependencies, created once at boot and reused by every route. */
export interface AppContext {
  config: ApiConfig;
  db: Database;
  cacheRedis: Redis;
  downloadQueue: Queue<DownloadJobData>;
  rateLimiter: RateLimiter;
  storage: StorageReader;
  close: () => Promise<void>;
}

export function createContext(config: ApiConfig): AppContext {
  const { db, close: closeDb } = createDb(config.DATABASE_URL);
  const cacheRedis = createCacheRedis(config.REDIS_URL);
  const queueConnection = createRedisConnection(config.REDIS_URL);
  const downloadQueue = createDownloadQueue(queueConnection);
  const rateLimiter = new RateLimiter(cacheRedis, config.RATE_LIMIT_JOBS_PER_HOUR);
  const storage = new StorageReader({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
  });

  return {
    config,
    db,
    cacheRedis,
    downloadQueue,
    rateLimiter,
    storage,
    close: async () => {
      await downloadQueue.close();
      await queueConnection.quit();
      cacheRedis.disconnect();
      await closeDb();
    },
  };
}
