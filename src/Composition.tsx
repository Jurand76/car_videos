import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Slide } from "./Slide";
import {
  FPS,
  getLastSlideTail,
  getOutroRange,
  getSlideSequenceDuration,
  getSlideStart,
  getSlideTransitionDuration,
  getTotalDuration,
  getTransitionEarlyFrames,
  PROJECT,
  SLIDES,
} from "./project";
import { getLocalBeatFrames } from "./slideAnimation";
import { getTransitionBetween } from "./transitions";

export const MyComposition = () => {
  const frame = useCurrentFrame();
  const beatTimes = PROJECT.sync.beatTimesSeconds ?? [];
  const { start: outroStart, end: outroEnd, duration: outroDuration } =
    getOutroRange();

  const outroProgress = interpolate(frame, [outroStart, outroEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const audioVolume = PROJECT.audioVolume * (1 - outroProgress);

  return (
    <AbsoluteFill className="bg-black">
      {PROJECT.audio ? (
        <Audio src={staticFile(PROJECT.audio)} volume={audioVolume} />
      ) : null}

      {SLIDES.map((slide, index) => {
        const slideStart = getSlideStart(index);
        const contentDuration = getSlideSequenceDuration(index);
        const isLast = index === SLIDES.length - 1;
        const tailFrames = isLast ? getLastSlideTail() : 0;
        const holdFrames = isLast ? outroDuration : 0;
        const slideDuration = isLast
          ? contentDuration + tailFrames + holdFrames
          : contentDuration;
        const localBeatFrames = getLocalBeatFrames(
          beatTimes,
          FPS,
          slideStart,
          contentDuration + tailFrames,
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

        const transitionEarlyFrames = getTransitionEarlyFrames(
          index,
          enterTransition,
        );
        const sequenceFrom = slideStart - transitionEarlyFrames;
        const sequenceDuration = slideDuration + transitionEarlyFrames;

        return (
          <Sequence
            key={`${slide.image}-${index}-${contentDuration}-${slide.beats ?? 0}`}
            from={sequenceFrom}
            durationInFrames={sequenceDuration}
            premountFor={premountFor}
          >
            <Slide
              {...slide}
              slideIndex={index}
              localBeatFrames={localBeatFrames}
              kenBurns={PROJECT.kenBurns}
              enterTransition={enterTransition}
              exitTransition={exitTransition}
              holdFrames={holdFrames}
            />
          </Sequence>
        );
      })}

      <AbsoluteFill
        style={{
          backgroundColor: "#000",
          opacity: outroProgress,
          zIndex: 9999,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

export const compositionDuration = getTotalDuration(SLIDES.length);
