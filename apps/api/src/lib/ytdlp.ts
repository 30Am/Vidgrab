/**
 * Fast metadata-only probe via `yt-dlp --dump-single-json --no-download`.
 * No file is ever fetched here — this is the <2s path that powers the format picker.
 */
import { spawn } from "node:child_process";
import {
  AppError,
  classifyYtDlpError,
  detectSource,
  ErrorCode,
  type Format,
  type ProbeResponse,
  type VideoSourceT,
} from "@vidgrab/shared";

const PROBE_TIMEOUT_MS = 20_000;

interface RawFormat {
  format_id: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  height?: number;
  width?: number;
  fps?: number;
  filesize?: number;
  filesize_approx?: number;
  format_note?: string;
  resolution?: string;
}

interface RawInfo {
  title?: string;
  thumbnail?: string;
  duration?: number;
  formats?: RawFormat[];
  _type?: string;
  entries?: unknown[];
}

function runYtDlpJson(
  ytdlpPath: string,
  url: string,
  proxyUrl?: string,
): Promise<RawInfo> {
  const args = [
    "--dump-single-json",
    "--no-download",
    "--no-warnings",
    "--no-playlist",
    "--socket-timeout",
    "15",
  ];
  if (proxyUrl) args.push("--proxy", proxyUrl);
  args.push(url);

  return new Promise((resolve, reject) => {
    const child = spawn(ytdlpPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new AppError(ErrorCode.PROBE_FAILED, "Probe timed out."));
    }, PROBE_TIMEOUT_MS);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new AppError(ErrorCode.PROBE_FAILED, "yt-dlp is not available.", err.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(classifyYtDlpError(stderr || `yt-dlp exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as RawInfo);
      } catch {
        reject(new AppError(ErrorCode.PROBE_FAILED, undefined, stdout.slice(0, 500)));
      }
    });
  });
}

function humanResolution(f: RawFormat): string | undefined {
  if (f.width && f.height) return `${f.width}x${f.height}`;
  return f.resolution;
}

function hasRealVideo(f: RawFormat): boolean {
  return !!f.vcodec && f.vcodec !== "none";
}

function hasRealAudio(f: RawFormat): boolean {
  return !!f.acodec && f.acodec !== "none";
}

/**
 * Quality label uses the SHORT side of the frame so vertical videos (Reels,
 * Shorts) read as "1080p" rather than "1920p". Falls back to height/width.
 */
function qualityFor(f: RawFormat): number | undefined {
  if (f.width && f.height) return Math.min(f.width, f.height);
  return f.height ?? f.width;
}

/** Turns yt-dlp's raw format array into the curated picker list. */
function buildFormats(raw: RawFormat[]): Format[] {
  const out: Format[] = [];

  // 1) Default: best video + audio merged. Non-technical users just click this.
  out.push({
    id: "bv*+ba/b",
    label: "Best available (video + audio)",
    kind: "best",
    hasAudio: true,
  });

  // 2) Real video streams, deduped by quality (short side), highest first.
  //    Skip storyboards and codec-less placeholder entries (e.g. Instagram's
  //    bare "id=3" with no vcodec/size).
  const byQuality = new Map<number, RawFormat>();
  for (const f of raw) {
    if (!hasRealVideo(f)) continue; // audio-only / junk handled elsewhere
    const q = qualityFor(f);
    if (!q) continue;
    const existing = byQuality.get(q);
    const size = f.filesize ?? f.filesize_approx ?? 0;
    const existingSize = existing ? (existing.filesize ?? existing.filesize_approx ?? 0) : -1;
    if (!existing || size > existingSize) byQuality.set(q, f);
  }
  const qualities = [...byQuality.keys()].sort((a, b) => b - a);
  for (const q of qualities) {
    const f = byQuality.get(q)!;
    const progressive = hasRealAudio(f); // already has its own audio track
    out.push({
      // Video-only streams get best audio merged in; progressive streams as-is.
      id: progressive ? f.format_id : `${f.format_id}+ba/b`,
      label: `${q}p · ${(f.ext ?? "mp4").toUpperCase()}`,
      kind: "video",
      resolution: humanResolution(f),
      fps: f.fps,
      codec: f.vcodec,
      hasAudio: true, // every video row is delivered with audio
      sizeBytes: f.filesize ?? f.filesize_approx,
    });
  }

  // 3) Audio-only (best).
  const bestAudio = raw
    .filter((f) => !hasRealVideo(f) && hasRealAudio(f))
    .sort(
      (a, b) => (b.filesize ?? b.filesize_approx ?? 0) - (a.filesize ?? a.filesize_approx ?? 0),
    )[0];
  out.push({
    id: bestAudio ? bestAudio.format_id : "ba/b",
    label: "Audio only",
    kind: "audio",
    codec: bestAudio?.acodec,
    hasAudio: true,
    sizeBytes: bestAudio?.filesize ?? bestAudio?.filesize_approx,
  });

  return out;
}

export interface ProbeDeps {
  ytdlpPath: string;
  proxyUrl?: string;
}

export async function probe(url: string, deps: ProbeDeps): Promise<ProbeResponse> {
  const source = detectSource(url);
  if (!source) {
    throw new AppError(ErrorCode.UNSUPPORTED_SOURCE);
  }

  const info = await runYtDlpJson(deps.ytdlpPath, url, deps.proxyUrl);
  if (info._type === "playlist" || (Array.isArray(info.entries) && info.entries.length > 0)) {
    throw new AppError(ErrorCode.UNSUPPORTED_SOURCE, "Playlists aren't supported — paste a single video link.");
  }

  const formats = buildFormats(info.formats ?? []);

  return {
    source: source as VideoSourceT,
    title: info.title ?? "Untitled",
    thumbnailUrl: info.thumbnail ?? "",
    durationSec: Math.round(info.duration ?? 0),
    formats,
  };
}
