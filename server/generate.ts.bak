import fs from "fs";
import path from "path";
import type { ProjectManifest, ProjectSlide } from "../src/projectTypes";
import { applySlideMontage, hashStringSeed } from "../src/effectMontage";
import { getAiStatus, type AiProvider } from "./env";
import { applyMusicSync, type GenerateInput, resolveBaseBeats } from "./syncProject";
import { clampBeats, getTempoProfile, resolveSlideBeats } from "../src/sync";
import { inferLocationFromPath, assignInfoChunksToSlides } from "./slideMatching";
import { formatMagazineCopy, MAGAZINE_STYLE_PROMPT } from "./magazineCopy";
import {
  CONTENT_FROM_TEXT_PROMPT,
  resolveFlowSystemPrompt,
  resolveFlowTemperature,
  pickFlowAiConfigForManifest,
} from "./flowAiConfig";
import {
  DEFAULT_VIDEO_FPS,
  DEFAULT_VIDEO_HEIGHT,
  DEFAULT_VIDEO_WIDTH,
  ensureVideoResolution,
} from "../src/videoDefaults";

export type { GenerateInput } from "./syncProject";

const ROOT = path.join(__dirname, "..");

const withEffectPreferences = (
  manifest: ProjectManifest,
  input: GenerateInput,
): ProjectManifest => ({
  ...manifest,
  allowedTransitions: input.allowedTransitions?.length
    ? input.allowedTransitions
    : undefined,
  allowedTextEffects: input.allowedTextEffects?.length
    ? input.allowedTextEffects
    : undefined,
  flowAiConfig: input.flowAiConfig
    ? pickFlowAiConfigForManifest(input.flowAiConfig) ?? manifest.flowAiConfig
    : manifest.flowAiConfig,
});

const pickTiming = (prompt: string, beatsPerSlide = 16) => {
  const tempo = getTempoProfile(beatsPerSlide);
  if (tempo.strictRhythm) {
    return { slideDuration: 36, transitionDuration: 5, kenBurns: false };
  }
  if (beatsPerSlide <= 8) {
    return { slideDuration: 52, transitionDuration: 8, kenBurns: false };
  }
  const p = prompt.toLowerCase();
  if (/szybk|dynamicz|reel|tiktok|fast|masakr|flash|glitch|shockwave/.test(p)) {
    return { slideDuration: 60, transitionDuration: 12, kenBurns: false };
  }
  if (/spokoj|wolno|slow|cinematic/.test(p)) {
    return { slideDuration: 120, transitionDuration: 24, kenBurns: true };
  }
  return { slideDuration: 90, transitionDuration: 18, kenBurns: tempo.kenBurns };
};

const parseInfoTextChunks = (text: string): { title: string; subtitle?: string }[] => {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const chunks: { title: string; subtitle?: string }[] = [];

  for (const line of lines) {
    const kv = line.match(/^([^:：\-–—]+)[:：\-–—]\s*(.+)$/);
    if (kv) {
      chunks.push({ title: kv[1].trim(), subtitle: kv[2].trim() });
      continue;
    }

    const bullet = line.match(/^[-*•]\s*(.+)$/);
    if (bullet) {
      const inner = bullet[1];
      const innerKv = inner.match(/^([^:：\-–—]+)[:：\-–—]\s*(.+)$/);
      if (innerKv) {
        chunks.push({ title: innerKv[1].trim(), subtitle: innerKv[2].trim() });
      } else {
        chunks.push({ title: inner.trim() });
      }
      continue;
    }

    if (line.length <= 55) {
      chunks.push({ title: line });
      continue;
    }

    const sentence = line.match(/^(.{1,55}?)[.!?]\s+(.+)$/);
    if (sentence) {
      chunks.push({
        title: sentence[1].trim(),
        subtitle: sentence[2].trim().slice(0, 140),
      });
    } else {
      chunks.push({
        title: line.slice(0, 42).trim(),
        subtitle: line.slice(42, 180).trim(),
      });
    }
  }

  if (chunks.length === 0) {
    return [];
  }

  return chunks;
};

