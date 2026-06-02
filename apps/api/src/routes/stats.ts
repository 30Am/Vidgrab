import type { FastifyInstance } from "fastify";
import { and, gte, sql } from "drizzle-orm";
import type { StatsResponse } from "@vidgrab/shared";
import { jobs } from "@vidgrab/db";
import type { AppContext } from "../context.js";

export function registerStatsRoute(app: FastifyInstance, ctx: AppContext) {
  // Optional public counter for the landing page (downloads today).
  app.get("/api/stats", async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [row] = await ctx.db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(jobs)
      .where(and(gte(jobs.createdAt, startOfDay), sql`${jobs.status} = 'ready'`));

    const body: StatsResponse = { downloadsToday: row?.count ?? 0 };
    return body;
  });
}
