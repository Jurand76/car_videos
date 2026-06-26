import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AnimatedSlideText } from "./effects/AnimatedSlideText";
import { FlashOverlay, getFlashImageOpacity, isFlashEffect } from "./effects/FlashOverlay";
import { getGlitchIntensity, GlitchImage } from "./effects/GlitchImage";
import { isBlockEffect, BlockReveal, BLOCK_REVEAL_TOTAL_PROGRESS } from "./effects/BlockReveal";
import { isStripEffect, StripReveal } from "./effects/StripReveal";
import { getSubtleDriftTransform } from "./effects/subtleDrift";
import { PanImageFrame } from "./effects/PanImageFrame";
import { isTileEffect, isTilesInOverlay, TileCompose } from "./effects/TileCompose";
import {
  ColorFadeTransition,
  getColorFadeOpacityForLocalFrame,
  isColorFadeActiveLocalFrame,
  isColorFadeEffect,
} from "./effects/ColorFadeTransition";
import {
  getMosaicOpacityForLocalFrame,
  isMosaicActiveLocalFrame,
  isMosaicEffect,
  MosaicTransition,
} from "./effects/MosaicTransition";
import type { ProjectSlide } from "./projectTypes";
import { PROJECT, getSlideStart, getSlideTransitionDuration, getTransitionEarlyFrames, getTransitionStartFrame } from "./project";
import { getTextEnterFrame } from "./slideAnimation";
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
  /** Ostatnie klatki — zamrożenie obrazu podczas outro. */
  holdFrames?: number;
};