const applyContentFromText = (input: GenerateInput): ProjectSlide[] => {
  if (input.contentMode !== "fromText" || !input.infoText?.trim()) {
    return input.slides;
  }

  const chunks = parseInfoTextChunks(input.infoText.trim());
  const assigned = assignInfoChunksToSlides(input.slides, chunks);
  return assigned.map(formatMagazineCopy);
};

const slideMetaPayload = (slide: ProjectSlide) => ({
  image: slide.image,
  location: slide.location ?? inferLocationFromPath(slide.image),
  sceneLabel: slide.sceneLabel?.trim() ?? "",
  title: slide.title,
  subtitle: slide.subtitle ?? "",
});

const mergeLlmSlides = (
  inputSlides: ProjectSlide[],
  llmSlides: ProjectSlide[],
): ProjectSlide[] =>
  inputSlides.map((input, index) => {
    const fromLlm =
      llmSlides.find((slide) => slide.image === input.image) ??
      llmSlides[index];
    return {
      image: input.image,
      location: input.location ?? inferLocationFromPath(input.image),
      sceneLabel: input.sceneLabel ?? "",
      title: fromLlm?.title?.trim() || input.title,
      subtitle: fromLlm?.subtitle?.trim() || input.subtitle,
      transition: fromLlm?.transition,
      beats: fromLlm?.beats,
    };
  });

const mergeLlmSlidesForFlow = (
  inputSlides: ProjectSlide[],
  llmSlides: ProjectSlide[],
): ProjectSlide[] =>
  inputSlides.map((input, index) => {
    const fromLlm =
      llmSlides.find((slide) => slide.image === input.image) ??
      llmSlides[index];
    return {
      ...input,
      location: input.location ?? inferLocationFromPath(input.image),
      transition: fromLlm?.transition,
    };
  });

export const generateHeuristic = (input: GenerateInput): ProjectManifest => {
  const baseBeats = resolveBaseBeats(input);
  const tempo = getTempoProfile(baseBeats);
  const slideBeatPattern = resolveSlideBeats(input.slides, baseBeats);
  const timing = pickTiming(input.prompt, baseBeats);
  const contentSlides = input.preserveSlideCopy
    ? input.slides
    : applyContentFromText(input);

  const slides = contentSlides.map((slide, index) => {
    const base = {
      ...slide,
      beats: slideBeatPattern[index],
    };
    if (input.contentMode === "fromText" && !input.preserveSlideCopy) {
      return formatMagazineCopy(base);
    }
    return base;
  });

  return withEffectPreferences(
    {
      version: 1,
      prompt: input.prompt,
      contentMode: input.contentMode ?? "manual",
      infoText:
        input.contentMode === "fromText" ? input.infoText?.trim() : undefined,
      generatedAt: new Date().toISOString(),
      generatedBy: "heuristic",
      fps: DEFAULT_VIDEO_FPS,
      width: DEFAULT_VIDEO_WIDTH,
      height: DEFAULT_VIDEO_HEIGHT,
      ...timing,
      kenBurns: tempo.kenBurns,
      audio: input.audio,
      audioVolume: 0.85,
      slides,
    },
    input,
  );
};

const DESCRIPTIONS_SYSTEM_PROMPT = `Jesteś copywriterem motoryzacyjnym. Zwracasz WYŁĄCZNIE poprawny JSON (bez markdown):
{
  "slides": [{ "image": string, "title": string, "subtitle"?: string }]
}
Zwróć DOKŁADNIE tyle slajdów, ile obrazków dostałeś — nie pomijaj żadnego.

${MAGAZINE_STYLE_PROMPT}
${CONTENT_FROM_TEXT_PROMPT}`;

