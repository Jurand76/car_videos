import type { TransitionType } from "./transitions";
import type { TextEffect } from "./effects/textEffects";
import type { MusicSyncInfo, SlideTiming } from "./sync";

export type FlowAiConfig = {
  /** Nadpisanie system promptu dla generowania flow. Puste = domyślny szablon. */
  systemPrompt?: string;
  temperature?: number;
  /** Użytkownik zapisał konfigurację AI w tym projekcie (≠ globalne domyślne). */
  customized?: boolean;
};

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
  /** Animacja wejścia tekstu — przypisywana przy generowaniu flow. */
  textEffect?: TextEffect;
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
  /** Czy przy generowaniu brać wszystkie obrazki z public/. */
  useAllPublicImages?: boolean;
  sync: MusicSyncInfo;
  slideTimings?: SlideTiming[];
  totalDurationFrames?: number;
  /** Dozwolone przejścia slajdów — brak = wszystkie. */
  allowedTransitions?: TransitionType[];
  /** Dozwolone animacje tekstu — brak = wszystkie. */
  allowedTextEffects?: TextEffect[];
  /** Parametry DeepSeek / OpenAI przy generowaniu flow animacji. */
  flowAiConfig?: FlowAiConfig;
};
