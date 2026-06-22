"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AiParametersPanel } from "@/components/ai-parameters-panel";
import { AiRenderProgress } from "@/components/ai-render-progress";
import { BackgroundProductPicker } from "@/components/background-product-picker";
import { GenerationCostBanner } from "@/components/generation-cost-banner";
import { MultiDropzoneItem, MultiFileDropzone } from "@/components/multi-file-dropzone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AiImageConfig, DEFAULT_AI_CONFIG, parseSectionAiConfigs, sectionAiConfigsToSettings } from "@/lib/ai-config";
import {
  batchProgressMessage,
  estimateBatchProgress,
  getBatchRenderProgress,
} from "@/lib/ai-render-progress";
import { api, ApiError, formatFetchError, OpenAiBilling, PhotoSeriesItem, Project } from "@/lib/api";
import { captureBillingBefore, reportGenerationCost } from "@/lib/openai-generation-cost";
import {
  backgroundIdFromPath,
  backgroundThumbUrl,
  useSavedBackgrounds,
} from "@/lib/saved-backgrounds";

const DEFAULT_SECTION_PROMPT =
  "Umieść produkt z pierwszego zdjęcia realistycznie na tle z drugiego zdjęcia. " +
  "Profesjonalna fotografia produktowa — dopasuj perspektywę, skalę, oświetlenie i cień. " +
  "Zachowaj model, kolor i detale produktu.";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_SEC = 600;

type PhotoSeriesEditorProps = {
  token: string;
  initialProject: Project;
};

type SeriesSection = {
  id: string;
  prompt: string;
};

function nextSectionId(existing: Iterable<string>): string {
  const taken = new Set(existing);
  let n = 1;
  while (taken.has(`s${n}`)) {
    n += 1;
  }
  return `s${n}`;
}

function categorySortKey(items: PhotoSeriesItem[], category: string): number {
  const categoryItems = items.filter((item) => item.category === category);
  if (categoryItems.length === 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.min(...categoryItems.map((item) => item.sort_order));
}

function promptForSection(
  id: string,
  settings: Record<string, unknown> | null | undefined,
  sectionPrompts: Record<string, string>,
): string {
  if (sectionPrompts[id]) {
    return sectionPrompts[id];
  }
  if (id === "exterior" && typeof settings?.exterior_prompt === "string") {
    return settings.exterior_prompt;
  }
  if (id === "interior" && typeof settings?.interior_prompt === "string") {
    return settings.interior_prompt;
  }
  return DEFAULT_SECTION_PROMPT;
}

function parseSections(
  settings: Record<string, unknown> | null | undefined,
  items: PhotoSeriesItem[],
): SeriesSection[] {
  const sectionPrompts =
    settings?.section_prompts && typeof settings.section_prompts === "object"
      ? (settings.section_prompts as Record<string, string>)
      : {};

  const raw = settings?.sections;
  let saved: SeriesSection[] = [];
  if (Array.isArray(raw)) {
    saved = raw
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const row = entry as { id?: unknown; prompt?: unknown };
        if (typeof row.id !== "string" || !row.id) return null;
        return {
          id: row.id,
          prompt: typeof row.prompt === "string" ? row.prompt : promptForSection(row.id, settings, sectionPrompts),
        };
      })
      .filter((entry): entry is SeriesSection => entry !== null);
  }

  if (saved.length === 0) {
    const categories = [...new Set(items.map((item) => item.category))];
    const legacyOrder = ["exterior", "interior"];
    const ordered = [
      ...legacyOrder.filter((cat) => categories.includes(cat)),
      ...categories
        .filter((cat) => !legacyOrder.includes(cat))
        .sort((a, b) => categorySortKey(items, a) - categorySortKey(items, b)),
    ];

    if (ordered.length === 0) {
      return [];
    }

    return ordered.map((id) => ({
      id,
      prompt: promptForSection(id, settings, sectionPrompts),
    }));
  }

  const savedIds = new Set(saved.map((section) => section.id));
  const orphanCategories = [...new Set(items.map((item) => item.category))]
    .filter((category) => !savedIds.has(category))
    .sort((a, b) => categorySortKey(items, a) - categorySortKey(items, b));

  return [
    ...saved,
    ...orphanCategories.map((id) => ({
      id,
      prompt: promptForSection(id, settings, sectionPrompts),
    })),
  ];
}

