import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ProjectManifest } from "../src/projectTypes";
import { writeProject } from "./generate";

const ROOT = path.join(__dirname, "..");
const PROJECT_PATH = path.join(ROOT, "generated/project.json");
const EXPORTS_DIR = path.join(ROOT, "generated/exports");
const COMPOSITION_ID = "MyComp";

let renderQueue: Promise<void> = Promise.resolve();

export const sanitizeExportFilename = (name: string): string => {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w\sąćęłńóśźżĄĆĘŁŃÓŚŹŻ.-]+/gi, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (cleaned || "wideo-autka").slice(0, 80);
};

const runRemotionCli = (outputPath: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const args = ["remotion", "render", COMPOSITION_ID, outputPath, "--log=info"];
    const child = spawn("npx", args, {
      cwd: ROOT,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(`[remotion] ${chunk.toString()}`);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve();
        return;
      }
      reject(
        new Error(
          stderr.trim() ||
            `Render Remotion zakończył się kodem ${code ?? "unknown"}.`,
        ),
      );
    });
  });

export const renderProjectVideo = async (
  manifest: ProjectManifest,
  outputPath: string,
): Promise<void> => {
  const run = async () => {
    if (!manifest.slides?.length) {
      throw new Error("Projekt nie ma slajdów do wyrenderowania.");
    }

    writeProject(manifest, PROJECT_PATH);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    await runRemotionCli(outputPath);
  };

  const task = renderQueue.then(run);
  renderQueue = task.catch(() => {});
  return task;
};

export const createExportOutputPath = (projectId: string): string => {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  return path.join(EXPORTS_DIR, `${projectId}-${Date.now()}.mp4`);
};

export const cleanupExportFile = (filePath: string) => {
  fs.unlink(filePath, () => {});
};
