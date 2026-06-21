"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AiParametersPanel } from "@/components/ai-parameters-panel";
import { AiRenderProgress } from "@/components/ai-render-progress";
import { FileDropzone } from "@/components/file-dropzone";
import { GenerationCostBanner } from "@/components/generation-cost-banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AiImageConfig, effectiveAiConfig, parseAiConfig } from "@/lib/ai-config";
import { api, ApiError, formatFetchError, OpenAiBilling, Project } from "@/lib/api";
import {
  aiProgressMessage,
  estimateAiProgress,
  getAiRenderProgress,
} from "@/lib/ai-render-progress";
import { captureBillingBefore, reportGenerationCost } from "@/lib/openai-generation-cost";

const DEFAULT_PROMPT =
  "Umieść samochód z pierwszego zdjęcia realistycznie na platformie studyjnej z drugiego zdjęcia. " +
  "Dopasuj perspektywę, skalę, oświetlenie i cień kontaktowy. Profesjonalna fotografia produktowa — " +
  "zachowaj dokładnie ten sam model i kolor auta.";

const POLL_INTERVAL_MS = 2000;
/** Pasek wizualnie pełny po ~4 min — nie kończy generowania. */
const PROGRESS_HINT_SEC = 240;
/** Twarde odcięcie pollingu — margines bezpieczeństwa, nie typowy czas renderu. */
const POLL_TIMEOUT_SEC = 600;

type AdvancedProjectEditorProps = {
  token: string;
  initialProject: Project;
};

