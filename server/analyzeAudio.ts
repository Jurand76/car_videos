import path from "path";
import { analyzeWithEssentia, type BeatAnalysis } from "./essentiaAnalyze";
import { detectBeatsFromFile } from "./beatDetect";
import { getAudioMeta } from "./audio";

export type { AccentPoint, BeatAnalysis } from "./essentiaAnalyze";
export type { DynamicFeatures } from "./dynamicAnalysis";

export const analyzeAudioFromPublic = async (
  root: string,
  relativePath: string,
) => {
  const fullPath = path.join(root, "public", relativePath);
  return analyzeAudioFile(fullPath);
};

export const analyzeAudioFile = async (
  filePath: string,
): Promise<BeatAnalysis & { durationSeconds: number; title: string | null }> => {
  const meta = await getAudioMeta(filePath);

  try {
    const essentia = await analyzeWithEssentia(filePath, meta.durationSeconds);
    return {
      ...essentia,
      durationSeconds: meta.durationSeconds,
      title: meta.title,
    };
  } catch (error) {
    console.warn(
      "Essentia analysis failed, using legacy detector:",
      error instanceof Error ? error.message : error,
    );
    const legacy = await detectBeatsFromFile(filePath, meta.durationSeconds);
    return {
      ...legacy,
      durationSeconds: meta.durationSeconds,
      title: meta.title,
    };
  }
};

/** Analiza audio z pełną dynamiką (główna funkcja dla Remotion) */
export const analyzeAudioWithDynamics = async (
  filePath: string,
): Promise<BeatAnalysis & { durationSeconds: number; title: string | null }> => {
  return analyzeAudioFile(filePath);
};
