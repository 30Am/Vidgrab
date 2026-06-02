/**
 * Per-source extractor configuration. Both platforms route through yt-dlp, but
 * Instagram needs a cookies file for non-public posts/stories (section 6.3).
 */
import type { VideoSourceT } from "@vidgrab/shared";
import type { WorkerConfig } from "../config.js";

export interface SourceExtractorOptions {
  cookiesFile?: string;
}

export function extractorOptionsFor(
  source: VideoSourceT,
  config: WorkerConfig,
): SourceExtractorOptions {
  if (source === "instagram" && config.INSTAGRAM_COOKIES_FILE) {
    return { cookiesFile: config.INSTAGRAM_COOKIES_FILE };
  }
  return {};
}
