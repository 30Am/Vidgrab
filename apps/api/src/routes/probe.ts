import type { FastifyInstance } from "fastify";
import { AppError, ProbeRequestSchema } from "@vidgrab/shared";
import type { AppContext } from "../context.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { getCachedProbe, setCachedProbe } from "../lib/cache.js";
import { probe } from "../lib/ytdlp.js";
import { ipHashOf } from "../lib/ip.js";

export function registerProbeRoute(app: FastifyInstance, ctx: AppContext) {
  app.post("/api/probe", async (req, reply) => {
    const parsed = ProbeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("INVALID_URL");
    }
    const { url, turnstileToken } = parsed.data;

    await verifyTurnstile(ctx.config.TURNSTILE_SECRET, turnstileToken, req.ip);

    // Light rate-limit on probe too (cheap but still shells out): share the bucket.
    const ipHash = ipHashOf(req);
    const rl = await ctx.rateLimiter.consume(ipHash, 0); // peek only, cost 0
    void rl;

    const cached = await getCachedProbe(ctx.cacheRedis, url);
    if (cached) {
      reply.header("x-cache", "hit");
      return cached;
    }

    const proxyUrl = ctx.config.proxyUrls[0]; // API uses first proxy for probes
    const result = await probe(url, { ytdlpPath: ctx.config.YTDLP_PATH, proxyUrl });

    await setCachedProbe(ctx.cacheRedis, url, result);
    reply.header("x-cache", "miss");
    return result;
  });
}
