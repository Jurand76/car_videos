import { Img, staticFile } from "remotion";
import { PanImageFrame } from "./PanImageFrame";

type PanningImageProps = {
  image: string;
  translateX: number;
  translateY: number;
  rotate: number;
  scale?: number;
  width: number;
  height: number;
};

export const PanningImage: React.FC<PanningImageProps> = ({
  image,
  translateX,
  translateY,
  rotate,
  scale = 1,
  width,
  height,
}) => (
  <PanImageFrame
    translateX={translateX}
    translateY={translateY}
    rotate={rotate}
    scale={scale}
    width={width}
    height={height}
  >
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
  </PanImageFrame>
);
