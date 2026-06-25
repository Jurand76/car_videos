import { AbsoluteFill, interpolate } from "remotion";
import type { TransitionType } from "../transitions";

type FlashOverlayProps = {
  progress: number;
  type: TransitionType;
};

export const getFlashOverlayOpacity = (
  progress: number,
  type: TransitionType,
): number => {
  const p = Math.min(1, Math.max(0, progress));

  switch (type) {
    case "flash":
      return interpolate(p, [0.72, 0.88, 1], [0, 0.95, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    case "shockwave":
      return interpolate(p, [0.65, 0.82, 1], [0, 0.75, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    case "strobeCut":
      return interpolate(
        p,
        [0.5, 0.58, 0.66, 0.74, 0.9, 1],
        [0, 0.85, 0.1, 0.9, 0.2, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
    default:
      return 0;
  }
};

/** Progress przejścia, w którym ekran jest już przykryty błyskiem — wtedy podmieniamy zdjęcie. */
export const getFlashSwapProgress = (type: TransitionType): number => {
  for (let p = 0.5; p <= 0.98; p += 0.005) {
    if (getFlashOverlayOpacity(p, type) >= 0.88) {
      return p;
    }
  }
  return type === "strobeCut" ? 0.58 : type === "shockwave" ? 0.78 : 0.86;
};

export const getFlashImageOpacity = (
  progress: number,
  type: TransitionType,
  role: "incoming" | "outgoing",
): number => {
  const swap = getFlashSwapProgress(type);
  if (role === "incoming") {
    return progress >= swap ? 1 : 0;
  }
  return progress < swap ? 1 : 0;
};

export const FlashOverlay: React.FC<FlashOverlayProps> = ({ progress, type }) => {
  const opacity = getFlashOverlayOpacity(progress, type);

  if (opacity <= 0.01) return null;

  const color =
    type === "shockwave"
      ? "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(120,180,255,0.5) 45%, transparent 70%)"
      : "white";

  return (
    <AbsoluteFill
      style={{
        background: color,
        opacity,
        mixBlendMode: type === "strobeCut" ? "screen" : "normal",
        pointerEvents: "none",
        zIndex: 50,
      }}
    />
  );
};

export const isFlashEffect = (type?: TransitionType) =>
  type === "flash" || type === "shockwave" || type === "strobeCut";
