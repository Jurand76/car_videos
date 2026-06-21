import type { TransitionType } from "./transitions";
import type { MusicSyncInfo, SlideTiming } from "./sync";

export type SlideLocation = "exterior" | "interior" | "detail" | "other";

export type ProjectSlide = {
  image: string;
  title: string;
  subtitle?: string;
  /** Zewnątrz / wnętrze — pomaga AI dopasować opis. */
  location?: SlideLocation;
  /** Co przedstawia zdjęcie, np. „fotel kierowcy”, „bagażnik”. */
  sceneLabel?: string;
  transition?: TransitionType;
  /** Ile taktów trwa ten slajd (zmienny rytm). */
  beats?: number;
  /** Siła akcentu przy wyjściu (0–1) — zoom i przejście. */
  accentStrength?: number;
};

export type ContentMode = "manual" | "fromText";

export type ProjectManifest = {
  version: 1;
  prompt: string;
  /** manual = teksty z panelu, fromText = AI z opisu auta */
  contentMode?: ContentMode;
  infoText?: string;
  generatedAt: string;
  generatedBy: "heuristic" | "deepseek" | "openai";
  fps: number;
  width: number;
  height: number;
  slideDuration: number;
  transitionDuration: number;
  kenBurns: boolean;
  audio: string | null;
  audioVolume: number;
  slides: ProjectSlide[];
  sync: MusicSyncInfo;
  slideTimings?: SlideTiming[];
  totalDurationFrames?: number;
};
