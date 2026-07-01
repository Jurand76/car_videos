"use client";

import clsx from "clsx";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";

import { PhotoCatalogViewer } from "@/components/photo-catalog-viewer";
import { Card } from "@/components/ui/card";
import { GeneratedFile, SeriesCategory } from "@/lib/api";
import { formatPlDateTime } from "@/lib/format-date";

export const MAX_SERIES_CATALOGS = 5;
export const SINGLE_CATALOG_TITLE = "Zdjęcia pojedyncze";

const CATALOG_IMAGE_WRAP = "px-[5px] pt-[5px] pb-1";
const CATALOG_TEXT_WRAP = "px-[5px] pb-1";

type GraphicsCatalogGalleryProps = {
  files: GeneratedFile[];
  emptyHint?: string;
};

type SeriesCatalog = {
  kind: "series";
  id: string;
  title: string;
  items: GeneratedFile[];
  latestAt: string;
  coverFile: GeneratedFile;
};

type SingleCatalog = {
  kind: "single";
  id: "single";
  title: string;
  items: GeneratedFile[];
  latestAt: string;
  coverFile: GeneratedFile;
};

type CatalogEntry = SeriesCatalog | SingleCatalog;

type OpenViewer =
  | { kind: "single"; index: number }
  | { kind: "series"; catalogId: string; index: number };

function seriesCategoryLabel(category: SeriesCategory | null | undefined) {
  if (category === "exterior") return "Zewnętrzne";
  if (category === "interior") return "Wnętrze";
  return null;
}

function resultImageUrl(file: GeneratedFile) {
  return `/api/generated-files/${file.id}?t=${encodeURIComponent(file.created_at)}`;
}

function seriesSourceImageUrl(file: GeneratedFile) {
  if (!file.project_id || !file.source_item_id) return null;
  return `/api/files/${file.project_id}/series/${file.source_item_id}?t=${encodeURIComponent(file.created_at)}`;
}

function singleSourceImageUrl(file: GeneratedFile) {
  return `/api/generated-files/${file.id}/source?t=${encodeURIComponent(file.created_at)}`;
}

function downloadName(file: GeneratedFile, index: number, kind: "single" | "series") {
  const slug = file.project_name
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż]+/gi, "-")
    .replace(/^-|-$/g, "");

  if (kind === "single") {
    const date = new Date(file.created_at).toISOString().slice(0, 10);
    return `${slug || "pojedyncze"}-${index + 1}-${date}.png`;
  }

  const category = file.series_category === "interior" ? "wnetrze" : "zewnatrz";
  return `${slug || "seria"}-${category}-${index + 1}.png`;
}

