import { spawn } from "node:child_process";

/**
 * Auto-updates the yt-dlp binary (section 6.2). Best-effort: a failure here must
 * not stop the worker from booting. Self-update only works for standalone builds.
 */
export function updateYtDlp(ytdlpPath: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(ytdlpPath, ["-U"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("error", () => resolve());
    child.on("close", () => {
      if (out.trim()) console.log(`[yt-dlp -U] ${out.trim().split("\n").pop()}`);
      resolve();
    });
  });
}
