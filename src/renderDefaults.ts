import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type RenderProfile = "fast" | "quality";

/** 1080p — NVENC / H.264 (wyższy = mniej „zgniecionych” cieni). */
export const FAST_RENDER_VIDEO_BITRATE = "16M";

const PROJECT_NVENC_BIN_DIR = path.join(process.cwd(), "tools", "remotion-bin-win");

const WINDOWS_NVENC_BIN_CANDIDATES = [
  PROJECT_NVENC_BIN_DIR,
  "C:/ffmpeg/bin",
  "C:/Program Files/ffmpeg/bin",
] as const;

const ffmpegBinaryName = () =>
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

const directoryHasFfmpeg = (dir: string): boolean =>
  fs.existsSync(path.join(dir, ffmpegBinaryName()));

/** Folder z ffmpeg.exe, ffprobe.exe i remotion.exe (hybrid pod NVENC). */
export const resolveBinariesDirectory = (): string | null => {
  const explicit = process.env.REMOTION_BINARIES_DIRECTORY?.trim();
  if (explicit && directoryHasFfmpeg(explicit)) return explicit;

  if (process.platform !== "win32") return null;

  for (const dir of WINDOWS_NVENC_BIN_CANDIDATES) {
    if (directoryHasFfmpeg(dir)) return dir;
  }

  return null;
};

export const getBinariesDirectory = (): string | null => resolveBinariesDirectory();

export const getRenderProfile = (): RenderProfile =>
  process.env.REMOTION_RENDER_PROFILE === "quality" ? "quality" : "fast";

/** GPU w headless Chrome (ANGLE na Windows). Wyłącz na VPS: REMOTION_GPU_RENDER=0 */
export const isGpuRenderEnabled = (): boolean => {
  if (process.env.REMOTION_GPU_RENDER === "0") return false;
  if (process.env.REMOTION_GPU_RENDER === "1") return true;
  return process.platform === "win32";
};

export const getHardwareAcceleration = (): "disabled" | "if-possible" | "required" => {
  const raw = process.env.REMOTION_HARDWARE_ACCELERATION?.trim();
  if (raw === "disabled" || raw === "if-possible" || raw === "required") {
    return raw;
  }
  if (!isGpuRenderEnabled()) return "disabled";
  return process.env.REMOTION_NVENC_REQUIRED === "1" ? "required" : "if-possible";
};

export const getOpenGlRenderer = (): "angle" | "vulkan" | "egl" | null => {
  if (!isGpuRenderEnabled()) return null;
  const override = process.env.REMOTION_GL?.trim();
  if (override === "angle" || override === "vulkan" || override === "egl") {
    return override;
  }
  if (process.platform === "win32") return "angle";
  if (process.platform === "linux") return "vulkan";
  return null;
};

export const getRenderConcurrency = (): number => {
  const cpus = Math.max(1, os.cpus().length);
  const raw = process.env.REMOTION_CONCURRENCY?.trim();
  if (raw && /^\d+$/.test(raw)) {
    return Math.max(1, Math.min(cpus, parseInt(raw, 10)));
  }
  return Math.max(1, Math.min(cpus, cpus > 2 ? cpus - 2 : cpus));
};

export const buildRemotionRenderCliArgs = (): string[] => {
  const profile = getRenderProfile();
  const args = ["--log=info", `--concurrency=${getRenderConcurrency()}`];

  const gl = getOpenGlRenderer();
  if (gl) args.push(`--gl=${gl}`);

  const hw = getHardwareAcceleration();
  if (hw !== "disabled") {
    args.push(`--hardware-acceleration=${hw}`);
  }

  const binDir = getBinariesDirectory();
  if (binDir) args.push(`--binaries-directory=${binDir}`);

  args.push("--color-space=bt709");

  if (profile === "fast") {
    args.push("--image-format=png");
    args.push(`--video-bitrate=${FAST_RENDER_VIDEO_BITRATE}`);
    args.push("--x264-preset=veryfast");
  } else {
    args.push("--image-format=png", "--crf=18");
  }

  return args;
};

type RemotionConfigLike = {
  setVideoImageFormat: (format: "png" | "jpeg") => void;
  setJpegQuality: (quality: number) => void;
  setCrf: (crf: number) => void;
  setVideoBitrate: (bitrate: string | null) => void;
  setX264Preset: (
    preset:
      | "ultrafast"
      | "superfast"
      | "veryfast"
      | "faster"
      | "fast"
      | "medium"
      | "slow"
      | "slower"
      | "veryslow"
      | "placebo"
      | null,
  ) => void;
  setHardwareAcceleration: (
    option: "disabled" | "if-possible" | "required",
  ) => void;
  setChromiumOpenGlRenderer: (
    renderer: "angle" | "vulkan" | "egl" | "swangle" | "swiftshader" | null,
  ) => void;
  setConcurrency: (concurrency: number | string) => void;
  setDisallowParallelEncoding: (flag: boolean) => void;
  setBinariesDirectory: (directory: string | null) => void;
  setCachingEnabled: (flag: boolean) => void;
  setColorSpace: (colorSpace: "bt709" | "bt601" | "bt2020-ncl" | "default") => void;
};

export const applyRemotionRenderConfig = (Config: RemotionConfigLike) => {
  const profile = getRenderProfile();

  Config.setCachingEnabled(true);
  Config.setDisallowParallelEncoding(false);
  const hw = getHardwareAcceleration();
  if (hw !== "disabled") {
    Config.setHardwareAcceleration(hw);
  }
  Config.setColorSpace("bt709");

  const gl = getOpenGlRenderer();
  if (gl) Config.setChromiumOpenGlRenderer(gl);

  const binDir = getBinariesDirectory();
  if (binDir) Config.setBinariesDirectory(binDir);

  if (process.env.REMOTION_CONCURRENCY?.trim()) {
    Config.setConcurrency(getRenderConcurrency());
  }

  if (profile === "fast") {
    Config.setVideoImageFormat("png");
    Config.setVideoBitrate(FAST_RENDER_VIDEO_BITRATE);
    Config.setX264Preset("veryfast");
  } else {
    Config.setVideoImageFormat("png");
    Config.setCrf(18);
    Config.setVideoBitrate(null);
    Config.setX264Preset(null);
  }
};
