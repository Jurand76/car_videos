import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { pipeline } from "node:stream/promises";
import { getAiStatus, loadProjectEnv } from "./env";
import { analyzeAudioFile } from "./analyzeAudio";
import { getAudioMeta, listAudioTracks } from "./audio";
import {
  generateProject,
  generateSlideDescriptions,
  readProject,
  writeProject,
  type GenerateInput,
} from "./generate";
import { mergeSlidesWithPublicImages } from "./publicImages";
import { requireVideoAuth, requireVideoAuthApi } from "./videoAuth";
import {
  createVideoProject,
  deleteVideoProject,
  getVideoProjectManifest,
  listVideoProjects,
  renameVideoProject,
  saveVideoProjectManifest,
} from "./videoProjects";
import {
  cleanupExportFile,
  createExportOutputPath,
  renderProjectVideo,
  sanitizeExportFilename,
} from "./renderExport";
import {
  completeExportJob,
  createExportJob,
  exportJobToJson,
  failExportJob,
  getExportJob,
  removeExportJob,
} from "./exportJobs";
import {
  DEFAULT_FLOW_AI_TEMPERATURE,
  getDefaultFlowSystemPrompt,
} from "./flowAiConfig";

loadProjectEnv();

const HUB_URL = process.env.HUB_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
const PHOTOS_WEB_URL = process.env.PHOTOS_WEB_URL ?? "http://localhost:3010";
const PHOTOS_API_URL = process.env.PHOTOS_API_URL ?? "http://localhost:8010";
const STUDIO_URL = process.env.STUDIO_URL ?? "http://localhost:3000";
const PORT = Number(process.env.PORT ?? 4000);
const ROOT = path.join(__dirname, "..");
const PROJECT_PATH = path.join(ROOT, "generated/project.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
const AUDIO_UPLOADS_DIR = path.join(UPLOADS_DIR, "audio");
const PANEL_DIR = path.join(ROOT, "panel");
const HUB_DIR = path.join(ROOT, "hub");

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, "exterior"), { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, "interior"), { recursive: true });
fs.mkdirSync(AUDIO_UPLOADS_DIR, { recursive: true });
fs.mkdirSync(path.dirname(PROJECT_PATH), { recursive: true });

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const location = String((req.body as { location?: string }).location ?? "");
    let dir = UPLOADS_DIR;
    if (location === "exterior") {
      dir = path.join(UPLOADS_DIR, "exterior");
    } else if (location === "interior") {
      dir = path.join(UPLOADS_DIR, "interior");
    }
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(AUDIO_UPLOADS_DIR, { recursive: true });
    cb(null, AUDIO_UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const audioUpload = multer({ storage: audioStorage, limits: { fileSize: 50 * 1024 * 1024 } });

const listAssets = () => {
  const scan = (dir: string, prefix: string) => {
    if (!fs.existsSync(dir)) {
      return [];
    }
    return fs.readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (fs.statSync(full).isDirectory()) {
        return scan(full, rel);
      }
      return [rel.replace(/\\/g, "/")];
    });
  };

  return scan(PUBLIC_DIR, "").filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return IMAGE_EXT.has(ext) || AUDIO_EXT.has(ext);
  });
};

