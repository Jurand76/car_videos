/** Rezerwa kadru na pan — bez wychodzenia poza bitmapę. */
export const PAN_ROOM_X = 50;
export const PAN_ROOM_Y = 35;

/** Minimalne lekkie zbliżenie, żeby pan ±PAN_ROOM nie odsłaniał czerni. */
export const getPanOverscan = (width: number, height: number): number =>
  Math.max(
    1 + (PAN_ROOM_X * 2) / Math.max(1, width),
    1 + (PAN_ROOM_Y * 2) / Math.max(1, height),
    1.02,
  );

export const clampPan = (
  translateX: number,
  translateY: number,
): { translateX: number; translateY: number } => ({
  translateX: Math.max(-PAN_ROOM_X, Math.min(PAN_ROOM_X, translateX)),
  translateY: Math.max(-PAN_ROOM_Y, Math.min(PAN_ROOM_Y, translateY)),
});
