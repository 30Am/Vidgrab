import type { Redis } from "ioredis";

/**
 * Atomic per-IP token bucket implemented as a Redis Lua script.
 * Refills `capacity` tokens over one hour; each job costs one token.
 *
 * KEYS[1] = bucket key
 * ARGV[1] = capacity (tokens/hour)
 * ARGV[2] = now (ms)
 * ARGV[3] = cost
 * Returns { allowed (1|0), remaining tokens (floored) }
 */
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local refillPerMs = capacity / 3600000.0

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  ts = now
end

local elapsed = math.max(0, now - ts)
tokens = math.min(capacity, tokens + elapsed * refillPerMs)

local allowed = 0
if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
end

redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, 3600000)
return { allowed, math.floor(tokens) }
`;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export class RateLimiter {
  private readonly redis: Redis;
  private readonly capacity: number;

  constructor(redis: Redis, capacityPerHour: number) {
    this.redis = redis;
    this.capacity = capacityPerHour;
  }

  async consume(ipHash: string, cost = 1, now = Date.now()): Promise<RateLimitResult> {
    const res = (await this.redis.eval(
      TOKEN_BUCKET_LUA,
      1,
      `ratelimit:${ipHash}`,
      this.capacity,
      now,
      cost,
    )) as [number, number];
    return { allowed: res[0] === 1, remaining: res[1] };
  }
}
