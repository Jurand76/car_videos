import { AbsoluteFill, Img, staticFile } from "remotion";
import { clampPan, getPanOverscan } from "./panRoom";

type PanningImageProps = {
  image: string;
  translateX: number;
  translateY: number;
  rotate: number;
  scale: number;
  width: number;
  height: number;
};

/**
 * Kadr zawsze W×H, clip overflow.
 * Obraz: cover + lekki overscan + translate — pan bez czarnych ram.
 * Exit bang skaluje cały klip od środka (scale >= 1).
 */
export const PanningImage: React.FC<PanningImageProps> = ({
  image,
  translateX,
  translateY,
  rotate,
  scale,
  width,
  height,
}) => {
  const overscan = getPanOverscan(width, height);
  const pan = clampPan(translateX, translateY);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          transform: `rotate(${rotate}deg) scale(${Math.max(1, scale)})`,
          transformOrigin: "center center",
        }}
      >
        <Img
          src={staticFile(image)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center center",
            transform: `translate3d(${pan.translateX}px, ${pan.translateY}px, 0) scale(${overscan})`,
            transformOrigin: "center center",
            display: "block",
            willChange: "transform",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