function itemsInSections(items: PhotoSeriesItem[], sections: SeriesSection[]): PhotoSeriesItem[] {
  const sectionIds = new Set(sections.map((section) => section.id));
  return items.filter((item) => sectionIds.has(item.category));
}

function sectionsToSettings(sections: SeriesSection[]) {
  return {
    sections: sections.map(({ id, prompt }) => ({ id, prompt })),
    section_prompts: Object.fromEntries(sections.map((section) => [section.id, section.prompt])),
  };
}

export function PhotoSeriesEditor({ token, initialProject }: PhotoSeriesEditorProps) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [name, setName] = useState(project.name);
  const [sections, setSections] = useState<SeriesSection[]>([]);
  const [sectionsReady, setSectionsReady] = useState(false);
  const [sectionAiConfigs, setSectionAiConfigs] = useState<Record<string, AiImageConfig>>({});
  const [items, setItems] = useState<PhotoSeriesItem[]>([]);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [costMessage, setCostMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generateStartedAt = useRef<number | null>(null);
  const billingBeforeRef = useRef<OpenAiBilling | null>(null);
  const { backgrounds, refresh: refreshBackgrounds } = useSavedBackgrounds(token);

  const selectedBackgroundId = backgroundIdFromPath(project.background_image_path);

  const batchProgress = getBatchRenderProgress(project.settings);
  const progressPercent =
    project.status === "completed" || batchProgress?.phase === "done"
      ? 100
      : estimateBatchProgress(elapsedSec, batchProgress);

  const backgroundUrl = project.background_image_path
    ? `/api/files/${project.id}/background?u=${encodeURIComponent(project.updated_at)}&b=${cacheVersion}`
    : null;

  const refreshItems = useCallback(async () => {
    const list = await api.listSeriesItems(token, project.id);
    setItems(list);
    return list;
  }, [project.id, token]);

  useEffect(() => {
    refreshItems()
      .then((list) => {
        const parsed = parseSections(project.settings, list);
        setSections(parsed);
        setSectionAiConfigs(parseSectionAiConfigs(project.settings, parsed.map((section) => section.id)));
        setSectionsReady(true);
      })
      .catch(() => {
        const parsed = parseSections(project.settings, []);
        setSections(parsed);
        setSectionAiConfigs(parseSectionAiConfigs(project.settings, parsed.map((section) => section.id)));
        setSectionsReady(true);
      });
  }, [project.settings, refreshItems]);

  const itemUrl = useCallback(
    (itemId: string, type: "source" | "result") => {
      const base =
        type === "result"
          ? `/api/files/${project.id}/series-result/${itemId}`
          : `/api/files/${project.id}/series/${itemId}`;
      return `${base}?b=${cacheVersion}`;
    },
    [project.id, cacheVersion],
  );

  const sectionItems = useCallback(
    (sectionId: string): MultiDropzoneItem[] =>
      items
        .filter((item) => item.category === sectionId)
        .map((item) => ({
          id: item.id,
          previewUrl: itemUrl(item.id, "source"),
          status: item.status,
          errorMessage: item.error_message,
          resultUrl: item.status === "completed" ? itemUrl(item.id, "result") : null,
        })),
    [items, itemUrl],
  );

  const visibleItems = useMemo(() => itemsInSections(items, sections), [items, sections]);

  const generateMissing = useMemo(() => {
    const missing: string[] = [];
    if (!project.background_image_path) {
      missing.push("tła produktu");
    }
    if (sections.length === 0) {
      missing.push("co najmniej jednej sekcji");
    }
    if (visibleItems.length === 0) {
      missing.push("zdjęć produktu w sekcjach");
    }
    return missing;
  }, [project.background_image_path, sections.length, visibleItems.length]);

  const canGenerate = generateMissing.length === 0 && !isGenerating && loading !== "generate";

  const processedItemsCount = useMemo(
    () => visibleItems.filter((item) => item.status === "completed").length,
    [visibleItems],
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    generateStartedAt.current = null;
    setIsGenerating(false);
    setElapsedSec(0);
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    generateStartedAt.current = Date.now();
    setIsGenerating(true);
    setElapsedSec(0);
    setError(null);

    timerRef.current = setInterval(() => {
      if (!generateStartedAt.current) return;
      const elapsed = Math.floor((Date.now() - generateStartedAt.current) / 1000);
      setElapsedSec(elapsed);
      if (elapsed >= POLL_TIMEOUT_SEC) {
        stopPolling();
        setError("Przetwarzanie trwa ponad 10 minut — odśwież projekt lub spróbuj ponownie.");
      }
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const [updated, list] = await Promise.all([
          api.getProject(token, project.id),
          api.listSeriesItems(token, project.id),
        ]);
        setProject(updated);
        setItems(list);

        if (updated.status === "completed") {
          setCacheVersion((v) => v + 1);
          const batch = getBatchRenderProgress(updated.settings);
          if (batch?.error) {
            setError(batch.error);
          }
          const beforeBilling = billingBeforeRef.current;
          billingBeforeRef.current = null;
          void reportGenerationCost(token, beforeBilling, "serii").then((message) => {
            if (message) {
              setCostMessage(message);
            }
          });
          window.setTimeout(() => {
            stopPolling();
            router.refresh();
          }, 400);
        } else if (updated.status === "draft") {
          const batch = getBatchRenderProgress(updated.settings);
          if (batch?.phase === "cancelled") {
            setCacheVersion((v) => v + 1);
            stopPolling();
            router.refresh();
          }
        } else if (updated.status === "failed") {
          stopPolling();
          const failed = getBatchRenderProgress(updated.settings);
          setError(failed?.error || "Przetwarzanie serii nie powiodło się");
        }
      } catch (err) {
        stopPolling();
        setError(formatFetchError(err));
      }
    }, POLL_INTERVAL_MS);
  }, [project.id, router, stopPolling, token]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const sectionSettings = useMemo(() => sectionsToSettings(sections), [sections]);

  const seriesSettingsPatch = useCallback(
    (extra: Record<string, unknown> = {}) => ({
      ...project.settings,
      ...sectionSettings,
      section_ai_configs: sectionAiConfigsToSettings(sectionAiConfigs),
      ...extra,
    }),
    [project.settings, sectionSettings, sectionAiConfigs],
  );

  async function persistSections(
    nextSections: SeriesSection[],
    configs: Record<string, AiImageConfig> = sectionAiConfigs,
  ) {
    const updated = await api.updateProject(token, project.id, {
      name,
      settings: {
        ...project.settings,
        ...sectionsToSettings(nextSections),
        section_ai_configs: sectionAiConfigsToSettings(configs),
      },
    });
    setProject(updated);
    return updated;
  }

  async function runAction(action: string, fn: () => Promise<void>) {
    setError(null);
    setLoading(action);
    try {
      await fn();
      setCacheVersion((v) => v + 1);
      router.refresh();
    } catch (err) {
      setError(formatFetchError(err));
    } finally {
      setLoading(null);
    }
  }

  function addSection() {
    const savedIds = new Set(sections.map((section) => section.id));
    const sectionPrompts =
      project.settings?.section_prompts && typeof project.settings.section_prompts === "object"
        ? (project.settings.section_prompts as Record<string, string>)
        : {};
    const orphanCategories = [...new Set(items.map((item) => item.category))]
      .filter((category) => !savedIds.has(category))
      .sort((a, b) => categorySortKey(items, a) - categorySortKey(items, b));

    const updatedSections =
      orphanCategories.length > 0
        ? [
            ...sections,
            {
              id: orphanCategories[0],
              prompt: promptForSection(orphanCategories[0], project.settings, sectionPrompts),
            },
          ]
        : [
            ...sections,
            {
              id: nextSectionId([
                ...sections.map((section) => section.id),
                ...items.map((item) => item.category),
              ]),
              prompt: DEFAULT_SECTION_PROMPT,
            },
          ];

    const newSection = updatedSections[updatedSections.length - 1];
    const nextConfigs = {
      ...sectionAiConfigs,
      [newSection.id]: { ...DEFAULT_AI_CONFIG },
    };
    setSections(updatedSections);
    setSectionAiConfigs(nextConfigs);
    void persistSections(updatedSections, nextConfigs).catch((err) => setError(formatFetchError(err)));
  }

  function removeSection(sectionId: string) {
    void runAction(`remove-section-${sectionId}`, async () => {
      const sectionItemIds = items.filter((item) => item.category === sectionId).map((item) => item.id);
      for (const itemId of sectionItemIds) {
        await api.deleteSeriesItem(token, project.id, itemId);
      }

      const updatedSections = sections.filter((section) => section.id !== sectionId);
      setSections(updatedSections);
      setSectionAiConfigs((current) => {
        const next = { ...current };
        delete next[sectionId];
        return next;
      });

      const updated = await api.updateProject(token, project.id, {
        settings: {
          ...project.settings,
          ...sectionsToSettings(updatedSections),
          section_ai_configs: sectionAiConfigsToSettings(
            Object.fromEntries(
              Object.entries(sectionAiConfigs).filter(([id]) => id !== sectionId),
            ),
          ),
        },
      });
      setProject(updated);
      await refreshItems();
    });
  }

  function updateSectionPrompt(sectionId: string, prompt: string) {
    setSections((current) =>
      current.map((section) => (section.id === sectionId ? { ...section, prompt } : section)),
    );
  }

  function updateSectionAiConfig(sectionId: string, config: AiImageConfig) {
    setSectionAiConfigs((current) => ({ ...current, [sectionId]: config }));
  }

  async function handleStop() {
    setError(null);
    setLoading("stop");
    try {
      const updated = await api.cancelPhotoSeries(token, project.id);
      setProject(updated);
    } catch (err) {
      setError(formatFetchError(err));
    } finally {
      setLoading(null);
    }
  }

  async function handleGenerateClick() {
    if (generateMissing.length > 0) {
      setError(`Przed przetwarzaniem brakuje: ${generateMissing.join(", ")}.`);
      return;
    }
    await handleGenerate();
  }

  async function handleGenerate() {
    setError(null);
    setCostMessage(null);
    setLoading("generate");
    try {
      billingBeforeRef.current = await captureBillingBefore(token);
      await persistSections(sections);
      const updated = await api.generatePhotoSeries(token, project.id, {
        sections: sectionSettings.sections,
        section_prompts: sectionSettings.section_prompts,
        section_ai_configs: sectionAiConfigsToSettings(sectionAiConfigs),
      });
      setProject(updated);
      startPolling();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(
          "Przetwarzanie już trwa w tle — poczekaj. Jeśli nic się nie dzieje, odczekaj ~90s i kliknij ponownie.",
        );
      } else {
        setError(formatFetchError(err));
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input label="Nazwa projektu" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button
            variant="secondary"
            loading={loading === "save"}
            disabled={isGenerating}
            onClick={() =>
              runAction("save", async () => {
                const updated = await api.updateProject(token, project.id, {
                  name,
                  settings: seriesSettingsPatch(),
                });
                setProject(updated);
              })
            }
          >
            Zapisz
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <Card className="flex h-full flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Sekcje ze zdjęciami</h2>
            <Button
              type="button"
              variant="secondary"
              disabled={!!loading || isGenerating}
              onClick={addSection}
            >
              Dodaj nową sekcję
            </Button>
          </div>

          <div className="flex-1">
            {!sectionsReady ? (
              <p className="mt-4 text-sm text-slate-600">Ładuję sekcje…</p>
            ) : (
              <dl className="mt-4 space-y-1 text-sm text-slate-700">
                <div className="flex justify-between gap-4">
                  <dt>Liczba dodanych sekcji:</dt>
                  <dd className="font-medium tabular-nums">{sections.length}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Liczba wszystkich zdjęć:</dt>
                  <dd className="font-medium tabular-nums">{visibleItems.length}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Liczba zdjęć przetworzonych:</dt>
                  <dd className="font-medium tabular-nums">{processedItemsCount}</dd>
                </div>
              </dl>
            )}

            {sectionsReady && sections.length === 0 && (
              <p className="mt-4 text-sm text-slate-600">
                Dodaj pierwszą sekcję — zdjęcia produktu i parametry AI pojawią się poniżej.
              </p>
            )}
          </div>

          <div className="mt-6">
            <div className="flex flex-wrap gap-3">
              <Button
                className={clsx(
                  "w-full sm:w-auto",
                  !canGenerate && loading !== "generate" && "opacity-60",
                )}
                loading={loading === "generate"}
                disabled={isGenerating || loading === "generate"}
                onClick={handleGenerateClick}
              >
                Przetwórz wszystkie zdjęcia
              </Button>
              {isGenerating && (
                <Button
                  variant="danger"
                  type="button"
                  loading={loading === "stop"}
                  onClick={handleStop}
                >
                  Zatrzymaj
                </Button>
              )}
            </div>
            {generateMissing.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Brakuje: {generateMissing.join(", ")}.
              </p>
            )}
          </div>
        </Card>

        <Card className="h-full">
          <BackgroundProductPicker
            label="Tło produktu"
            hint="Wspólne tło dla wszystkich zdjęć w serii"
            previewUrl={backgroundUrl}
            disabled={!!loading || isGenerating}
            loading={loading === "background" || loading === "background-select"}
            deletingBackgroundId={
              loading?.startsWith("bg-delete-") ? loading.slice("bg-delete-".length) : null
            }
            backgrounds={backgrounds}
            selectedBackgroundId={selectedBackgroundId}
            backgroundThumbUrl={(id) => backgroundThumbUrl(id, cacheVersion)}
            onUpload={(file) =>
              runAction("background", async () => {
                const updated = await api.uploadBackground(token, project.id, file);
                setProject(updated);
                await refreshBackgrounds();
              })
            }
            onSelectBackground={(backgroundId) =>
              runAction("background-select", async () => {
                const updated = await api.selectProjectBackground(
                  token,
                  project.id,
                  backgroundId,
                );
                setProject(updated);
              })
            }
            onDeleteBackground={(backgroundId) =>
              runAction(`bg-delete-${backgroundId}`, async () => {
                await api.deleteBackground(token, backgroundId);
                const updated = await api.getProject(token, project.id);
                setProject(updated);
                await refreshBackgrounds();
                setCacheVersion((v) => v + 1);
              })
            }
          />
        </Card>
      </div>

      {isGenerating && (
        <AiRenderProgress
          message={batchProgressMessage(batchProgress, elapsedSec)}
          elapsedSec={elapsedSec}
          progressPercent={progressPercent}
        />
      )}

      {sectionsReady &&
        sections.map((section, index) => (
          <Card key={section.id} className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Sekcja nr {index + 1}</h2>
              <Button
                type="button"
                variant="danger"
                className="px-3 py-1.5 text-xs"
                disabled={!!loading || isGenerating}
                loading={loading === `remove-section-${section.id}`}
                onClick={() => removeSection(section.id)}
              >
                Usuń sekcję
              </Button>
            </div>

            <MultiFileDropzone
              compact
              label="Zdjęcia produktu"
              hint="JPEG, PNG lub WebP — dodaj dowolną liczbę zdjęć do przetworzenia"
              items={sectionItems(section.id)}
              disabled={!!loading || isGenerating}
              onFiles={(files) =>
                runAction(`upload-${section.id}`, async () => {
                  await api.uploadSeriesItems(token, project.id, section.id, files);
                  await refreshItems();
                })
              }
              onRemove={(itemId) =>
                runAction(`remove-${itemId}`, async () => {
                  await api.deleteSeriesItem(token, project.id, itemId);
                  await refreshItems();
                })
              }
            />

            <div>
              <h3 className="text-lg font-semibold">Parametry AI</h3>
              <div className="mt-6">
                <AiParametersPanel
                  token={token}
                  prompt={section.prompt}
                  aiConfig={sectionAiConfigs[section.id] ?? DEFAULT_AI_CONFIG}
                  productSize={null}
                  disabled={!!loading}
                  generating={isGenerating}
                  hideGenerate
                  onPromptChange={(text) => updateSectionPrompt(section.id, text)}
                  onAiConfigChange={(config) => updateSectionAiConfig(section.id, config)}
                  onRestoreDefaultPrompt={() => updateSectionPrompt(section.id, DEFAULT_SECTION_PROMPT)}
                  onGenerate={handleGenerate}
                />
              </div>
            </div>
          </Card>
        ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {costMessage && <GenerationCostBanner message={costMessage} />}
    </div>
  );
}