export const Slide: React.FC<SlideProps> = ({
  image,
  title,
  subtitle,
  textEffect,
  slideIndex,
  localBeatFrames,
  enterTransition,
  exitTransition,
  holdFrames = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const contentFrames = Math.max(1, durationInFrames - holdFrames);
  const activeFrame =
    holdFrames > 0 ? Math.min(frame, contentFrames - 1) : frame;
  const enterTransitionDuration =
    slideIndex > 0 ? getSlideTransitionDuration(slideIndex - 1) : 0;
  const exitTransitionDuration = getSlideTransitionDuration(slideIndex);
  const framesPerBeat = PROJECT.sync.framesPerBeat ?? Math.round(fps * 0.4);

  const transitionEarlyFrames = getTransitionEarlyFrames(
    slideIndex,
    enterTransition,
  );
  const contentActiveFrame = activeFrame - transitionEarlyFrames;

  const enterProgress =
    enterTransition !== undefined && enterTransitionDuration > 0
      ? interpolate(contentActiveFrame, [0, enterTransitionDuration], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  /** Nakładki (kafelki, bloki, pasy) — zegar od startu sekwencji, żeby zgadzać się ze starym slajdem. */
  const sequenceEnterProgress =
    enterTransitionDuration > 0
      ? interpolate(activeFrame, [0, enterTransitionDuration], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const isOverlayStyleEnter =
    Boolean(enterTransition) &&
    (isTilesInOverlay(enterTransition) ||
      isBlockEffect(enterTransition) ||
      isStripEffect(enterTransition));

  const overlayEnterProgress = isOverlayStyleEnter
    ? sequenceEnterProgress
    : enterProgress;

  const exitStart = Math.max(0, contentFrames - exitTransitionDuration);
  const exitProgress =
    exitTransition !== undefined && contentFrames > 1
      ? interpolate(activeFrame, [exitStart, contentFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;

  let transitionStyle: React.CSSProperties = {};
  let zIndex = 1;

  if (
    exitProgress > 0 &&
    exitTransition &&
    !isColorFadeEffect(exitTransition) &&
    !isMosaicEffect(exitTransition) &&
    !isTilesInOverlay(exitTransition) &&
    !isBlockEffect(exitTransition) &&
    !isStripEffect(exitTransition)
  ) {
    const { style, zIndex: z } = getTransitionStyles(
      exitTransition,
      exitProgress,
      "outgoing",
    );
    transitionStyle = style;
    zIndex = z;
  } else if (
    enterTransition &&
    enterProgress < 1 &&
    !isColorFadeEffect(enterTransition) &&
    !isMosaicEffect(enterTransition) &&
    !isTilesInOverlay(enterTransition) &&
    !isBlockEffect(enterTransition) &&
    !isStripEffect(enterTransition)
  ) {
    const { style, zIndex: z } = getTransitionStyles(
      enterTransition,
      enterProgress,
      "incoming",
    );
    transitionStyle = style;
    zIndex = z;
  }

  if (exitProgress > 0 && exitTransition && isFlashEffect(exitTransition)) {
    transitionStyle = {
      ...transitionStyle,
      opacity: getFlashImageOpacity(exitProgress, exitTransition, "outgoing"),
    };
  } else if (
    enterTransition &&
    enterProgress < 1 &&
    isFlashEffect(enterTransition)
  ) {
    transitionStyle = {
      ...transitionStyle,
      opacity: getFlashImageOpacity(enterProgress, enterTransition, "incoming"),
    };
  }

  const textEnterDelayBeats =
    PROJECT.sync.textEnterDelayBeats ??
    PROJECT.sync.animationPhases?.introBeats ??
    0;

  const textEnterFrame = getTextEnterFrame(
    localBeatFrames,
    textEnterDelayBeats,
    enterTransitionDuration,
    framesPerBeat,
  );

  const textHideStart = Math.max(
    textEnterFrame + 8,
    exitTransition ? exitStart - 6 : contentFrames,
  );

  const textOpacity = (() => {
    if (contentActiveFrame < textEnterFrame) return 0;
    if (!exitTransition || textHideStart >= contentFrames - 1) return 1;
    if (contentActiveFrame < textHideStart) return 1;

    const hideEnd = Math.min(textHideStart + 10, contentFrames);
    if (hideEnd <= textHideStart) return 1;

    return interpolate(contentActiveFrame, [textHideStart, hideEnd], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  })();

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
    enterTransitionDuration > 0 &&
    activeFrame < enterTransitionDuration;

  const blockEnter =
    enterTransition &&
    isBlockEffect(enterTransition) &&
    enterTransitionDuration > 0 &&
    activeFrame < enterTransitionDuration;

  const stripExit =
    exitTransition &&
    isStripEffect(exitTransition) &&
    exitProgress > 0;

  const blockExit =
    exitTransition &&
    isBlockEffect(exitTransition) &&
    exitProgress > 0;

  const slideStart = getSlideStart(slideIndex);
  const compositionFrame = slideStart + contentActiveFrame;

  const isMosaicEnterType =
    Boolean(enterTransition) &&
    isMosaicEffect(enterTransition) &&
    slideIndex > 0;
  const isMosaicExitType =
    Boolean(exitTransition) && isMosaicEffect(exitTransition);

  const mosaicTransitionIndex = isMosaicEnterType
    ? slideIndex - 1
    : isMosaicExitType
      ? slideIndex
      : -1;

  const mosaicLocal =
    mosaicTransitionIndex >= 0
      ? compositionFrame - getTransitionStartFrame(mosaicTransitionIndex)
      : -1;

  const mosaicEnter =
    isMosaicEnterType && isMosaicActiveLocalFrame(mosaicLocal);

  const mosaicExit =
    isMosaicExitType && isMosaicActiveLocalFrame(mosaicLocal);

  const isColorFadeEnterType =
    Boolean(enterTransition) &&
    isColorFadeEffect(enterTransition) &&
    slideIndex > 0;
  const isColorFadeExitType =
    Boolean(exitTransition) && isColorFadeEffect(exitTransition);

  const colorFadeTransitionIndex = isColorFadeEnterType
    ? slideIndex - 1
    : isColorFadeExitType
      ? slideIndex
      : -1;

  const colorFadeLocal =
    colorFadeTransitionIndex >= 0
      ? compositionFrame - getTransitionStartFrame(colorFadeTransitionIndex)
      : -1;

  const colorFadeEnterActive =
    isColorFadeEnterType && isColorFadeActiveLocalFrame(colorFadeLocal);

  const colorFadeExitActive =
    isColorFadeExitType && isColorFadeActiveLocalFrame(colorFadeLocal);

  const tileEnter =
    enterTransition &&
    isTileEffect(enterTransition) &&
    enterTransitionDuration > 0 &&
    activeFrame < enterTransitionDuration;

  const tileExit =
    exitTransition &&
    isTileEffect(exitTransition) &&
    exitTransition !== "tilesIn" &&
    exitProgress > 0;

  if (tileEnter || tileExit || stripEnter || blockEnter || stripExit || blockExit) {
    transitionStyle = {};
  } else if (mosaicEnter || mosaicExit || colorFadeEnterActive || colorFadeExitActive) {
    const swapOpacity =
      mosaicExit || colorFadeExitActive
        ? mosaicExit
          ? getMosaicOpacityForLocalFrame(mosaicLocal, "outgoing")
          : getColorFadeOpacityForLocalFrame(colorFadeLocal, "outgoing")
        : mosaicEnter
          ? getMosaicOpacityForLocalFrame(mosaicLocal, "incoming")
          : getColorFadeOpacityForLocalFrame(colorFadeLocal, "incoming");
    transitionStyle = {
      ...transitionStyle,
      opacity: swapOpacity,
    };
  }

  const panTransform = getSubtleDriftTransform(
    contentActiveFrame,
    contentFrames - transitionEarlyFrames,
    exitTransitionDuration,
    slideIndex,
  );

  const flashEnter =
    enterTransition && isFlashEffect(enterTransition) && enterProgress < 1;
  const flashExit =
    exitTransition &&
    isFlashEffect(exitTransition) &&
    exitProgress > 0 &&
    !flashEnter;

  const renderImage = () => {
    if (colorFadeExitActive && exitTransition) {
      return (
        <ColorFadeTransition
          image={image}
          role="outgoing"
          localFrame={colorFadeLocal}
        />
      );
    }

    if (colorFadeEnterActive && enterTransition) {
      return (
        <ColorFadeTransition
          image={image}
          role="incoming"
          localFrame={colorFadeLocal}
        />
      );
    }

    if (mosaicExit && exitTransition) {
      return (
        <MosaicTransition
          image={image}
          role="outgoing"
          localFrame={mosaicLocal}
        />
      );
    }

    if (mosaicEnter && enterTransition) {
      return (
        <MosaicTransition
          image={image}
          role="incoming"
          localFrame={mosaicLocal}
        />
      );
    }

    if (blockEnter && enterTransition && isBlockEffect(enterTransition)) {
      const blockProgress =
        overlayEnterProgress * BLOCK_REVEAL_TOTAL_PROGRESS;
      return (
        <BlockReveal
          image={image}
          progress={blockProgress}
          variant={enterTransition}
        />
      );
    }

    if (stripEnter && enterTransition && isStripEffect(enterTransition)) {
      return (
        <StripReveal
          image={image}
          progress={overlayEnterProgress}
          variant={enterTransition}
        />
      );
    }

    if (tileExit && exitTransition) {
      return (
        <TileCompose
          image={image}
          progress={1 - exitProgress}
          variant={exitTransition}
        />
      );
    }

    if (tileEnter && enterTransition) {
      return (
        <TileCompose
          image={image}
          progress={
            isTilesInOverlay(enterTransition)
              ? overlayEnterProgress
              : enterProgress
          }
          variant={enterTransition}
        />
      );
    }

    if (glitchEnter || glitchExit) {
      return (
        <GlitchImage
          image={image}
          intensity={Math.max(0.15, glitchIntensity)}
        />
      );
    }

    return (
      <Img
        src={staticFile(image)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center center",
          display: "block",
        }}
      />
    );
  };

  const overlayEnterActive =
    (tileEnter && enterTransition && isTilesInOverlay(enterTransition)) ||
    (blockEnter && enterTransition && isBlockEffect(enterTransition)) ||
    (stripEnter && enterTransition && isStripEffect(enterTransition));

  const imageBackground =
    colorFadeEnterActive || colorFadeExitActive
      ? "#444444"
      : overlayEnterActive
        ? "transparent"
        : "#000";

  return (
    <AbsoluteFill style={{ zIndex }}>
      <AbsoluteFill
        style={{
          ...transitionStyle,
          transform: transitionStyle.transform,
        }}
      >
        <PanImageFrame
          translateX={panTransform.translateX}
          translateY={panTransform.translateY}
          rotate={panTransform.rotate}
          width={width}
          height={height}
          backgroundColor={imageBackground}
        >
          {renderImage()}
        </PanImageFrame>
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
          textEffect={textEffect}
          localFrame={contentActiveFrame - textEnterFrame}
          hideStartFrame={textHideStart - textEnterFrame}
          baseOpacity={textOpacity}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
