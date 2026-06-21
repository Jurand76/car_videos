import { AbsoluteFill, Easing, Img, staticFile } from "remotion";
import type { TransitionType } from "../transitions";

const COLS = 10;
const ROWS = 6;

type TileComposeProps = {
  image: string;
  progress: number;
  variant: TransitionType;
  scale?: number;
};

const ease = (t: number) => Easing.out(Easing.cubic)(Math.min(1, Math.max(0, t)));

const hash = (col: number, row: number, seed: number) => {
  const x = Math.sin(col * 12.9898 + row * 78.233 + seed) * 43758.5453;
  return x - Math.floor(x);
};

const getTileMotion = (
  variant: TransitionType,
  col: number,
  row: number,
  p: number,
  width: number,
  height: number,
) => {
  const stagger = (col + row) / (COLS + ROWS);
  const local = ease((p - stagger * 0.35) / 0.65);

  if (variant === "mosaic") {
    const angle = (hash(col, row, 1) - 0.5) * 180 * (1 - local);
    const dist = (1 - local) * (80 + hash(col, row, 2) * 220);
    const rad = hash(col, row, 3) * Math.PI * 2;
    return {
      x: Math.cos(rad) * dist,
      y: Math.sin(rad) * dist,
      rotate: angle,
      scale: 0.4 + local * 0.6,
      opacity: local,
    };
  }

  if (variant === "tilesRadial") {
    const cx = COLS / 2;
    const cy = ROWS / 2;
    const dx = col - cx;
    const dy = row - cy;
    const dist0 = Math.sqrt(dx * dx + dy * dy) / (COLS / 2);
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

  // tilesIn — kafle wjeżdżają z krawędzi
  const fromLeft = col < COLS / 3;
  const fromRight = col > (COLS * 2) / 3;
  const fromTop = row < ROWS / 3;
  const fromBottom = row > (ROWS * 2) / 3;
  let x = 0;
  let y = 0;
  if (fromLeft) x = (1 - local) * -width * 0.6;
  if (fromRight) x = (1 - local) * width * 0.6;
  if (fromTop) y = (1 - local) * -height * 0.6;
  if (fromBottom) y = (1 - local) * height * 0.6;

  return {
    x,
    y,
    rotate: (1 - local) * (fromLeft ? -15 : 15),
    scale: 0.85 + local * 0.15,
    opacity: local,
  };
};

export const TileCompose: React.FC<TileComposeProps> = ({
  image,
  progress,
  variant,
  scale = 1,
}) => {
  const cells = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const motion = getTileMotion(variant, col, row, progress, 1280, 720);
      cells.push(
        <div
          key={`${col}-${row}`}
          style={{
            position: "absolute",
            left: `${(col / COLS) * 100}%`,
            top: `${(row / ROWS) * 100}%`,
            width: `${100 / COLS}%`,
            height: `${100 / ROWS}%`,
            overflow: "hidden",
            opacity: motion.opacity,
            transform: `translate(${motion.x}px, ${motion.y}px) rotate(${motion.rotate}deg) scale(${motion.scale})`,
          }}
        >
          <Img
            src={staticFile(image)}
            style={{
              position: "absolute",
              width: `${COLS * 100}%`,
              height: `${ROWS * 100}%`,
              maxWidth: "none",
              left: `${-col * 100}%`,
              top: `${-row * 100}%`,
              objectFit: "cover",
            }}
          />
        </div>,
      );
    }
  }

  return (
    <AbsoluteFill style={{ transform: `scale(${scale})` }}>{cells}</AbsoluteFill>
  );
};

export const isTileEffect = (type?: TransitionType) =>
  type === "mosaic" ||
  type === "tilesIn" ||
  type === "tilesRadial" ||
  type === "shatter";
