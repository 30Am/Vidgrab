/**
 * Compatibility transcode. Some sources (notably Instagram) only offer VP9/AV1
 * video, which plays in browsers but NOT in QuickTime / the Apple ecosystem.
 * When the output is an MP4 whose video isn't already H.264, we re-encode the
 * video to H.264 (and ensure AAC audio) so the file plays everywhere.
 *
 * This is conditional: H.264 sources (e.g. most YouTube formats) are left as-is,
 * so the common path pays no transcode cost.
 */
import { spawn } from "node:child_process";
import { rename, rm } from "node:fs/promises";

const QUICKTIME_OK_VCODECS = new Set(["h264", "avc1", "hevc", "h265"]);
const QUICKTIME_OK_ACODECS = new Set(["aac", "mp4a", "alac", "mp3"]);

interface StreamInfo {
  vcodec?: string;
  acodec?: string;
}

function runFfprobe(ffprobePath: string, file: string): Promise<StreamInfo> {
  const args = [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,codec_name",
    "-of",
    "json",
    file,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobePath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed: ${err}`));
        return;
      }
      try {
        const json = JSON.parse(out) as { streams?: Array<{ codec_type?: string; codec_name?: string }> };
        const info: StreamInfo = {};
        for (const s of json.streams ?? []) {
          if (s.codec_type === "video" && !info.vcodec) info.vcodec = s.codec_name;
          if (s.codec_type === "audio" && !info.acodec) info.acodec = s.codec_name;
        }
        resolve(info);
      } catch (e) {
        reject(e as Error);
      }
    });
  });
}

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}: ${err.slice(-500)}`));
      else resolve();
    });
  });
}

export interface TranscodeDeps {
  ffmpegPath: string;
  ffprobePath: string;
}

/**
 * Ensures an MP4 is QuickTime-compatible. Returns true if a re-encode happened.
 * Mutates the file in place (writes a temp file then renames over the original).
 */
export async function ensureQuickTimeCompatible(
  filePath: string,
  deps: TranscodeDeps,
  onProgress?: () => void,
): Promise<boolean> {
  let info: StreamInfo;
  try {
    info = await runFfprobe(deps.ffprobePath, filePath);
  } catch {
    return false; // can't probe — leave the file as-is
  }

  const videoOk = info.vcodec ? QUICKTIME_OK_VCODECS.has(info.vcodec.toLowerCase()) : true;
  const audioOk = info.acodec ? QUICKTIME_OK_ACODECS.has(info.acodec.toLowerCase()) : true;
  if (videoOk && audioOk) return false;

  onProgress?.();
  const tmp = `${filePath}.compat.mp4`;
  const args = [
    "-y",
    "-i",
    filePath,
    "-c:v",
    videoOk ? "copy" : "libx264",
    ...(videoOk ? [] : ["-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"]),
    "-c:a",
    audioOk ? "copy" : "aac",
    ...(audioOk ? [] : ["-b:a", "192k"]),
    "-movflags",
    "+faststart",
    tmp,
  ];
  await runFfmpeg(deps.ffmpegPath, args);
  await rm(filePath, { force: true });
  await rename(tmp, filePath);
  return true;
}
