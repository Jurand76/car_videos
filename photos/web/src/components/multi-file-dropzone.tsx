"use client";

import clsx from "clsx";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

export type MultiDropzoneItem = {
  id: string;
  previewUrl: string;
  status?: string;
  errorMessage?: string | null;
  resultUrl?: string | null;
};

type MultiFileDropzoneProps = {
  label: string;
  hint?: string;
  items: MultiDropzoneItem[];
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

function statusBadge(status?: string) {
  switch (status) {
    case "completed":
      return "Gotowe";
    case "processing":
      return "Przetwarzanie...";
    case "failed":
      return "Błąd";
    default:
      return "Oczekuje";
  }
}

function ProcessingSpinner() {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/45"
      role="status"
      aria-label="Przetwarzanie zdjęcia"
    >
      <svg
        className="h-11 w-11 animate-spin text-white"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path
          className="opacity-90"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      <p className="mt-2 text-xs font-medium text-white">Przetwarzanie...</p>
    </div>
  );
}

type ItemViewMode = "source" | "result";

export function MultiFileDropzone({
  label,
  hint,
  items,
  onFiles,
  onRemove,
  disabled,
  compact = false,
}: MultiFileDropzoneProps) {
  const [viewModeById, setViewModeById] = useState<Record<string, ItemViewMode>>({});

  const getViewMode = useCallback(
    (item: MultiDropzoneItem): ItemViewMode => {
      if (!item.resultUrl) return "source";
      return viewModeById[item.id] ?? "result";
    },
    [viewModeById],
  );

  const toggleViewMode = useCallback((item: MultiDropzoneItem) => {
    if (!item.resultUrl || item.status === "processing") return;
    setViewModeById((prev) => ({
      ...prev,
      [item.id]: (prev[item.id] ?? "result") === "result" ? "source" : "result",
    }));
  }, []);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) {
        onFiles(accepted);
      }
    },
    [onFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpeg", ".jpg", ".png", ".webp"] },
    disabled,
  });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>

      <div
        {...getRootProps()}
        className={clsx(
          "cursor-pointer rounded-xl border-2 border-dashed text-center transition",
          compact ? "p-2" : "p-4",
          isDragActive ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <input {...getInputProps()} />
        <p className={clsx("text-slate-600", compact ? "text-xs" : "text-sm")}>
          {isDragActive
            ? "Upuść zdjęcia tutaj..."
            : compact
              ? "Przeciągnij lub kliknij, aby dodać zdjęcia"
              : "Przeciągnij wiele zdjęć lub kliknij, aby wybrać pliki"}
        </p>
      </div>

      {items.length > 0 && (
        <div
          className={clsx(
            "grid gap-2",
            compact ? "grid-cols-4 sm:grid-cols-5 lg:grid-cols-6" : "gap-3 sm:grid-cols-2",
          )}
        >
          {items.map((item) => {
            const viewMode = getViewMode(item);
            const displayUrl = viewMode === "result" && item.resultUrl ? item.resultUrl : item.previewUrl;
            const canToggle = !!item.resultUrl && item.status !== "processing";

            if (compact) {
              return (
                <div
                  key={item.id}
                  className="relative aspect-square overflow-hidden rounded-md border border-slate-200"
                >
                  <button
                    type="button"
                    disabled={!canToggle}
                    onClick={() => toggleViewMode(item)}
                    className={clsx(
                      "relative block h-full w-full",
                      canToggle && "cursor-pointer hover:ring-2 hover:ring-inset hover:ring-brand-400",
                      !canToggle && "cursor-default",
                    )}
                    aria-label={
                      canToggle
                        ? `Pokaż ${viewMode === "result" ? "zdjęcie źródłowe" : "zdjęcie wynikowe"}`
                        : "Zdjęcie serii"
                    }
                    title={canToggle ? "Kliknij, aby przełączyć źródło / wynik" : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={displayUrl}
                      alt={viewMode === "result" ? "Zdjęcie wynikowe" : "Zdjęcie źródłowe"}
                      className="h-full w-full object-cover"
                    />
                    {item.resultUrl && item.status !== "processing" && (
                      <span
                        className={clsx(
                          "absolute left-1 top-1 rounded px-1 py-0.5 text-[8px] font-medium text-white",
                          viewMode === "result" ? "bg-emerald-600" : "bg-slate-600",
                        )}
                      >
                        {viewMode === "result" ? "Wynik" : "Źródło"}
                      </span>
                    )}
                    {item.status === "processing" && (
                      <div
                        className="absolute inset-0 flex items-center justify-center bg-slate-900/45"
                        role="status"
                        aria-label="Przetwarzanie zdjęcia"
                      >
                        <svg
                          className="h-6 w-6 animate-spin text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="3"
                          />
                          <path
                            className="opacity-90"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                          />
                        </svg>
                      </div>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={disabled || item.status === "processing"}
                    onClick={() => onRemove(item.id)}
                    className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded bg-black/55 text-xs leading-none text-white hover:bg-red-600 disabled:opacity-40"
                    aria-label="Usuń zdjęcie"
                  >
                    ×
                  </button>
                  <span
                    className={clsx(
                      "absolute bottom-1 left-1 z-10 rounded px-1.5 py-0.5 text-[9px] font-medium",
                      item.status === "completed" && "bg-emerald-600/90 text-white",
                      item.status === "processing" && "bg-amber-500/90 text-white",
                      item.status === "failed" && "bg-red-600/90 text-white",
                      (!item.status || item.status === "pending") && "bg-slate-700/80 text-white",
                    )}
                  >
                    {statusBadge(item.status)}
                  </span>
                </div>
              );
            }

            return (
            <div
              key={item.id}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              <button
                type="button"
                disabled={!canToggle}
                onClick={() => toggleViewMode(item)}
                className={clsx(
                  "relative block aspect-[4/3] w-full bg-slate-100",
                  canToggle && "cursor-pointer hover:ring-2 hover:ring-inset hover:ring-brand-400",
                  !canToggle && "cursor-default",
                )}
                aria-label={
                  canToggle
                    ? `Pokaż ${viewMode === "result" ? "zdjęcie źródłowe" : "zdjęcie wynikowe"}`
                    : "Zdjęcie serii"
                }
                title={canToggle ? "Kliknij, aby przełączyć źródło / wynik" : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayUrl}
                  alt={viewMode === "result" ? "Zdjęcie wynikowe" : "Zdjęcie źródłowe"}
                  className="absolute inset-0 h-full w-full object-contain"
                />
                {item.resultUrl && item.status !== "processing" && (
                  <span
                    className={clsx(
                      "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium text-white",
                      viewMode === "result" ? "bg-emerald-600" : "bg-slate-600",
                    )}
                  >
                    {viewMode === "result" ? "Wynik" : "Źródło"}
                  </span>
                )}
                {item.status === "processing" && <ProcessingSpinner />}
              </button>
              <div className="flex items-center justify-between gap-2 p-2">
                <div className="min-w-0">
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      item.status === "completed" && "bg-emerald-100 text-emerald-800",
                      item.status === "processing" && "bg-amber-100 text-amber-800",
                      item.status === "failed" && "bg-red-100 text-red-800",
                      (!item.status || item.status === "pending") && "bg-slate-100 text-slate-600",
                    )}
                  >
                    {statusBadge(item.status)}
                  </span>
                  {item.errorMessage && (
                    <p className="mt-1 truncate text-[10px] text-red-600" title={item.errorMessage}>
                      {item.errorMessage}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={disabled || item.status === "processing"}
                  onClick={() => onRemove(item.id)}
                  className="shrink-0 rounded px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                >
                  Usuń
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
