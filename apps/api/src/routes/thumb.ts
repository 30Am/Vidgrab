import type { FastifyInstance } from "fastify";
import { AppError } from "@vidgrab/shared";
import type { AppContext } from "../context.js";

// Only these CDNs may be proxied — prevents the endpoint becoming an open proxy / SSRF.
const ALLOWED_HOST_SUFFIXES = [".ytimg.com", ".ggpht.com", ".cdninstagram.com", ".fbcdn.net"];

function isAllowedThumbHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => h === suffix.slice(1) || h.endsWith(suffix));
}

/**
 * Image proxy for video thumbnails. Instagram's CDN sets
 * `Cross-Origin-Resource-Policy: same-origin`, which makes browsers block the
 * image in an <img> tag on our origin. We fetch it server-side (no such
 * restriction) and re-serve it with cross-origin-friendly, cacheable headers.
 */
export function registerThumbRoute(app: FastifyInstance, _ctx: AppContext) {
  app.get<{ Querystring: { u?: string } }>("/api/thumb", async (req, reply) => {
    const raw = req.query.u;
    if (!raw) throw new AppError("INVALID_URL", "Missing thumbnail url.");

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      throw new AppError("INVALID_URL", "Invalid thumbnail url.");
    }
    if (target.protocol !== "https:" || !isAllowedThumbHost(target.hostname)) {
      throw new AppError("UNSUPPORTED_SOURCE", "Thumbnail host not allowed.");
    }

    let upstream: Response;
    try {
      upstream = await fetch(target.toString(), {
        headers: { "user-agent": "Mozilla/5.0", accept: "image/*" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new AppError("PROBE_FAILED", "Couldn't load thumbnail.");
    }

    if (!upstream.ok || !upstream.body) {
      throw new AppError("NOT_FOUND", "Thumbnail unavailable.");
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      throw new AppError("UNSUPPORTED_SOURCE", "Not an image.");
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    reply
      .header("content-type", contentType)
      .header("cache-control", "public, max-age=86400")
      .header("cross-origin-resource-policy", "cross-origin");
    return reply.send(buf);
  });
}
