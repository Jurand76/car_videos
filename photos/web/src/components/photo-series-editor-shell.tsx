"use client";

import dynamic from "next/dynamic";

import type { Project } from "@/lib/api";

const PhotoSeriesEditor = dynamic(
  () => import("@/components/photo-series-editor").then((m) => m.PhotoSeriesEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 animate-pulse rounded-xl bg-slate-100" aria-label="Ładowanie edytora serii" />
    ),
  },
);

type PhotoSeriesEditorShellProps = {
  token: string;
  initialProject: Project;
};

export function PhotoSeriesEditorShell({ token, initialProject }: PhotoSeriesEditorShellProps) {
  return <PhotoSeriesEditor token={token} initialProject={initialProject} />;
}
