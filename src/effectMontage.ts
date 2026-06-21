import type { TextEffect } from "./effects/textEffects";
import { TEXT_EFFECTS } from "./effects/textEffects";
import type { ProjectSlide } from "./projectTypes";
import { TRANSITION_TYPES, type TransitionType } from "./transitions";

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

const TRANSITION_ALIASES: Partial<Record<TransitionType, string[]>> = {
  flash: ["flash", "błysk", "blysk", "strobe"],
  glitch: ["glitch", "glitcz"],
  mosaic: ["mosaic", "mozaika", "kafle"],
  tilesIn: ["tiles", "kafel", "tile"],
  shatter: ["shatter", "rozbicie", "shard"],
  shockwave: ["shockwave", "fala", "uderzeni"],
  strobeCut: ["strobe", "stroboskop"],
  zoomSpin: ["zoom", "obrót", "obrot", "spin"],
  rgbSplit: ["rgb", "split", "rozszczep"],
  wipeLeft: ["wipe", "zasłon", "zaslona"],
  pushLeft: ["push", "przesuni"],
  fade: ["fade", "przenik", "delikat", "spokoj", "cinematic"],
  blur: ["blur", "rozmyc"],
  zoomIn: ["zoom", "przybliż", "przybliz"],
  zoomOut: ["oddal"],
  slideLeft: ["slide", "slajd"],
  flip: ["flip", "przerzuc"],
};

const TEXT_EFFECT_ALIASES: Partial<Record<TextEffect, string[]>> = {
  boomIn: ["boom", "wybuch", "eksplozj", "masakr"],
  mosaicIn: ["mosaic", "mozaika", "kafel"],
  shatterIn: ["shatter", "rozbicie"],
  glitchIn: ["glitch", "glitcz"],
  popIn: ["pop"],
  waveIn: ["wave", "fala"],
  stampIn: ["stamp", "stempel"],
  elasticIn: ["elastic", "elastyczn"],
  slideUp: ["slide", "gór", "gor"],
  scaleIn: ["scale", "powiększ", "powieksz"],
  blurIn: ["blur", "rozmyc"],
  slideLeft: ["slide", "lewo"],
};

const mulberry32 = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashStringSeed = (input: string): number => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const splitCamel = (value: string): string[] =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length > 2);

const scoreByPrompt = (
  effect: string,
  aliases: string[] | undefined,
  prompt: string,
): number => {
  const p = prompt.toLowerCase();
  let score = 1;
  for (const alias of aliases ?? []) {
    if (p.includes(alias.toLowerCase())) score += 4;
  }
  for (const part of splitCamel(effect)) {
    if (p.includes(part)) score += 1.5;
  }
  return score;
};

export const resolveTransitionPool = (
  prompt: string,
  allowed?: TransitionType[],
): TransitionType[] => {
  const p = prompt.toLowerCase();
  let base: TransitionType[];
  if (/szybk|dynamicz|energet|reel|tiktok|fast|aggressive|hard|masakr/.test(p)) {
    base = ENERGETIC;
  } else if (/spokoj|wolno|slow|cinematic|delikat|soft|smooth/.test(p)) {
    base = CALM;
  } else {
    base = TRANSITION_TYPES;
  }
  if (!allowed?.length) return base;
  const filtered = base.filter((t) => allowed.includes(t));
  return filtered.length ? filtered : allowed;
};

export const resolveTextEffectPool = (
  allowed?: TextEffect[],
): TextEffect[] => {
  if (allowed?.length) return allowed;
  return TEXT_EFFECTS;
};

/** Losuje efekty bez powtórzeń, dopóki zestaw się nie wyczerpie. */
export const assignUniqueMontage = <T extends string>(
  pool: readonly T[],
  count: number,
  prompt: string,
  aliases: Partial<Record<T, string[]>>,
  seed: number,
): T[] => {
  if (count <= 0 || !pool.length) return [];

  const rng = mulberry32(seed);
  const result: T[] = [];
  let available = [...pool];

  for (let i = 0; i < count; i++) {
    if (!available.length) {
      const last = result[result.length - 1];
      available = [...pool];
      if (last && available.length > 1) {
        available = available.filter((item) => item !== last);
        if (!available.length) available = [...pool];
      }
    }

    const weights = available.map((effect) =>
      scoreByPrompt(effect, aliases[effect], prompt),
    );
    const total = weights.reduce((sum, w) => sum + w, 0);
    let pick = rng() * total;
    let index = 0;
    for (let j = 0; j < weights.length; j++) {
      pick -= weights[j];
      if (pick <= 0) {
        index = j;
        break;
      }
    }

    const chosen = available[index];
    result.push(chosen);
    available.splice(index, 1);
  }

  return result;
};

export const applySlideMontage = (
  slides: ProjectSlide[],
  prompt: string,
  options: {
    allowedTransitions?: TransitionType[];
    allowedTextEffects?: TextEffect[];
    seed?: number;
  } = {},
): ProjectSlide[] => {
  if (!slides.length) return slides;

  const transitionPool = resolveTransitionPool(
    prompt,
    options.allowedTransitions,
  );
  const textPool = resolveTextEffectPool(options.allowedTextEffects);
  const seed =
    options.seed ??
    hashStringSeed(
      `${prompt}|${slides.map((s) => s.image).join("|")}|${slides.length}`,
    );

  const transitions = assignUniqueMontage(
    transitionPool,
    Math.max(0, slides.length - 1),
    prompt,
    TRANSITION_ALIASES,
    seed,
  );
  const textEffects = assignUniqueMontage(
    textPool,
    slides.length,
    prompt,
    TEXT_EFFECT_ALIASES,
    seed + 0x9e3779b9,
  );

  return slides.map((slide, index) => ({
    ...slide,
    transition: index === 0 ? undefined : transitions[index - 1],
    textEffect: textEffects[index],
  }));
};
