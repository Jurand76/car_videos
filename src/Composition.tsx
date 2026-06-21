import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Slide } from "./Slide";
import {
  FPS,
  getOutroFrames,
  getSlideSequenceDuration,
  getSlideStart,
  getSlideTransitionDuration,
  getSlidesContentEndFrame,
  getTotalDuration,
  PROJECT,
  SLIDES,
} from "./project";
import { getLocalBeatFrames } from "./slideAnimation";
import { getTransitionBetween } from "./transitions";

export const MyComposition = () => {
  const frame = useCurrentFrame();
  const beatTimes = PROJECT.sync.beatTimesSeconds ?? [];
  const outroFrames = getOutroFrames();
  const outroStart = getSlidesContentEndFrame();
  const totalFrames = getTotalDuration(SLIDES.length);

  const fadeOut = interpolate(frame, [outroStart, totalFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const audioVolume = (f: number) => {
    const base = PROJECT.audioVolume;
    if (f < outroStart) return base;
    return interpolate(f, [outroStart, totalFrames], [base, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  };

  return (
    <AbsoluteFill className="bg-black">
      {PROJECT.audio ? (
        <Audio
          src={staticFile(PROJECT.audio)}
          volume={audioVolume}
        />
      ) : null}

      {SLIDES.map((slide, index) => {
        const slideStart = getSlideStart(index);
        const contentDuration = getSlideSequenceDuration(index);
        const isLast = index === SLIDES.length - 1;
        const slideDuration = isLast
          ? contentDuration + outroFrames
          : contentDuration;
        const localBeatFrames = getLocalBeatFrames(
          beatTimes,
          FPS,
          slideStart,
          contentDuration,
        );

        const enterTransition =
          index > 0
            ? (slide.transition ?? getTransitionBetween(index - 1))
            : undefined;
        const exitTransition =
          index < SLIDES.length - 1
            ? (SLIDES[index + 1]?.transition ?? getTransitionBetween(index))
            : undefined;
        const enterOverlap =
          index > 0 ? getSlideTransitionDuration(index - 1) : 0;
        const exitOverlap = getSlideTransitionDuration(index);
        const premountFor = Math.max(enterOverlap, exitOverlap);

        return (
          <Sequence
            key={`${slide.image}-${index}`}
            from={slideStart}
            durationInFrames={slideDuration}
            premountFor={premountFor}
          >
            <Slide
              {...slide}
              slideIndex={index}
              localBeatFrames={localBeatFrames}
              kenBurns={PROJECT.kenBurns}
              enterTransition={enterTransition}
              exitTransition={exitTransition}
              holdFrames={isLast ? outroFrames : 0}
            />
          </Sequence>
        );
      })}

      <AbsoluteFill
        style={{
          backgroundColor: "#000",
          opacity: fadeOut,
          zIndex: 9999,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

export const compositionDuration = getTotalDuration(SLIDES.length);
