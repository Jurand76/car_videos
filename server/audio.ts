import { parseFile } from "music-metadata";
import fs from "fs";
import path from "path";

export type AudioMeta = {
  durationSeconds: number;
  bpm: number | null;
  title: string | null;
};

export type AudioTrack = {
  path: string;
  filename: string;
  title: string | null;
  displayTitle: string;
  durationSeconds: number;
  bpm: number | null;
  url: string;
};

const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);

export const prettifyAudioFilename = (filename: string): string => {
  const base = filename.replace(/\.[^.]+$/, "");
  const cleaned = base.replace(/^\d+-/, "");
  const pretty = cleaned.replace(/[-_]/g, " ").trim();
  return pretty || filename;
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

const scanAudioPaths = (dir: string, prefix: string): string[] => {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (fs.statSync(full).isDirectory()) {
      return scanAudioPaths(full, rel);
    }
    const ext = path.extname(name).toLowerCase();
    if (!AUDIO_EXT.has(ext)) {
      return [];
    }
    return [rel.replace(/\\/g, "/")];
  });
};

export const listAudioTracks = async (publicDir: string): Promise<AudioTrack[]> => {
  const paths = scanAudioPaths(publicDir, "");
  const tracks = await Promise.all(
    paths.map(async (relativePath) => {
      const filename = path.basename(relativePath);
      let meta: AudioMeta = { durationSeconds: 0, bpm: null, title: null };
      try {
        meta = await getAudioMeta(path.join(publicDir, relativePath));
      } catch {
        // brak metadanych
      }
      const displayTitle = meta.title?.trim() || prettifyAudioFilename(filename);
      return {
        path: relativePath,
        filename,
        title: meta.title,
        displayTitle,
        durationSeconds: meta.durationSeconds,
        bpm: meta.bpm,
        url: `/public/${relativePath}`,
      };
    }),
  );

  return tracks.sort((a, b) =>
    a.displayTitle.localeCompare(b.displayTitle, "pl", {
      numeric: true,
      sensitivity: "base",
    }),
  );
};
