import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ProjectManifest } from "../src/projectTypes";
import {
  DEFAULT_VIDEO_FPS,
  DEFAULT_VIDEO_HEIGHT,
  DEFAULT_VIDEO_WIDTH,
} from "../src/videoDefaults";
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
  fps: DEFAULT_VIDEO_FPS,
  width: DEFAULT_VIDEO_WIDTH,
  height: DEFAULT_VIDEO_HEIGHT,
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
    textEnterDelayBeats: 0,
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

const discoverProjectsOnDisk = (userId: string): VideoProjectSummary[] => {
  const dir = userDir(userId);
  if (!fs.existsSync(dir)) return [];

  const index = readIndex(userId);
  const found: VideoProjectSummary[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const file = manifestPath(userId, entry.name);
    if (!fs.existsSync(file)) continue;

    try {
      const manifest = readProject(file);
      const existing = index.projects.find((p) => p.id === entry.name);
      const createdAt =
        existing?.createdAt ?? manifest.generatedAt ?? new Date().toISOString();
      const name =
        existing?.name?.trim() ||
        manifest.slides[0]?.title?.trim() ||
        manifest.prompt?.slice(0, 48).trim() ||
        "Projekt wideo";
      found.push(summaryFromManifest({ id: entry.name, name, createdAt }, manifest));
    } catch {
      // pomijamy uszkodzone manifesty
    }
  }

  return found;
};

/** Uzupełnia projects.json na podstawie folderów z manifest.json. */
const syncProjectIndex = (userId: string): VideoProjectSummary[] => {
  const index = readIndex(userId);
  const onDisk = discoverProjectsOnDisk(userId);
  if (onDisk.length === 0) {
    return index.projects;
  }

  const byId = new Map<string, VideoProjectSummary>();
  for (const project of index.projects) {
    byId.set(project.id, project);
  }
  for (const project of onDisk) {
    const existing = byId.get(project.id);
    byId.set(
      project.id,
      existing
        ? {
            ...project,
            name: existing.name,
            createdAt: existing.createdAt,
          }
        : project,
    );
  }

  const merged = [...byId.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  if (
    merged.length !== index.projects.length ||
    merged.some((project, i) => project.id !== index.projects[i]?.id)
  ) {
    writeIndex(userId, { projects: merged });
  }

  return merged;
};

/**
 * Po resecie bazy konta dostaje nowe userId — przenosi projekty ze starego katalogu.
 */
const adoptForeignProjects = (userId: string): boolean => {
  const usersRoot = path.join(ROOT, "generated", "video-users");
  if (!fs.existsSync(usersRoot)) return false;

  let adopted = false;
  for (const entry of fs.readdirSync(usersRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === userId) continue;

    const foreign = discoverProjectsOnDisk(entry.name);
    if (foreign.length === 0) continue;

    const fromDir = userDir(entry.name);
    const toDir = userDir(userId);
    fs.mkdirSync(toDir, { recursive: true });

    for (const project of foreign) {
      const from = path.join(fromDir, project.id);
      const to = path.join(toDir, project.id);
      if (!fs.existsSync(to)) {
        fs.cpSync(from, to, { recursive: true });
      }
    }

    adopted = true;
    console.warn(
      `[video] Odtworzono ${foreign.length} projektów z poprzedniego konta (${entry.name} → ${userId}).`,
    );
  }

  return adopted;
};

const listAllDiskProjects = (): VideoProjectSummary[] => {
  const usersRoot = path.join(ROOT, "generated", "video-users");
  if (!fs.existsSync(usersRoot)) return [];

  const byId = new Map<string, VideoProjectSummary>();
  for (const entry of fs.readdirSync(usersRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const project of discoverProjectsOnDisk(entry.name)) {
      byId.set(project.id, project);
    }
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
};

const findManifestFile = (userId: string, projectId: string): string | null => {
  const direct = manifestPath(userId, projectId);
  if (fs.existsSync(direct)) return direct;

  if (process.env.NODE_ENV === "production") return null;

  const usersRoot = path.join(ROOT, "generated", "video-users");
  if (!fs.existsSync(usersRoot)) return null;

  for (const entry of fs.readdirSync(usersRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = manifestPath(entry.name, projectId);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
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

export const recoverVideoProjectsForUser = (userId: string): VideoProjectSummary[] => {
  adoptForeignProjects(userId);
  let projects = syncProjectIndex(userId);

  if (projects.length === 0) {
    importLegacyProject(userId);
    projects = syncProjectIndex(userId);
  }

  if (projects.length === 0) {
    console.warn(
      `[video] Brak projektów dla userId=${userId}. Na dysku sprawdź: npm run video:scan`,
    );
  }

  return projects;
};

export const listVideoProjects = (userId: string): VideoProjectSummary[] => {
  let projects = syncProjectIndex(userId);

  if (projects.length === 0) {
    projects = recoverVideoProjectsForUser(userId);
  }

  if (projects.length === 0 && process.env.NODE_ENV !== "production") {
    const onDisk = listAllDiskProjects();
    if (onDisk.length > 0) {
      adoptForeignProjects(userId);
      projects = syncProjectIndex(userId);
      if (projects.length === 0) {
        writeIndex(userId, { projects: onDisk });
        projects = onDisk;
      }
    }
  }

  return projects;
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
  const file = findManifestFile(userId, projectId);
  if (!file) {
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
