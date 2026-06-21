import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AdvancedProjectEditorShell } from "@/components/advanced-project-editor-shell";
import { PhotoSeriesEditorShell } from "@/components/photo-series-editor-shell";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.accessToken) {
    redirect("/login");
  }

  const { id } = await params;

  try {
    const project = await api.getProject(session.accessToken, id);
    if (project.project_type === "simple") {
      notFound();
    }
    const isPhotoSeries = project.project_type === "photo_series";

    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
          ← Wróć do projektów
        </Link>
        <h1 className="mt-4 text-2xl font-bold">{project.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {isPhotoSeries
            ? "Wgraj zdjęcia produktu z różnych ujęć i tła — model AI przetworzy całą serię"
            : "Wgraj zdjęcie produktu oraz tła — model AI wygeneruje render"}
        </p>

        <div className="mt-8">
          {isPhotoSeries ? (
            <PhotoSeriesEditorShell token={session.accessToken} initialProject={project} />
          ) : (
            <AdvancedProjectEditorShell token={session.accessToken} initialProject={project} />
          )}
        </div>
      </div>
    );
  } catch {
    notFound();
  }
}
