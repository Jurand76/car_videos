import { AbsoluteFill, Easing, Img, staticFile } from "remotion";
import type { TransitionType } from "../transitions";

const STRIP_COUNT = 3;

type StripRevealProps = {
  image: string;
  progress: number;
  variant: "stripsHorizontal" | "stripsVertical";
  scale?: number;
};

const ease = (t: number) =>
  Easing.out(Easing.cubic)(Math.min(1, Math.max(0, t)));

const getStripProgress = (
  progress: number,
  index: number,
): number => {
  const gap = 0.2;
  const window = 0.58;
  const start = index * gap;
  return ease((progress - start) / window);
};

export const StripReveal: React.FC<StripRevealProps> = ({
  image,
  progress,
  variant,
  scale = 1,
}) => {
  const strips = [];

  for (let i = 0; i < STRIP_COUNT; i++) {
    const local = getStripProgress(progress, i);
    const fromStart = i === 0 || i === 2;
    const offset = (1 - local) * 110 * (fromStart ? -1 : 1);

    if (variant === "stripsHorizontal") {
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
              transform: `translateY(${offset}%)`,
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
            transform: `translateX(${offset}%)`,
          }}
        />
      </div>,
    );
  }

  return (
    <AbsoluteFill style={{ transform: `scale(${scale})` }}>{strips}</AbsoluteFill>
  );
};

export const isStripEffect = (type?: TransitionType) =>
  type === "stripsHorizontal" || type === "stripsVertical";
