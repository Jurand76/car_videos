type BatchRenderSettings = {
  phase?: string;
  message?: string;
  error?: string;
  current_index?: number;
  total?: number;
  current_item_id?: string;
  current_category?: string;
  updated_at?: string;
};

type AiRenderSettings = {
  phase?: string;
  message?: string;
  error?: string;
  updated_at?: string;
};

export function getAiRenderProgress(settings: Record<string, unknown> | null): AiRenderSettings | null {
  const raw = settings?.ai_render;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  return raw as AiRenderSettings;
}

export function getBatchRenderProgress(
  settings: Record<string, unknown> | null,
): BatchRenderSettings | null {
  const raw = settings?.batch_render;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  return raw as BatchRenderSettings;
}

/** Pasek dochodzi do ~94% po ~4 min — to tylko wizualizacja, nie limit generowania. */
const PROGRESS_CAP = 94;
const PROGRESS_FULL_SEC = 240;

export function estimateAiProgress(elapsedSec: number, phase?: string): number {
  if (phase === "done") return 100;
  if (phase === "saving") return 98;

  const t = Math.max(0, elapsedSec);
  const ratio = t / PROGRESS_FULL_SEC;
  let percent = PROGRESS_CAP * (1 - Math.exp(-ratio * 1.8));

  switch (phase) {
    case "queued":
      percent = Math.max(percent, Math.min(8, 3 + t * 0.5));
      break;
    case "preparing":
      percent = Math.max(percent, Math.min(16, 8 + t * 0.4));
      break;
    case "openai":
    case "processing":
      percent = Math.max(percent, Math.min(PROGRESS_CAP, 12 + t * 0.28));
      break;
    default:
      percent = Math.min(PROGRESS_CAP, percent * 0.9);
      break;
  }

  return Math.round(Math.min(PROGRESS_CAP, percent) * 10) / 10;
}

export function estimateBatchProgress(
  elapsedSec: number,
  progress: BatchRenderSettings | null,
): number {
  if (progress?.phase === "done") return 100;

  const total = progress?.total ?? 0;
  const current = progress?.current_index ?? 0;
  if (total > 0 && current > 0) {
    const completedShare = (current - 1) / total;
    const itemShare = estimateAiProgress(elapsedSec, progress?.phase) / 100 / total;
    return Math.round(Math.min(PROGRESS_CAP, (completedShare + itemShare) * 100) * 10) / 10;
  }

  return estimateAiProgress(elapsedSec, progress?.phase);
}

export function aiProgressMessage(
  progress: AiRenderSettings | null,
  elapsedSec = 0,
  fallback = "Generuję render AI...",
): string {
  const message = progress?.message?.trim();
  if (message && !(progress?.phase === "queued" && elapsedSec > 4)) {
    return message;
  }
  if (elapsedSec > 4) {
    return "Łączę z GPT Image 2...";
  }
  return message || fallback;
}

export function batchProgressMessage(
  progress: BatchRenderSettings | null,
  elapsedSec = 0,
  fallback = "Przetwarzam serię zdjęć...",
): string {
  const message = progress?.message?.trim();
  if (message) {
    return message;
  }
  if (elapsedSec > 4) {
    return "Łączę z GPT Image 2...";
  }
  return fallback;
}
