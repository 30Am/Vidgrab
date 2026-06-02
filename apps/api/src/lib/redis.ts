import { Redis } from "ioredis";

/** Plain Redis client for caching (separate from the BullMQ connection). */
export function createCacheRedis(url: string): Redis {
  return new Redis(url, { lazyConnect: false });
}
