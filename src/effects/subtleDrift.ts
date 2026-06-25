import { PAN_ROOM_X, PAN_ROOM_Y } from "./panRoom";

export type DriftTransform = {
  translateX: number;
  translateY: number;
  rotate: number;
};

const getFinalDrift = (slideIndex: number): DriftTransform => {
  const sign = slideIndex % 4 < 2 ? 1 : -1;
  const panVertical = slideIndex % 2 === 1;

  if (panVertical) {
    return {
      translateX: PAN_ROOM_X * 0.35 * sign,
      translateY: PAN_ROOM_Y * sign,
      rotate: 0,
    };
  }

  return {
    translateX: PAN_ROOM_X * sign,
    translateY: PAN_ROOM_Y * 0.35 * -sign,
    rotate: 0,
  };
};

/** Liniowy pan w granicach PAN_ROOM — od końca wejścia do startu przejścia wyjścia. */
export const getSubtleDriftTransform = (
  frame: number,
  durationInFrames: number,
  transitionDuration: number,
  slideIndex: number,
): DriftTransform => {
  const exitStart = Math.max(0, durationInFrames - transitionDuration);
  const holdStart = transitionDuration;
  const final = getFinalDrift(slideIndex);
  const holdWindow = Math.max(1, exitStart - holdStart);
  const panFrames = Math.min(
    Math.max(10, Math.round(holdWindow * 0.7)),
    holdWindow,
  );
  const panEnd = holdStart + panFrames;

  if (frame < holdStart) {
    return { translateX: 0, translateY: 0, rotate: 0 };
  }

  if (frame >= panEnd) {
    return final;
  }

  const progress = Math.min(1, (frame - holdStart) / Math.max(1, panEnd - holdStart));

  return {
    translateX: final.translateX * progress,
    translateY: final.translateY * progress,
    rotate: 0,
  };
};
