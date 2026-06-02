/**
 * URL validation and source detection for YouTube and Instagram.
 * Used by both the frontend (client-side validation) and the API.
 */

export type VideoSource = "youtube" | "instagram";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
]);

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "www.");
}

/**
 * Detects which platform a URL belongs to, or null if unsupported.
 * Intentionally permissive about the path — yt-dlp does the real validation.
 */
export function detectSource(rawUrl: string): VideoSource | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  const host = normalizeHost(url.hostname);

  if (YOUTUBE_HOSTS.has(host)) {
    // youtu.be/<id> or youtube.com/watch?v= / /shorts/ / /live/
    return "youtube";
  }
  if (INSTAGRAM_HOSTS.has(host)) {
    // /p/, /reel/, /reels/, /tv/, /stories/
    return "instagram";
  }
  return null;
}

export function isSupportedUrl(rawUrl: string): boolean {
  return detectSource(rawUrl) !== null;
}

/**
 * Stable hash of a URL for cache keys and abuse correlation.
 * Not cryptographic — collisions are acceptable for cache bucketing.
 */
export function hashUrl(rawUrl: string): string {
  let h1 = 0xdeadbeef ^ rawUrl.length;
  let h2 = 0x41c6ce57 ^ rawUrl.length;
  for (let i = 0; i < rawUrl.length; i++) {
    const ch = rawUrl.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}
