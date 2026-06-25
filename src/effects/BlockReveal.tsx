import { Easing, Img, staticFile } from "remotion";
import type { TransitionType } from "../transitions";
import { FrameFill } from "./FrameFill";

const BLOCK_COUNT = 3;
/** Czas pojawienia jednego bloku (progress 0–1). */
const BLOCK_DURATION = 0.26;
/** Przerwa między końcem jednego bloku a startem następnego. */
const BLOCK_GAP = 0.3;

/** Kolejność: lewy → prawy → środek (pion: góra → dół → środek). */
const BLOCK_REVEAL_ORDER = [0, 2, 1];

const blockStep = BLOCK_DURATION + BLOCK_GAP;

/** Pełny progress animacji (ostatni blok kończy się na tej wartości). */
export const BLOCK_REVEAL_TOTAL_PROGRESS =
  (BLOCK_COUNT - 1) * blockStep + BLOCK_DURATION;

/** ~1.38 s przy 30 fps — jak opóźnienia w podglądzie panelu (0 / 0.56 / 1.12 s). */
export const getBlockTransitionFrames = (): number => 42;

type BlockRevealProps = {
  image: string;
  progress: number;
  variant: "blocksHorizontal" | "blocksVertical";
};

const ease = (t: number) =>
  Easing.out(Easing.cubic)(Math.min(1, Math.max(0, t)));

const getBlockReveal = (progress: number, blockIndex: number): number => {
  const orderIndex = BLOCK_REVEAL_ORDER.indexOf(blockIndex);
  if (orderIndex < 0) return 0;

  const start = orderIndex * blockStep;
  if (progress <= start) return 0;
  if (progress >= start + BLOCK_DURATION) return 1;

  return ease((progress - start) / BLOCK_DURATION);
};

export const BlockReveal: React.FC<BlockRevealProps> = ({
  image,
  progress,
  variant,
}) => {
  const blocks = [];
  const useColumns = variant === "blocksHorizontal";

  for (let i = 0; i < BLOCK_COUNT; i++) {
    const reveal = getBlockReveal(progress, i);
    const scale = 0.88 + reveal * 0.12;
    const visible = reveal > 0;

    const cellStyle = useColumns
      ? {
          top: 0,
          height: "100%",
          left: `${(i / BLOCK_COUNT) * 100}%`,
          width: `${100 / BLOCK_COUNT}%`,
        }
      : {
          left: 0,
          width: "100%",
          top: `${(i / BLOCK_COUNT) * 100}%`,
          height: `${100 / BLOCK_COUNT}%`,
        };

    const imgStyle = useColumns
      ? {
          position: "absolute" as const,
          top: 0,
          height: "100%",
          width: `${BLOCK_COUNT * 100}%`,
          maxWidth: "none" as const,
          left: `${-i * 100}%`,
          objectFit: "cover" as const,
          objectPosition: "center center" as const,
          display: "block" as const,
        }
      : {
          position: "absolute" as const,
          left: 0,
          width: "100%",
          height: `${BLOCK_COUNT * 100}%`,
          maxWidth: "none" as const,
          top: `${-i * 100}%`,
          objectFit: "cover" as const,
          objectPosition: "center center" as const,
          display: "block" as const,
        };

    blocks.push(
      <div
        key={i}
        style={{
          position: "absolute",
          overflow: "hidden",
          ...cellStyle,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            opacity: visible ? 1 : 0,
            visibility: visible ? "visible" : "hidden",
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          <Img src={staticFile(image)} style={imgStyle} />
        </div>
      </div>,
    );
  }

  return <FrameFill>{blocks}</FrameFill>;
};

export const isBlockEffect = (type?: TransitionType) =>
  type === "blocksHorizontal" || type === "blocksVertical";
