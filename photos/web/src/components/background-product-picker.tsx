"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";

import type { SavedBackground } from "@/lib/api";

type BackgroundProductPickerProps = {
  label: string;
  hint?: string;
  previewUrl?: string | null;
  disabled?: boolean;
  loading?: boolean;
  deletingBackgroundId?: string | null;
  backgrounds: SavedBackground[];
  selectedBackgroundId?: string | null;
  onUpload: (file: File) => void;
  onSelectBackground: (backgroundId: string) => void;
  onDeleteBackground: (backgroundId: string) => void;
  backgroundThumbUrl: (backgroundId: string) => string;
};

function BackgroundThumbnailGrid({
  backgrounds,
  selectedBackgroundId,
  deletingBackgroundId,
  pickerDisabled,
  backgroundThumbUrl,
  onSelectBackground,
  onDeleteBackground,
}: {
  backgrounds: SavedBackground[];
  selectedBackgroundId?: string | null;
  deletingBackgroundId?: string | null;
  pickerDisabled: boolean;
  backgroundThumbUrl: (backgroundId: string) => string;
  onSelectBackground: (backgroundId: string) => void;
  onDeleteBackground: (backgroundId: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {backgrounds.map((item) => {
        const selected = item.id === selectedBackgroundId;
        const deleting = deletingBackgroundId === item.id;
        return (
          <div
            key={item.id}
            className={clsx(
              "relative aspect-[4/3] overflow-hidden rounded-md border-2 transition",
              selected ? "border-brand-500 ring-2 ring-brand-200" : "border-slate-200",
              deleting && "opacity-50",
            )}
          >
            <button
              type="button"
              title="Użyj tego tła"
              disabled={pickerDisabled || deleting}
              onClick={() => onSelectBackground(item.id)}
              className={clsx(
                "absolute inset-0 hover:opacity-95",
                (pickerDisabled || deleting) && "cursor-not-allowed",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={backgroundThumbUrl(item.id)}
                alt="Zapisane tło"
                className="h-full w-full object-cover"
              />
            </button>
            <button
              type="button"
              title="Usuń tło"
              disabled={pickerDisabled || deleting}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDeleteBackground(item.id);
              }}
              className={clsx(
                "absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/75 text-xs leading-none text-white transition hover:bg-red-600",
                (pickerDisabled || deleting) && "cursor-not-allowed opacity-60",
              )}
              aria-label="Usuń tło"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function BackgroundProductPicker({
  label,
  hint,
  previewUrl,
  disabled,
  loading,
  deletingBackgroundId,
  backgrounds,
  selectedBackgroundId,
  onUpload,
  onSelectBackground,
  onDeleteBackground,
  backgroundThumbUrl,
}: BackgroundProductPickerProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) {
        onUpload(accepted[0]);
      }
    },
    [onUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpeg", ".jpg", ".png", ".webp"] },
    maxFiles: 1,
    disabled: disabled || loading,
  });

  const pickerDisabled = Boolean(disabled || loading);
  const hasLibrary = backgrounds.length > 0;

  useEffect(() => {
    if (!libraryOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setLibraryOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLibraryOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [libraryOpen]);

  const handleSelectBackground = (backgroundId: string) => {
    onSelectBackground(backgroundId);
    setLibraryOpen(false);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{label}</p>

      <div ref={rootRef} className="relative aspect-[4/3] w-full">
        <div
          {...getRootProps()}
          className={clsx(
            "absolute inset-0 cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition",
            isDragActive ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50",
            pickerDisabled && "cursor-not-allowed opacity-60",
            hasLibrary && !libraryOpen && "pb-9",
          )}
        >
          <input {...getInputProps()} />

          {previewUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Podgląd tła"
                className="absolute inset-0 h-full w-full object-contain"
              />
              <div
                className={clsx(
                  "absolute inset-x-0 bg-slate-900/65 px-3 py-1.5 text-center text-xs text-white transition",
                  hasLibrary ? "bottom-9" : "bottom-0",
                  isDragActive && "bg-brand-600/80",
                )}
              >
                {loading
                  ? "Zapisuję tło..."
                  : isDragActive
                    ? "Upuść nowe tło..."
                    : "Kliknij lub przeciągnij, aby dodać tło"}
              </div>
            </>
          ) : (
            <div
              className={clsx(
                "flex h-full flex-col items-center justify-center p-3 text-center",
                hasLibrary && "pb-9",
              )}
            >
              <p className="text-sm text-slate-600">
                {loading
                  ? "Zapisuję tło..."
                  : isDragActive
                    ? "Upuść plik tutaj..."
                    : "Przeciągnij tło lub kliknij, aby wybrać"}
              </p>
              {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
            </div>
          )}
        </div>

        {hasLibrary && !libraryOpen && (
          <button
            type="button"
            disabled={pickerDisabled}
            onClick={() => setLibraryOpen(true)}
            className={clsx(
              "absolute inset-x-0 bottom-0 z-10 flex h-9 items-center justify-between rounded-b-xl border-t border-slate-200 bg-slate-50/95 px-2.5 text-xs leading-tight text-slate-600 transition hover:bg-slate-100",
              pickerDisabled && "cursor-not-allowed opacity-60",
            )}
          >
            <span className="font-medium">Gotowe tła ({backgrounds.length})</span>
            <span className="text-slate-400" aria-hidden>
              ▾
            </span>
          </button>
        )}

        {hasLibrary && libraryOpen && (
          <div className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-2.5 text-xs leading-tight text-slate-600">
              <span className="font-medium">Gotowe tła ({backgrounds.length})</span>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                onClick={() => setLibraryOpen(false)}
                aria-label="Zamknij bibliotekę tła"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <BackgroundThumbnailGrid
                backgrounds={backgrounds}
                selectedBackgroundId={selectedBackgroundId}
                deletingBackgroundId={deletingBackgroundId}
                pickerDisabled={pickerDisabled}
                backgroundThumbUrl={backgroundThumbUrl}
                onSelectBackground={handleSelectBackground}
                onDeleteBackground={onDeleteBackground}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
