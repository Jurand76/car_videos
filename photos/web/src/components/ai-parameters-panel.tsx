"use client";

import clsx from "clsx";
import { ReactNode, useState } from "react";

import { PromptPicker } from "@/components/prompt-picker";
import { Button } from "@/components/ui/button";
import {
  AI_SIZE_PRESETS,
  AiImageConfig,
  AiImageQuality,
  AiImageSize,
  AiOutputFormat,
  resolveAutoSize,
} from "@/lib/ai-config";

type ProductSize = { w: number; h: number };

type AiParametersPanelProps = {
  token: string;
  prompt: string;
  aiConfig: AiImageConfig;
  productSize: ProductSize | null;
  disabled?: boolean;
  generating?: boolean;
  generateLoading?: boolean;
  canGenerate?: boolean;
  onPromptChange: (value: string) => void;
  onAiConfigChange: (config: AiImageConfig) => void;
  onRestoreDefaultPrompt: () => void;
  onGenerate: () => void;
  progressSlot?: ReactNode;
  topSlot?: ReactNode;
  hideGenerate?: boolean;
  promptDescription?: string;
};

type PanelQuality = Extract<AiImageQuality, "low" | "medium" | "high">;
type PanelFormat = Extract<AiOutputFormat, "png" | "jpeg">;

function OptionButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "rounded-lg border px-4 py-2 text-sm font-medium transition",
        active
          ? "border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {children}
    </button>
  );
}

