import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { AppError } from "@vidgrab/shared";
import { jobs } from "@vidgrab/db";
import type { AppContext } from "../context.js";
import { contentTypeFromKey, downloadFilename } from "../lib/download-name.js";

/**
 * Streams a finished job's file from object storage to the browser. This keeps
 * MinIO/R2 internal (no public presigned URLs) so everything stays behind the
 * single reverse-proxy auth. Low-volume internal use makes proxying fine.
 */
export function registerDownloadRoute(app: FastifyInstance, ctx: AppContext) {
  app.get<{ Params: { id: string } }>("/api/download/:id", async (req, reply) => {
    const { id } = req.params;
    const [row] = await ctx.db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    if (!row) throw new AppError("NOT_FOUND");
    if (row.status !== "ready" || !row.storageKey) {
      throw new AppError("NOT_FOUND", "This download isn't ready.");
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      throw new AppError("NOT_FOUND", "This download has expired.");
    }

    let object;
    try {
      object = await ctx.storage.getObject(row.storageKey);
    } catch {
      throw new AppError("NOT_FOUND", "The file is no longer available.");
    }

    const filename = downloadFilename(row.url, row.storageKey);
    reply
      .header("content-type", object.contentType ?? contentTypeFromKey(row.storageKey))
      .header("content-disposition", `attachment; filename="${filename}"`)
      .header("cache-control", "private, no-store");
    if (object.contentLength != null) {
      reply.header("content-length", String(object.contentLength));
    }
    return reply.send(object.body);
  });
}