function sortByNewest(files: GeneratedFile[]): GeneratedFile[] {
  return [...files].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function buildSeriesCatalogs(files: GeneratedFile[]): SeriesCatalog[] {
  const byProject = new Map<string, GeneratedFile[]>();

  for (const file of files) {
    if (file.project_type !== "photo_series" || !file.project_id) continue;
    const list = byProject.get(file.project_id) ?? [];
    list.push(file);
    byProject.set(file.project_id, list);
  }

  return [...byProject.entries()]
    .map(([projectId, items]) => {
      const sorted = sortByNewest(items);
      return {
        kind: "series" as const,
        id: projectId,
        title: sorted[0]?.project_name ?? "Bez nazwy",
        items: sorted,
        latestAt: sorted[0]?.created_at ?? new Date(0).toISOString(),
        coverFile: sorted[0],
      };
    })
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
    .slice(0, MAX_SERIES_CATALOGS);
}

function buildSingleCatalog(files: GeneratedFile[]): SingleCatalog | null {
  const items = sortByNewest(files.filter((f) => f.project_type === "advanced"));

  if (items.length === 0) return null;

  return {
    kind: "single",
    id: "single",
    title: SINGLE_CATALOG_TITLE,
    items,
    latestAt: items[0].created_at,
    coverFile: items[0],
  };
}

function SeriesStackIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="14" y="8" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="2" opacity="0.45" />
      <rect x="10" y="14" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="2" opacity="0.7" />
      <rect x="6" y="20" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="2.5" />
      <path d="M12 32h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function GraphicsCatalogGallery({
  files,
  emptyHint = "Po wygenerowaniu zdjęć pojedynczych lub przetworzeniu serii wyniki trafią tutaj jako katalogi.",
}: GraphicsCatalogGalleryProps) {
  const catalogs = useMemo(() => {
    const entries: CatalogEntry[] = [...buildSeriesCatalogs(files)];
    const single = buildSingleCatalog(files);
    if (single) entries.push(single);
    return entries.sort(
      (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
    );
  }, [files]);

  const [openViewer, setOpenViewer] = useState<OpenViewer | null>(null);

  const activeCatalog = useMemo(() => {
    if (!openViewer) return null;
    if (openViewer.kind === "single") {
      return catalogs.find((c) => c.kind === "single") ?? null;
    }
    return catalogs.find((c) => c.kind === "series" && c.id === openViewer.catalogId) ?? null;
  }, [catalogs, openViewer]);

  const currentIndex = openViewer?.index ?? 0;
  const currentItem = activeCatalog?.items[currentIndex] ?? null;

  const closeViewer = useCallback(() => {
    setOpenViewer(null);
  }, []);

  const goPrev = useCallback(() => {
    setOpenViewer((prev) => {
      if (!prev) return prev;
      return { ...prev, index: Math.max(0, prev.index - 1) };
    });
  }, []);

  const goNext = useCallback(() => {
    setOpenViewer((prev) => {
      if (!prev || !activeCatalog) return prev;
      return { ...prev, index: Math.min(activeCatalog.items.length - 1, prev.index + 1) };
    });
  }, [activeCatalog]);

  if (catalogs.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-slate-600">Brak katalogów w bazie grafik.</p>
        <p className="mt-1 text-sm text-slate-500">{emptyHint}</p>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {catalogs.map((catalog) => {
          const isSingle = catalog.kind === "single";

          return (
            <Card
              key={catalog.id}
              className={clsx(
                "group !p-0 overflow-hidden transition hover:shadow-md",
                isSingle ? "hover:border-violet-500" : "hover:border-teal-500",
              )}
            >
              <button
                type="button"
                onClick={() =>
                  setOpenViewer(
                    isSingle
                      ? { kind: "single", index: 0 }
                      : { kind: "series", catalogId: catalog.id, index: 0 },
                  )
                }
                className={clsx("block w-full text-left", CATALOG_IMAGE_WRAP)}
                aria-label={`Otwórz katalog: ${catalog.title}`}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-100">
                  <Image
                    src={resultImageUrl(catalog.coverFile)}
                    alt={catalog.title}
                    fill
                    unoptimized
                    loading="lazy"
                    className="rounded-lg object-cover transition group-hover:scale-[1.02]"
                    sizes="(max-width: 640px) 50vw, 20vw"
                  />
                  {!isSingle && (
                    <span className="absolute right-1.5 top-1.5 rounded-lg bg-white/90 p-1.5 text-teal-600 shadow-sm">
                      <SeriesStackIcon className="h-5 w-5" />
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-8 text-xs font-medium text-white">
                    {catalog.items.length} zdjęć
                  </span>
                </div>
              </button>
              <div className={CATALOG_TEXT_WRAP}>
                <p className="truncate text-sm font-semibold text-slate-900">{catalog.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{formatPlDateTime(catalog.latestAt)}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {openViewer && activeCatalog && currentItem && (
        <PhotoCatalogViewer
          title={activeCatalog.title}
          total={activeCatalog.items.length}
          currentIndex={currentIndex}
          subtitle={
            activeCatalog.kind === "series" && seriesCategoryLabel(currentItem.series_category) ? (
              <> · {seriesCategoryLabel(currentItem.series_category)}</>
            ) : activeCatalog.kind === "single" && currentItem.project_name ? (
              <> · {currentItem.project_name}</>
            ) : undefined
          }
          sourceUrl={
            activeCatalog.kind === "single"
              ? singleSourceImageUrl(currentItem)
              : seriesSourceImageUrl(currentItem)
          }
          resultUrl={resultImageUrl(currentItem)}
          downloadHref={resultImageUrl(currentItem)}
          downloadName={downloadName(currentItem, currentIndex, activeCatalog.kind)}
          onClose={closeViewer}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}
    </>
  );
}