function SizePresetMeta({
  preset,
  suffix,
}: {
  preset: (typeof AI_SIZE_PRESETS)[number];
  suffix?: ReactNode;
}) {
  if (preset.value === "auto") {
    return (
      <span className="text-sm text-slate-700">
        <span className="font-semibold text-slate-900">Rozdzielczość:</span> Auto
        <span className="mx-2 text-slate-300">·</span>
        <span className="font-semibold text-slate-900">Proporcje:</span> dopasowanie do produktu
        {suffix}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0 text-sm text-slate-700">
      <span>
        <span className="font-semibold text-slate-900">Rozdzielczość:</span> {preset.label} (
        {preset.tier})
      </span>
      <span>
        <span className="font-semibold text-slate-900">Proporcje:</span> {preset.ratio}
      </span>
      {suffix}
    </span>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx("h-5 w-5 text-slate-500 transition", expanded && "rotate-180")}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function AiParametersPanel({
  token,
  prompt,
  aiConfig,
  productSize,
  disabled,
  generating,
  generateLoading,
  canGenerate,
  onPromptChange,
  onAiConfigChange,
  onRestoreDefaultPrompt,
  onGenerate,
  progressSlot,
  topSlot,
  hideGenerate = false,
  promptDescription = "Opisz, jak AI ma połączyć oba zdjęcia — produktu oraz tła.",
}: AiParametersPanelProps) {
  const [sizeOpen, setSizeOpen] = useState(false);

  const panelQuality: PanelQuality =
    aiConfig.quality === "low" || aiConfig.quality === "medium" ? aiConfig.quality : "high";

  const panelFormat: PanelFormat = aiConfig.output_format === "jpeg" ? "jpeg" : "png";

  const resolvedAuto =
    productSize && aiConfig.size === "auto"
      ? resolveAutoSize(productSize.w, productSize.h)
      : null;

  const displayPreset =
    aiConfig.size === "auto"
      ? AI_SIZE_PRESETS.find((p) =>
          productSize && resolvedAuto ? p.value === resolvedAuto : p.value === "auto",
        )
      : AI_SIZE_PRESETS.find((p) => p.value === aiConfig.size);

  function setQuality(quality: PanelQuality) {
    onAiConfigChange({ ...aiConfig, quality });
  }

  function setFormat(output_format: PanelFormat) {
    onAiConfigChange({ ...aiConfig, output_format });
  }

  function setSize(size: AiImageSize) {
    onAiConfigChange({ ...aiConfig, size });
    setSizeOpen(false);
  }

  return (
    <div className="space-y-8">
      {topSlot}

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <section className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Prompt dla modelu</h3>
            <p className="mt-1 text-sm text-slate-600">{promptDescription}</p>
          </div>

          <PromptPicker
            token={token}
            disabled={disabled || generating}
            onSelect={(text) => onPromptChange(text)}
          />

          <textarea
            value={prompt}
            disabled={disabled || generating}
            onChange={(e) => onPromptChange(e.target.value)}
            rows={10}
            className="min-h-[220px] w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />

          <Button
            variant="secondary"
            type="button"
            disabled={disabled || generating}
            onClick={onRestoreDefaultPrompt}
          >
            Przywróć domyślny prompt
          </Button>
        </section>

        <div className="space-y-6">
          <section className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">Jakość</p>
            <div className="flex flex-wrap gap-2">
              <OptionButton
                active={panelQuality === "low"}
                disabled={disabled || generating}
                onClick={() => setQuality("low")}
              >
                Niska
              </OptionButton>
              <OptionButton
                active={panelQuality === "medium"}
                disabled={disabled || generating}
                onClick={() => setQuality("medium")}
              >
                Średnia
              </OptionButton>
              <OptionButton
                active={panelQuality === "high"}
                disabled={disabled || generating}
                onClick={() => setQuality("high")}
              >
                Wysoka
              </OptionButton>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">Format wyjścia</p>
            <div className="flex flex-wrap gap-2">
              <OptionButton
                active={panelFormat === "png"}
                disabled={disabled || generating}
                onClick={() => setFormat("png")}
              >
                PNG
              </OptionButton>
              <OptionButton
                active={panelFormat === "jpeg"}
                disabled={disabled || generating}
                onClick={() => setFormat("jpeg")}
              >
                JPG
              </OptionButton>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">Rozmiar wyjścia</p>
            <button
              type="button"
              disabled={disabled || generating}
              onClick={() => setSizeOpen((v) => !v)}
              className={clsx(
                "flex w-full items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-left transition",
                !disabled && !generating && "hover:border-brand-400 hover:bg-slate-50",
                (disabled || generating) && "cursor-not-allowed opacity-60",
              )}
              aria-expanded={sizeOpen}
            >
              <span className="min-w-0">
                {displayPreset ? (
                  <SizePresetMeta
                    preset={displayPreset}
                    suffix={
                      aiConfig.size === "auto" && resolvedAuto ? (
                        <span className="text-xs font-normal text-emerald-700">(Auto)</span>
                      ) : undefined
                    }
                  />
                ) : (
                  <span className="text-sm text-slate-700">Auto — wgraj zdjęcie produktu</span>
                )}
                <span className="mt-0.5 block text-xs text-slate-500">
                  {aiConfig.size === "auto" && productSize
                    ? `Na podstawie zdjęcia produktu (${productSize.w}×${productSize.h})`
                    : sizeOpen
                      ? "Kliknij wariant poniżej"
                      : "Kliknij, aby wybrać rozdzielczość i proporcje"}
                </span>
              </span>
              <ChevronIcon expanded={sizeOpen} />
            </button>

            {sizeOpen && (
              <div className="grid gap-2">
                {AI_SIZE_PRESETS.map((preset) => {
                  const isAutoMatch =
                    preset.value === "auto" && resolvedAuto !== null;
                  const isResolvedAuto = preset.value === resolvedAuto;

                  return (
                    <button
                      key={preset.value}
                      type="button"
                      disabled={disabled || generating}
                      onClick={() => setSize(preset.value)}
                      className={clsx(
                        "rounded-lg border px-3 py-2 text-left transition",
                        aiConfig.size === preset.value
                          ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                          : isResolvedAuto && aiConfig.size === "auto"
                            ? "border-emerald-300 bg-emerald-50/60"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                        (disabled || generating) && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <SizePresetMeta
                        preset={preset}
                        suffix={
                          isAutoMatch && aiConfig.size === "auto" ? (
                            <span className="text-xs font-normal text-emerald-700">
                              (dopasowanie Auto)
                            </span>
                          ) : undefined
                        }
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {!hideGenerate && (
        <div className="border-t border-slate-200 pt-6">
          <Button loading={generateLoading} disabled={!canGenerate} onClick={onGenerate}>
            Generuj render AI
          </Button>
          {progressSlot && <div className="mt-4">{progressSlot}</div>}
        </div>
      )}
    </div>
  );
}
