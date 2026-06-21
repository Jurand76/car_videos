import fs from "fs";
import path from "path";
import type { ProjectManifest, ProjectSlide } from "../src/projectTypes";
import { TRANSITION_TYPES, type TransitionType } from "../src/transitions";
import { getAiStatus, type AiProvider } from "./env";
import { applyMusicSync, type GenerateInput } from "./syncProject";
import { assignVariedBeats, guessBeatsPerSlide } from "../src/sync";
import { inferLocationFromPath, assignInfoChunksToSlides } from "./slideMatching";
import { formatMagazineCopy, MAGAZINE_STYLE_PROMPT } from "./magazineCopy";

export type { GenerateInput } from "./syncProject";

const ROOT = path.join(__dirname, "..");

const ENERGETIC: TransitionType[] = [
  "flash",
  "glitch",
  "mosaic",
  "tilesIn",
  "shatter",
  "shockwave",
  "strobeCut",
  "tilesRadial",
  "zoomSpin",
  "rgbSplit",
  "spinIn",
  "pixelate",
  "kaleidFlip",
  "stripsHorizontal",
  "stripsVertical",
  "wipeLeft",
  "pushLeft",
  "zoomIn",
  "flip",
];

const CALM: TransitionType[] = [
  "fade",
  "zoomOut",
  "blur",
  "slideUp",
  "wipeUp",
  "rotateCcw",
];

const pickPool = (prompt: string): TransitionType[] => {
  const p = prompt.toLowerCase();
  if (
    /szybk|dynamicz|energet|reel|tiktok|fast|aggressive|hard/.test(p)
  ) {
    return ENERGETIC;
  }
  if (/spokoj|wolno|slow|cinematic|delikat|soft|smooth/.test(p)) {
    return CALM;
  }
  return TRANSITION_TYPES;
};

const pickTiming = (prompt: string) => {
  const p = prompt.toLowerCase();
  if (/szybk|dynamicz|reel|tiktok|fast/.test(p)) {
    return { slideDuration: 60, transitionDuration: 14, kenBurns: false };
  }
  if (/spokoj|wolno|slow|cinematic/.test(p)) {
    return { slideDuration: 120, transitionDuration: 28, kenBurns: true };
  }
  return { slideDuration: 90, transitionDuration: 20, kenBurns: true };
};

const clampBeats = (value: number) =>
  Math.max(4, Math.min(48, Math.round(value)));

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

export const generateHeuristic = (input: GenerateInput): ProjectManifest => {
  const pool = pickPool(input.prompt);
  const timing = pickTiming(input.prompt);
  const baseBeats = guessBeatsPerSlide(input.prompt);
  const beatPattern = assignVariedBeats(input.slides.length, baseBeats);
  const contentSlides = applyContentFromText(input);

  const slides = contentSlides.map((slide, index) => {
    const base = {
      ...slide,
      transition:
        index === 0 ? undefined : pool[(index - 1) % pool.length],
      beats: beatPattern[index],
    };
    return input.contentMode === "fromText" ? formatMagazineCopy(base) : base;
  });

  return {
    version: 1,
    prompt: input.prompt,
    contentMode: input.contentMode ?? "manual",
    infoText:
      input.contentMode === "fromText" ? input.infoText?.trim() : undefined,
    generatedAt: new Date().toISOString(),
    generatedBy: "heuristic",
    fps: 30,
    width: 1280,
    height: 720,
    ...timing,
    audio: input.audio,
    audioVolume: 0.85,
    slides,
  };
};

const SYSTEM_PROMPT = `Jesteś reżyserem wideo Remotion. Zwracasz WYŁĄCZNIE poprawny JSON (bez markdown) zgodny ze schematem:
{
  "slideDuration": number (45-150),
  "transitionDuration": number (10-35),
  "kenBurns": boolean,
  "audioVolume": number (0-1),
  "slides": [{ "image": string, "title": string, "subtitle"?: string, "transition"?: string, "beats"?: number }]
}
Dozwolone transition (oprócz pierwszego slajdu): ${TRANSITION_TYPES.join(", ")}.
Preferuj efekty WOW (flash, glitch, mosaic, tilesIn, shatter, shockwave) przy dynamicznych promptach.
Pierwszy slajd NIE ma transition.

WAŻNE — rytm slajdów:
- Każdy slajd ma pole "beats" (4-48): ile taktów trwa TEN slajd.
- ZRÓŻNICUJ beats między slajdami — unikaj jednolitej wartości dla wszystkich.
- Krótsze slajdy (8-12) przy dynamicznych momentach, dropach, mocnych tekstach.
- Dłuższe (20-32) przy spokojniejszych, cinematic, ważnych slajdach.
- Średnia beats powinna pasować do promptu (szybki reel ~8-16, spokojny ~20-32).

Dopasuj tempo, efekty i rytm do promptu użytkownika.
Zwróć DOKŁADNIE tyle slajdów, ile obrazków dostałeś — nie pomijaj żadnego.

${MAGAZINE_STYLE_PROMPT}`;

