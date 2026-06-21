import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AnimatedSlideText } from "./effects/AnimatedSlideText";
import { FlashOverlay, isFlashEffect } from "./effects/FlashOverlay";
import { getGlitchIntensity, GlitchImage } from "./effects/GlitchImage";
import { isStripEffect, StripReveal } from "./effects/StripReveal";
import { getSubtleDriftTransform } from "./effects/subtleDrift";
import { PanningImage } from "./effects/PanningImage";
import { isTileEffect, TileCompose } from "./effects/TileCompose";
import type { ProjectSlide } from "./projectTypes";
import { PROJECT, getSlideTransitionDuration } from "./project";
import {
  DEFAULT_ANIMATION_PHASES,
  buildAnimationPhases,
  getExitBangScale,
  getTextEnterFrame,
} from "./slideAnimation";
import { pickBangStrengthForAccent } from "./accentDriven";
import {
  getTransitionStyles,
  type TransitionType,
} from "./transitions";

type SlideProps = ProjectSlide & {
  slideIndex: number;
  localBeatFrames: number[];
  kenBurns?: boolean;
  enterTransition?: TransitionType;
  exitTransition?: TransitionType;
};

export const Slide: React.FC<SlideProps> = ({
  image,
  title,
  subtitle,
  beats,
  accentStrength,
  slideIndex,
  localBeatFrames,
  kenBurns = true,
  enterTransition,
  exitTransition,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const enterTransitionDuration =
    slideIndex > 0 ? getSlideTransitionDuration(slideIndex - 1) : 0;
  const exitTransitionDuration = getSlideTransitionDuration(slideIndex);
  const slideBeats = beats ?? PROJECT.sync.beatsPerSlide ?? 16;
  const phases =
    beats != null
      ? buildAnimationPhases(slideBeats)
      : (PROJECT.sync.animationPhases ?? DEFAULT_ANIMATION_PHASES);
  const framesPerBeat = PROJECT.sync.framesPerBeat ?? Math.round(fps * 0.4);
  const useChoreography = Boolean(
    PROJECT.sync.enabled && PROJECT.sync.beatTimesSeconds?.length,
  );

  const enterProgress =
    enterTransition !== undefined && enterTransitionDuration > 0
      ? interpolate(frame, [0, enterTransitionDuration], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const exitStart = Math.max(0, durationInFrames - exitTransitionDuration);
  const exitProgress =
    exitTransition !== undefined && durationInFrames > 1
      ? interpolate(frame, [exitStart, durationInFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;

  let transitionStyle: React.CSSProperties = {};
  let zIndex = 1;

  if (exitProgress > 0 && exitTransition) {
    const { style, zIndex: z } = getTransitionStyles(
      exitTransition,
      exitProgress,
      "outgoing",
    );
    transitionStyle = style;
    zIndex = z;
  } else if (enterTransition && enterProgress < 1) {
    const { style, zIndex: z } = getTransitionStyles(
      enterTransition,
      enterProgress,
      "incoming",
    );
    transitionStyle = style;
    zIndex = z;
  }

  const textEnterFrame = useChoreography
    ? getTextEnterFrame(
        localBeatFrames,
        phases.introBeats,
        enterTransitionDuration,
        framesPerBeat,
      )
    : enterTransition
      ? enterTransitionDuration + 4
      : 12;

  const textHideStart = Math.max(
    textEnterFrame + 8,
    exitTransition ? exitStart - 6 : durationInFrames,
  );

  const textOpacity = (() => {
    if (frame < textEnterFrame) return 0;
    if (!exitTransition || textHideStart >= durationInFrames - 1) return 1;
    if (frame < textHideStart) return 1;

    const hideEnd = Math.min(textHideStart + 10, durationInFrames);
    if (hideEnd <= textHideStart) return 1;

    return interpolate(frame, [textHideStart, hideEnd], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  })();

  let imageScale = 1;

  if (exitTransition && phases.exitBang !== false) {
    const bangStrength =
      accentStrength != null
        ? pickBangStrengthForAccent(accentStrength, phases.bangStrength ?? 0.14)
        : phases.bangStrength ?? 0.14;
    imageScale = getExitBangScale(
      frame,
      durationInFrames,
      exitTransitionDuration,
      bangStrength,
    );
  }

  const glitchEnter =
    enterTransition === "glitch" && enterProgress < 1;
  const glitchExit = exitTransition === "glitch" && exitProgress > 0;
  const glitchIntensity = glitchEnter
    ? getGlitchIntensity(enterProgress, "incoming")
    : glitchExit
      ? getGlitchIntensity(exitProgress, "outgoing")
      : 0;

  const stripEnter =
    enterTransition &&
    isStripEffect(enterTransition) &&
    enterProgress < 1;

  const tileEnter =
    enterTransition &&
    isTileEffect(enterTransition) &&
    enterProgress < 1;

  const tileExit =
    exitTransition &&
    isTileEffect(exitTransition) &&
    exitProgress > 0;

  if (tileEnter || tileExit) {
    transitionStyle = {};
  }

  const usePan =
    kenBurns &&
    enterProgress >= 1 &&
    !glitchEnter &&
    !glitchExit &&
    !tileEnter &&
    !tileExit &&
    !stripEnter;

  const drift = usePan
    ? getSubtleDriftTransform(
        frame,
        durationInFrames,
        exitTransitionDuration,
        slideIndex,
      )
    : { translateX: 0, translateY: 0, rotate: 0 };

  const flashExit =
    exitTransition && isFlashEffect(exitTransition) && exitProgress > 0;
  const flashEnter =
    enterTransition && isFlashEffect(enterTransition) && enterProgress < 0.95;

  const usesCustomCompose =
    tileEnter || tileExit || glitchEnter || glitchExit || stripEnter;

  const imageTransform = usesCustomCompose
    ? `scale(${imageScale})`
    : undefined;

  const renderImage = () => {
    if (stripEnter && enterTransition && isStripEffect(enterTransition)) {
      return (
        <StripReveal
          image={image}
          progress={enterProgress}
          variant={enterTransition}
          scale={imageScale}
        />
      );
    }

    if (tileExit && exitTransition) {
      return (
        <TileCompose
          image={image}
          progress={1 - exitProgress}
          variant={exitTransition}
          scale={imageScale}
        />
      );
    }

    if (tileEnter && enterTransition) {
      return (
        <TileCompose
          image={image}
          progress={enterProgress}
          variant={enterTransition}
          scale={imageScale}
        />
      );
    }

    if (glitchEnter || glitchExit) {
      return (
        <GlitchImage
          image={image}
          intensity={Math.max(0.15, glitchIntensity)}
          scale={imageScale}
        />
      );
    }

    return (
      <PanningImage
        image={image}
        translateX={drift.translateX}
        translateY={drift.translateY}
        rotate={drift.rotate}
        scale={imageScale}
        width={width}
        height={height}
      />
    );
  };

  return (
    <AbsoluteFill style={{ zIndex }}>
      <AbsoluteFill
        style={{
          ...transitionStyle,
          transform: [transitionStyle.transform, imageTransform]
            .filter(Boolean)
            .join(" "),
        }}
      >
        {renderImage()}
        <AbsoluteFill className="bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      </AbsoluteFill>

      {flashExit && exitTransition ? (
        <FlashOverlay progress={exitProgress} type={exitTransition} />
      ) : null}
      {flashEnter && enterTransition ? (
        <FlashOverlay progress={enterProgress} type={enterTransition} />
      ) : null}

      <AbsoluteFill className="flex flex-col items-start justify-end px-16 pb-20">
        <AnimatedSlideText
          title={title}
          subtitle={subtitle}
          slideIndex={slideIndex}
          localFrame={frame - textEnterFrame}
          hideStartFrame={textHideStart - textEnterFrame}
          baseOpacity={textOpacity}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