export function AdvancedProjectEditor({ token, initialProject }: AdvancedProjectEditorProps) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [name, setName] = useState(project.name);
  const [prompt, setPrompt] = useState(
    () => (project.settings?.ai_prompt as string | undefined) || DEFAULT_PROMPT,
  );
  const [aiConfig, setAiConfig] = useState<AiImageConfig>(() => parseAiConfig(project.settings));
  const [cacheVersion, setCacheVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [slowWarning, setSlowWarning] = useState(false);
  const [productSize, setProductSize] = useState<{ w: number; h: number } | null>(null);
  const [costMessage, setCostMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generateStartedAt = useRef<number | null>(null);
  const billingBeforeRef = useRef<OpenAiBilling | null>(null);

  const aiProgress = getAiRenderProgress(project.settings);
  const progressPercent =
    project.status === "completed" || aiProgress?.phase === "done"
      ? 100
      : estimateAiProgress(elapsedSec, aiProgress?.phase);

  const fileUrl = (type: "car" | "background" | "result") => {
    const params = new URLSearchParams({ u: project.updated_at });
    if (cacheVersion > 0) params.set("b", String(cacheVersion));
    return `/api/files/${project.id}/${type}?${params.toString()}`;
  };

  const previews = useMemo(
    () => ({
      car: project.car_image_path ? fileUrl("car") : null,
      background: project.background_image_path ? fileUrl("background") : null,
      result: project.result_image_path ? fileUrl("result") : null,
    }),
    [
      project.car_image_path,
      project.background_image_path,
      project.result_image_path,
      project.updated_at,
      cacheVersion,
    ],
  );

  const canGenerate =
    !!project.car_image_path && !!project.background_image_path && !loading && !isGenerating;

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
    setSlowWarning(false);
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    generateStartedAt.current = Date.now();
    setIsGenerating(true);
    setElapsedSec(0);
    setSlowWarning(false);
    setError(null);

    timerRef.current = setInterval(() => {
      if (!generateStartedAt.current) {
        return;
      }
      const elapsed = Math.floor((Date.now() - generateStartedAt.current) / 1000);
      setElapsedSec(elapsed);
      if (elapsed >= PROGRESS_HINT_SEC) {
        setSlowWarning(true);
      }
      if (elapsed >= POLL_TIMEOUT_SEC) {
        stopPolling();
        setError(
          "Generowanie trwa ponad 10 minut — odśwież projekt lub spróbuj ponownie.",
        );
      }
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const updated = await api.getProject(token, project.id);
        setProject(updated);

        if (updated.status === "completed") {
          setProject(updated);
          setElapsedSec(
            generateStartedAt.current
              ? Math.floor((Date.now() - generateStartedAt.current) / 1000)
              : elapsedSec,
          );
          setCacheVersion((v) => v + 1);
          const beforeBilling = billingBeforeRef.current;
          billingBeforeRef.current = null;
          void reportGenerationCost(token, beforeBilling, "zdjęcia").then((message) => {
            if (message) {
              setCostMessage(message);
            }
          });
          window.setTimeout(() => {
            stopPolling();
            router.refresh();
          }, 400);
        } else if (updated.status === "failed") {
          stopPolling();
          const failed = getAiRenderProgress(updated.settings);
          setError(failed?.error || "Generowanie AI nie powiodło się");
        }
      } catch (err) {
        stopPolling();
        setError(formatFetchError(err));
      }
    }, POLL_INTERVAL_MS);
  }, [project.id, router, stopPolling, token]);

  useEffect(() => {
    if (!previews.car) {
      setProductSize(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      setProductSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => setProductSize(null);
    img.src = previews.car;
  }, [previews.car]);

  useEffect(() => () => stopPolling(), [stopPolling]);

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

  async function handleGenerate() {
    setError(null);
    setCostMessage(null);
    setLoading("generate");
    try {
      billingBeforeRef.current = await captureBillingBefore(token);
      const updated = await api.aiGenerateProject(token, project.id, {
        prompt,
        ai_config: effectiveAiConfig(aiConfig, productSize),
      });
      setProject(updated);
      startPolling();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(
          "Generowanie już trwa w tle — poczekaj 1–3 min. Jeśli nic się nie dzieje, odczekaj ~90s i kliknij ponownie.",
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
                  settings: { ...project.settings, ai_prompt: prompt, ai_config: aiConfig },
                });
                setProject(updated);
              })
            }
          >
            Zapisz
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <FileDropzone
            label="Zdjęcie produktu"
            hint="JPEG, PNG lub WebP — główne ujęcie produktu"
            previewUrl={previews.car}
            disabled={!!loading || isGenerating}
            onFile={(file) =>
              runAction("car", async () => {
                const updated = await api.uploadCar(token, project.id, file);
                setProject(updated);
              })
            }
          />
        </Card>
        <Card>
          <FileDropzone
            label="Tło produktu"
            hint="JPEG, PNG lub WebP — tło studyjne lub platforma"
            previewUrl={previews.background}
            disabled={!!loading || isGenerating}
            onFile={(file) =>
              runAction("background", async () => {
                const updated = await api.uploadBackground(token, project.id, file);
                setProject(updated);
              })
            }
          />
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-semibold">Parametry AI</h2>
        <div className="mt-6">
          <AiParametersPanel
            token={token}
            prompt={prompt}
            aiConfig={aiConfig}
            productSize={productSize}
            disabled={!!loading}
            generating={isGenerating}
            generateLoading={loading === "generate"}
            canGenerate={canGenerate}
            onPromptChange={setPrompt}
            onAiConfigChange={setAiConfig}
            onRestoreDefaultPrompt={() => setPrompt(DEFAULT_PROMPT)}
            onGenerate={handleGenerate}
            progressSlot={
              isGenerating ? (
                <>
                  <AiRenderProgress
                    message={aiProgressMessage(aiProgress, elapsedSec)}
                    elapsedSec={elapsedSec}
                    progressPercent={progressPercent}
                  />
                  {slowWarning && (
                    <p className="mt-2 text-xs text-amber-700">
                      Trwa dłużej niż zwykle — nadal czekam na odpowiedź z OpenAI (to nie błąd).
                    </p>
                  )}
                </>
              ) : undefined
            }
          />
        </div>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {costMessage && <GenerationCostBanner message={costMessage} />}

      {previews.result && (
        <Card>
          <h2 className="mb-4 font-semibold">Finalny render AI</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previews.result}
            alt="Wynik renderu AI"
            className="w-full rounded-lg border object-contain"
          />
          <a
            href={previews.result}
            download={`ai-render-${project.id}.${
              aiConfig.output_format === "jpeg" ? "jpg" : aiConfig.output_format
            }`}
            className="mt-4 inline-block"
          >
            <Button variant="secondary" type="button">
              Pobierz wynik
            </Button>
          </a>
        </Card>
      )}
    </div>
  );
}
