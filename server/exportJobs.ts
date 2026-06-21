import { randomUUID } from "node:crypto";

export type ExportJobStatus =
  | "queued"
  | "bundling"
  | "rendering"
  | "encoding"
  | "done"
  | "error";

export type ExportJob = {
  id: string;
  userId: string;
  projectId: string;
  downloadName: string;
  outputPath: string;
  status: ExportJobStatus;
  progress: number;
  renderedFrames: number;
  totalFrames: number;
  message: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

const jobs = new Map<string, ExportJob>();

const clampProgress = (value: number) => Math.min(1, Math.max(0, value));

export const createExportJob = (input: {
  userId: string;
  projectId: string;
  downloadName: string;
  outputPath: string;
}): ExportJob => {
  const job: ExportJob = {
    id: randomUUID(),
    userId: input.userId,
    projectId: input.projectId,
    downloadName: input.downloadName,
    outputPath: input.outputPath,
    status: "queued",
    progress: 0,
    renderedFrames: 0,
    totalFrames: 0,
    message: "Kolejka renderu…",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
};

export const getExportJob = (
  jobId: string,
  userId: string,
  projectId: string,
): ExportJob | null => {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId || job.projectId !== projectId) {
    return null;
  }
  return job;
};

export const getExportJobById = (jobId: string): ExportJob | null =>
  jobs.get(jobId) ?? null;

export const updateExportJob = (
  jobId: string,
  patch: Partial<
    Pick<
      ExportJob,
      | "status"
      | "progress"
      | "renderedFrames"
      | "totalFrames"
      | "message"
      | "error"
    >
  >,
) => {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
};

export const completeExportJob = (jobId: string) => {
  updateExportJob(jobId, {
    status: "done",
    progress: 1,
    message: "Render zakończony — pobieranie pliku…",
  });
};

export const failExportJob = (jobId: string, error: string) => {
  updateExportJob(jobId, {
    status: "error",
    error,
    message: error,
  });
};

export const removeExportJob = (jobId: string) => {
  jobs.delete(jobId);
};

export const parseRemotionLogChunk = (
  chunk: string,
  current: Pick<ExportJob, "status" | "progress" | "renderedFrames" | "totalFrames">,
): Partial<
  Pick<
    ExportJob,
    "status" | "progress" | "renderedFrames" | "totalFrames" | "message"
  >
> | null => {
  const text = chunk.replace(/\r/g, "\n");
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  let next = { ...current };
  let changed = false;

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (/bundl|webpack|building/.test(lower)) {
      next.status = "bundling";
      next.progress = Math.max(next.progress, 0.05);
      next.message = "Bundlowanie projektu Remotion…";
      changed = true;
      continue;
    }

    const frameMatch =
      line.match(/(?:rendered|rendering|encoded|encoding|muxing)[^\d]*(\d+)\s*[/]\s*(\d+)/i) ??
      line.match(/(\d+)\s*[/]\s*(\d+)/);
    if (frameMatch) {
      const rendered = Number(frameMatch[1]);
      const total = Number(frameMatch[2]);
      if (total > 0 && rendered >= 0) {
        next.renderedFrames = rendered;
        next.totalFrames = total;
        const ratio = rendered / total;
        if (/encod|mux|stitch/i.test(line)) {
          next.status = "encoding";
          next.progress = clampProgress(0.82 + ratio * 0.16);
          next.message = `Enkodowanie ${rendered}/${total}…`;
        } else {
          next.status = "rendering";
          next.progress = clampProgress(0.12 + ratio * 0.68);
          next.message = `Render klatek ${rendered}/${total}…`;
        }
        changed = true;
      }
    }

    const pctMatch = line.match(/(\d{1,3})%/);
    if (pctMatch) {
      const pct = Number(pctMatch[1]);
      if (Number.isFinite(pct)) {
        next.progress = clampProgress(Math.max(next.progress, pct / 100));
        changed = true;
      }
    }

    if (/stitch|mux|encoding|encoded|merging/.test(lower) && next.status !== "rendering") {
      next.status = "encoding";
      next.message = "Enkodowanie wideo…";
      next.progress = Math.max(next.progress, 0.85);
      changed = true;
    }
  }

  return changed ? next : null;
};

export const exportJobToJson = (job: ExportJob) => ({
  jobId: job.id,
  status: job.status,
  progress: job.progress,
  renderedFrames: job.renderedFrames,
  totalFrames: job.totalFrames,
  message: job.message,
  error: job.error,
  downloadName: job.downloadName,
});
