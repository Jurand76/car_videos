import { Easing, Img, staticFile } from "remotion";
import type { TransitionType } from "../transitions";
import { FrameFill } from "./FrameFill";

const STRIP_COUNT = 3;
/** Opóźnienie startu kolejnego pasa (nakładanie się animacji). */
const STRIP_STAGGER = 0.14;
/** Czas wjazdu jednego pasa względem progressu przejścia 0–1. */
const STRIP_DURATION = 0.55;

type StripRevealProps = {
  image: string;
  progress: number;
  variant: "stripsHorizontal" | "stripsVertical";
  scale?: number;
};

const ease = (t: number) =>
  Easing.out(Easing.cubic)(Math.min(1, Math.max(0, t)));

const getStripProgress = (progress: number, index: number): number => {
  const start = index * STRIP_STAGGER;
  return ease((progress - start) / STRIP_DURATION);
};

/** Pasy 0 i 2 z jednej strony, pas 1 z przeciwnej (naprzemiennie). */
const stripEntersFromStart = (index: number) => index === 0 || index === 2;

export const StripReveal: React.FC<StripRevealProps> = ({
  image,
  progress,
  variant,
  scale = 1,
}) => {
  const strips = [];
  const isHorizontal = variant === "stripsHorizontal";

  for (let i = 0; i < STRIP_COUNT; i++) {
    const local = getStripProgress(progress, i);
    const travel = (1 - local) * 110;
    const sign = stripEntersFromStart(i) ? -1 : 1;
    const slideTransform = isHorizontal
      ? `translateX(${sign * travel}%)`
      : `translateY(${sign * travel}%)`;

    if (isHorizontal) {
      strips.push(
        <div
          key={i}
          style={{
            position: "absolute",
            left: 0,
            width: "100%",
            top: `${(i / STRIP_COUNT) * 100}%`,
            height: `${100 / STRIP_COUNT}%`,
            overflow: "hidden",
          }}
        >
          <Img
            src={staticFile(image)}
            style={{
              position: "absolute",
              width: "100%",
              height: `${STRIP_COUNT * 100}%`,
              top: `${-i * 100}%`,
              objectFit: "cover",
              transform: slideTransform,
            }}
          />
        </div>,
      );
      continue;
    }

    strips.push(
      <div
        key={i}
        style={{
          position: "absolute",
          top: 0,
          height: "100%",
          left: `${(i / STRIP_COUNT) * 100}%`,
          width: `${100 / STRIP_COUNT}%`,
          overflow: "hidden",
        }}
      >
        <Img
          src={staticFile(image)}
          style={{
            position: "absolute",
            height: "100%",
            width: `${STRIP_COUNT * 100}%`,
            left: `${-i * 100}%`,
            objectFit: "cover",
            transform: slideTransform,
          }}
        />
      </div>,
    );
  }

  return (
    <FrameFill style={{ transform: `scale(${scale})` }}>{strips}</FrameFill>
  );
};

export const isStripEffect = (type?: TransitionType) =>
  type === "stripsHorizontal" || type === "stripsVertical";
