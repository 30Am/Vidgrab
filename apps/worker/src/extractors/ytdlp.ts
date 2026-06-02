/**
 * Shared yt-dlp download runner. Spawns the binary, streams stdout, parses
 * progress lines, and resolves the path of the produced file.
 *
 * We use direct child_process.spawn (not youtube-dl-exec) for finer control over
 * streaming progress and cancellation — the decision called out in Phase 0.
 */
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { classifyYtDlpError } from "@vidgrab/shared";

export interface DownloadOptions {
  ytdlpPath: string;
  ffmpegPath: string;
  url: string;
  formatId: string;
  /** Output directory (per-job temp dir). */
  outDir: string;
  /** Output basename without extension (the jobId). */
  basename: string;
  audioOnly: boolean;
  container: string; // mp4 | mkv | mp3 | m4a
  proxyUrl?: string;
  cookiesFile?: string;
  maxFilesizeBytes?: number;
  /** Called with 0–100 as yt-dlp reports progress. */
  onProgress?: (percent: number, stage: "running" | "merging") => void;
  /** Abort the running download (e.g. on shutdown). */
  signal?: AbortSignal;
}

export interface DownloadResult {
  filePath: string;
  filename: string;
}

// yt-dlp progress template we request: "PROGRESS <downloaded> <total> <percent>"
const PROGRESS_TEMPLATE = "download:VIDGRAB_PROGRESS %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress._percent_str)s";

function buildArgs(opts: DownloadOptions): string[] {
  const outTemplate = join(opts.outDir, `${opts.basename}.%(ext)s`);
  const args: string[] = [
    "--no-warnings",
    "--no-playlist",
    // --newline prints each progress update on its own line (not \r); we parse
    // these lines. Do NOT pass --no-progress here — it suppresses the template.
    "--newline",
    "--progress-template",
    PROGRESS_TEMPLATE,
    "-o",
    outTemplate,
    "--socket-timeout",
    "30",
    "--retries",
    "3",
  ];

  // --ffmpeg-location must be a real path/dir, NOT a bare command name. Passing
  // "ffmpeg" makes yt-dlp fail to locate it, silently SKIP the merge, and leave
  // the separate video/audio fragments behind. Only set it when it's a path;
  // otherwise let yt-dlp find ffmpeg on PATH.
  if (opts.ffmpegPath && opts.ffmpegPath.includes("/")) {
    args.push("--ffmpeg-location", opts.ffmpegPath);
  }

  if (opts.audioOnly) {
    // Extract audio; container drives the codec (mp3 / m4a).
    const audioFormat = opts.container === "mp3" ? "mp3" : "m4a";
    args.push("-x", "--audio-format", audioFormat, "--audio-quality", "0", "-f", opts.formatId);
  } else {
    args.push("-f", opts.formatId, "--merge-output-format", opts.container);
  }

  if (opts.maxFilesizeBytes) args.push("--max-filesize", String(opts.maxFilesizeBytes));
  if (opts.proxyUrl) args.push("--proxy", opts.proxyUrl);
  if (opts.cookiesFile) args.push("--cookies", opts.cookiesFile);

  args.push(opts.url);
  return args;
}

function parsePercent(line: string): number | null {
  // Matches "VIDGRAB_PROGRESS <dl> <total> <pct>%"
  const m = line.match(/VIDGRAB_PROGRESS\s+(\S+)\s+(\S+)\s+([\d.]+)%/);
  if (m && m[3]) {
    const pct = parseFloat(m[3]);
    return Number.isFinite(pct) ? pct : null;
  }
  return null;
}

export async function downloadWithYtDlp(opts: DownloadOptions): Promise<DownloadResult> {
  const args = buildArgs(opts);

  return new Promise<DownloadResult>((resolve, reject) => {
    const child = spawn(opts.ytdlpPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let sawMerge = false;
    let lastEmit = 0;

    const onAbort = () => child.kill("SIGKILL");
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    let stdoutBuf = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      let idx: number;
      while ((idx = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);

        if (line.includes("[Merger]") || line.includes("[ffmpeg]")) {
          sawMerge = true;
          opts.onProgress?.(99, "merging");
          continue;
        }
        const pct = parsePercent(line);
        if (pct != null) {
          const now = Date.now();
          // Throttle progress events to ~every 500ms (section 4.4).
          if (now - lastEmit >= 500 || pct >= 100) {
            lastEmit = now;
            opts.onProgress?.(pct, sawMerge ? "merging" : "running");
          }
        }
      }
    });

    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      opts.signal?.removeEventListener("abort", onAbort);
      reject(classifyYtDlpError(err.message));
    });

    child.on("close", async (code) => {
      opts.signal?.removeEventListener("abort", onAbort);
      if (opts.signal?.aborted) {
        reject(new Error("aborted"));
        return;
      }
      if (code !== 0) {
        reject(classifyYtDlpError(stderr || `yt-dlp exited with code ${code}`));
        return;
      }
      // Find the produced file (extension depends on merge/extract result).
      try {
        const found = await findOutputFile(opts.outDir, opts.basename);
        if (!found) {
          reject(classifyYtDlpError(stderr || "yt-dlp produced no output file"));
          return;
        }
        resolve({ filePath: join(opts.outDir, found), filename: found });
      } catch (err) {
        reject(err as Error);
      }
    });
  });
}

async function findOutputFile(dir: string, basename: string): Promise<string | undefined> {
  const entries = await readdir(dir);
  // Candidate = our basename, not a partial. Exclude per-format fragment files
  // like "<basename>.f137.mp4" / "<basename>.fdash-123v.mp4" so we never upload
  // an un-merged audio/video stream by accident.
  const fragmentInfix = new RegExp(`^${escapeRegExp(basename)}\\.f[\\w-]+\\.`);
  const candidates = entries.filter(
    (e) =>
      e.startsWith(`${basename}.`) &&
      !e.endsWith(".part") &&
      !e.endsWith(".ytdl") &&
      !fragmentInfix.test(e),
  );
  if (candidates.length === 0) return undefined;
  // Prefer the largest file (the merged output dwarfs any leftover).
  const withSizes = await Promise.all(
    candidates.map(async (name) => ({ name, size: (await stat(join(dir, name))).size })),
  );
  withSizes.sort((a, b) => b.size - a.size);
  return withSizes[0]?.name;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
