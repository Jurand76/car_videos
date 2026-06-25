import { Img, staticFile } from "remotion";
import type { TransitionType } from "../transitions";
import { FrameFill } from "./FrameFill";

/** Jednolity szary na środku przejścia. */
export const COLOR_FADE_GRAY = "#444444";

export const getColorFadeTransitionFrames = (): number => 48;

export const getColorFadeHalfDuration = (): number =>
  getColorFadeTransitionFrames() / 2;

type ColorFadeRole = "outgoing" | "incoming";

const stepsInHalf = (half: number): number => Math.max(1, half - 1);

/** 0→1 w obrębie połowy (wyjście: zasłona #444 narasta, wejście: zasłona opada). */
export const getColorFadeTForLocalFrame = (
  localFrame: number,
  role: ColorFadeRole,
): number => {
  const half = getColorFadeHalfDuration();
  const f = Math.max(0, localFrame);
  const steps = stepsInHalf(half);

  if (role === "outgoing") {
    if (f >= half) return 1;
    return Math.min(1, f / steps);
  }

  if (f < half) return 0;
  return Math.min(1, (f - half) / steps);
};

export const getColorFadeOpacityForLocalFrame = (
  localFrame: number,
  role: ColorFadeRole,
): number => {
  const half = getColorFadeHalfDuration();
  const f = Math.max(0, localFrame);
  if (role === "outgoing") return f < half ? 1 : 0;
  return f >= half ? 1 : 0;
};

export const isColorFadeActiveLocalFrame = (localFrame: number): boolean =>
  localFrame >= 0 && localFrame < getColorFadeTransitionFrames();

export const isColorFadeEffect = (type?: TransitionType) => type === "colorFade";

type ColorFadeTransitionProps = {
  image: string;
  role: ColorFadeRole;
  localFrame: number;
};

export const ColorFadeTransition: React.FC<ColorFadeTransitionProps> = ({
  image,
  role,
  localFrame,
}) => {
  if (!isColorFadeActiveLocalFrame(localFrame)) return null;
  if (getColorFadeOpacityForLocalFrame(localFrame, role) <= 0) return null;

  const t = getColorFadeTForLocalFrame(localFrame, role);
  const veilOpacity = role === "outgoing" ? t : 1 - t;

  return (
    <FrameFill style={{ backgroundColor: COLOR_FADE_GRAY }}>
      <Img
        src={staticFile(image)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center center",
          opacity: 1,
          display: "block",
        }}
      />
      <FrameFill
        style={{
          backgroundColor: COLOR_FADE_GRAY,
          opacity: veilOpacity,
        }}
      />
    </FrameFill>
  );
};
