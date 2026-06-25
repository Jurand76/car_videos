import type { CSSProperties, ReactNode } from "react";

type FrameFillProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/** Wypełnia rodzica (np. PanImageFrame) — nie całą kompozycję jak AbsoluteFill. */
export const FrameFill: React.FC<FrameFillProps> = ({
  children,
  className,
  style,
}) => (
  <div
    className={className}
    style={{
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      ...style,
    }}
  >
    {children}
  </div>
);
