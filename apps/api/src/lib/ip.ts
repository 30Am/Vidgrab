import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";

/**
 * Hashes the caller IP for abuse correlation only (never store raw IPs).
 * Honors X-Forwarded-For (Cloudflare / load balancer) when present.
 */
export function ipHashOf(req: FastifyRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0]?.trim()) || req.ip || "0.0.0.0";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}
