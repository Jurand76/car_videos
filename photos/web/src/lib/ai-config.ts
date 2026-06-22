export type AiImageQuality = "auto" | "low" | "medium" | "high";
export type AiOutputFormat = "png" | "jpeg" | "webp";

export const AI_SIZE_PRESETS = [
  { value: "auto", label: "Auto", ratio: "—", tier: "Domyślny" },
  { value: "1024x1024", label: "1024 × 1024", ratio: "1:1", tier: "1K" },
  { value: "1536x1024", label: "1536 × 1024", ratio: "3:2", tier: "1K" },
  { value: "1024x1536", label: "1024 × 1536", ratio: "2:3", tier: "1K" },
  { value: "2048x1536", label: "2048 × 1536", ratio: "4:3", tier: "2K" },
  { value: "2048x2048", label: "2048 × 2048", ratio: "1:1", tier: "2K" },
  { value: "2560x1440", label: "2560 × 1440", ratio: "16:9", tier: "2K" },
  { value: "2560x1088", label: "2560 × 1088", ratio: "21:9", tier: "2K" },
  { value: "1440x2560", label: "1440 × 2560", ratio: "9:16", tier: "2K" },
  { value: "2816x2816", label: "2816 × 2816", ratio: "1:1", tier: "~2.8K" },
  { value: "3840x2160", label: "3840 × 2160", ratio: "16:9", tier: "4K" },
  { value: "2160x3840", label: "2160 × 3840", ratio: "9:16", tier: "4K" },
] as const;

export type AiImageSize = (typeof AI_SIZE_PRESETS)[number]["value"];

const VALID_SIZES = new Set<string>(AI_SIZE_PRESETS.map((p) => p.value));

export type AiImageConfig = {
  quality: AiImageQuality;
  size: AiImageSize;
  output_format: AiOutputFormat;
  output_compression: number;
};

export const DEFAULT_AI_CONFIG: AiImageConfig = {
  quality: "low",
  size: "auto",
  output_format: "png",
  output_compression: 100,
};

export function parseSizeDimensions(size: AiImageSize): { w: number; h: number } | null {
  if (size === "auto") return null;
  const [w, h] = size.split("x").map(Number);
  if (!w || !h) return null;
  return { w, h };
}

/** Najbliższy preset do proporcji i rozdzielczości zdjęcia produktu. */
export function resolveAutoSize(sourceWidth: number, sourceHeight: number): AiImageSize {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return "1024x1024";
  }

  const sourceRatio = sourceWidth / sourceHeight;
  const sourceMax = Math.max(sourceWidth, sourceHeight);

  const candidates = AI_SIZE_PRESETS.filter((p) => p.value !== "auto");

  let best: AiImageSize = "1024x1024";
  let bestScore = Infinity;

  for (const preset of candidates) {
    const dims = parseSizeDimensions(preset.value);
    if (!dims) continue;

    const presetRatio = dims.w / dims.h;
    const ratioDiff = Math.abs(Math.log(sourceRatio) - Math.log(presetRatio));
    const presetMax = Math.max(dims.w, dims.h);
    const resolutionDiff = Math.abs(Math.log(sourceMax) - Math.log(presetMax));

    const score = ratioDiff * 3 + resolutionDiff;
    if (score < bestScore) {
      bestScore = score;
      best = preset.value;
    }
  }

  return best;
}

export function sizePresetLabel(size: AiImageSize): string {
  const preset = AI_SIZE_PRESETS.find((p) => p.value === size);
  if (!preset) return size;
  if (preset.value === "auto") return "Auto";
  return `Rozdzielczość: ${preset.label} (${preset.tier}), proporcje: ${preset.ratio}`;
}

export function sizeDisplayLabel(
  size: AiImageSize,
  productSize: { w: number; h: number } | null,
): string {
  if (size !== "auto") return sizePresetLabel(size);
  if (!productSize) {
    return "Auto — wgraj zdjęcie produktu";
  }
  return `Auto → ${sizePresetLabel(resolveAutoSize(productSize.w, productSize.h))}`;
}

export function effectiveAiConfig(
  config: AiImageConfig,
  productSize: { w: number; h: number } | null,
): AiImageConfig {
  if (config.size !== "auto") return config;
  const resolved = productSize
    ? resolveAutoSize(productSize.w, productSize.h)
    : ("1024x1024" as AiImageSize);
  return { ...config, size: resolved };
}

export function parseAiConfig(settings: Record<string, unknown> | null | undefined): AiImageConfig {
  const raw = settings?.ai_config;
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_AI_CONFIG };
  }
  const data = raw as Record<string, unknown>;
  const quality = data.quality;
  const size = data.size;
  const output_format = data.output_format;

  const parsedSize =
    typeof size === "string" && VALID_SIZES.has(size) ? (size as AiImageSize) : DEFAULT_AI_CONFIG.size;

  return {
    quality:
      quality === "auto" || quality === "low" || quality === "medium" || quality === "high"
        ? quality
        : DEFAULT_AI_CONFIG.quality,
    size: parsedSize,
    output_format:
      output_format === "png" || output_format === "jpeg" || output_format === "webp"
        ? output_format
        : DEFAULT_AI_CONFIG.output_format,
    output_compression: 100,
  };
}

function parseAiConfigValue(raw: unknown): AiImageConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_AI_CONFIG };
  }
  return parseAiConfig({ ai_config: raw as Record<string, unknown> });
}

export function parseSectionAiConfigs(
  settings: Record<string, unknown> | null | undefined,
  sectionIds: string[],
): Record<string, AiImageConfig> {
  const fallback = parseAiConfig(settings);
  const configs: Record<string, AiImageConfig> = {};
  const raw = settings?.section_ai_configs;

  if (raw && typeof raw === "object") {
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      configs[id] = parseAiConfigValue(value);
    }
  }

  for (const id of sectionIds) {
    if (!configs[id]) {
      configs[id] = { ...fallback };
    }
  }

  return configs;
}

export function sectionAiConfigsToSettings(
  configs: Record<string, AiImageConfig>,
): Record<string, AiImageConfig> {
  return Object.fromEntries(
    Object.entries(configs).map(([id, config]) => [id, { ...config }]),
  );
}
