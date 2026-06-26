/** Domyślna rozdzielczość eksportu / kompozycji (1080p). */
export const DEFAULT_VIDEO_WIDTH = 1920;
export const DEFAULT_VIDEO_HEIGHT = 1080;
export const DEFAULT_VIDEO_FPS = 30;

/** Niższe CRF = lepsza jakość H.264 (typowo 15–23). */
export const VIDEO_RENDER_CRF = 18;

export const ensureVideoResolution = <T extends { width?: number; height?: number }>(
  manifest: T,
): T & { width: number; height: number } => ({
  ...manifest,
  width: DEFAULT_VIDEO_WIDTH,
  height: DEFAULT_VIDEO_HEIGHT,
});
