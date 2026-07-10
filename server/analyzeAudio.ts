import fs from "fs";
import path from "path";
import {
  analyzeWithEssentia,
  type BeatAnalysis,
} from "./essentiaAnalyze";
import {detectBeatsFromFile} from "./beatDetect";
import {getAudioMeta} from "./audio";

export type {AccentPoint, BeatAnalysis} from "./essentiaAnalyze";

type AudioResult = BeatAnalysis & {
  durationSeconds: number;
  title: string;
};

const analysisCache = new Map<string, Promise<AudioResult>>();
const MAX_CACHE_ENTRIES = 20;

const buildCacheKey = (filePath: string) => {
  const stat = fs.statSync(filePath);
  return [
    path.resolve(filePath),
    stat.size,
    stat.mtimeMs,
    process.env.ESSENTIA_RHYTHM_METHOD ?? "degara",
    process.env.ESSENTIA_MIN_TEMPO ?? "60",
    process.env.ESSENTIA_MAX_TEMPO ?? "200",
    process.env.ESSENTIA_SUPERFLUX ?? "0",
  ].join("|");
};

const trimCache = () => {
  while (analysisCache.size > MAX_CACHE_ENTRIES) {
    const firstKey = analysisCache.keys().next().value as string | undefined;
    if (!firstKey) return;
    analysisCache.delete(firstKey);
  }
};

export const analyzeAudioFromPublic = async (
  root: string,
  relativePath: string,
) => {
  const fullPath = path.join(root, "public", relativePath);
  return analyzeAudioFile(fullPath);
};

export const analyzeAudioFile = async (
  filePath: string,
): Promise<AudioResult> => {
  const cacheKey = buildCacheKey(filePath);
  const cached = analysisCache.get(cacheKey);

  if (cached) {
    console.info(`[audio] cache hit: ${path.basename(filePath)}`);
    return cached;
  }

  const analysisPromise = (async () => {
    const meta = await getAudioMeta(filePath);

    try {
      const essentia = await analyzeWithEssentia(
        filePath,
        meta.durationSeconds,
      );

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

      const legacy = await detectBeatsFromFile(
        filePath,
        meta.durationSeconds,
      );

      return {
        ...legacy,
        durationSeconds: meta.durationSeconds,
        title: meta.title,
      };
    }
  })();

  analysisCache.set(cacheKey, analysisPromise);
  trimCache();

  try {
    return await analysisPromise;
  } catch (error) {
    analysisCache.delete(cacheKey);
    throw error;
  }
};
