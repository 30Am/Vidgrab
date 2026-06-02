"use client";

import { useCallback, useRef, useState } from "react";
import type { Container, Format, JobStatus, ProbeResponse } from "@vidgrab/shared";
import { isSupportedUrl } from "@vidgrab/shared";
import { ApiError, createJob, getJob, probe, thumbnailProxyUrl } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { FormatPicker } from "./FormatPicker";

type Phase = "idle" | "probing" | "picking" | "downloading" | "ready" | "error";

const POLL_INTERVAL_MS = 1500;

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued…",
  running: "Downloading…",
  merging: "Merging video + audio…",
  uploading: "Almost there…",
  ready: "Ready!",
  failed: "Failed",
};

function isAudioOnly(f: Format): boolean {
  return f.kind === "audio";
}

function containerFor(f: Format): Container {
  if (isAudioOnly(f)) return "m4a";
  return "mp4";
}

export function Downloader() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [meta, setMeta] = useState<ProbeResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState<JobStatus>("queued");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setPhase("idle");
    setMeta(null);
    setSelectedId("");
    setProgress(0);
    setError(null);
  }, []);

  const onProbe = useCallback(async () => {
    const trimmed = url.trim();
    if (!isSupportedUrl(trimmed)) {
      setError("Please paste a valid YouTube or Instagram link.");
      setPhase("error");
      return;
    }
    setError(null);
    setPhase("probing");
    try {
      const result = await probe(trimmed);
      setMeta(result);
      setSelectedId(result.formats[0]?.id ?? "");
      setPhase("picking");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't read that link.");
      setPhase("error");
    }
  }, [url]);

  const pollJob = useCallback((jobId: string) => {
    const tick = async () => {
      try {
        const job = await getJob(jobId);
        setStatus(job.status);
        setProgress(job.progress);
        if (job.status === "ready" && job.downloadUrl) {
          setPhase("ready");
          // Trigger the browser download via a hidden anchor.
          const a = document.createElement("a");
          a.href = job.downloadUrl;
          a.rel = "noopener";
          a.download = "";
          document.body.appendChild(a);
          a.click();
          a.remove();
          return;
        }
        if (job.status === "failed") {
          setError(job.error?.message ?? "The download failed. Please try again.");
          setPhase("error");
          return;
        }
        pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Lost connection while downloading.");
        setPhase("error");
      }
    };
    void tick();
  }, []);

  const onDownload = useCallback(async () => {
    if (!meta || !selectedId) return;
    const fmt = meta.formats.find((f) => f.id === selectedId);
    if (!fmt) return;
    setPhase("downloading");
    setStatus("queued");
    setProgress(0);
    try {
      const { jobId } = await createJob({
        url: url.trim(),
        formatId: selectedId,
        audioOnly: isAudioOnly(fmt),
        container: containerFor(fmt),
      });
      pollJob(jobId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the download.");
      setPhase("error");
    }
  }, [meta, selectedId, url, pollJob]);

  return (
    <div className="w-full max-w-xl">
      {/* URL input */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && phase !== "probing") void onProbe();
          }}
          placeholder="Paste a YouTube or Instagram link…"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/40 dark:border-slate-700 dark:bg-slate-900"
          aria-label="Video URL"
        />
        <button
          type="button"
          onClick={() => void onProbe()}
          disabled={phase === "probing" || url.trim().length === 0}
          className="rounded-lg bg-brand px-6 py-3 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {phase === "probing" ? "Reading…" : "Get formats"}
        </button>
      </div>

      {/* Error */}
      {phase === "error" && error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}{" "}
          <button onClick={reset} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}

      {/* Metadata + format picker */}
      {meta && (phase === "picking" || phase === "downloading" || phase === "ready") && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex gap-4">
            {meta.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailProxyUrl(meta.thumbnailUrl)}
                alt=""
                className="h-20 w-32 flex-shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0">
              <h2 className="truncate font-semibold" title={meta.title}>
                {meta.title}
              </h2>
              <p className="text-sm capitalize text-slate-500">
                {meta.source}
                {meta.durationSec ? ` · ${formatDuration(meta.durationSec)}` : ""}
              </p>
            </div>
          </div>

          {phase === "picking" && (
            <>
              <div className="mt-4">
                <FormatPicker
                  formats={meta.formats}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </div>
              <button
                type="button"
                onClick={() => void onDownload()}
                className="mt-4 w-full rounded-lg bg-brand px-6 py-3 font-semibold text-white transition hover:bg-brand-dark"
              >
                Download
              </button>
            </>
          )}

          {(phase === "downloading" || phase === "ready") && (
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-sm">
                <span>{STATUS_LABEL[status]}</span>
                <span className="tabular-nums text-slate-500">{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {phase === "ready" && (
                <p className="mt-3 text-sm text-green-600 dark:text-green-400">
                  Your download should have started.{" "}
                  <button onClick={reset} className="font-semibold underline">
                    Download another
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
