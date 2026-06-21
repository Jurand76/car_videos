import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";

type GlitchImageProps = {
  image: string;
  intensity: number;
  scale?: number;
};

export const GlitchImage: React.FC<GlitchImageProps> = ({
  image,
  intensity,
  scale = 1,
}) => {
  const shakeX = Math.sin(intensity * 80) * 12 * intensity;
  const shakeY = Math.cos(intensity * 60) * 6 * intensity;
  const split = 8 * intensity;
  const slice = Math.floor(intensity * 6);

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale}) translate(${shakeX}px, ${shakeY}px)`,
      }}
    >
      <Img
        src={staticFile(image)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `translateX(${split}px)`,
          filter: `hue-rotate(${slice * 40}deg) saturate(1.4)`,
        }}
      />
      <AbsoluteFill
        style={{
          mixBlendMode: "screen",
          opacity: 0.55 * intensity,
        }}
      >
        <Img
          src={staticFile(image)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `translateX(${-split * 1.5}px)`,
            filter: "hue-rotate(90deg)",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          mixBlendMode: "multiply",
          opacity: 0.35 * intensity,
        }}
      >
        <Img
          src={staticFile(image)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `translateY(${split}px)`,
            filter: "hue-rotate(-70deg)",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `repeating-linear-gradient(
            0deg,
            rgba(255,255,255,${0.08 * intensity}) 0px,
            rgba(255,255,255,${0.08 * intensity}) 2px,
            transparent 2px,
            transparent 6px
          )`,
          opacity: intensity,
        }}
      />
    </AbsoluteFill>
  );
};

export const getGlitchIntensity = (progress: number, role: "incoming" | "outgoing") => {
  if (role === "incoming") {
    return interpolate(progress, [0, 0.15, 0.45, 0.7, 1], [1, 1, 0.6, 0.2, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  return interpolate(progress, [0, 0.3, 0.6, 1], [0, 0.7, 1, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};
