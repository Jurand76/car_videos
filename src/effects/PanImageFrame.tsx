import { AbsoluteFill } from "remotion";
import type { ReactNode } from "react";
import { clampPan, getPanOverscan } from "./panRoom";

export type PanTransform = {
  translateX: number;
  translateY: number;
  rotate: number;
  scale?: number;
};

type PanImageFrameProps = PanTransform & {
  width: number;
  height: number;
  children: ReactNode;
  backgroundColor?: string;
};

/**
 * Kadr W×H z overscanem i translate — ten sam układ co przy panie Ken Burns.
 * Efekty przejść renderują się wewnątrz, żeby pasować do tego, co widzi użytkownik.
 */
export const PanImageFrame: React.FC<PanImageFrameProps> = ({
  translateX,
  translateY,
  rotate,
  scale = 1,
  width,
  height,
  children,
  backgroundColor = "#000",
}) => {
  const overscan = getPanOverscan(width, height);
  const pan = clampPan(translateX, translateY);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          transform: `rotate(${rotate}deg) scale(${Math.max(1, scale)})`,
          transformOrigin: "center center",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            transform: `translate3d(${pan.translateX}px, ${pan.translateY}px, 0) scale(${overscan})`,
            transformOrigin: "center center",
            willChange: "transform",
          }}
        >
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};
