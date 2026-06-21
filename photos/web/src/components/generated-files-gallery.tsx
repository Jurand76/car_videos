"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GeneratedFile } from "@/lib/api";
import { formatPlDateTime } from "@/lib/format-date";

type GeneratedFilesGalleryProps = {
  files: GeneratedFile[];
  emptyTitle?: string;
  emptyHint?: string;
  variant?: "renders" | "series";
};

function projectTypeLabel(type: string) {
  if (type === "advanced") return "Pojedyncze";
  if (type === "photo_series") return "Seryjne";
  return "Archiwum";
}

function seriesCategoryLabel(category: string | null | undefined) {
  if (category === "exterior") return "Zewnętrzne";
  if (category === "interior") return "Wnętrze";
  return null;
}

function typeBadgeClass(type: string) {
  if (type === "advanced") return "bg-violet-100 text-violet-800";
  if (type === "photo_series") return "bg-teal-100 text-teal-800";
  return "bg-slate-100 text-slate-600";
}

function fileImageUrl(file: GeneratedFile) {
  return `/api/generated-files/${file.id}?t=${encodeURIComponent(file.created_at)}`;
}

function downloadName(file: GeneratedFile) {
  const slug = file.project_name
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż]+/gi, "-")
    .replace(/^-|-$/g, "");
  const date = new Date(file.created_at).toISOString().slice(0, 10);
  return `${slug || "render"}-${date}.png`;
}

export function GeneratedFilesGallery({
  files,
  emptyTitle = "Brak zapisanych renderów.",
  emptyHint = "Po wygenerowaniu zdjęcia w projekcie pojawi się tutaj automatycznie.",
  variant = "renders",
}: GeneratedFilesGalleryProps) {
  const [preview, setPreview] = useState<GeneratedFile | null>(null);

  const closePreview = useCallback(() => setPreview(null), []);

  useEffect(() => {
    if (!preview) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closePreview();
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [preview, closePreview]);

  if (files.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-slate-600">{emptyTitle}</p>
        <p className="mt-1 text-sm text-slate-500">{emptyHint}</p>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {files.map((file) => {
          const imageSrc = fileImageUrl(file);
          return (
            <Card
              key={file.id}
              className="group overflow-hidden p-0 transition hover:border-brand-500 hover:shadow-md"
            >
              <button
                type="button"
                onClick={() => setPreview(file)}
                className="block w-full text-left"
                aria-label={`Powiększ: ${file.label || file.project_name}`}
              >
                <div className="relative aspect-[4/3] bg-slate-100">
                  <Image
                    src={imageSrc}
                    alt={file.label || file.project_name}
                    fill
                    unoptimized
                    className="object-cover transition group-hover:scale-[1.02]"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 20vw"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-medium text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
                    Powiększ
                  </span>
                </div>
              </button>
              <div className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${typeBadgeClass(file.project_type)}`}>
                    {projectTypeLabel(file.project_type)}
                  </span>
                  {variant === "series" && seriesCategoryLabel(file.series_category) && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {seriesCategoryLabel(file.series_category)}
                    </span>
                  )}
                  {file.project_id && variant !== "series" && (
                    <Link
                      href={`/dashboard/projects/${file.project_id}`}
                      className="text-[10px] font-medium text-brand-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Projekt →
                    </Link>
                  )}
                </div>
                <p className="truncate text-sm font-medium text-slate-900">
                  {file.label || file.project_name}
                </p>
                <p className="text-xs text-slate-500">{formatPlDateTime(file.created_at)}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Zamknij podgląd"
            className="absolute inset-0 bg-slate-900/75"
            onClick={closePreview}
          />
          <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  {preview.label || preview.project_name}
                </p>
                <p className="text-xs text-slate-500">
                  {formatPlDateTime(preview.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a href={fileImageUrl(preview)} download={downloadName(preview)}>
                  <Button type="button" variant="secondary">
                    Pobierz
                  </Button>
                </a>
                {preview.project_id && (
                  <Link href={`/dashboard/projects/${preview.project_id}`}>
                    <Button type="button" variant="secondary">
                      Otwórz projekt
                    </Button>
                  </Link>
                )}
                <Button type="button" onClick={closePreview}>
                  Zamknij
                </Button>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-100 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileImageUrl(preview)}
                alt={preview.label || preview.project_name}
                className="max-h-[calc(92vh-8rem)] w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
