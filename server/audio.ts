import { parseFile } from "music-metadata";
import path from "path";

export type AudioMeta = {
  durationSeconds: number;
  bpm: number | null;
  title: string | null;
};

export const getAudioMeta = async (filePath: string): Promise<AudioMeta> => {
  const metadata = await parseFile(filePath);
  const durationSeconds = metadata.format.duration ?? 0;

  const bpmRaw = metadata.common.bpm;
  const bpm =
    typeof bpmRaw === "number" && bpmRaw > 40 && bpmRaw < 240
      ? Math.round(bpmRaw)
      : null;

  return {
    durationSeconds,
    bpm,
    title: metadata.common.title ?? null,
  };
};

export const getAudioMetaFromPublic = async (
  root: string,
  relativePath: string,
): Promise<AudioMeta> => {
  const fullPath = path.join(root, "public", relativePath);
  return getAudioMeta(fullPath);
};
