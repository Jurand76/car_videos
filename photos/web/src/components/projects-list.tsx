"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, formatFetchError, Project } from "@/lib/api";
import { formatPlDateTime } from "@/lib/format-date";
import { usePreloadedImages } from "@/lib/use-preloaded-images";

type ProjectsListProps = {
  token: string;
  initialProjects: Project[];
};

function projectTypeLabel(type: string) {
  if (type === "advanced") return "Pojedyncze";
  if (type === "photo_series") return "Seryjne";
  return "Archiwum";
}

function projectTypeBadgeClass(type: string) {
  if (type === "advanced") return "bg-violet-100 text-violet-800";
  if (type === "photo_series") return "bg-teal-100 text-teal-800";
  return "bg-slate-100 text-slate-600";
}

function statusLabel(status: string) {
  switch (status) {
    case "completed":
      return "Gotowy";
    case "processing":
      return "Przetwarzanie...";
    case "failed":
      return "Błąd";
    default:
      return "Szkic";
  }
}

function projectThumbnailUrl(project: Project): string | null {
  const cache = encodeURIComponent(project.updated_at);
  if (project.project_type === "photo_series" && project.preview_series_item_id) {
    return `/api/files/${project.id}/series/${project.preview_series_item_id}?u=${cache}`;
  }
  if (project.result_image_path) {
    return `/api/files/${project.id}/result?u=${cache}`;
  }
  if (project.car_image_path) {
    return `/api/files/${project.id}/car?u=${cache}`;
  }
  return null;
}

function ProjectsListSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <Card
          key={index}
          className="flex !h-[110px] !max-h-[110px] overflow-hidden !p-0"
          aria-hidden
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-between pb-1.5 pl-3 pt-2.5">
            <div className="space-y-2">
              <div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="flex gap-1">
              <div className="h-5 w-16 animate-pulse rounded-md bg-slate-100" />
              <div className="h-5 w-14 animate-pulse rounded-md bg-slate-100" />
            </div>
          </div>
          <div className="my-1 mr-1 size-[100px] shrink-0 animate-pulse rounded-lg bg-slate-100" />
        </Card>
      ))}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function ImagePlaceholderIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6 text-slate-300"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 15-5-5L8 18" />
    </svg>
  );
}

export function ProjectsList({ token, initialProjects }: ProjectsListProps) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  const thumbnailUrls = useMemo(
    () =>
      projects
        .map((project) => projectThumbnailUrl(project))
        .filter((url): url is string => url !== null),
    [projects],
  );
  const thumbnailsReady = usePreloadedImages(thumbnailUrls);

  const closeModal = useCallback(() => {
    if (!deleting) {
      setDeleteTarget(null);
    }
  }, [deleting]);

  useEffect(() => {
    if (!deleteTarget) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [deleteTarget, closeModal]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteProject(token, deleteTarget.id);
      setProjects((current) => current.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      setError(formatFetchError(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {error && (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {!thumbnailsReady ? (
        <ProjectsListSkeleton count={projects.length} />
      ) : (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => {
          const thumbnailUrl = projectThumbnailUrl(project);

          return (
            <Card
              key={project.id}
              className="flex !h-[110px] !max-h-[110px] overflow-hidden !p-0 transition hover:border-brand-500 hover:shadow-md"
            >
              <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-between pb-1.5 pl-3 pt-2.5">
                <Link href={`/dashboard/projects/${project.id}`} className="min-w-0">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-[1] text-slate-900">
                    {project.name}
                  </h3>
                  <p className="mt-1.5 text-[11px] leading-tight text-slate-500">
                    Ostatnia zmiana: {formatPlDateTime(project.updated_at)}
                  </p>
                </Link>

                <div className="flex items-center gap-1">
                  <span
                    className={`rounded-md px-1.5 py-1 text-[10px] font-medium leading-none sm:text-xs ${projectTypeBadgeClass(project.project_type ?? "advanced")}`}
                  >
                    {projectTypeLabel(project.project_type ?? "advanced")}
                  </span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-1 text-[10px] font-medium leading-none text-slate-600 sm:text-xs">
                    {statusLabel(project.status)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Usuń projekt ${project.name}`}
                    className="rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    onClick={() => {
                      setError(null);
                      setDeleteTarget(project);
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>

              <div className="my-1 mr-1 flex size-[100px] shrink-0 items-center justify-center">
                {thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="size-[100px] rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex size-[100px] items-center justify-center rounded-lg bg-slate-50">
                    <ImagePlaceholderIcon />
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Anuluj"
            className="absolute inset-0 bg-slate-900/50"
            onClick={closeModal}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Usunąć projekt?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Projekt <span className="font-medium text-slate-900">{deleteTarget.name}</span> zostanie
              trwale usunięty. Wygenerowane kopie w bazie plików zostają.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" disabled={deleting} onClick={closeModal}>
                Anuluj
              </Button>
              <Button type="button" variant="danger" loading={deleting} onClick={confirmDelete}>
                Usuń projekt
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
