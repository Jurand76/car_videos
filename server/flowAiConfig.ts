import type { TransitionType } from "../src/transitions";
import type { TextEffect } from "../src/effects/textEffects";
import type { FlowAiConfig } from "../src/projectTypes";
import { TRANSITION_TYPES } from "../src/transitions";
import { TEXT_EFFECTS } from "../src/effects/textEffects";
import { MAGAZINE_STYLE_PROMPT } from "./magazineCopy";

export type { FlowAiConfig };

export const DEFAULT_FLOW_AI_TEMPERATURE = 0.7;

export const FLOW_ONLY_PROMPT = `
TRYB flow-only (slides[] mają już title/subtitle):
- NIE zmieniaj title ani subtitle — zwróć je identycznie jak w payloadzie.
- NIE ustawiaj beats — taktowanie slajdów ustawia użytkownik (beatsPerSlide w payloadzie).
- NIE ustawiaj transition — przejścia przypisze silnik montażu (losowo z puli użytkownika).
- Ustaw tylko pola globalne (slideDuration, transitionDuration, kenBurns, audioVolume).`;

export const CONTENT_FROM_TEXT_PROMPT = `
TRYB fromText (payload: infoText + slides[] z polami image, location, sceneLabel):
- Każdy slajd ma location (exterior/interior/detail/other) i sceneLabel — CO WIDAĆ na zdjęciu.
- Dopasuj title/subtitle WYŁĄCZNIE do sceneLabel i location. Fotel → tekst o fotelach/tapicerce, NIE o bagażniku.
- Każdy fakt/parametr z infoText użyj RAZ — ZERO powtórzeń między slajdami (moc, moment, 0-100 itd. tylko raz).
- Jeśli brakuje parametrów na wszystkie slajdy, napisz krótki redakcyjny opis widocznego elementu (bez liczb z innych slajdów).
- sceneLabel jest wiążący — traktuj go jak opis kadru od użytkownika.
- Pierwszy slajd: marka/model w tonie redakcyjnym, dopasowany do kadru.
- Nie wymyślaj parametrów spoza infoText.
- Przykład: sceneLabel „fotel kierowcy” → title „Komfort na dłuższe dystanse”, subtitle „Skóra Nappa · podgrzewane fotele · masaż”.`;

export const FLOW_ALLOWED_TRANSITIONS_RE =
  /Dozwolone transition \(oprócz pierwszego slajdu\): [^.]+\./;

export const FLOW_ALLOWED_TEXT_EFFECTS_RE =
  /Dozwolone animacje tekstu[^:]*: [^.]+\./;

export const applyAllowedTransitionsToPrompt = (
  prompt: string,
  allowedTransitions: TransitionType[],
): string => {
  const line = `Dozwolone transition (oprócz pierwszego slajdu): ${allowedTransitions.join(", ")}.`;
  if (FLOW_ALLOWED_TRANSITIONS_RE.test(prompt)) {
    return prompt.replace(FLOW_ALLOWED_TRANSITIONS_RE, line);
  }
  return prompt;
};

export const applyAllowedTextEffectsToPrompt = (
  prompt: string,
  allowedTextEffects: TextEffect[],
): string => {
  const line = `Dozwolone animacje tekstu (title/subtitle, silnik montażu): ${allowedTextEffects.join(", ")}.`;
  if (FLOW_ALLOWED_TEXT_EFFECTS_RE.test(prompt)) {
    return prompt.replace(FLOW_ALLOWED_TEXT_EFFECTS_RE, line);
  }
  if (FLOW_ALLOWED_TRANSITIONS_RE.test(prompt)) {
    return prompt.replace(
      FLOW_ALLOWED_TRANSITIONS_RE,
      (match) => `${match}\n${line}`,
    );
  }
  return `${prompt.trimEnd()}\n${line}`;
};

export const applyAllowedEffectsToPrompt = (
  prompt: string,
  allowedTransitions: TransitionType[],
  allowedTextEffects: TextEffect[],
): string =>
  applyAllowedTextEffectsToPrompt(
    applyAllowedTransitionsToPrompt(prompt, allowedTransitions),
    allowedTextEffects,
  );

