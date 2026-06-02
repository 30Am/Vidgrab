import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { AppError, ErrorCode } from "@vidgrab/shared";
import type { AppContext } from "./context.js";
import { registerProbeRoute } from "./routes/probe.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerStatsRoute } from "./routes/stats.js";
import { registerThumbRoute } from "./routes/thumb.js";
import { registerDownloadRoute } from "./routes/download.js";

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: ctx.config.LOG_LEVEL,
      ...(ctx.config.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }
        : {}),
    },
    trustProxy: true,
    bodyLimit: 16 * 1024,
  });

  await app.register(cors, {
    origin: ctx.config.corsOrigins.length ? ctx.config.corsOrigins : true,
    methods: ["GET", "POST"],
  });

  // Centralized error handler → typed JSON the frontend understands.
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        req.log.error({ code: err.code, detail: err.detail }, err.message);
      } else {
        req.log.warn({ code: err.code }, err.message);
      }
      return reply.code(err.statusCode).send({ error: err.toJSON() });
    }
    // Fastify validation / unknown errors
    req.log.error(err);
    const fallback = new AppError(ErrorCode.INTERNAL);
    return reply.code(fallback.statusCode).send({ error: fallback.toJSON() });
  });

  app.setNotFoundHandler((_req, reply) => {
    const e = new AppError(ErrorCode.NOT_FOUND, "Route not found.");
    reply.code(e.statusCode).send({ error: e.toJSON() });
  });

  registerHealthRoute(app, ctx);
  registerProbeRoute(app, ctx);
  registerJobRoutes(app, ctx);
  registerStatsRoute(app, ctx);
  registerThumbRoute(app, ctx);
  registerDownloadRoute(app, ctx);

  return app;
}
