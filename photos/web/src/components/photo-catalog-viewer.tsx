"use client";

import { ReactNode, useEffect } from "react";

import { Button } from "@/components/ui/button";

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      {direction === "left" ? (
        <path d="m15 18-6-6 6-6" />
      ) : (
        <path d="m9 18 6-6-6-6" />
      )}
    </svg>
  );
}

type PhotoCatalogViewerProps = {
  title: string;
  total: number;
  currentIndex: number;
  subtitle?: ReactNode;
  sourceUrl: string | null;
  resultUrl: string;
  downloadHref: string;
  downloadName: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export function PhotoCatalogViewer({
  title,
  total,
  currentIndex,
  subtitle,
  sourceUrl,
  resultUrl,
  downloadHref,
  downloadName,
  onClose,
  onPrev,
  onNext,
}: PhotoCatalogViewerProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, onPrev, onNext]);

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] w-screen flex-col bg-white">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-slate-900">{title}</p>
          <p className="text-sm text-slate-500">
            {currentIndex + 1} / {total}
            {subtitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href={downloadHref} download={downloadName}>
            <Button type="button" variant="secondary">
              Pobierz wynik
            </Button>
          </a>
          <Button type="button" onClick={onClose}>
            Zamknij
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-12 shrink-0 items-center justify-center border-r bg-slate-50 sm:w-14">
          <button
            type="button"
            aria-label="Poprzednie zdjęcie"
            disabled={currentIndex === 0}
            onClick={onPrev}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-200 disabled:opacity-30"
          >
            <ChevronIcon direction="left" />
          </button>
        </div>

        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-2">
          <div className="flex min-h-0 min-w-0 flex-col border-r">
            <p className="shrink-0 border-b bg-slate-50 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
              Przed
            </p>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-100 p-2 sm:p-4">
              {sourceUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={sourceUrl}
                  alt="Zdjęcie przed obróbką"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <p className="p-4 text-sm text-slate-500">Brak podglądu źródła</p>
              )}
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col">
            <p className="shrink-0 border-b bg-slate-50 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
              Po
            </p>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-100 p-2 sm:p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resultUrl}
                alt="Zdjęcie po obróbce"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          </div>
        </div>

        <div className="flex w-12 shrink-0 items-center justify-center border-l bg-slate-50 sm:w-14">
          <button
            type="button"
            aria-label="Następne zdjęcie"
            disabled={currentIndex >= total - 1}
            onClick={onNext}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-200 disabled:opacity-30"
          >
            <ChevronIcon direction="right" />
          </button>
        </div>
      </div>
    </div>
  );
}