type LlmConfig = {
  provider: Exclude<AiProvider, "heuristic">;
  apiKey: string;
  baseUrl: string;
  model: string;
};

const buildDescriptionsUserPayload = (input: GenerateInput) =>
  JSON.stringify({
    infoText: input.infoText?.trim() ?? "",
    slides: input.slides.map(slideMetaPayload),
  });

const buildUserPayload = (input: GenerateInput) => {
  const baseBeats = resolveBaseBeats(input);
  const base = {
    prompt: input.prompt,
    audio: input.audio,
    contentMode: input.contentMode ?? "manual",
    beatsPerSlide: baseBeats,
  };

  if (input.contentMode === "fromText" && input.infoText?.trim()) {
    return JSON.stringify({
      ...base,
      infoText: input.infoText.trim(),
      slides: input.slides.map(slideMetaPayload),
    });
  }

  return JSON.stringify({
    ...base,
    slides: input.slides.map(slideMetaPayload),
  });
};

const parseLlmResponse = (
  input: GenerateInput,
  provider: Exclude<AiProvider, "heuristic">,
  content: string,
): ProjectManifest => {
  const parsed = JSON.parse(content) as {
    slideDuration: number;
    transitionDuration: number;
    kenBurns: boolean;
    audioVolume: number;
    slides: ProjectSlide[];
  };

  const merged = input.preserveSlideCopy
    ? mergeLlmSlidesForFlow(input.slides, parsed.slides)
    : mergeLlmSlides(input.slides, parsed.slides);
  const baseBeats = resolveBaseBeats(input);
  const tempo = getTempoProfile(baseBeats);
  const slideBeatPattern = resolveSlideBeats(input.slides, baseBeats);
  const slides = merged.map((slide, index) => ({
    ...slide,
    transition: index === 0 ? undefined : slide.transition,
    beats: slideBeatPattern[index],
  }));

  const slidesWithBeats = slides.map((slide) => {
    if (input.preserveSlideCopy) {
      return slide;
    }
    return {
      ...formatMagazineCopy(slide),
      beats: slide.beats,
    };
  });

  return withEffectPreferences(
    {
      version: 1,
      prompt: input.prompt,
      contentMode: input.contentMode ?? "manual",
      infoText:
        input.contentMode === "fromText" ? input.infoText?.trim() : undefined,
      generatedAt: new Date().toISOString(),
      generatedBy: provider,
      fps: DEFAULT_VIDEO_FPS,
      width: DEFAULT_VIDEO_WIDTH,
      height: DEFAULT_VIDEO_HEIGHT,
      slideDuration: parsed.slideDuration,
      transitionDuration: parsed.transitionDuration,
      kenBurns: tempo.kenBurns,
      audio: input.audio,
      audioVolume: parsed.audioVolume ?? 0.85,
      slides: slidesWithBeats,
    },
    input,
  );
};

const parseDescriptionsResponse = (
  input: GenerateInput,
  content: string,
): ProjectSlide[] => {
  const parsed = JSON.parse(content) as { slides: ProjectSlide[] };
  return mergeLlmSlides(input.slides, parsed.slides ?? []).map(formatMagazineCopy);
};

const callLlmJson = async (
  config: LlmConfig,
  system: string,
  user: string,
  temperature = resolveFlowTemperature(),
): Promise<string> => {
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${config.provider} API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0].message.content;
};

const getLlmConfig = (): LlmConfig | null => {
  const ai = getAiStatus();
  if (!ai.enabled || ai.provider === "heuristic" || !ai.model) {
    return null;
  }
  return ai.provider === "deepseek"
    ? {
        provider: "deepseek",
        apiKey: process.env.DEEPSEEK_API_KEY!,
        baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
        model: ai.model,
      }
    : {
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY!,
        baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com",
        model: ai.model,
      };
};

