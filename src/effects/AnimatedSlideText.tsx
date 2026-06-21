import { interpolate, useVideoConfig } from "remotion";
import { ALLOWED_TEXT_EFFECTS } from "../project";
import {
  getBoomSpring,
  getClassicEntrance,
  getElasticSpring,
  getEnterProgress,
  getGlitchJitter,
  getGlitchOutJitter,
  getPopSpring,
  getShatterOffset,
  getShatterOutProgress,
  getStampSpring,
  getTextEffect,
  getWaveSpring,
  hashUnit,
  mosaicCellProgress,
  supportsShatterOut,
  TEXT_EFFECTS,
  type TextEffect,
} from "./textEffects";

type AnimatedSlideTextProps = {
  title: string;
  subtitle?: string;
  slideIndex: number;
  textEffect?: TextEffect;
  localFrame: number;
  hideStartFrame: number;
  baseOpacity: number;
};

const MOSAIC_COLS = 9;
const MOSAIC_ROWS = 4;

const StableTitle: React.FC<{
  title: string;
  className: string;
  opacity?: number;
}> = ({ title, className, opacity = 1 }) => (
  <h2 className={className} style={{ opacity }}>
    {title}
  </h2>
);

const ShatterChars: React.FC<{
  text: string;
  progress: number;
  slideIndex: number;
  className: string;
  outProgress: number;
}> = ({ text, progress, slideIndex, className, outProgress }) => {
  const chars = [...text];
  const assemble = 1 - outProgress;

  return (
    <span className={className} style={{ display: "inline-block" }}>
      {chars.map((char, index) => {
        if (char === " ") {
          return <span key={index}>&nbsp;</span>;
        }
        const offset = getShatterOffset(index, slideIndex, 120);
        const p = progress * assemble;
        const x = offset.x * (1 - p);
        const y = offset.y * (1 - p);
        const rotate = offset.rotate * (1 - p);
        const out = getShatterOffset(index, slideIndex + 99, 160);
        const ox = out.x * outProgress;
        const oy = out.y * outProgress;
        const orot = out.rotate * outProgress;
        const outScale = 1 + outProgress * 0.45;

        return (
          <span
            key={index}
            style={{
              display: "inline-block",
              transform: `translate(${x + ox}px, ${y + oy}px) rotate(${rotate + orot}deg) scale(${outScale})`,
              opacity: interpolate(p, [0, 0.15], [0, 1], {
                extrapolateRight: "clamp",
              }) * (1 - outProgress * 0.9),
            }}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
};

const StampChars: React.FC<{
  text: string;
  localFrame: number;
  fps: number;
  className: string;
  outProgress: number;
}> = ({ text, localFrame, fps, className, outProgress }) => {
  const chars = [...text];
  return (
    <span className={className} style={{ display: "inline-block" }}>
      {chars.map((char, index) => {
        if (char === " ") {
          return <span key={index}>&nbsp;</span>;
        }
        const s = getStampSpring(localFrame, fps, index);
        const y = (1 - s) * -72 + outProgress * 50;
        const scale = 0.4 + s * 0.6 + outProgress * 0.2;
        return (
          <span
            key={index}
            style={{
              display: "inline-block",
              transform: `translateY(${y}px) scale(${scale})`,
              opacity: s * (1 - outProgress),
              filter: s < 0.85 ? "brightness(1.6)" : "none",
            }}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
};

const WaveChars: React.FC<{
  text: string;
  localFrame: number;
  fps: number;
  className: string;
  outProgress: number;
}> = ({ text, localFrame, fps, className, outProgress }) => {
  const chars = [...text];
  return (
    <span className={className} style={{ display: "inline-block" }}>
      {chars.map((char, index) => {
        if (char === " ") {
          return <span key={index}>&nbsp;</span>;
        }
        const s = getWaveSpring(localFrame, fps, index);
        const y = (1 - s) * 48 + outProgress * 40;
        const opacity = s * (1 - outProgress);
        return (
          <span
            key={index}
            style={{
              display: "inline-block",
              transform: `translateY(${y}px)`,
              opacity,
            }}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
};

const MosaicOverlay: React.FC<{ progress: number }> = ({ progress }) => {
  const cells = [];
  for (let row = 0; row < MOSAIC_ROWS; row++) {
    for (let col = 0; col < MOSAIC_COLS; col++) {
      const cell = mosaicCellProgress(
        progress,
        col,
        row,
        MOSAIC_COLS,
        MOSAIC_ROWS,
      );
      if (cell >= 1) continue;
      const blockScale = interpolate(cell, [0, 0.6, 1], [1.8, 1.1, 0.15]);
      const blockRotate = (hashUnit(col * 7 + row * 13) - 0.5) * 18 * (1 - cell);
      const shade = 0.55 + hashUnit(col + row * 3) * 0.35;
      cells.push(
        <div
          key={`${col}-${row}`}
          style={{
            position: "absolute",
            left: `${(col / MOSAIC_COLS) * 100}%`,
            top: `${(row / MOSAIC_ROWS) * 100}%`,
            width: `${100 / MOSAIC_COLS + 1.2}%`,
            height: `${100 / MOSAIC_ROWS + 1.2}%`,
            background: `rgba(${Math.round(40 + shade * 80)}, ${Math.round(40 + shade * 80)}, ${Math.round(45 + shade * 90)}, ${0.97 * (1 - cell * 0.85)})`,
            border: `2px solid rgba(255,255,255,${0.25 * (1 - cell)})`,
            transform: `scale(${blockScale}) rotate(${blockRotate}deg)`,
            transformOrigin: "center center",
            opacity: 1 - cell * 0.92,
            boxShadow: "0 2px 12px rgba(0,0,0,0.45)",
          }}
        />,
      );
    }
  }
  return (
    <div
      style={{
        position: "absolute",
        inset: "-4% -2%",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {cells}
    </div>
  );
};

const renderTitle = (
  effect: TextEffect,
  title: string,
  slideIndex: number,
  localFrame: number,
  fps: number,
  progress: number,
  outProgress: number,
) => {
  const titleClass =
    "text-5xl font-bold tracking-tight text-white drop-shadow-lg";

  const settled = progress >= 1 && outProgress === 0;

  if (settled && (effect === "glitchIn" || effect === "popIn" || effect === "elasticIn")) {
    return <StableTitle title={title} className={titleClass} />;
  }

  if (effect === "shatterIn") {
    return (
      <ShatterChars
        text={title}
        progress={progress}
        slideIndex={slideIndex}
        className={titleClass}
        outProgress={outProgress}
      />
    );
  }

  if (effect === "waveIn") {
    if (settled) {
      return <StableTitle title={title} className={titleClass} />;
    }
    return (
      <WaveChars
        text={title}
        localFrame={localFrame}
        fps={fps}
        className={titleClass}
        outProgress={outProgress}
      />
    );
  }

  if (effect === "stampIn") {
    if (settled) {
      return <StableTitle title={title} className={titleClass} />;
    }
    return (
      <StampChars
        text={title}
        localFrame={localFrame}
        fps={fps}
        className={titleClass}
        outProgress={outProgress}
      />
    );
  }

  if (effect === "elasticIn") {
    const s = getElasticSpring(localFrame, fps);
    const squash = 1 + (1 - s) * 0.35;
    return (
      <h2
        className={titleClass}
        style={{
          transform: `scaleX(${0.5 + s * 0.55}) scaleY(${squash - outProgress * 0.3}) translateY(${outProgress * -30}px)`,
          opacity: Math.min(1, s * 1.15) * (1 - outProgress),
        }}
      >
        {title}
      </h2>
    );
  }

  if (effect === "boomIn") {
    if (outProgress > 0.05) {
      return (
        <ShatterChars
          text={title}
          progress={1}
          slideIndex={slideIndex}
          className={titleClass}
          outProgress={outProgress}
        />
      );
    }
    const s = getBoomSpring(localFrame, fps);
    const shake =
      localFrame < 8
        ? (localFrame % 2 === 0 ? 5 : -5) * (1 - localFrame / 8)
        : 0;
    const scale = 0.25 + s * 0.78 + outProgress * 0.35;
    const opacity = Math.min(1, s * 1.2) * (1 - outProgress);
    const flash = localFrame < 5 ? (1 - localFrame / 5) * 0.55 : 0;
    if (settled) {
      return <StableTitle title={title} className={titleClass} />;
    }
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        {flash > 0 ? (
          <div
            style={{
              position: "absolute",
              inset: "-30% -15%",
              background: `rgba(255,255,255,${flash})`,
              filter: "blur(8px)",
              pointerEvents: "none",
            }}
          />
        ) : null}
        <h2
          className={titleClass}
          style={{
            transform: `scale(${scale}) translateX(${shake + outProgress * 30}px)`,
            opacity,
            filter: localFrame < 4 ? "brightness(2.2)" : "none",
          }}
        >
          {title}
        </h2>
      </div>
    );
  }

  if (effect === "popIn") {
    const s = getPopSpring(localFrame, fps);
    return (
      <h2
        className={titleClass}
        style={{
          transform: `scale(${0.5 + s * 0.5}) translateY(${outProgress * -20}px)`,
          opacity: s * (1 - outProgress),
        }}
      >
        {title}
      </h2>
    );
  }

  if (effect === "glitchIn") {
    if (settled) {
      return <StableTitle title={title} className={titleClass} />;
    }

    const jitter = getGlitchJitter(localFrame, progress, slideIndex);
    const outJitter = getGlitchOutJitter(
      localFrame,
      outProgress,
      slideIndex + 7,
    );
    return (
      <h2
        className={titleClass}
        style={{
          transform: `translate(${jitter.x + outJitter.x}px, ${jitter.y + outJitter.y}px) skewX(${jitter.skew + outJitter.skew}deg)`,
          opacity: Math.max(progress, 1 - outProgress),
          filter: `blur(${jitter.blur + outJitter.blur}px)`,
          textShadow:
            progress < 0.85 && outProgress === 0
              ? "2px 0 rgba(255,0,80,0.7), -2px 0 rgba(0,255,255,0.6)"
              : undefined,
        }}
      >
        {title}
      </h2>
    );
  }

  if (effect === "mosaicIn") {
    const textOpacity = interpolate(progress, [0.4, 0.8], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const textScale = interpolate(progress, [0, 1], [0.88, 1]);
    if (settled) {
      return <StableTitle title={title} className={titleClass} />;
    }
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <h2
          className={titleClass}
          style={{
            opacity: textOpacity * (1 - outProgress),
            transform: `scale(${textScale})`,
            filter: progress < 0.5 ? `blur(${(1 - progress) * 6}px)` : "none",
          }}
        >
          {title}
        </h2>
        {progress < 1 && outProgress < 0.15 ? (
          <MosaicOverlay progress={progress} />
        ) : null}
      </div>
    );
  }

  const motion = getClassicEntrance(effect, progress);
  return (
    <h2
      className={titleClass}
      style={{
        transform: `${motion.transform} translateY(${outProgress * -24}px)`,
        filter: motion.filter,
        opacity: progress * (1 - outProgress),
      }}
    >
      {title}
    </h2>
  );
};

export const AnimatedSlideText: React.FC<AnimatedSlideTextProps> = ({
  title,
  subtitle,
  slideIndex,
  textEffect,
  localFrame,
  hideStartFrame,
  baseOpacity,
}) => {
  const { fps } = useVideoConfig();
  const effect =
    textEffect ??
    getTextEffect(slideIndex, ALLOWED_TEXT_EFFECTS ?? TEXT_EFFECTS);
  const progress = getEnterProgress(localFrame, fps, effect);
  const outProgress =
    supportsShatterOut(effect) && hideStartFrame < Number.MAX_SAFE_INTEGER / 2
      ? getShatterOutProgress(localFrame, hideStartFrame, fps)
      : 0;

  const subtitleDelay = Math.round(fps * 0.05);
  const subtitleLocal = localFrame - subtitleDelay;
  const subtitleProgress =
    subtitleLocal > 0 ? getEnterProgress(subtitleLocal, fps, "blurIn") : 0;

  if (localFrame < 0) {
    return null;
  }

  return (
    <div style={{ opacity: baseOpacity }}>
      {renderTitle(
        effect,
        title,
        slideIndex,
        localFrame,
        fps,
        progress,
        outProgress,
      )}
      {subtitle ? (
        <p
          className="mt-3 max-w-2xl text-2xl text-white/90"
          style={{
            opacity: subtitleProgress * (1 - outProgress * 0.8) * baseOpacity,
            transform: `translateY(${(1 - subtitleProgress) * 20}px)`,
            filter: `blur(${(1 - subtitleProgress) * 8}px)`,
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
};

export { getTextEffect };
