import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

export function registerHealthRoute(app: FastifyInstance, ctx: AppContext) {
  // Liveness probe for the load balancer (section 4.2).
  app.get("/api/health", async () => {
    let redisOk = false;
    try {
      redisOk = (await ctx.cacheRedis.ping()) === "PONG";
    } catch {
      redisOk = false;
    }
    return { status: "ok", redis: redisOk, uptime: process.uptime() };
  });
}
