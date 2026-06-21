import "./index.css";
import { Composition } from "remotion";
import { MyComposition } from "./Composition";
import { FPS, getTotalDuration, HEIGHT, SLIDES, WIDTH } from "./project";

export const RemotionRoot: React.FC = () => {
  const durationInFrames = getTotalDuration(SLIDES.length);

  return (
    <>
      <Composition
        id="MyComp"
        component={MyComposition}
        durationInFrames={durationInFrames}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{}}
        calculateMetadata={async () => ({
          durationInFrames: getTotalDuration(SLIDES.length),
          fps: FPS,
          width: WIDTH,
          height: HEIGHT,
        })}
      />
    </>
  );
};
