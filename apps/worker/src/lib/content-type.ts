const MAP: Record<string, string> = {
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  opus: "audio/opus",
};

export function contentTypeForExt(ext: string): string {
  return MAP[ext.toLowerCase()] ?? "application/octet-stream";
}

/** Builds a safe, human-friendly download filename from a title. */
export function safeFilename(title: string, ext: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120)
    .replace(/^[_.-]+|[_.-]+$/g, "");
  return `${base || "vidgrab"}.${ext}`;
}
