"use client";

import type { Format } from "@vidgrab/shared";
import { formatBytes } from "@/lib/format";

export function FormatPicker({
  formats,
  selectedId,
  onSelect,
}: {
  formats: Format[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Download format">
      {formats.map((f) => {
        const selected = f.id === selectedId;
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(f.id)}
            className={[
              "flex items-center justify-between rounded-lg border px-4 py-3 text-left transition",
              selected
                ? "border-brand bg-brand/5 ring-2 ring-brand"
                : "border-slate-200 hover:border-brand/60 dark:border-slate-700",
            ].join(" ")}
          >
            <span className="flex items-center gap-2">
              <span className="font-medium">{f.label}</span>
              {f.kind === "audio" ? (
                <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                  audio only
                </span>
              ) : (
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                  video + audio
                </span>
              )}
              {f.kind === "video" && f.fps && f.fps >= 50 && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {Math.round(f.fps)}fps
                </span>
              )}
            </span>
            <span className="text-sm tabular-nums text-slate-500">{formatBytes(f.sizeBytes)}</span>
          </button>
        );
      })}
    </div>
  );
}
