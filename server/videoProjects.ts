import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ProjectManifest } from "../src/projectTypes";
import { readProject, writeProject } from "./generate";

export type VideoProjectSummary = {
  id: string;
  name: string;
  status: "draft" | "ready";
  createdAt: string;
  updatedAt: string;
  slideCount: number;
  thumbnailImage: string | null;
  prompt: string;
};

type ProjectIndex = {
  projects: VideoProjectSummary[];
};

const ROOT = path.join(__dirname, "..");
const LEGACY_PROJECT_PATH = path.join(ROOT, "generated/project.json");

const userDir = (userId: string) =>
  path.join(ROOT, "generated", "video-users", userId);

const indexPath = (userId: string) => path.join(userDir(userId), "projects.json");

const manifestPath = (userId: string, projectId: string) =>
  path.join(userDir(userId), projectId, "manifest.json");

const emptyManifest = (): ProjectManifest => ({
  version: 1,
  prompt: "",
  contentMode: "manual",
  generatedAt: new Date().toISOString(),
  generatedBy: "heuristic",
  fps: 30,
  width: 1280,
  height: 720,
  slideDuration: 90,
  transitionDuration: 20,
  kenBurns: true,
  audio: null,
  audioVolume: 0.7,
  slides: [],
  sync: {
    enabled: true,
    mode: "beats",
    beatsPerSlide: 16,
  },
});

const readIndex = (userId: string): ProjectIndex => {
  const file = indexPath(userId);
  if (!fs.existsSync(file)) {
    return { projects: [] };
  }
  return JSON.parse(fs.readFileSync(file, "utf-8")) as ProjectIndex;
};

const writeIndex = (userId: string, index: ProjectIndex) => {
  fs.mkdirSync(userDir(userId), { recursive: true });
  fs.writeFileSync(indexPath(userId), JSON.stringify(index, null, 2), "utf-8");
};

const summaryFromManifest = (
  meta: Pick<VideoProjectSummary, "id" | "name" | "createdAt">,
  manifest: ProjectManifest,
): VideoProjectSummary => {
  const thumbnailImage = manifest.slides[0]?.image ?? null;
  const hasContent = manifest.slides.length > 0 || Boolean(manifest.prompt?.trim());
  return {
    id: meta.id,
    name: meta.name,
    createdAt: meta.createdAt,
    updatedAt: new Date().toISOString(),
    status: manifest.slides.length > 0 && manifest.prompt?.trim() ? "ready" : hasContent ? "draft" : "draft",
    slideCount: manifest.slides.length,
    thumbnailImage,
    prompt: manifest.prompt ?? "",
  };
};

const importLegacyProject = (userId: string): VideoProjectSummary | null => {
  if (!fs.existsSync(LEGACY_PROJECT_PATH)) {
    return null;
  }
  try {
    const manifest = readProject(LEGACY_PROJECT_PATH);
    const id = randomUUID();
    const createdAt = manifest.generatedAt ?? new Date().toISOString();
    const name =
      manifest.slides[0]?.title?.trim() ||
      manifest.prompt?.slice(0, 48).trim() ||
      "Projekt wideo";
    const summary = summaryFromManifest({ id, name, createdAt }, manifest);
    writeProject(manifest, manifestPath(userId, id));
    writeIndex(userId, { projects: [summary] });
    return summary;
  } catch {
    return null;
  }
};

export const listVideoProjects = (userId: string): VideoProjectSummary[] => {
  const index = readIndex(userId);
  if (index.projects.length === 0) {
    const imported = importLegacyProject(userId);
    if (imported) {
      return [imported];
    }
  }
  return [...index.projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
};

export const createVideoProject = (
  userId: string,
  name?: string,
): VideoProjectSummary => {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const manifest = emptyManifest();
  const projectName = name?.trim() || `Projekt wideo ${new Date().toLocaleDateString("pl-PL")}`;
  const summary = summaryFromManifest({ id, name: projectName, createdAt }, manifest);

  writeProject(manifest, manifestPath(userId, id));
  const index = readIndex(userId);
  index.projects.unshift(summary);
  writeIndex(userId, index);
  return summary;
};

export const getVideoProjectManifest = (
  userId: string,
  projectId: string,
): ProjectManifest | null => {
  const file = manifestPath(userId, projectId);
  if (!fs.existsSync(file)) {
    return null;
  }
  return readProject(file);
};

export const saveVideoProjectManifest = (
  userId: string,
  projectId: string,
  manifest: ProjectManifest,
  name?: string,
): VideoProjectSummary | null => {
  const index = readIndex(userId);
  const existing = index.projects.find((p) => p.id === projectId);
  if (!existing) {
    return null;
  }

  writeProject(manifest, manifestPath(userId, projectId));
  const updated = summaryFromManifest(
    {
      id: projectId,
      name: name?.trim() || existing.name,
      createdAt: existing.createdAt,
    },
    manifest,
  );
  index.projects = index.projects.map((p) => (p.id === projectId ? updated : p));
  writeIndex(userId, index);
  return updated;
};

export const renameVideoProject = (
  userId: string,
  projectId: string,
  name: string,
): VideoProjectSummary | null => {
  const index = readIndex(userId);
  const existing = index.projects.find((p) => p.id === projectId);
  if (!existing) {
    return null;
  }
  const manifest = getVideoProjectManifest(userId, projectId) ?? emptyManifest();
  const updated = summaryFromManifest(
    { id: projectId, name: name.trim() || existing.name, createdAt: existing.createdAt },
    manifest,
  );
  index.projects = index.projects.map((p) => (p.id === projectId ? updated : p));
  writeIndex(userId, index);
  return updated;
};

export const deleteVideoProject = (userId: string, projectId: string): boolean => {
  const index = readIndex(userId);
  const next = index.projects.filter((p) => p.id !== projectId);
  if (next.length === index.projects.length) {
    return false;
  }
  writeIndex(userId, { projects: next });
  const dir = path.join(userDir(userId), projectId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return true;
};

export const getLegacyProjectPath = () => LEGACY_PROJECT_PATH;
