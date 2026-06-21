"use client";

import dynamic from "next/dynamic";

import type { Project } from "@/lib/api";

const AdvancedProjectEditor = dynamic(
  () => import("@/components/advanced-project-editor").then((m) => m.AdvancedProjectEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 animate-pulse rounded-xl bg-slate-100" aria-label="Ładowanie edytora AI" />
    ),
  },
);

type AdvancedProjectEditorShellProps = {
  token: string;
  initialProject: Project;
};

export function AdvancedProjectEditorShell({
  token,
  initialProject,
}: AdvancedProjectEditorShellProps) {
  return <AdvancedProjectEditor token={token} initialProject={initialProject} />;
}
