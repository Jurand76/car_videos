import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  continueRender,
  delayRender,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { TransitionType } from "../transitions";
import { FrameFill } from "./FrameFill";
import { getMosaicMaxHalvingLevel, loadMosaicLevels } from "./mosaicHalving";
import {
  blockSizeToHalvingLevel,
  getMosaicBlockSizeForLocalFrame,
  getMosaicOpacityForLocalFrame,
  getMosaicTransitionFrames,
  isMosaicActiveLocalFrame,
  type MosaicRole,
} from "./mosaicSchedule";

export {
  getMosaicTransitionFrames,
  getMosaicHalfDuration,
  getMosaicBlockSizeForLocalFrame,
  getMosaicOpacityForLocalFrame,
  isMosaicActiveLocalFrame,
  MOSAIC_MAX_BLOCK,
  MOSAIC_FRAMES_PER_STEP,
} from "./mosaicSchedule";

export const isMosaicEffect = (type?: TransitionType) => type === "mosaic";

type MosaicTransitionProps = {
  image: string;
  role: MosaicRole;
  localFrame: number;
};

const MosaicCanvasImage: React.FC<{
  image: string;
  blockSize: number;
  width: number;
  height: number;
}> = ({ image, blockSize, width, height }) => {
  const frame = useCurrentFrame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [levels, setLevels] = useState<HTMLCanvasElement[] | null>(null);
  const maxLevel = getMosaicMaxHalvingLevel();

  useEffect(() => {
    let cancelled = false;
    const handle = delayRender(`mosaic-levels-${image}`);

    loadMosaicLevels(staticFile(image), width, height, maxLevel)
      .then((built) => {
        if (!cancelled) setLevels(built);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));

    return () => {
      cancelled = true;
      continueRender(handle);
    };
  }, [image, width, height, maxLevel]);

  const level = blockSizeToHalvingLevel(blockSize);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !levels) return;

    const src = levels[Math.min(level, levels.length - 1)]!;
    canvas.width = src.width;
    canvas.height = src.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0);
  }, [levels, level]);

  if (!levels) {
    return (
      <Img
        src={staticFile(image)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center center",
          imageRendering: "pixelated",
          display: "block",
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        imageRendering: "pixelated",
      }}
    />
  );
};

export const MosaicTransition: React.FC<MosaicTransitionProps> = ({
  image,
  role,
  localFrame,
}) => {
  const { width, height } = useVideoConfig();

  if (!isMosaicActiveLocalFrame(localFrame)) return null;
  if (getMosaicOpacityForLocalFrame(localFrame, role) <= 0) return null;

  const blockSize = getMosaicBlockSizeForLocalFrame(localFrame, role);

  return (
    <FrameFill>
      <MosaicCanvasImage
        image={image}
        blockSize={blockSize}
        width={width}
        height={height}
      />
    </FrameFill>
  );
};
