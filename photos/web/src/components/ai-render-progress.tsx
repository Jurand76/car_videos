"use client";

type AiRenderProgressProps = {
  message: string;
  elapsedSec: number;
  progressPercent: number;
};

export function AiRenderProgress({ message, elapsedSec, progressPercent }: AiRenderProgressProps) {
  return (
    <div
      className="mt-4 overflow-hidden rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-violet-50 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-4">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
          <span
            className="absolute inline-flex h-10 w-10 animate-ping rounded-full bg-violet-400 opacity-30"
            aria-hidden
          />
          <span className="relative text-2xl animate-bounce" aria-hidden>
            🚗
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-violet-900">{message}</p>
          <p className="mt-0.5 text-xs text-violet-600">
            {elapsedSec}s — GPT Image 2 pracuje (zwykle 1–3 min)
          </p>
        </div>
        <div className="flex shrink-0 gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-500"
              style={{ animationDelay: `${i * 180}ms`, animationDuration: "0.9s" }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-violet-100">
        <div
          className="relative h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.min(98, progressPercent)}%` }}
        >
          <span className="absolute inset-0 animate-pulse bg-white/25" aria-hidden />
        </div>
      </div>
      <p className="mt-2 text-right text-xs tabular-nums text-violet-500">
        {Math.round(progressPercent)}%
      </p>
    </div>
  );
}
