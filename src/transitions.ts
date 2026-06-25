import { Easing } from "remotion";

export type TransitionType =
  | "fade"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "slideDown"
  | "zoomIn"
  | "zoomOut"
  | "wipeLeft"
  | "wipeRight"
  | "wipeUp"
  | "wipeDown"
  | "rotateCw"
  | "rotateCcw"
  | "blur"
  | "flip"
  | "pushLeft"
  | "pushRight"
  | "squeeze"
  | "glitch"
  | "flash"
  | "shockwave"
  | "strobeCut"
  | "mosaic"
  | "colorFade"
  | "tilesIn"
  | "tilesRadial"
  | "shatter"
  | "spinIn"
  | "zoomSpin"
  | "rgbSplit"
  | "pixelate"
  | "kaleidFlip"
  | "stripsHorizontal"
  | "stripsVertical"
  | "blocksHorizontal"
  | "blocksVertical";

export const TRANSITION_TYPES: TransitionType[] = [
  "flash",
  "glitch",
  "mosaic",
  "colorFade",
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
  "blocksHorizontal",
  "blocksVertical",
  "zoomIn",
  "flip",
  "slideLeft",
  "rotateCw",
  "blur",
  "squeeze",
  "slideRight",
  "zoomOut",
  "slideUp",
  "fade",
  "slideDown",
  "rotateCcw",
];

export const WOW_EFFECTS: TransitionType[] = [
  "flash",
  "glitch",
  "mosaic",
  "colorFade",
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
  "blocksHorizontal",
  "blocksVertical",
];

export type TransitionRole = "outgoing" | "incoming";

export type TransitionStyles = {
  style: React.CSSProperties;
  zIndex: number;
};

const ease = (t: number) => Easing.inOut(Easing.cubic)(t);

export const getTransitionBetween = (index: number): TransitionType => {
  return TRANSITION_TYPES[index % TRANSITION_TYPES.length];
};

