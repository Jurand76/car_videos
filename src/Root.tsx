import "./index.css";
import { Composition } from "remotion";
import { compositionDuration, MyComposition } from "./Composition";
import { FPS, HEIGHT, WIDTH } from "./project";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MyComp"
        component={MyComposition}
        durationInFrames={compositionDuration}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{}}
      />
    </>
  );
};