const getAlternateLlmConfig = (
  failedProvider: Exclude<AiProvider, "heuristic">,
): LlmConfig | null => {
  if (failedProvider === "openai" && process.env.DEEPSEEK_API_KEY) {
    return {
      provider: "deepseek",
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    };
  }
  if (failedProvider === "deepseek" && process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com",
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    };
  }
  return null;
};

export const generateSlideDescriptions = async (
  input: GenerateInput,
): Promise<ProjectSlide[]> => {
  if (input.contentMode !== "fromText" || !input.infoText?.trim()) {
    throw new Error("Tryb „AI z opisu auta” wymaga opisu auta.");
  }
  if (!input.slides.length) {
    throw new Error("Brak slajdów do opisania.");
  }

  const config = getLlmConfig();
  if (!config) {
    return applyContentFromText(input).map(formatMagazineCopy);
  }

  try {
    const content = await callLlmJson(
      config,
      DESCRIPTIONS_SYSTEM_PROMPT,
      buildDescriptionsUserPayload(input),
    );
    return parseDescriptionsResponse(input, content);
  } catch {
    return applyContentFromText(input).map(formatMagazineCopy);
  }
};

export const generateWithLlm = async (
  input: GenerateInput,
  config: LlmConfig,
): Promise<ProjectManifest> => {
  const content = await callLlmJson(
    config,
    resolveFlowSystemPrompt(input),
    buildUserPayload(input),
    resolveFlowTemperature(input.flowAiConfig),
  );

  return parseLlmResponse(input, config.provider, content);
};

export const generateProject = async (
  input: GenerateInput,
): Promise<ProjectManifest> => {
  const flowInput: GenerateInput = { ...input, preserveSlideCopy: true };
  const ai = getAiStatus();
  let manifest: ProjectManifest;

  if (!ai.enabled || ai.provider === "heuristic" || !ai.model) {
    manifest = generateHeuristic(flowInput);
  } else {
    const config = getLlmConfig();
    if (!config) {
      manifest = generateHeuristic(flowInput);
    } else {
      try {
        manifest = await generateWithLlm(flowInput, config);
      } catch (primaryError) {
        const alternate = getAlternateLlmConfig(config.provider);
        if (!alternate) {
          throw primaryError;
        }
        console.warn(
          "Primary LLM failed, trying alternate provider:",
          primaryError instanceof Error ? primaryError.message : primaryError,
        );
        try {
          manifest = await generateWithLlm(flowInput, alternate);
        } catch (alternateError) {
          const primaryMessage =
            primaryError instanceof Error ? primaryError.message : String(primaryError);
          const alternateMessage =
            alternateError instanceof Error
              ? alternateError.message
              : String(alternateError);
          throw new Error(
            `AI niedostępne (${config.provider}: ${primaryMessage}; ${alternate.provider}: ${alternateMessage})`,
          );
        }
      }
    }
  }

  const synced = await applyMusicSync(manifest, flowInput, ROOT);
  const montageSeed = hashStringSeed(
    `${input.prompt}|${synced.slides.map((s) => s.image).join("|")}|${synced.generatedAt}|${Date.now()}`,
  );

  return {
    ...synced,
    slides: applySlideMontage(synced.slides, input.prompt, {
      allowedTransitions:
        synced.allowedTransitions ?? input.allowedTransitions,
      allowedTextEffects:
        synced.allowedTextEffects ?? input.allowedTextEffects,
      seed: montageSeed,
    }),
  };
};

export const writeProject = (
  manifest: ProjectManifest,
  projectPath: string,
) => {
  fs.mkdirSync(path.dirname(projectPath), { recursive: true });
  const normalized = ensureVideoResolution(manifest);
  fs.writeFileSync(projectPath, JSON.stringify(normalized, null, 2), "utf-8");
};

export const readProject = (projectPath: string): ProjectManifest => {
  const raw = fs.readFileSync(projectPath, "utf-8");
  return ensureVideoResolution(JSON.parse(raw) as ProjectManifest);
};