const CONTENT_FROM_TEXT_PROMPT = `
TRYB fromText (payload: infoText + slides[] z polami image, location, sceneLabel):
- Każdy slajd ma location (exterior/interior/detail/other) i sceneLabel — CO WIDAĆ na zdjęciu.
- Dopasuj title/subtitle WYŁĄCZNIE do sceneLabel i location. Fotel → tekst o fotelach/tapicerce, NIE o bagażniku.
- Każdy fakt/parametr z infoText użyj RAZ — ZERO powtórzeń między slajdami (moc, moment, 0-100 itd. tylko raz).
- Jeśli brakuje parametrów na wszystkie slajdy, napisz krótki redakcyjny opis widocznego elementu (bez liczb z innych slajdów).
- sceneLabel jest wiążący — traktuj go jak opis kadru od użytkownika.
- Pierwszy slajd: marka/model w tonie redakcyjnym, dopasowany do kadru.
- Nie wymyślaj parametrów spoza infoText.
- Przykład: sceneLabel „fotel kierowcy” → title „Komfort na dłuższe dystanse”, subtitle „Skóra Nappa · podgrzewane fotele · masaż”.`;

type LlmConfig = {
  provider: Exclude<AiProvider, "heuristic">;
  apiKey: string;
  baseUrl: string;
  model: string;
};

const buildSystemPrompt = (input: GenerateInput) =>
  input.contentMode === "fromText" && input.infoText?.trim()
    ? `${SYSTEM_PROMPT}\n${CONTENT_FROM_TEXT_PROMPT}`
    : SYSTEM_PROMPT;

const buildUserPayload = (input: GenerateInput) => {
  const base = {
    prompt: input.prompt,
    audio: input.audio,
    contentMode: input.contentMode ?? "manual",
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

  const merged = mergeLlmSlides(input.slides, parsed.slides);
  const slides = merged.map((slide, index) => ({
    ...slide,
    transition: index === 0 ? undefined : slide.transition,
    beats:
      slide.beats != null && slide.beats > 0
        ? clampBeats(slide.beats)
        : undefined,
  }));

  const baseBeats = guessBeatsPerSlide(input.prompt);
  const beatPattern = assignVariedBeats(input.slides.length, baseBeats);
  const slidesWithBeats = slides.map((slide, index) => ({
    ...formatMagazineCopy(slide),
    beats: slide.beats ?? beatPattern[index],
  }));

  return {
    version: 1,
    prompt: input.prompt,
    contentMode: input.contentMode ?? "manual",
    infoText:
      input.contentMode === "fromText" ? input.infoText?.trim() : undefined,
    generatedAt: new Date().toISOString(),
    generatedBy: provider,
    fps: 30,
    width: 1280,
    height: 720,
    slideDuration: parsed.slideDuration,
    transitionDuration: parsed.transitionDuration,
    kenBurns: parsed.kenBurns,
    audio: input.audio,
    audioVolume: parsed.audioVolume ?? 0.85,
    slides: slidesWithBeats,
  };
};

export const generateWithLlm = async (
  input: GenerateInput,
  config: LlmConfig,
): Promise<ProjectManifest> => {
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(input) },
        { role: "user", content: buildUserPayload(input) },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `${config.provider} API error: ${response.status} ${text}`,
    );
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  return parseLlmResponse(
    input,
    config.provider,
    data.choices[0].message.content,
  );
};

export const generateProject = async (
  input: GenerateInput,
): Promise<ProjectManifest> => {
  const ai = getAiStatus();
  let manifest: ProjectManifest;

  if (!ai.enabled || ai.provider === "heuristic" || !ai.model) {
    manifest = generateHeuristic(input);
  } else {
    const config: LlmConfig =
      ai.provider === "deepseek"
        ? {
            provider: "deepseek",
            apiKey: process.env.DEEPSEEK_API_KEY!,
            baseUrl:
              process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
            model: ai.model,
          }
        : {
            provider: "openai",
            apiKey: process.env.OPENAI_API_KEY!,
            baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com",
            model: ai.model,
          };

    try {
      manifest = await generateWithLlm(input, config);
    } catch {
      manifest = generateHeuristic(input);
    }
  }

  return applyMusicSync(manifest, input, ROOT);
};

export const writeProject = (
  manifest: ProjectManifest,
  projectPath: string,
) => {
  fs.mkdirSync(path.dirname(projectPath), { recursive: true });
  fs.writeFileSync(projectPath, JSON.stringify(manifest, null, 2), "utf-8");
};

export const readProject = (projectPath: string): ProjectManifest => {
  const raw = fs.readFileSync(projectPath, "utf-8");
  return JSON.parse(raw) as ProjectManifest;
};