const corsOrigins = (
  process.env.CORS_ORIGINS ?? `${HUB_URL},${PHOTOS_WEB_URL},http://localhost:4000`
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.use(
  cors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use("/public", express.static(PUBLIC_DIR));

app.get("/hub/config.js", (_req, res) => {
  res
    .type("application/javascript")
    .send(`window.__AUTKA_PHOTOS_URL__=${JSON.stringify(PHOTOS_WEB_URL)};`);
});

app.use("/hub", express.static(HUB_DIR));

app.get("/video", requireVideoAuth, (_req, res) => {
  res.set("Cache-Control", "no-store, must-revalidate");
  res.sendFile(path.join(PANEL_DIR, "index.html"));
});
app.use(
  "/video",
  (_req, res, next) => {
    res.set("Cache-Control", "no-store, must-revalidate");
    next();
  },
  express.static(PANEL_DIR),
);

app.get("/", (_req, res) => {
  res.redirect(`${PHOTOS_WEB_URL}/login`);
});

app.get("/api/health", (_req, res) => {
  const ai = getAiStatus();
  res.json({
    ok: true,
    aiEnabled: ai.enabled,
    aiProvider: ai.provider,
    aiModel: ai.model,
    studioUrl: STUDIO_URL,
    hubUrl: `${PHOTOS_WEB_URL}/hub`,
    photosUrl: `${PHOTOS_WEB_URL}/dashboard`,
    photosWebUrl: PHOTOS_WEB_URL,
    loginUrl: `${PHOTOS_WEB_URL}/login`,
    signOutUrl: `${PHOTOS_WEB_URL}/api/auth/signout`,
    flowAiDefaults: {
      systemPrompt: getDefaultFlowSystemPrompt(),
      temperature: DEFAULT_FLOW_AI_TEMPERATURE,
    },
  });
});

app.get("/api/me", requireVideoAuthApi, (req, res) => {
  res.json({ user: req.videoUser });
});

app.post("/api/logout", (_req, res) => {
  res.clearCookie("videoAccess", { sameSite: "lax" });
  res.json({
    ok: true,
    loginUrl: `${PHOTOS_WEB_URL}/login`,
    signOutUrl: `${PHOTOS_WEB_URL}/api/auth/signout`,
  });
});

app.get("/api/project", requireVideoAuthApi, (req, res) => {
  const projectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const userId = req.videoUser!.id;

  if (projectId) {
    const manifest = getVideoProjectManifest(userId, projectId);
    if (!manifest) {
      res.status(404).json({ error: "Nie znaleziono projektu wideo." });
      return;
    }
    writeProject(manifest, PROJECT_PATH);
    res.json({ ...manifest, id: projectId });
    return;
  }

  try {
    const project = readProject(PROJECT_PATH);
    res.json(project);
  } catch {
    res.status(404).json({ error: "Wybierz projekt wideo z listy." });
  }
});

app.get("/api/video-projects", requireVideoAuthApi, (req, res) => {
  res.json({ projects: listVideoProjects(req.videoUser!.id) });
});

app.post("/api/video-projects", requireVideoAuthApi, (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name : undefined;
  const project = createVideoProject(req.videoUser!.id, name);
  res.status(201).json({ project });
});

app.patch("/api/video-projects/:id", requireVideoAuthApi, (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name : undefined;
  if (!name?.trim()) {
    res.status(400).json({ error: "Podaj nazwę projektu." });
    return;
  }
  const project = renameVideoProject(req.videoUser!.id, req.params.id, name);
  if (!project) {
    res.status(404).json({ error: "Nie znaleziono projektu." });
    return;
  }
  res.json({ project });
});

app.put("/api/video-projects/:id/manifest", requireVideoAuthApi, (req, res) => {
  const userId = req.videoUser!.id;
  const projectId = req.params.id;
  if (!getVideoProjectManifest(userId, projectId)) {
    res.status(404).json({ error: "Nie znaleziono projektu." });
    return;
  }
  const manifest = req.body as import("../src/projectTypes").ProjectManifest;
  if (!manifest || !Array.isArray(manifest.slides)) {
    res.status(400).json({ error: "Nieprawidłowy manifest." });
    return;
  }
  writeProject(manifest, PROJECT_PATH);
  const project = saveVideoProjectManifest(userId, projectId, manifest);
  res.json({ ok: true, project, projectId });
});

app.delete("/api/video-projects/:id", requireVideoAuthApi, (req, res) => {
  const ok = deleteVideoProject(req.videoUser!.id, req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Nie znaleziono projektu." });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/video-projects/:id/export", requireVideoAuthApi, (req, res) => {
  const userId = req.videoUser!.id;
  const projectId = req.params.id;
  const manifest = getVideoProjectManifest(userId, projectId);

  if (!manifest) {
    res.status(404).json({ error: "Nie znaleziono projektu wideo." });
    return;
  }

  if (!manifest.slides?.length) {
    res.status(400).json({ error: "Dodaj slajdy przed eksportem wideo." });
    return;
  }

  const summary = listVideoProjects(userId).find((item) => item.id === projectId);
  const downloadName = `${sanitizeExportFilename(summary?.name ?? "wideo-autka")}.mp4`;
  const outputPath = createExportOutputPath(projectId);
  const job = createExportJob({
    userId,
    projectId,
    downloadName,
    outputPath,
  });

  res.status(202).json(exportJobToJson(job));

  void renderProjectVideo(manifest, outputPath, job)
    .then(() => {
      completeExportJob(job.id);
    })
    .catch((error) => {
      failExportJob(
        job.id,
        error instanceof Error ? error.message : "Nie udało się wyrenderować wideo.",
      );
      cleanupExportFile(outputPath);
    });
});

app.get("/api/video-projects/:id/export/:jobId", requireVideoAuthApi, (req, res) => {
  const userId = req.videoUser!.id;
  const { id: projectId, jobId } = req.params;
  const job = getExportJob(jobId, userId, projectId);

  if (!job) {
    res.status(404).json({ error: "Nie znaleziono zadania eksportu." });
    return;
  }

  res.json(exportJobToJson(job));
});

app.get(
  "/api/video-projects/:id/export/:jobId/file",
  requireVideoAuthApi,
  async (req, res) => {
    const userId = req.videoUser!.id;
    const { id: projectId, jobId } = req.params;
    const job = getExportJob(jobId, userId, projectId);

    if (!job) {
      res.status(404).json({ error: "Nie znaleziono zadania eksportu." });
      return;
    }

    if (job.status === "error") {
      res.status(500).json({ error: job.error ?? "Render wideo nieudany." });
      return;
    }

    if (job.status !== "done") {
      res.status(409).json({ error: "Render wideo jeszcze trwa." });
      return;
    }

    if (!fs.existsSync(job.outputPath)) {
      res.status(404).json({ error: "Plik wideo nie jest już dostępny." });
      return;
    }

    try {
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(job.downloadName)}`,
      );
      await pipeline(fs.createReadStream(job.outputPath), res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : "Nie udało się pobrać pliku wideo.",
        });
      }
    } finally {
      cleanupExportFile(job.outputPath);
      removeExportJob(job.id);
    }
  },
);

app.get("/api/assets", (_req, res) => {
  res.json({ assets: listAssets() });
});

app.get("/api/audio", async (_req, res) => {
  try {
    const tracks = await listAudioTracks(PUBLIC_DIR);
    res.json({ tracks });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Nie udało się wczytać biblioteki audio.",
    });
  }
});

app.post("/api/upload/images", upload.array("images", 30), (req, res) => {
  const files = req.files;
  if (!files || !Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "Nie przesłano obrazków." });
    return;
  }

  const uploaded = files.map((file) => {
    const relative = path
      .relative(PUBLIC_DIR, file.path)
      .replace(/\\/g, "/");
    return {
      filename: file.filename,
      path: relative,
      url: `/public/${relative}`,
      location: String((req.body as { location?: string }).location ?? ""),
    };
  });

  res.json({ uploaded });
});

app.post("/api/upload/audio", audioUpload.single("audio"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Nie przesłano pliku audio." });
    return;
  }

  let meta = {
    durationSeconds: 0,
    bpm: null as number | null,
    title: null as string | null,
  };
  let beatAnalysis = null as {
    bpm: number;
    beatCount: number;
    accentCount: number;
    confidence: number;
    analyzer: "essentia" | "legacy";
  } | null;

  try {
    meta = await getAudioMeta(file.path);
  } catch {
    // brak metadanych
  }

  try {
    const analysis = await analyzeAudioFile(file.path);
    beatAnalysis = {
      bpm: analysis.bpm,
      beatCount: analysis.beatTimesSeconds.length,
      accentCount: analysis.accentPoints.filter((a) => a.strength >= 0.55).length,
      confidence: analysis.confidence,
      analyzer: analysis.analyzer,
    };
  } catch (error) {
    console.warn(
      "Beat detection failed:",
      error instanceof Error ? error.message : error,
    );
  }

  const relative = path.relative(PUBLIC_DIR, file.path).replace(/\\/g, "/");

  res.json({
    audio: {
      filename: file.filename,
      path: relative,
      url: `/public/${relative}`,
      durationSeconds: meta.durationSeconds,
      bpm: meta.bpm,
      title: meta.title,
      beatAnalysis,
    },
  });
});

app.post("/api/analyze-audio", async (req, res) => {
  try {
    const { path: relativePath } = req.body as { path?: string };
    if (!relativePath) {
      res.status(400).json({ error: "Brak ścieżki audio." });
      return;
    }
    const analysis = await analyzeAudioFile(path.join(PUBLIC_DIR, relativePath));
    res.json({
      bpm: analysis.bpm,
      beatCount: analysis.beatTimesSeconds.length,
      accentCount: analysis.accentPoints.filter((a) => a.strength >= 0.55).length,
      confidence: analysis.confidence,
      analyzer: analysis.analyzer,
      durationSeconds: analysis.durationSeconds,
      beatTimesSeconds: analysis.beatTimesSeconds,
      beatStrengths: analysis.beatStrengths,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Analiza nieudana",
    });
  }
});

app.post("/api/generate-descriptions", requireVideoAuthApi, async (req, res) => {
  try {
    const {
      projectId,
      infoText,
      slides,
      useAllPublicImages,
    } = req.body as GenerateInput & { projectId?: string };

    if (!projectId) {
      res.status(400).json({ error: "Brak identyfikatora projektu wideo." });
      return;
    }

    const userId = req.videoUser!.id;
    const existingManifest = getVideoProjectManifest(userId, projectId);
    if (!existingManifest) {
      res.status(404).json({ error: "Nie znaleziono projektu wideo." });
      return;
    }

    if (!infoText?.trim()) {
      res.status(400).json({
        error: "W trybie „AI z opisu” wklej opis auta / parametry techniczne.",
      });
      return;
    }

    const useAllPublic = useAllPublicImages !== false;
    const incomingSlides = slides ?? [];
    const { slides: mergedSlides, added, removed } = mergeSlidesWithPublicImages(
      incomingSlides,
      PUBLIC_DIR,
      useAllPublic,
    );

    if (!mergedSlides.length) {
      res.status(400).json({
        error: "Brak obrazków w public/. Wrzuć pliki JPG/PNG do public/ lub uploads/.",
      });
      return;
    }

    const updatedSlides = await generateSlideDescriptions({
      prompt: existingManifest.prompt ?? "",
      contentMode: "fromText",
      infoText: infoText.trim(),
      slides: mergedSlides,
      audio: existingManifest.audio ?? null,
    });

    const manifest = {
      ...existingManifest,
      contentMode: "fromText" as const,
      infoText: infoText.trim(),
      slides: updatedSlides,
      generatedAt: new Date().toISOString(),
    };

    writeProject(manifest, PROJECT_PATH);
    saveVideoProjectManifest(userId, projectId, manifest);

    res.json({
      ok: true,
      projectId,
      project: manifest,
      slides: updatedSlides,
      slidesAdded: added,
      slidesRemoved: removed,
      message: `Opisy slajdów wygenerowane (${updatedSlides.length} slajdów).`,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Błąd generowania opisów",
    });
  }
});

app.post("/api/generate", requireVideoAuthApi, async (req, res) => {
  try {
    const {
      projectId,
      prompt,
      contentMode,
      infoText,
      slides,
      audio,
      bpm,
      beatsPerSlide,
      textEnterDelayBeats,
      audioDurationSeconds,
      syncToMusic,
      syncMode,
      useAllPublicImages,
      allowedTransitions,
      allowedTextEffects,
      beatTimesSeconds,
      beatStrengths,
      analyzer,
      confidence,
      flowAiConfig,
    } = req.body as GenerateInput & { projectId?: string };

    if (!projectId) {
      res.status(400).json({ error: "Brak identyfikatora projektu wideo." });
      return;
    }

    const userId = req.videoUser!.id;
    if (!getVideoProjectManifest(userId, projectId)) {
      res.status(404).json({ error: "Nie znaleziono projektu wideo." });
      return;
    }

    if (!prompt?.trim()) {
      res.status(400).json({ error: "Prompt jest wymagany." });
      return;
    }

    const useAllPublic = useAllPublicImages !== false;
    const incomingSlides = slides ?? [];
    const { slides: mergedSlides, added, removed } =
      mergeSlidesWithPublicImages(
        incomingSlides,
        PUBLIC_DIR,
        useAllPublic,
      );

    if (!mergedSlides.length) {
      res.status(400).json({
        error: "Brak obrazków w public/. Wrzuć pliki JPG/PNG do public/ lub uploads/.",
      });
      return;
    }

    const mode = contentMode ?? "manual";

    const manifest = await generateProject({
      prompt: prompt.trim(),
      contentMode: mode,
      infoText: infoText?.trim() ?? null,
      useAllPublicImages: useAllPublic,
      slides: mergedSlides,
      audio: audio ?? null,
      bpm: bpm ?? null,
      beatsPerSlide: beatsPerSlide ?? undefined,
      textEnterDelayBeats: textEnterDelayBeats ?? undefined,
      audioDurationSeconds: audioDurationSeconds ?? null,
      syncToMusic: syncToMusic ?? true,
      syncMode: syncMode ?? "beats",
      allowedTransitions: allowedTransitions ?? undefined,
      allowedTextEffects: allowedTextEffects ?? undefined,
      beatTimesSeconds: beatTimesSeconds ?? undefined,
      beatStrengths: beatStrengths ?? undefined,
      analyzer: analyzer ?? undefined,
      confidence: confidence ?? undefined,
      flowAiConfig: flowAiConfig ?? undefined,
    });

    writeProject(manifest, PROJECT_PATH);
    saveVideoProjectManifest(userId, projectId, manifest);

    res.json({
      ok: true,
      projectId,
      project: manifest,
      slideCount: manifest.slides.length,
      slidesAdded: added,
      slidesRemoved: removed,
      message:
        added > 0 || removed > 0
          ? `Projekt zapisany (${manifest.slides.length} slajdów, +${added}${removed > 0 ? `, usunięto ${removed} brakujących` : ""}). Remotion Studio przeładuje podgląd po zapisie project.json.`
          : "Projekt zapisany — Remotion Studio powinno przeładować podgląd. Jeśli timing się nie zmienił, odśwież kartę Studio (F5).",
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Błąd generowania",
    });
  }
});

app.listen(PORT, () => {
  const ai = getAiStatus();
  console.log(`AUTKA.PL hub:     ${PHOTOS_WEB_URL}/hub`);
  console.log(`Panel wideo:      http://localhost:${PORT}/video`);
  console.log(`Remotion Studio:${STUDIO_URL}`);
  if (ai.enabled) {
    console.log(`AI: ${ai.provider} (${ai.model})`);
  } else {
    console.log(
      "AI: heurystyka — dodaj klucz do project.env (patrz project.env.example)",
    );
  }
});
