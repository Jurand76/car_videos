import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { Slide } from "./Slide";
import {
  FPS,
  getSlideSequenceDuration,
  getSlideStart,
  getSlideTransitionDuration,
  getTotalDuration,
  PROJECT,
  SLIDES,
} from "./project";
import { getLocalBeatFrames } from "./slideAnimation";
import { getTransitionBetween } from "./transitions";

export const MyComposition = () => {
  const beatTimes = PROJECT.sync.beatTimesSeconds ?? [];

  return (
    <AbsoluteFill className="bg-black">
      {PROJECT.audio ? (
        <Audio
          src={staticFile(PROJECT.audio)}
          volume={() => PROJECT.audioVolume}
        />
      ) : null}

      {SLIDES.map((slide, index) => {
        const slideStart = getSlideStart(index);
        const slideDuration = getSlideSequenceDuration(index);
        const localBeatFrames = getLocalBeatFrames(
          beatTimes,
          FPS,
          slideStart,
          slideDuration,
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
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const compositionDuration = getTotalDuration(SLIDES.length);
