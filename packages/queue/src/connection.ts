import { Redis, type RedisOptions } from "ioredis";

/**
 * Builds an ioredis connection configured for BullMQ.
 * BullMQ requires maxRetriesPerRequest=null on the blocking connection.
 */
export function createRedisConnection(url: string, options?: RedisOptions): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...options,
  });
}