const buildBaseSystemPrompt = (
  allowedTransitions: TransitionType[],
  allowedTextEffects: TextEffect[] = TEXT_EFFECTS,
) => {
  const transitionList = allowedTransitions.join(", ");
  const textEffectList = allowedTextEffects.join(", ");
  return `Jesteś reżyserem wideo Remotion. Zwracasz WYŁĄCZNIE poprawny JSON (bez markdown) zgodny ze schematem:
{
  "slideDuration": number (45-150),
  "transitionDuration": number (10-35),
  "kenBurns": boolean,
  "audioVolume": number (0-1),
  "slides": [{ "image": string, "title": string, "subtitle"?: string, "transition"?: string, "beats"?: number }]
}
Dozwolone transition (oprócz pierwszego slajdu): ${transitionList}.
Dozwolone animacje tekstu (title/subtitle, silnik montażu): ${textEffectList}.
Preferuj efekty WOW (flash, glitch, mosaic, tilesIn, shatter, shockwave) przy dynamicznych promptach.
Pierwszy slajd NIE ma transition.

WAŻNE — rytm slajdów:
- W payloadzie jest beatsPerSlide — bazowe tempo wybrane przez użytkownika.
- Przy beatsPerSlide <= 4: krótkie slajdy (2–4 takty), szybkie cięcia, mocne przejścia.
- Przy beatsPerSlide >= 16: dłuższe slajdy (12–32 takty), spokojniejszy rytm.
- ZRÓŻNICUJ beats między slajdami wokół beatsPerSlide (nie wszystkie identyczne).
- Średnia beats slajdów powinna być bliska beatsPerSlide z payloadu.

Dopasuj tempo, efekty i rytm do promptu użytkownika.
Zwróć DOKŁADNIE tyle slajdów, ile obrazków dostałeś — nie pomijaj żadnego.

${MAGAZINE_STYLE_PROMPT}`;
};

export const getDefaultFlowSystemPrompt = (
  allowedTransitions: TransitionType[] = TRANSITION_TYPES,
  allowedTextEffects: TextEffect[] = TEXT_EFFECTS,
) => buildBaseSystemPrompt(allowedTransitions, allowedTextEffects);

export const clampFlowTemperature = (value: number | undefined): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_FLOW_AI_TEMPERATURE;
  }
  return Math.min(2, Math.max(0, value));
};

export const normalizeFlowAiConfig = (
  config?: FlowAiConfig | null,
): FlowAiConfig => ({
  systemPrompt: config?.systemPrompt?.trim() ?? "",
  temperature: clampFlowTemperature(config?.temperature),
});

export type FlowSystemPromptInput = {
  allowedTransitions?: TransitionType[];
  allowedTextEffects?: TextEffect[];
  preserveSlideCopy?: boolean;
  contentMode?: "manual" | "fromText";
  infoText?: string | null;
  flowAiConfig?: FlowAiConfig | null;
};

export const resolveFlowSystemPrompt = (input: FlowSystemPromptInput): string => {
  const allowedTransitions = input.allowedTransitions?.length
    ? input.allowedTransitions
    : TRANSITION_TYPES;
  const allowedTextEffects = input.allowedTextEffects?.length
    ? input.allowedTextEffects
    : TEXT_EFFECTS;

  const custom = input.flowAiConfig?.systemPrompt?.trim();
  if (custom) {
    return applyAllowedEffectsToPrompt(
      custom,
      allowedTransitions,
      allowedTextEffects,
    );
  }

  const base = buildBaseSystemPrompt(allowedTransitions, allowedTextEffects);

  if (input.preserveSlideCopy) {
    return `${base}\n${FLOW_ONLY_PROMPT}`;
  }
  if (input.contentMode === "fromText" && input.infoText?.trim()) {
    return `${base}\n${CONTENT_FROM_TEXT_PROMPT}`;
  }
  return base;
};

export const resolveFlowTemperature = (config?: FlowAiConfig | null): number =>
  clampFlowTemperature(config?.temperature);

export const pickFlowAiConfigForManifest = (
  config?: FlowAiConfig | null,
): FlowAiConfig | undefined => {
  const normalized = normalizeFlowAiConfig(config);
  const hasCustomPrompt = Boolean(normalized.systemPrompt);
  const hasCustomTemp = normalized.temperature !== DEFAULT_FLOW_AI_TEMPERATURE;
  const isCustomized = Boolean(config?.customized || hasCustomPrompt || hasCustomTemp);
  if (!isCustomized) {
    return undefined;
  }
  return {
    customized: true,
    ...(hasCustomPrompt ? { systemPrompt: normalized.systemPrompt } : {}),
    ...(hasCustomTemp ? { temperature: normalized.temperature } : {}),
  };
};
