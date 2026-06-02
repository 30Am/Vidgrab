import type { Redis } from "ioredis";
import { hashUrl, type ProbeResponse } from "@vidgrab/shared";

const PROBE_TTL_SECONDS = 3600; // 1 hour, per section 4.2

const key = (url: string) => `probe:${hashUrl(url)}`;

export async function getCachedProbe(redis: Redis, url: string): Promise<ProbeResponse | null> {
  const raw = await redis.get(key(url));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProbeResponse;
  } catch {
    return null;
  }
}

export async function setCachedProbe(
  redis: Redis,
  url: string,
  value: ProbeResponse,
): Promise<void> {
  await redis.set(key(url), JSON.stringify(value), "EX", PROBE_TTL_SECONDS);
}
