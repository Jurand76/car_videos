"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AiImageConfig,
  AiImageQuality,
  AiImageSize,
  AiOutputFormat,
  AI_SIZE_PRESETS,
  DEFAULT_AI_CONFIG,
} from "@/lib/ai-config";

type AiConfigModalProps = {
  open: boolean;
  config: AiImageConfig;
  disabled?: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave: (config: AiImageConfig) => void;
};

function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-800">{label}</span>
      {hint && <span className="mt-0.5 block text-xs font-normal text-slate-500">{hint}</span>}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AiConfigModal({
  open,
  config,
  disabled,
  saving,
  onClose,
  onSave,
}: AiConfigModalProps) {
  const [draft, setDraft] = useState(config);

  useEffect(() => {
    if (open) {
      setDraft(config);
    }
  }, [open, config]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Zamknij"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Konfiguracja AI</h3>
        <p className="mt-1 text-sm text-slate-600">
          Parametry wysyłane do GPT Image 2 przy generowaniu. GPT Image nie ma{" "}
          <code className="rounded bg-slate-100 px-1">temperature</code> — użyj jakości i rozmiaru.
        </p>

        <div className="mt-5 space-y-4">
          <SelectField<AiImageQuality>
            label="Jakość"
            hint="Wyższa = lepszy detal, dłużej i drożej"
            value={draft.quality}
            disabled={disabled}
            onChange={(quality) => setDraft((c) => ({ ...c, quality }))}
            options={[
              { value: "auto", label: "Auto" },
              { value: "low", label: "Niska (szybko)" },
              { value: "medium", label: "Średnia" },
              { value: "high", label: "Wysoka" },
            ]}
          />

          <SelectField<AiImageSize>
            label="Rozmiar wyjścia"
            value={draft.size}
            disabled={disabled}
            onChange={(size) => setDraft((c) => ({ ...c, size }))}
            options={AI_SIZE_PRESETS.map((preset) => ({
              value: preset.value,
              label:
                preset.value === "auto"
                  ? "Auto"
                  : `${preset.label} (${preset.ratio} · ${preset.tier})`,
            }))}
          />

          <SelectField<AiOutputFormat>
            label="Format pliku"
            value={draft.output_format}
            disabled={disabled}
            onChange={(output_format) => setDraft((c) => ({ ...c, output_format }))}
            options={[
              { value: "png", label: "PNG (bezstratny)" },
              { value: "jpeg", label: "JPEG" },
              { value: "webp", label: "WebP" },
            ]}
          />

          {draft.output_format !== "png" && (
            <label className="block text-sm">
              <span className="font-medium text-slate-800">
                Kompresja ({draft.output_compression}%)
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Tylko dla JPEG i WebP — wyższa = lepsza jakość, większy plik
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={disabled}
                value={draft.output_compression}
                onChange={(e) =>
                  setDraft((c) => ({ ...c, output_compression: Number(e.target.value) }))
                }
                className="mt-3 w-full accent-violet-600"
              />
            </label>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button
            variant="secondary"
            type="button"
            disabled={disabled || saving}
            onClick={() => setDraft({ ...DEFAULT_AI_CONFIG })}
          >
            Domyślne
          </Button>
          <Button variant="secondary" type="button" disabled={saving} onClick={onClose}>
            Anuluj
          </Button>
          <Button
            type="button"
            loading={saving}
            disabled={disabled}
            onClick={() => onSave(draft)}
          >
            Zapisz
          </Button>
        </div>
      </div>
    </div>
  );
}
