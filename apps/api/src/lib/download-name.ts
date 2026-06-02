/** Helpers for naming/typing the streamed download. */

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
};

export function contentTypeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Builds a friendly download filename. The stored object is named by jobId, so
 * we don't have the original title here — use a stable, safe generic name with
 * the correct extension. (The picker label tells the user what they chose.)
 */
export function downloadFilename(_sourceUrl: string, key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "mp4";
  return `vidgrab-download.${ext}`.replace(/[\r\n"]/g, "");
}