export const getTransitionStyles = (
  type: TransitionType,
  progress: number,
  role: TransitionRole,
): TransitionStyles => {
  const p = ease(Math.min(1, Math.max(0, progress)));
  const incoming = role === "incoming";
  const t = p;
  const inv = 1 - p;

  const base: TransitionStyles = {
    style: {},
    zIndex: incoming ? 2 : 1,
  };

  switch (type) {
    case "fade":
      return { ...base, style: { opacity: incoming ? p : inv } };

    case "slideLeft":
      return {
        ...base,
        style: {
          transform: `translateX(${incoming ? inv * 100 : -t * 100}%)`,
        },
      };

    case "slideRight":
      return {
        ...base,
        style: {
          transform: `translateX(${incoming ? -inv * 100 : t * 100}%)`,
        },
      };

    case "slideUp":
      return {
        ...base,
        style: {
          transform: `translateY(${incoming ? inv * 100 : -t * 100}%)`,
        },
      };

    case "slideDown":
      return {
        ...base,
        style: {
          transform: `translateY(${incoming ? -inv * 100 : t * 100}%)`,
        },
      };

    case "zoomIn":
      return {
        ...base,
        style: {
          opacity: incoming ? p : inv,
          transform: `scale(${incoming ? 0.75 + p * 0.25 : 1 + t * 0.35})`,
        },
      };

    case "zoomOut":
      return {
        ...base,
        style: {
          opacity: incoming ? p : inv,
          transform: `scale(${incoming ? 1.35 - p * 0.35 : 1 - t * 0.3})`,
        },
      };

    case "wipeLeft":
      return {
        ...base,
        zIndex: incoming ? 3 : 1,
        style: incoming
          ? { clipPath: `inset(0 ${inv * 100}% 0 0)` }
          : { opacity: 1 },
      };

    case "wipeRight":
      return {
        ...base,
        zIndex: incoming ? 3 : 1,
        style: incoming
          ? { clipPath: `inset(0 0 0 ${inv * 100}%)` }
          : { opacity: 1 },
      };

    case "wipeUp":
      return {
        ...base,
        zIndex: incoming ? 3 : 1,
        style: incoming
          ? { clipPath: `inset(${inv * 100}% 0 0 0)` }
          : { opacity: 1 },
      };

    case "wipeDown":
      return {
        ...base,
        zIndex: incoming ? 3 : 1,
        style: incoming
          ? { clipPath: `inset(0 0 ${inv * 100}% 0)` }
          : { opacity: 1 },
      };

    case "rotateCw":
      return {
        ...base,
        style: {
          opacity: incoming ? p : inv,
          transform: `rotate(${incoming ? (1 - p) * -12 : t * 12}deg) scale(${incoming ? 0.85 + p * 0.15 : 1 - t * 0.15})`,
        },
      };

    case "rotateCcw":
      return {
        ...base,
        style: {
          opacity: incoming ? p : inv,
          transform: `rotate(${incoming ? (1 - p) * 12 : -t * 12}deg) scale(${incoming ? 0.85 + p * 0.15 : 1 - t * 0.15})`,
        },
      };

    case "blur":
      return {
        ...base,
        style: {
          opacity: incoming ? p : inv,
          filter: `blur(${incoming ? (1 - p) * 18 : t * 18}px)`,
          transform: `scale(${incoming ? 1.08 - p * 0.08 : 1 + t * 0.08})`,
        },
      };

    case "flip":
      return {
        ...base,
        zIndex: incoming ? 2 : 1,
        style: {
          opacity: p > 0.05 && p < 0.95 ? 1 : incoming ? p : inv,
          transform: `perspective(1400px) rotateY(${incoming ? (1 - p) * 90 : -t * 90}deg)`,
          backfaceVisibility: "hidden" as const,
        },
      };

    case "pushLeft":
      return {
        ...base,
        zIndex: incoming ? 1 : 2,
        style: {
          transform: `translateX(${incoming ? inv * 100 : -t * 100}%)`,
        },
      };

    case "pushRight":
      return {
        ...base,
        zIndex: incoming ? 1 : 2,
        style: {
          transform: `translateX(${incoming ? -inv * 100 : t * 100}%)`,
        },
      };

    case "squeeze":
      return {
        ...base,
        style: {
          opacity: incoming ? p : inv,
          transform: `scale(${incoming ? 1.2 - p * 0.2 : 1 - t * 0.2}, ${incoming ? 0.8 + p * 0.2 : 1 + t * 0.2})`,
        },
      };

    case "spinIn":
      return {
        ...base,
        style: {
          opacity: incoming ? p : inv,
          transform: `rotate(${incoming ? (1 - p) * 180 : t * 180}deg) scale(${incoming ? 0.5 + p * 0.5 : 1 - t * 0.3})`,
        },
      };

    case "zoomSpin":
      return {
        ...base,
        style: {
          opacity: incoming ? p : inv,
          transform: `rotate(${incoming ? (1 - p) * 45 : -t * 45}deg) scale(${incoming ? 0.4 + p * 0.6 : 1 + t * 0.5})`,
        },
      };

    case "rgbSplit":
      return {
        ...base,
        style: {
          opacity: incoming ? p : inv,
          transform: `translateX(${incoming ? (1 - p) * -20 : t * 20}px) scale(${incoming ? 0.9 + p * 0.1 : 1 + t * 0.15})`,
          filter: `drop-shadow(${incoming ? (1 - p) * 8 : t * 8}px 0 0 rgba(255,0,80,0.8)) drop-shadow(${incoming ? (1 - p) * -8 : -t * 8}px 0 0 rgba(0,255,255,0.8))`,
        },
      };

    case "pixelate":
      return {
        ...base,
        style: {
          opacity: incoming ? p : inv,
          filter: `blur(${incoming ? (1 - p) * 6 : 0}px) saturate(${1 + t * 0.5})`,
          transform: `scale(${incoming ? 1.15 - p * 0.15 : 1 + t * 0.2})`,
        },
      };

    case "kaleidFlip":
      return {
        ...base,
        style: {
          opacity: incoming ? p : inv,
          transform: `perspective(1200px) rotateX(${incoming ? (1 - p) * 35 : -t * 35}deg) rotateZ(${incoming ? (1 - p) * 12 : -t * 12}deg) scale(${incoming ? 0.7 + p * 0.3 : 1 - t * 0.2})`,
        },
      };

    case "glitch":
    case "flash":
    case "shockwave":
    case "strobeCut":
    case "mosaic":
    case "colorFade":
    case "tilesIn":
    case "tilesRadial":
    case "shatter":
    case "stripsHorizontal":
    case "stripsVertical":
    case "blocksHorizontal":
    case "blocksVertical":
      return {
        ...base,
        style: { opacity: incoming ? Math.max(p, 0.01) : inv },
      };
  }
};
