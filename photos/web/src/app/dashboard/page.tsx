import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CreateProjectButtons } from "@/components/create-project-buttons";
import { GraphicsCatalogGallery, MAX_SERIES_CATALOGS } from "@/components/graphics-catalog-gallery";
import { OpenAiBalanceCard } from "@/components/openai-balance-card";
import { PromptLibrary } from "@/components/prompt-library";
import { ProjectsList } from "@/components/projects-list";
import { Card } from "@/components/ui/card";
import { api, GeneratedFile, Project, SavedPrompt } from "@/lib/api";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.accessToken) {
    redirect("/login");
  }

  let projects: Project[] = [];
  let galleryFiles: GeneratedFile[] = [];
  let savedPrompts: SavedPrompt[] = [];
  let loadError: string | null = null;
  let galleryError: string | null = null;
  let promptsError: string | null = null;

  try {
    const allProjects = await api.listProjects(session.accessToken);
    projects = allProjects.filter((p) => p.project_type !== "simple");
  } catch (err) {
    loadError =
      err instanceof Error
        ? err.message
        : "Nie udało się połączyć z API — sprawdź czy kontener api działa";
  }
  try {
    galleryFiles = await api.listGeneratedFiles(session.accessToken, "all");
  } catch (err) {
    galleryError =
      err instanceof Error ? err.message : "Nie udało się załadować bazy grafik";
  }
  try {
    savedPrompts = await api.listSavedPrompts(session.accessToken);
  } catch (err) {
    promptsError =
      err instanceof Error ? err.message : "Nie udało się załadować bazy promptów";
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Zdjęcia produktowe</h1>
          <p className="mt-1 text-sm text-slate-600">
            Tworzenie zdjęć produktowych pojedynczych lub seryjnie, na dowolnie wybranym tle
          </p>
        </div>
        <div className="relative z-10 w-full shrink-0 sm:w-80 lg:w-96">
          <OpenAiBalanceCard token={session.accessToken} />
        </div>
      </div>

      <section className="mt-10">
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Stwórz nowy projekt</h2>
              <p className="mt-1 text-sm text-slate-600">
                Wybierz typ projektu — pojedyncze zdjęcie lub całą serię ujęć.
              </p>
            </div>
            <CreateProjectButtons token={session.accessToken} />
          </div>
        </Card>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Projekty użytkownika</h2>
        <p className="mt-1 text-sm text-slate-600">Twoje zapisane projekty i ich status.</p>

        {loadError && (
          <Card className="mt-4 border-red-200 bg-red-50 text-sm text-red-800">
            Nie udało się załadować projektów: {loadError}. Spróbuj odświeżyć stronę lub uruchom{" "}
            <code className="rounded bg-red-100 px-1">docker compose restart api</code>.
          </Card>
        )}

        {!loadError && projects.length === 0 ? (
          <Card className="mt-4 text-center">
            <p className="text-slate-600">Nie masz jeszcze żadnych projektów.</p>
            <p className="mt-1 text-sm text-slate-500">
              Użyj sekcji powyżej, aby utworzyć pierwszy projekt.
            </p>
          </Card>
        ) : !loadError ? (
          <div className="mt-4">
            <ProjectsList token={session.accessToken} initialProjects={projects} />
          </div>
        ) : null}
      </section>

      <section className="mt-12">
        {promptsError ? (
          <Card className="border-amber-200 bg-amber-50 text-sm text-amber-900">
            {promptsError}
          </Card>
        ) : (
          <PromptLibrary token={session.accessToken} initialPrompts={savedPrompts} />
        )}
      </section>

      <section className="mt-12">
        <div>
          <h2 className="text-lg font-semibold">Baza grafik</h2>
          <p className="mt-1 text-sm text-slate-600">
            Katalogi z projektów — porównaj zdjęcie przed i po obróbce, przewijaj strzałkami.
            Serie (max {MAX_SERIES_CATALOGS}) i zdjęcia pojedyncze pojawiają się tutaj automatycznie.
          </p>
        </div>
        {galleryError ? (
          <Card className="mt-4 border-amber-200 bg-amber-50 text-sm text-amber-900">
            {galleryError}
          </Card>
        ) : (
          <div className="mt-4">
            <GraphicsCatalogGallery files={galleryFiles} />
          </div>
        )}
      </section>
    </div>
  );
}
