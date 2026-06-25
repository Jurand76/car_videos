import {
  Easing,
  Img,
  staticFile,
  useVideoConfig,
} from "remotion";
import type { TransitionType } from "../transitions";
import { FrameFill } from "./FrameFill";

const COLS = 10;
const ROWS = 6;

/** Docelowy rozmiar kafelka na ekranie (px); siatka dopasowuje się do klatru. */
export const TILES_IN_SIZE_PX = 64;

/** Losowy start w obrębie przejścia; każdy kafelek domyka się w stałym czasie. */
const TILES_IN_POP_WINDOW = 0.62;
const TILES_IN_POP_SPAN = 0.22;

type TileComposeProps = {
  image: string;
  progress: number;
  variant: TransitionType;
  scale?: number;
};

const ease = (t: number) =>
  Easing.out(Easing.cubic)(Math.min(1, Math.max(0, t)));

const hash = (col: number, row: number, seed: number) => {
  const x = Math.sin(col * 12.9898 + row * 78.233 + seed) * 43758.5453;
  return x - Math.floor(x);
};

export const getTilesInGrid = (width: number, height: number) => {
  const cols = Math.max(1, Math.ceil(width / TILES_IN_SIZE_PX));
  const rows = Math.max(1, Math.ceil(height / TILES_IN_SIZE_PX));
  return { cols, rows };
};

const getTileMotion = (
  variant: TransitionType,
  col: number,
  row: number,
  p: number,
  width: number,
  height: number,
  cols: number,
  rows: number,
) => {
  if (variant === "tilesIn") {
    const start = hash(col, row, 17) * TILES_IN_POP_WINDOW;
    const local = ease((p - start) / TILES_IN_POP_SPAN);

    return {
      x: 0,
      y: 0,
      rotate: 0,
      scale: local,
      opacity: local > 0 ? 1 : 0,
    };
  }

  const stagger = (col + row) / (cols + rows);
  const local = ease((p - stagger * 0.35) / 0.65);

  if (variant === "tilesRadial") {
    const cx = cols / 2;
    const cy = rows / 2;
    const dx = col - cx;
    const dy = row - cy;
    const dist0 = Math.sqrt(dx * dx + dy * dy) / (cols / 2);
    const localR = ease((p - dist0 * 0.25) / 0.75);
    return {
      x: dx * (1 - localR) * 40,
      y: dy * (1 - localR) * 40,
      rotate: (1 - localR) * 25 * (hash(col, row, 4) > 0.5 ? 1 : -1),
      scale: 0.3 + localR * 0.7,
      opacity: localR,
    };
  }

  if (variant === "shatter") {
    const localS = ease((p - stagger * 0.2) / 0.8);
    return {
      x: (hash(col, row, 5) - 0.5) * (1 - localS) * width * 0.4,
      y: (hash(col, row, 6) - 0.5) * (1 - localS) * height * 0.4,
      rotate: (hash(col, row, 7) - 0.5) * (1 - localS) * 90,
      scale: 0.2 + localS * 0.8,
      opacity: localS,
    };
  }

  return {
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
    opacity: 1,
  };
};

export const TileCompose: React.FC<TileComposeProps> = ({
  image,
  progress,
  variant,
  scale = 1,
}) => {
  const { width, height } = useVideoConfig();
  const isOverlay = variant === "tilesIn";
  const { cols, rows } = isOverlay
    ? getTilesInGrid(width, height)
    : { cols: COLS, rows: ROWS };

  const cellW = width / cols;
  const cellH = height / rows;
  const imageSrc = staticFile(image);

  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const motion = getTileMotion(
        variant,
        col,
        row,
        progress,
        width,
        height,
        cols,
        rows,
      );

      if (!isOverlay && motion.opacity <= 0) {
        continue;
      }

      const tileScale = isOverlay ? Math.max(0, motion.scale) : motion.scale;
      const tileVisible = isOverlay ? tileScale > 0 : motion.opacity > 0;

      const cellStyle = isOverlay
        ? {
            position: "absolute" as const,
            left: col * cellW,
            top: row * cellH,
            width: cellW,
            height: cellH,
          }
        : {
            position: "absolute" as const,
            left: `${(col / cols) * 100}%`,
            top: `${(row / rows) * 100}%`,
            width: `${100 / cols}%`,
            height: `${100 / rows}%`,
          };

      const sliceStyle = isOverlay
        ? {
            position: "absolute" as const,
            left: -col * cellW,
            top: -row * cellH,
            width,
            height,
            maxWidth: "none" as const,
            objectFit: "cover" as const,
            objectPosition: "center center" as const,
            display: "block" as const,
          }
        : {
            position: "absolute" as const,
            width: `${cols * 100}%`,
            height: `${rows * 100}%`,
            maxWidth: "none" as const,
            left: `${-col * 100}%`,
            top: `${-row * 100}%`,
            objectFit: "cover" as const,
          };

      cells.push(
        <div
          key={`${col}-${row}`}
          style={{
            ...cellStyle,
            overflow: "hidden",
            opacity: tileVisible ? motion.opacity : 0,
            visibility: tileVisible ? "visible" : "hidden",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              transform: `translate(${motion.x}px, ${motion.y}px) rotate(${motion.rotate}deg) scale(${tileScale})`,
              transformOrigin: "center center",
            }}
          >
            {isOverlay ? (
              <img src={imageSrc} alt="" style={sliceStyle} />
            ) : (
              <Img src={imageSrc} style={sliceStyle} />
            )}
          </div>
        </div>,
      );
    }
  }

  return (
    <FrameFill
      style={{
        transform: isOverlay ? undefined : `scale(${scale})`,
        pointerEvents: "none",
      }}
    >
      {cells}
    </FrameFill>
  );
};

export const isTileEffect = (type?: TransitionType) =>
  type === "tilesIn" || type === "tilesRadial" || type === "shatter";

export const isTilesInOverlay = (type?: TransitionType) => type === "tilesIn";

export const getTilesInTransitionFrames = (): number => 40;
