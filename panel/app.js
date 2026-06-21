/** @typedef {"exterior" | "interior" | "detail" | "other"} SlideLocation */
/** @typedef {{ image: string, title: string, subtitle?: string, location?: SlideLocation, sceneLabel?: string, beats?: number }} Slide */

/** @type {Slide[]} */
let slides = [];
/** @type {string | null} */
let audioPath = null;
/** @type {number | null} */
let audioDurationSeconds = null;
/** @type {number | null} */
let detectedBpm = null;
/** @type {{ bpm: number, beatCount: number, confidence: number, accentCount?: number, analyzer?: string } | null} */
let beatAnalysis = null;
/** @type {string | null} */
let activeProjectId = null;
/** @type {{ id: string, name: string, status: string, updatedAt: string, slideCount: number, thumbnailImage: string | null, prompt: string }[]} */
let videoProjects = [];
/** @type {{ id: string, name: string } | null} */
let deleteProjectTarget = null;
/** @type {{ path: string, filename: string, title: string | null, displayTitle: string, durationSeconds: number, bpm: number | null }[]} */
let availableAudioTracks = [];
/** @type {boolean} */
let audioAnalysisPending = false;
/** @type {Record<string, unknown> | null} */
let persistedManifestMeta = null;
/** Klucz ustawień rytmu z ostatniego «Generuj flow» — omija fałszywe niezgodności BPM/beatów. */
let lastFlowTimingKey = null;

const ALL_GRAPHIC_EFFECTS = [
  "flash", "glitch", "mosaic", "tilesIn", "shatter", "shockwave", "strobeCut",
  "tilesRadial", "zoomSpin", "rgbSplit", "spinIn", "pixelate", "kaleidFlip",
  "stripsHorizontal", "stripsVertical", "wipeLeft", "pushLeft", "zoomIn", "flip",
  "slideLeft", "rotateCw", "blur", "squeeze", "slideRight", "zoomOut", "wipeRight",
  "slideUp", "pushRight", "fade", "slideDown", "wipeUp", "rotateCcw", "wipeDown",
];

const ALL_TEXT_EFFECTS = [
  "boomIn", "mosaicIn", "shatterIn", "glitchIn", "popIn", "waveIn", "stampIn",
  "elasticIn", "slideUp", "scaleIn", "blurIn", "slideLeft",
];

const GRAPHIC_EFFECT_LABELS = {
  flash: "Błysk",
  glitch: "Glitch",
  mosaic: "Mozaika",
  tilesIn: "Kafelki",
  shatter: "Rozbicie",
  shockwave: "Fala uderzeniowa",
  strobeCut: "Stroboskop",
  tilesRadial: "Kafelki radialne",
  zoomSpin: "Zoom + obrót",
  rgbSplit: "Rozszczep RGB",
  spinIn: "Wjazd obrotowy",
  pixelate: "Pikselizacja",
  kaleidFlip: "Kalejdoskop",
  stripsHorizontal: "Pasy poziome",
  stripsVertical: "Pasy pionowe",
  wipeLeft: "Zasłona w lewo",
  pushLeft: "Przesunięcie w lewo",
  zoomIn: "Przybliżenie",
  flip: "Przerzucenie",
  slideLeft: "Slajd w lewo",
  rotateCw: "Obrót zgodnie z zegarem",
  blur: "Rozmycie",
  squeeze: "Ściskanie",
  slideRight: "Slajd w prawo",
  zoomOut: "Oddalenie",
  wipeRight: "Zasłona w prawo",
  slideUp: "Slajd w górę",
  pushRight: "Przesunięcie w prawo",
  fade: "Przenikanie",
  slideDown: "Slajd w dół",
  wipeUp: "Zasłona w górę",
  rotateCcw: "Obrót przeciwnie",
  wipeDown: "Zasłona w dół",
};

const TEXT_EFFECT_LABELS = {
  boomIn: "Wybuch",
  mosaicIn: "Mozaika",
  shatterIn: "Rozbicie",
  glitchIn: "Glitch",
  popIn: "Pop",
  waveIn: "Fala",
  stampIn: "Stempel",
  elasticIn: "Elastyczny",
  slideUp: "Wjazd w górę",
  scaleIn: "Powiększenie",
  blurIn: "Rozmycie",
  slideLeft: "Wjazd z lewej",
};

/** @type {Set<string>} */
let selectedGraphicEffects = new Set(ALL_GRAPHIC_EFFECTS);
/** @type {Set<string>} */
let selectedTextEffects = new Set(ALL_TEXT_EFFECTS);
/** @type {Set<string> | null} */
let graphicEffectsDraft = null;
/** @type {Set<string> | null} */
let textEffectsDraft = null;

const getEffectLabel = (id, kind) =>
  kind === "graphic"
    ? GRAPHIC_EFFECT_LABELS[id] ?? id
    : TEXT_EFFECT_LABELS[id] ?? id;

const getSelectedGraphicEffects = () => [...selectedGraphicEffects];
const getSelectedTextEffects = () => [...selectedTextEffects];

const setSelectedGraphicEffects = (ids) => {
  selectedGraphicEffects = new Set(
    ids.filter((id) => ALL_GRAPHIC_EFFECTS.includes(id)),
  );
  if (!selectedGraphicEffects.size) {
    selectedGraphicEffects = new Set(ALL_GRAPHIC_EFFECTS);
  }
};

const setSelectedTextEffects = (ids) => {
  selectedTextEffects = new Set(
    ids.filter((id) => ALL_TEXT_EFFECTS.includes(id)),
  );
  if (!selectedTextEffects.size) {
    selectedTextEffects = new Set(ALL_TEXT_EFFECTS);
  }
};

const formatEffectsPreview = (ids, kind, max = 4) => {
  if (!ids.length) return "Brak wybranych efektów";
  const labels = ids.map((id) => getEffectLabel(id, kind));
  if (labels.length <= max) return labels.join(" · ");
  const shown = labels.slice(0, max).join(" · ");
  return `${shown} · +${labels.length - max}`;
};

const updateEffectsSummary = () => {
  const graphicIds = getSelectedGraphicEffects();
  const textIds = getSelectedTextEffects();
  const graphicSummary = $("graphic-effects-summary");
  const textSummary = $("text-effects-summary");
  const graphicChips = $("graphic-effects-chips");
  const textChips = $("text-effects-chips");

  if (graphicSummary) {
    graphicSummary.textContent = `${graphicIds.length} / ${ALL_GRAPHIC_EFFECTS.length}`;
  }
  if (textSummary) {
    textSummary.textContent = `${textIds.length} / ${ALL_TEXT_EFFECTS.length}`;
  }
  if (graphicChips) {
    graphicChips.textContent = formatEffectsPreview(graphicIds, "graphic");
  }
  if (textChips) {
    textChips.textContent = formatEffectsPreview(textIds, "text");
  }
};

const renderEffectsCheckboxGrid = (containerId, allEffects, draft, kind) => {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = allEffects
    .map((id) => {
      const checked = draft.has(id) ? "checked" : "";
      const label = getEffectLabel(id, kind);
      return `
        <label class="effect-check">
          <input type="checkbox" value="${id}" ${checked} />
          <span>${label}</span>
        </label>
      `;
    })
    .join("");
};

const readEffectsDraftFromGrid = (containerId) => {
  const container = $(containerId);
  if (!container) return new Set();
  const ids = [...container.querySelectorAll('input[type="checkbox"]:checked')].map(
    (input) => input.value,
  );
  return new Set(ids);
};

const openGraphicEffectsModal = () => {
  graphicEffectsDraft = new Set(selectedGraphicEffects);
  renderEffectsCheckboxGrid(
    "graphic-effects-list",
    ALL_GRAPHIC_EFFECTS,
    graphicEffectsDraft,
    "graphic",
  );
  const modal = $("graphic-effects-modal");
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
};

const closeGraphicEffectsModal = () => {
  graphicEffectsDraft = null;
  const modal = $("graphic-effects-modal");
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
};

const openTextEffectsModal = () => {
  textEffectsDraft = new Set(selectedTextEffects);
  renderEffectsCheckboxGrid(
    "text-effects-list",
    ALL_TEXT_EFFECTS,
    textEffectsDraft,
    "text",
  );
  const modal = $("text-effects-modal");
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
};

const closeTextEffectsModal = () => {
  textEffectsDraft = null;
  const modal = $("text-effects-modal");
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
};

const saveGraphicEffectsDraft = () => {
  const draft = readEffectsDraftFromGrid("graphic-effects-list");
  if (!draft.size) {
    setStatus("Wybierz co najmniej jeden efekt graficzny.", "err");
    return;
  }
  selectedGraphicEffects = draft;
  updateEffectsSummary();
  closeGraphicEffectsModal();
};

const saveTextEffectsDraft = () => {
  const draft = readEffectsDraftFromGrid("text-effects-list");
  if (!draft.size) {
    setStatus("Wybierz co najmniej jeden efekt tekstu.", "err");
    return;
  }
  selectedTextEffects = draft;
  updateEffectsSummary();
  closeTextEffectsModal();
};

const resetEffectsSelection = () => {
  selectedGraphicEffects = new Set(ALL_GRAPHIC_EFFECTS);
  selectedTextEffects = new Set(ALL_TEXT_EFFECTS);
  updateEffectsSummary();
};

const applyEffectsFromManifest = (project) => {
  if (project?.allowedTransitions?.length) {
    setSelectedGraphicEffects(project.allowedTransitions);
  } else {
    selectedGraphicEffects = new Set(ALL_GRAPHIC_EFFECTS);
  }
  if (project?.allowedTextEffects?.length) {
    setSelectedTextEffects(project.allowedTextEffects);
  } else {
    selectedTextEffects = new Set(ALL_TEXT_EFFECTS);
  }
  updateEffectsSummary();
};

const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const prettifyAudioFilename = (filename) => {
  const base = String(filename).replace(/\.[^.]+$/, "");
  const cleaned = base.replace(/^\d+-/, "");
  const pretty = cleaned.replace(/[-_]/g, " ").trim();
  return pretty || filename;
};

const getAudioDisplayTitle = (path) => {
  const track = availableAudioTracks.find((item) => item.path === path);
  if (track) {
    return track.displayTitle || track.title || prettifyAudioFilename(track.filename);
  }
  if (!path) return "";
  return prettifyAudioFilename(path.split("/").pop() ?? path);
};

const renderAudioSelect = () => {
  const select = $("audio-select");
  if (!select) return;
  const current = audioPath ?? "";
  select.innerHTML = '<option value="">Bez muzyki</option>';
  for (const track of availableAudioTracks) {
    const option = document.createElement("option");
    option.value = track.path;
    let label = track.displayTitle || prettifyAudioFilename(track.filename);
    if (track.durationSeconds > 0) {
      label += ` (${formatDuration(track.durationSeconds)})`;
    }
    option.textContent = label;
    select.appendChild(option);
  }
  if (current && !availableAudioTracks.some((item) => item.path === current)) {
    const option = document.createElement("option");
    option.value = current;
    option.textContent = getAudioDisplayTitle(current);
    select.appendChild(option);
  }
  select.value = current;
};

const loadAudioLibrary = async () => {
  try {
    const res = await fetch("/api/audio");
    if (!res.ok) return;
    const data = await res.json();
    availableAudioTracks = data.tracks ?? [];
    renderAudioSelect();
  } catch {
    // biblioteka opcjonalna przy starcie
  }
};

const setAudioAnalysisPending = (pending) => {
  audioAnalysisPending = pending;
  const select = $("audio-select");
  if (select) select.disabled = pending;
  $("audio-picker")?.classList.toggle("audio-picker--analyzing", pending);
  updateAudioMeta();
};

const applyAudioTrack = async (path, { analyze = true, silent = false } = {}) => {
  if (!path) {
    audioPath = null;
    audioDurationSeconds = null;
    detectedBpm = null;
    beatAnalysis = null;
    renderAudioSelect();
    updateAudioMeta();
    return;
  }

  const track = availableAudioTracks.find((item) => item.path === path);
  if (path !== persistedManifestMeta?.audio) {
    invalidateDerivedTiming();
  }
  audioPath = path;
  audioDurationSeconds = track?.durationSeconds || null;
  detectedBpm = track?.bpm || null;
  beatAnalysis = null;
  renderAudioSelect();

  if (!analyze) {
    updateAudioMeta();
    return;
  }

  setAudioAnalysisPending(true);
  if (!silent) setStatus("Analizuję beaty...");
  try {
    const res = await fetch("/api/analyze-audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Analiza nieudana");
    audioDurationSeconds = data.durationSeconds || audioDurationSeconds;
    detectedBpm = data.bpm || detectedBpm;
    beatAnalysis = {
      bpm: data.bpm,
      beatCount: data.beatCount,
      accentCount: data.accentCount,
      confidence: data.confidence,
      analyzer: data.analyzer,
      beatTimesSeconds: data.beatTimesSeconds ?? null,
      beatStrengths: data.beatStrengths ?? null,
    };
    if (!$("bpm").value) {
      $("bpm").placeholder = `wykryto ${data.bpm} BPM`;
    }
    if (!silent) {
      setStatus(
        `Analiza (${data.analyzer === "essentia" ? "Essentia" : "legacy"}): ${data.bpm} BPM, ${data.beatCount} beatów.`,
        "ok",
      );
    }
  } catch (error) {
    if (!silent) {
      setStatus(
        error instanceof Error ? error.message : "Nie udało się przeanalizować audio.",
        "error",
      );
    }
  } finally {
    setAudioAnalysisPending(false);
  }
};

const updateSyncPanelVisibility = () => {
  const panel = $("assets-sync");
  const layout = document.querySelector(".assets-layout");
  if (!panel) return;
  const hasTempo =
    Boolean(beatAnalysis?.bpm) ||
    Boolean(detectedBpm) ||
    Boolean(audioDurationSeconds && audioDurationSeconds > 0);
  panel.hidden = !(audioPath && hasTempo);
  layout?.classList.toggle("assets-layout--single", panel.hidden);
};

const updateAudioMeta = () => {
  const meta = $("audio-meta");
  const beatMeta = $("beat-meta");
  if (!audioPath) {
    meta.textContent = "";
    beatMeta.textContent = "";
    updateSyncPanelVisibility();
    return;
  }
  const parts = [];
  if (audioDurationSeconds) {
    parts.push(`Długość: ${formatDuration(audioDurationSeconds)}`);
  }
  if (detectedBpm) {
    parts.push(`Tag ID3 BPM: ${detectedBpm}`);
  }
  meta.textContent = parts.join(" · ");

  beatMeta.classList.toggle("beat-meta--loading", audioAnalysisPending);

  if (audioAnalysisPending) {
    beatMeta.textContent = "Trwa detekcja beatów (Essentia)…";
  } else if (beatAnalysis) {
    const analyzer =
      beatAnalysis.analyzer === "essentia" ? "Essentia" : "legacy";
    const accents =
      beatAnalysis.accentCount != null
        ? ` · ${beatAnalysis.accentCount} mocnych akcentów`
        : "";
    beatMeta.textContent = `Detekcja (${analyzer}): ~${beatAnalysis.bpm} BPM · ${beatAnalysis.beatCount} beatów${accents} · pewność ${Math.round(beatAnalysis.confidence * 100)}%`;
  } else if ($("sync-mode")?.value === "beats") {
    beatMeta.textContent = "Wybierz utwór z listy lub wrzuć plik MP3";
  } else {
    beatMeta.textContent = "";
  }

  updateSyncPanelVisibility();
};

const $ = (id) => document.getElementById(id);

/** Origin-absolute URL do pliku w public/ (niezależnie od ścieżki panelu). */
const publicAssetUrl = (relativePath) => {
  const clean = String(relativePath).replace(/\\/g, "/").replace(/^\/+/, "");
  return `${window.location.origin}/public/${clean}`;
};

const getProjectIdFromUrl = () => new URLSearchParams(window.location.search).get("project");

const setProjectInUrl = (projectId) => {
  const url = new URL(window.location.href);
  if (projectId) {
    url.searchParams.set("project", projectId);
  } else {
    url.searchParams.delete("project");
  }
  window.history.replaceState({}, "", url);
};

const formatPlDateTime = (iso) => {
  try {
    return new Date(iso).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const projectStatusLabel = (status) => {
  if (status === "ready") return "Gotowy";
  return "Szkic";
};

const showProjectsView = () => {
  $("view-projects").hidden = false;
  $("view-editor").hidden = true;
  document.title = "AUTKA.PL — Videoprezentacja";
  setProjectInUrl(null);
  activeProjectId = null;
  persistedManifestMeta = null;
  lastFlowTimingKey = null;
  updateSaveProjectButton();
};

const showEditorView = (project) => {
  $("view-projects").hidden = true;
  $("view-editor").hidden = false;
  $("editor-project-title").textContent = project.name;
  $("editor-project-name-input").value = project.name;
  $("editor-project-meta").textContent = `${project.slideCount} slajdów · ostatnia zmiana ${formatPlDateTime(project.updatedAt)}`;
  document.title = `${project.name} — AUTKA.PL Wideo`;
};

const TRASH_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="project-card-delete-icon" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;

const IMAGE_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="project-card-thumb-icon" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m21 15-5-5L8 18"/></svg>`;

const renderProjectThumbnail = (thumbnailImage, className) => {
  if (!thumbnailImage) {
    return `<div class="${className}-placeholder">${IMAGE_PLACEHOLDER_SVG}</div>`;
  }
  return `<img src="${publicAssetUrl(thumbnailImage)}" alt="" loading="lazy" decoding="async" />`;
};

const renderVideoLibrary = () => {
  const library = $("video-library-grid");
  if (!library) return;
  library.innerHTML =
    '<div class="empty">Brak gotowych renderów. Po wyrenderowaniu wideo kafelki pojawią się tutaj i otworzą Remotion Studio.</div>';
};

const renderProjectsDashboard = () => {
  const list = $("user-projects-list");
  const errorEl = $("projects-error");

  renderVideoLibrary();

  if (!videoProjects.length) {
    list.innerHTML =
      '<div class="empty">Nie masz jeszcze żadnych projektów wideo. Kliknij „Nowy projekt wideo”.</div>';
    return;
  }

  if (errorEl) errorEl.hidden = true;

  list.innerHTML = videoProjects
    .map(
      (project) => `
      <article class="project-card" data-project-id="${project.id}">
        <div class="project-card-body">
          <button type="button" class="project-card-open" data-open-project="${project.id}">
            <div class="project-card-title">${escapeHtml(project.name)}</div>
            <div class="project-card-meta">Ostatnia zmiana: ${escapeHtml(formatPlDateTime(project.updatedAt))}</div>
          </button>
          <div class="project-card-badges">
            <span class="project-badge project-badge--video">Wideo</span>
            <span class="project-badge project-badge--status">${escapeHtml(projectStatusLabel(project.status))}</span>
            <button type="button" class="project-card-delete" data-delete-project="${project.id}" aria-label="Usuń projekt ${escapeHtml(project.name)}">${TRASH_ICON_SVG}</button>
          </div>
        </div>
        <div class="project-card-thumb">
          ${renderProjectThumbnail(project.thumbnailImage, "project-card-thumb")}
        </div>
      </article>
    `,
    )
    .join("");

  list.querySelectorAll("[data-open-project]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openProject(btn.getAttribute("data-open-project"));
    });
  });
  list.querySelectorAll("[data-delete-project]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const project = videoProjects.find((item) => item.id === btn.getAttribute("data-delete-project"));
      if (project) openDeleteProjectModal(project);
    });
  });
};

const loadVideoProjects = async () => {
  const res = await fetch("/api/video-projects");
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Nie udało się wczytać projektów wideo.");
  }
  videoProjects = data.projects ?? [];
  renderProjectsDashboard();
};

const createVideoProject = async () => {
  const res = await fetch("/api/video-projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Nie udało się utworzyć projektu.");
  }
  videoProjects.unshift(data.project);
  renderProjectsDashboard();
  await openProject(data.project.id);
};

const getTextEnterDelayBeats = () =>
  Number($("text-enter-delay")?.value ?? 0);

const buildFlowTimingKey = () =>
  JSON.stringify({
    audio: audioPath ?? null,
    slideCount: slides.length,
    syncEnabled: Boolean($("sync-to-music")?.checked),
    syncMode: $("sync-mode")?.value ?? "beats",
    beatsPerSlide: Number($("beats-per-slide")?.value) || 16,
    textEnterDelayBeats: getTextEnterDelayBeats(),
    bpm: $("bpm")?.value.trim()
      ? Number($("bpm").value)
      : Math.round(beatAnalysis?.bpm ?? detectedBpm ?? 0) || null,
  });

const markFlowTimingFresh = () => {
  lastFlowTimingKey = buildFlowTimingKey();
};

const invalidateDerivedTiming = () => {
  lastFlowTimingKey = null;
  if (!persistedManifestMeta) return;
  persistedManifestMeta = {
    ...persistedManifestMeta,
    slideTimings: undefined,
    totalDurationFrames: undefined,
    sync: persistedManifestMeta.sync
      ? {
          ...persistedManifestMeta.sync,
          beatTimesSeconds: undefined,
          slideTransitionDurations: undefined,
          cutTimesSeconds: undefined,
        }
      : persistedManifestMeta.sync,
  };
  if (beatAnalysis) {
    beatAnalysis = {
      ...beatAnalysis,
      beatTimesSeconds: null,
      beatStrengths: null,
    };
  }
};

const isFlowTimingFresh = () => {
  if (!$("sync-to-music")?.checked) {
    return Boolean(persistedManifestMeta?.slideTimings?.length || !audioPath);
  }
  if (!persistedManifestMeta?.slideTimings?.length) return false;
  if (!lastFlowTimingKey) return false;
  return buildFlowTimingKey() === lastFlowTimingKey;
};

const buildSyncFromEditor = () => {
  const prevSync = persistedManifestMeta?.sync ?? {};
  const audioUnchanged = Boolean(audioPath && persistedManifestMeta?.audio === audioPath);
  const sync = {
    enabled: $("sync-to-music").checked,
    mode: $("sync-mode").value,
    beatsPerSlide: Number($("beats-per-slide").value) || 16,
    textEnterDelayBeats: getTextEnterDelayBeats(),
    bpm: $("bpm").value.trim()
      ? Number($("bpm").value)
      : (detectedBpm ?? beatAnalysis?.bpm ?? prevSync.bpm ?? null),
    beatCount: beatAnalysis?.beatCount ?? prevSync.beatCount ?? null,
    confidence: beatAnalysis?.confidence ?? prevSync.confidence ?? null,
    analyzer: beatAnalysis?.analyzer ?? prevSync.analyzer,
    audioDurationSeconds:
      audioDurationSeconds ?? prevSync.audioDurationSeconds ?? 0,
  };

  if (beatAnalysis?.beatTimesSeconds?.length) {
    sync.beatTimesSeconds = beatAnalysis.beatTimesSeconds;
  } else if (audioUnchanged && prevSync.beatTimesSeconds?.length) {
    sync.beatTimesSeconds = prevSync.beatTimesSeconds;
  }

  if (audioUnchanged && prevSync.slideTransitionDurations?.length) {
    sync.slideTransitionDurations = prevSync.slideTransitionDurations;
  }

  return sync;
};

const buildManifestFromEditor = () => {
  const audioUnchanged = Boolean(audioPath && persistedManifestMeta?.audio === audioPath);
  const timingFresh = isFlowTimingFresh();

  return {
    version: 1,
    prompt: $("prompt").value.trim(),
    contentMode: getContentMode(),
    infoText: $("info-text").value.trim(),
    generatedAt: persistedManifestMeta?.generatedAt ?? new Date().toISOString(),
    generatedBy: persistedManifestMeta?.generatedBy ?? "heuristic",
    fps: persistedManifestMeta?.fps ?? 30,
    width: persistedManifestMeta?.width ?? 1280,
    height: persistedManifestMeta?.height ?? 720,
    slideDuration: persistedManifestMeta?.slideDuration ?? 90,
    transitionDuration: persistedManifestMeta?.transitionDuration ?? 20,
    kenBurns: persistedManifestMeta?.kenBurns ?? true,
    audio: audioPath,
    audioVolume: persistedManifestMeta?.audioVolume ?? 0.7,
    slides,
    useAllPublicImages: false,
    allowedTransitions: getSelectedGraphicEffects(),
    allowedTextEffects: getSelectedTextEffects(),
    slideTimings: timingFresh ? persistedManifestMeta?.slideTimings : undefined,
    totalDurationFrames: timingFresh ? persistedManifestMeta?.totalDurationFrames : undefined,
    sync: buildSyncFromEditor(),
  };
};

const setSaveProjectStatus = (message, type = "") => {
  const el = $("save-project-status");
  if (!el) return;
  el.textContent = message;
  el.className = `editor-save-status${type ? ` ${type}` : ""}`;
};

const updateSaveProjectButton = () => {
  const btn = $("save-project-btn");
  if (btn) btn.disabled = !activeProjectId;
};

const saveCurrentProjectDraft = async () => {
  if (!activeProjectId) return;

  const nameInput = $("editor-project-name-input");
  const name = nameInput?.value.trim();
  if (!name) {
    throw new Error("Podaj nazwę projektu.");
  }

  const current = videoProjects.find((item) => item.id === activeProjectId);
  if (current && current.name !== name) {
    const renameRes = await fetch(`/api/video-projects/${encodeURIComponent(activeProjectId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const renameData = await renameRes.json();
    if (!renameRes.ok) {
      throw new Error(renameData.error ?? "Nie udało się zapisać nazwy projektu.");
    }
    if (renameData.project) {
      videoProjects = videoProjects.map((item) =>
        item.id === renameData.project.id ? renameData.project : item,
      );
      $("editor-project-title").textContent = renameData.project.name;
      document.title = `${renameData.project.name} — AUTKA.PL Wideo`;
    }
  }

  const manifest = buildManifestFromEditor();
  const res = await fetch(`/api/video-projects/${encodeURIComponent(activeProjectId)}/manifest`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(manifest),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Nie udało się zapisać projektu.");
  }
  persistedManifestMeta = manifest;
  $("manifest-preview").textContent = JSON.stringify(manifest, null, 2);
  if (data.project) {
    videoProjects = videoProjects.map((item) =>
      item.id === data.project.id ? data.project : item,
    );
    $("editor-project-meta").textContent = `${data.project.slideCount} slajdów · ostatnia zmiana ${formatPlDateTime(data.project.updatedAt)}`;
  }
};

const resetEditorState = () => {
  persistedManifestMeta = null;
  lastFlowTimingKey = null;
  slides = [];
  audioPath = null;
  audioDurationSeconds = null;
  detectedBpm = null;
  beatAnalysis = null;
  audioAnalysisPending = false;
  $("prompt").value = "";
  $("info-text").value = "";
  $("audio-meta").textContent = "";
  $("beat-meta").textContent = "";
  $("manifest-preview").textContent = "";
  $("bpm").value = "";
  $("sync-to-music").checked = true;
  $("sync-mode").value = "beats";
  $("beats-per-slide").value = "16";
  $("text-enter-delay").value = "0";
  setContentMode("manual");
  $("audio-select")?.removeAttribute("disabled");
  $("audio-picker")?.classList.remove("audio-picker--analyzing");
  renderAudioSelect();
  updateAudioMeta();
  renderSlides();
  setSlidesSectionExpanded(false);
  resetEffectsSelection();
};

const applyManifestToEditor = (project) => {
  resetEditorState();
  persistedManifestMeta = project;
  $("prompt").value = project.prompt ?? "";
  setContentMode(project.contentMode ?? "manual");
  $("info-text").value = project.infoText ?? "";
  slides = project.slides ?? [];
  audioPath = project.audio ?? null;
  audioDurationSeconds = project.sync?.audioDurationSeconds ?? null;
  detectedBpm = project.sync?.bpm ?? null;
  $("beats-per-slide").value = String(project.sync?.beatsPerSlide ?? 16);
  $("text-enter-delay").value = String(project.sync?.textEnterDelayBeats ?? 0);
  if (project.sync?.mode) {
    $("sync-mode").value = project.sync.mode;
  }
  if (project.sync?.bpm) {
    $("bpm").value = String(project.sync.bpm);
  }
  if (project.sync?.beatTimesSeconds?.length) {
    beatAnalysis = {
      bpm: project.sync.bpm,
      beatCount: project.sync.beatCount ?? project.sync.beatTimesSeconds.length,
      confidence: project.sync.confidence ?? 0.7,
      analyzer: project.sync.analyzer ?? "legacy",
      beatTimesSeconds: project.sync.beatTimesSeconds,
    };
  } else if (project.sync?.beatCount && project.sync?.bpm) {
    beatAnalysis = {
      bpm: project.sync.bpm,
      beatCount: project.sync.beatCount,
      confidence: project.sync.confidence ?? 0.7,
      analyzer: project.sync.analyzer ?? "legacy",
    };
  }
  $("sync-to-music").checked = project.sync?.enabled !== false;
  applyEffectsFromManifest(project);
  renderAudioSelect();
  updateAudioMeta();
  renderSlides();
  $("manifest-preview").textContent = JSON.stringify(project, null, 2);
  if (project.slideTimings?.length && project.sync?.enabled !== false) {
    markFlowTimingFresh();
  }
};

const openProject = async (projectId, options = {}) => {
  if (!projectId) return;
  const summary = videoProjects.find((item) => item.id === projectId);
  if (!summary) {
    await loadVideoProjects();
  }
  const projectSummary = videoProjects.find((item) => item.id === projectId);
  if (!projectSummary) return;

  activeProjectId = projectId;
  if (!options.skipUrl) {
    setProjectInUrl(projectId);
  }
  showEditorView(projectSummary);
  updateSaveProjectButton();
  setSaveProjectStatus("");

  await loadAudioLibrary();
  const res = await fetch(`/api/project?projectId=${encodeURIComponent(projectId)}`);
  if (res.ok) {
    applyManifestToEditor(await res.json());
    return;
  }

  resetEditorState();
  $("manifest-preview").textContent = "Nowy projekt — wrzuć zdjęcia i wygeneruj flow.";
};

const openDeleteProjectModal = (project) => {
  deleteProjectTarget = { id: project.id, name: project.name };
  $("project-delete-text").textContent = `Na pewno usunąć projekt „${project.name}”? Tej operacji nie cofniesz.`;
  const modal = $("project-delete-modal");
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
};

const closeDeleteProjectModal = () => {
  deleteProjectTarget = null;
  const modal = $("project-delete-modal");
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
};

const confirmDeleteProject = async () => {
  if (!deleteProjectTarget) return;
  const res = await fetch(`/api/video-projects/${encodeURIComponent(deleteProjectTarget.id)}`, {
    method: "DELETE",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Nie udało się usunąć projektu.");
  }
  videoProjects = videoProjects.filter((item) => item.id !== deleteProjectTarget.id);
  closeDeleteProjectModal();
  renderProjectsDashboard();
};

const getContentMode = () => {
  const selected = document.querySelector('input[name="content-mode"]:checked');
  return /** @type {"manual" | "fromText"} */ (
    selected?.getAttribute("value") ?? "manual"
  );
};

const updateContentModeUi = () => {
  const fromText = getContentMode() === "fromText";
  $("info-text-block").hidden = !fromText;
  const descBlock = $("generate-descriptions-block");
  if (descBlock) descBlock.hidden = !fromText;
  if (editingSlideIndex != null && slides[editingSlideIndex]) {
    refreshSlideModalForContentMode();
    updateSlideTileInGrid(editingSlideIndex);
    return;
  }
  renderSlides();
};

const refreshSlideModalForContentMode = () => {
  const body = $("slide-modal-body");
  if (!body || editingSlideIndex == null) return;

  const fromText = getContentMode() === "fromText";
  const sceneField = body.querySelector(".modal-field-scene-label");
  const sceneInput = body.querySelector("input[data-field='sceneLabel']");
  const titleField = body.querySelector(".modal-field-title");
  const subtitleField = body.querySelector(".modal-field-subtitle");
  const titleInput = body.querySelector("input[data-field='title']");
  const subtitleInput = body.querySelector("input[data-field='subtitle']");
  const sceneHint = body.querySelector(".modal-scene-hint");

  if (sceneField) sceneField.hidden = false;
  if (sceneInput instanceof HTMLInputElement) {
    sceneInput.disabled = false;
    sceneInput.readOnly = false;
  }
  if (titleField) titleField.hidden = fromText;
  if (subtitleField) subtitleField.hidden = fromText;
  if (titleInput instanceof HTMLInputElement) {
    titleInput.disabled = false;
    titleInput.placeholder = "Tytuł na wideo";
  }
  if (subtitleInput instanceof HTMLInputElement) {
    subtitleInput.disabled = false;
    subtitleInput.placeholder = "Podtytuł";
  }
  if (sceneHint) {
    const slide = slides[editingSlideIndex];
    sceneHint.hidden = !(fromText && !slide?.sceneLabel?.trim());
  }
};

const setSlidesSectionExpanded = (expanded) => {
  const body = $("slides-section-body");
  const toggle = $("slides-section-toggle");
  if (!body || !toggle) return;
  body.hidden = !expanded;
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.classList.toggle("is-expanded", expanded);
};

const updateSlidesSectionVisibility = () => {
  if (slides.length > 0) {
    setSlidesSectionExpanded(true);
  }
};

const setContentMode = (mode) => {
  const input = document.querySelector(
    `input[name="content-mode"][value="${mode}"]`,
  );
  if (input instanceof HTMLInputElement) {
    input.checked = true;
  }
  updateContentModeUi();
};

const setStatus = (message, type = "") => {
  const el = $("status");
  if (!el) return;
  el.textContent = message;
  el.className = `generate-action-status${type ? ` ${type}` : ""}`;
};

const readApiJson = async (res, fallbackMessage = "Błąd serwera.") => {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    const snippet = raw.trim().slice(0, 180);
    throw new Error(
      snippet.startsWith("<")
        ? `${fallbackMessage} (HTTP ${res.status})`
        : snippet || `${fallbackMessage} (HTTP ${res.status})`,
    );
  }
};

const parseApiResponse = async (res, fallbackMessage = "Błąd serwera.") => {
  const data = await readApiJson(res, fallbackMessage);
  if (!res.ok) {
    throw new Error(data.error ?? fallbackMessage);
  }
  return data;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const setDescriptionsStatus = (message, type = "") => {
  const el = $("descriptions-status");
  if (!el) return;
  el.textContent = message;
  el.className = `generate-action-status${type ? ` ${type}` : ""}`;
};

const inferLocationFromPath = (image) => {
  const lower = image.toLowerCase().replace(/\\/g, "/");
  if (/(?:^|\/)(exterior|zewnatrz|outside|ext|zewn)(?:\/|[-_]|$)/.test(lower)) {
    return "exterior";
  }
  if (/(?:^|\/)(interior|wewnatrz|inside|int|wewn)(?:\/|[-_]|$)/.test(lower)) {
    return "interior";
  }
  if (/(?:^|\/)detail(?:\/|[-_]|$)/.test(lower)) {
    return "detail";
  }
  return "other";
};

const locationOptions = [
  { value: "exterior", label: "Zewnątrz" },
  { value: "interior", label: "Wnętrze" },
  { value: "detail", label: "Detal" },
  { value: "other", label: "Inne" },
];

/** @type {number | null} */
let editingSlideIndex = null;

/** @type {number | null} */
let dragFromIndex = null;

const moveSlide = (fromIndex, toIndex) => {
  if (fromIndex === toIndex) return;
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= slides.length ||
    toIndex >= slides.length
  ) {
    return;
  }

  const editingImage =
    editingSlideIndex != null ? slides[editingSlideIndex]?.image : null;
  const [item] = slides.splice(fromIndex, 1);
  slides.splice(toIndex, 0, item);

  if (editingImage) {
    const next = slides.findIndex((s) => s.image === editingImage);
    editingSlideIndex = next >= 0 ? next : null;
  }

  renderSlides();
  invalidateDerivedTiming();
};

const removeSlide = (index) => {
  if (index < 0 || index >= slides.length) return;
  if (editingSlideIndex === index) {
    closeSlideModal();
  } else if (editingSlideIndex != null && editingSlideIndex > index) {
    editingSlideIndex -= 1;
  }
  slides.splice(index, 1);
  renderSlides();
  invalidateDerivedTiming();
};

const getLocationLabel = (location) =>
  locationOptions.find((option) => option.value === location)?.label ?? "Inne";

const getSlideCaption = (slide, fromText) => {
  const scene = slide.sceneLabel?.trim();
  const title = slide.title?.trim();
  if (scene) return scene;
  if (fromText) return title || "Brak opisu zdjęcia";
  return title || "Bez tytułu";
};

const getSlideMetaLine = (slide) => {
  const parts = [];
  if (slide.subtitle?.trim()) {
    parts.push(slide.subtitle.trim());
  }
  if (slide.beats) {
    parts.push(`${slide.beats}♩`);
  }
  return parts.join(" · ");
};

const renderLocationSelect = (slide, id = "") => {
  const value = slide.location ?? inferLocationFromPath(slide.image);
  return `<select data-field="location" title="Typ zdjęcia"${id ? ` id="${id}"` : ""}>${locationOptions
    .map(
      (option) =>
        `<option value="${option.value}"${value === option.value ? " selected" : ""}>${option.label}</option>`,
    )
    .join("")}</select>`;
};

const closeSlideModal = () => {
  editingSlideIndex = null;
  const modal = $("slide-modal");
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
};

const updateSlideTileInGrid = (index) => {
  const tile = $("slides-list")?.querySelector(`.slide-tile[data-index="${index}"]`);
  if (!tile || !slides[index]) return;

  const fromText = getContentMode() === "fromText";
  const slide = slides[index];
  const caption = getSlideCaption(slide, fromText);
  const location = slide.location ?? inferLocationFromPath(slide.image);
  const needsScene = fromText && !slide.sceneLabel?.trim();

  const indexEl = tile.querySelector(".slide-tile-index");
  const titleEl = tile.querySelector(".slide-tile-title");
  const metaEl = tile.querySelector(".slide-tile-meta");
  const badge = tile.querySelector(".slide-tile-badge");

  if (indexEl) indexEl.textContent = `#${index + 1}`;
  if (titleEl) titleEl.textContent = caption;
  if (metaEl) metaEl.textContent = getSlideMetaLine(slide);
  if (badge) {
    badge.textContent = getLocationLabel(location);
    badge.classList.toggle("warn", needsScene);
  }
  const open = tile.querySelector(".slide-tile-open");
  if (open) {
    open.setAttribute("aria-label", `Edytuj slajd ${index + 1}: ${caption}`);
  }
  tile.setAttribute("data-index", String(index));
};

const renderSlideModal = () => {
  const body = $("slide-modal-body");
  const titleEl = $("slide-modal-title");
  if (editingSlideIndex == null || !slides[editingSlideIndex]) {
    closeSlideModal();
    return;
  }

  const index = editingSlideIndex;
  const slide = slides[index];
  const fromText = getContentMode() === "fromText";
  titleEl.textContent = `Slajd ${index + 1} / ${slides.length}`;

  body.innerHTML = `
    <img class="modal-preview" src="${publicAssetUrl(slide.image)}" alt="${escapeHtml(slide.sceneLabel || slide.title)}" />
    <label class="modal-field">
      <span>Typ zdjęcia</span>
      ${renderLocationSelect(slide, "modal-location")}
    </label>
    <label class="modal-field modal-field-scene-label">
      <span>Co widać na zdjęciu</span>
      <input type="text" data-field="sceneLabel" value="${escapeHtml(slide.sceneLabel ?? "")}" placeholder="np. fotel kierowcy, bagażnik, przód auta" />
    </label>
    <label class="modal-field modal-field-title"${fromText ? " hidden" : ""}>
      <span>Tytuł na wideo</span>
      <input type="text" data-field="title" value="${escapeHtml(slide.title)}" placeholder="Tytuł na wideo" />
    </label>
    <label class="modal-field modal-field-subtitle"${fromText ? " hidden" : ""}>
      <span>Podtytuł</span>
      <input type="text" data-field="subtitle" value="${escapeHtml(slide.subtitle ?? "")}" placeholder="Podtytuł" />
    </label>
    ${slide.beats ? `<p class="modal-hint">Rytm slajdu: <span class="beats-badge">${slide.beats}♩</span> (ustawione przy generowaniu)</p>` : ""}
    <p class="modal-hint modal-scene-hint"${fromText && !slide.sceneLabel?.trim() ? "" : " hidden"}>Uzupełnij opis zdjęcia — AI dopasuje tekst bez powtórzeń.</p>
    <div class="modal-reorder">
      <button type="button" class="btn btn-ghost" data-move-prev${index === 0 ? " disabled" : ""}>← W lewo</button>
      <span class="modal-reorder-label">Pozycja ${index + 1} / ${slides.length}</span>
      <button type="button" class="btn btn-ghost" data-move-next${index >= slides.length - 1 ? " disabled" : ""}>W prawo →</button>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-danger" data-modal-remove>Usuń slajd</button>
      <button type="button" class="btn btn-secondary" data-modal-close>Gotowe</button>
    </div>
  `;

  body.querySelector("select[data-field='location']")?.addEventListener("change", (e) => {
    const target = /** @type {HTMLSelectElement} */ (e.target);
    slides[index].location = /** @type {SlideLocation} */ (target.value);
    updateSlideTileInGrid(index);
  });

  body.querySelector("input[data-field='sceneLabel']")?.addEventListener("input", (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    slides[index].sceneLabel = target.value;
    const sceneHint = body.querySelector(".modal-scene-hint");
    if (sceneHint) {
      sceneHint.hidden = !(getContentMode() === "fromText" && !target.value.trim());
    }
    updateSlideTileInGrid(index);
  });

  body.querySelector("input[data-field='title']")?.addEventListener("input", (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    slides[index].title = target.value;
    updateSlideTileInGrid(index);
  });
  body.querySelector("input[data-field='subtitle']")?.addEventListener("input", (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    slides[index].subtitle = target.value;
    updateSlideTileInGrid(index);
  });

  body.querySelector("[data-move-prev]")?.addEventListener("click", () => {
    if (index > 0) moveSlide(index, index - 1);
  });

  body.querySelector("[data-move-next]")?.addEventListener("click", () => {
    if (index < slides.length - 1) moveSlide(index, index + 1);
  });

  body.querySelector("[data-modal-remove]")?.addEventListener("click", () => {
    slides.splice(index, 1);
    closeSlideModal();
    renderSlides();
    invalidateDerivedTiming();
  });

  body.querySelectorAll("[data-modal-close]").forEach((btn) => {
    btn.addEventListener("click", closeSlideModal);
  });
};

const openSlideModal = (index) => {
  if (!slides[index]) return;
  editingSlideIndex = index;
  const modal = $("slide-modal");
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  renderSlideModal();
};

const renderSlides = () => {
  const list = $("slides-list");
  const fromText = getContentMode() === "fromText";

  if (!slides.length) {
    list.innerHTML =
      '<div class="empty">Brak slajdów. Wrzuć obrazki albo kliknij „Skanuj public/”.</div>';
    if (editingSlideIndex != null) closeSlideModal();
    return;
  }

  if (editingSlideIndex != null && editingSlideIndex >= slides.length) {
    closeSlideModal();
  }

  list.innerHTML = slides
    .map((slide, index) => {
      const location = slide.location ?? inferLocationFromPath(slide.image);
      const caption = getSlideCaption(slide, fromText);
      const needsScene = fromText && !slide.sceneLabel?.trim();
      return `
      <div class="slide-tile" data-index="${index}">
        <button
          type="button"
          class="slide-tile-open"
          aria-label="Edytuj slajd ${index + 1}: ${escapeHtml(caption)}"
        >
          <span class="slide-tile-photo">
            <img src="${publicAssetUrl(slide.image)}" alt="" loading="lazy" decoding="async" draggable="false" />
            <span class="slide-tile-index">#${index + 1}</span>
          </span>
          <span class="slide-tile-caption">
            <span class="slide-tile-title">${escapeHtml(caption)}</span>
            <span class="slide-tile-meta">${escapeHtml(getSlideMetaLine(slide))}</span>
          </span>
        </button>
        <div class="slide-tile-photo-overlay">
          <div class="slide-tile-photo-left">
            <span class="slide-tile-badge${needsScene ? " warn" : ""}">${escapeHtml(getLocationLabel(location))}</span>
            <button
              type="button"
              class="slide-tile-drag"
              draggable="true"
              title="Przeciągnij, żeby zmienić kolejność"
              aria-label="Zmień kolejność slajdu ${index + 1}"
            >⠿</button>
          </div>
          <button
            type="button"
            class="slide-tile-delete"
            data-delete-slide="${index}"
            title="Usuń slajd"
            aria-label="Usuń slajd ${index + 1}"
          >✕</button>
        </div>
      </div>
    `;
    })
    .join("");

  attachSlideReorder(list);

  if (editingSlideIndex != null) {
    if (slides[editingSlideIndex]) {
      renderSlideModal();
    } else {
      closeSlideModal();
    }
  }

  updateSlidesSectionVisibility();
};

const attachSlideReorder = (list) => {
  list.querySelectorAll(".slide-tile-drag").forEach((handle) => {
    handle.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    handle.addEventListener("dragstart", (e) => {
      const tile = handle.closest(".slide-tile");
      dragFromIndex = Number(tile?.getAttribute("data-index"));
      tile?.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(dragFromIndex));
      }
    });

    handle.addEventListener("dragend", () => {
      dragFromIndex = null;
      list.querySelectorAll(".slide-tile").forEach((tile) => {
        tile.classList.remove("dragging", "drop-target");
      });
    });
  });

  list.querySelectorAll(".slide-tile").forEach((tile) => {
    tile.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (dragFromIndex == null) return;
      tile.classList.add("drop-target");
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
    });

    tile.addEventListener("dragleave", () => {
      tile.classList.remove("drop-target");
    });

    tile.addEventListener("drop", (e) => {
      e.preventDefault();
      tile.classList.remove("drop-target");
      const toIndex = Number(tile.getAttribute("data-index"));
      if (dragFromIndex == null || Number.isNaN(toIndex)) return;
      moveSlide(dragFromIndex, toIndex);
    });
  });

  list.querySelectorAll(".slide-tile-open").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.closest(".slide-tile")?.getAttribute("data-index"));
      if (!Number.isNaN(index)) openSlideModal(index);
    });
  });

  list.querySelectorAll("[data-delete-slide]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = Number(btn.getAttribute("data-delete-slide"));
      if (!Number.isNaN(index)) removeSlide(index);
    });
  });
};

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const addSlidesFromPaths = (paths, defaultLocation) => {
  let added = 0;
  for (const image of paths) {
    if (slides.some((s) => s.image === image)) continue;
    const base = image.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Slajd";
    slides.push({
      image,
      title: base.replace(/[-_]/g, " "),
      subtitle: "",
      location: defaultLocation ?? inferLocationFromPath(image),
      sceneLabel: "",
    });
    added++;
  }
  if (added > 0) {
    invalidateDerivedTiming();
  }
  renderSlides();
  return added;
};

const uploadImages = async (files, location = "") => {
  if (!files.length) return;
  const form = new FormData();
  for (const file of files) form.append("images", file);
  if (location) form.append("location", location);

  const label =
    location === "exterior"
      ? "zewnętrz"
      : location === "interior"
        ? "wnętrze"
        : "obrazki";
  setStatus(`Wgrywam ${label}...`);
  const res = await fetch("/api/upload/images", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Upload failed");

  addSlidesFromPaths(
    data.uploaded.map((u) => u.path),
    location || undefined,
  );
  setStatus(`Dodano ${data.uploaded.length} zdjęć (${label}).`, "ok");
};

const uploadAudio = async (file) => {
  const form = new FormData();
  form.append("audio", file);

  setAudioAnalysisPending(true);
  setStatus("Wgrywam i analizuję beaty...");
  try {
    const res = await fetch("/api/upload/audio", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Upload failed");

    audioPath = data.audio.path;
    audioDurationSeconds = data.audio.durationSeconds || null;
    detectedBpm = data.audio.bpm || null;
    beatAnalysis = data.audio.beatAnalysis || null;
    if (beatAnalysis && !$("bpm").value) {
      $("bpm").placeholder = `wykryto ${beatAnalysis.bpm} BPM`;
    }
    await loadAudioLibrary();
    renderAudioSelect();
    setStatus(
      beatAnalysis
        ? `Analiza (${beatAnalysis.analyzer === "essentia" ? "Essentia" : "legacy"}): ${beatAnalysis.bpm} BPM, ${beatAnalysis.beatCount} beatów, ${beatAnalysis.accentCount ?? "?"} akcentów.`
        : "Muzyka gotowa (detekcja beatów przy generowaniu).",
      "ok",
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Upload nieudany.", "error");
    throw error;
  } finally {
    setAudioAnalysisPending(false);
  }
};

const loadProject = async () => {
  if (!activeProjectId) {
    $("manifest-preview").textContent = "";
    return;
  }
  try {
    const res = await fetch(`/api/project?projectId=${encodeURIComponent(activeProjectId)}`);
    if (!res.ok) {
      $("manifest-preview").textContent =
        res.status === 404
          ? "Nowy projekt — wrzuć zdjęcia i wygeneruj flow."
          : `Nie udało się wczytać manifestu (HTTP ${res.status}).`;
      return;
    }
    const project = await res.json();
    applyManifestToEditor(project);
  } catch (error) {
    $("manifest-preview").textContent =
      error instanceof Error
        ? `Błąd wczytywania manifestu: ${error.message}`
        : "Brak wygenerowanego projektu.";
  }
};

const loadHealth = async () => {
  const res = await fetch("/api/health");
  const data = await res.json();

  if (data.hubUrl) {
    const hub = data.hubUrl.replace(/\/$/, "");
    $("hub-link")?.setAttribute("href", hub);
    $("hub-home-link")?.setAttribute("href", hub);
  }
  if (data.photosUrl) {
    $("photos-link")?.setAttribute("href", data.photosUrl);
  }

  if (data.studioUrl) {
    const studioLink = $("studio-link");
    if (studioLink) {
      studioLink.href = data.studioUrl;
    }
  }

  const logoutForm = $("logout-form");
  if (logoutForm && data.signOutUrl) {
    logoutForm.action = data.signOutUrl;
  }

  return data;
};

const loadSessionUser = async () => {
  const emailEl = $("user-email");
  const logoutForm = $("logout-form");
  if (!emailEl || !logoutForm) return;

  try {
    const res = await fetch("/api/me");
    if (!res.ok) {
      emailEl.textContent = "";
      return;
    }
    const data = await res.json();
    const user = data.user;
    emailEl.textContent = user?.name?.trim() || user?.email || "";
    emailEl.title = user?.email ?? "";
  } catch {
    emailEl.textContent = "";
  }

  logoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      // cookie wygasnie po wylogowaniu z NextAuth
    }
    logoutForm.submit();
  });
};

const generateDescriptions = async () => {
  if (!activeProjectId) {
    setDescriptionsStatus("Wybierz projekt wideo z listy.", "err");
    return;
  }

  const infoText = $("info-text").value.trim();
  if (!infoText) {
    setDescriptionsStatus("Wklej opis auta / parametry techniczne.", "err");
    return;
  }

  const btn = $("generate-descriptions-btn");
  if (btn) btn.disabled = true;

  if (!slides.length) {
    setDescriptionsStatus("Dodaj zdjęcia slajdów przed generowaniem opisów.", "err");
    if (btn) btn.disabled = false;
    return;
  }

  setDescriptionsStatus("Generuję opisy slajdów...");

  try {
    const res = await fetch("/api/generate-descriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: activeProjectId,
        infoText,
        slides,
        useAllPublicImages: false,
      }),
    });
    const data = await parseApiResponse(res, "Generowanie opisów nieudane");

    slides = data.slides ?? data.project?.slides ?? slides;
    persistedManifestMeta = data.project ?? persistedManifestMeta;
    invalidateDerivedTiming();
    if (data.project) {
      $("manifest-preview").textContent = JSON.stringify(data.project, null, 2);
      videoProjects = videoProjects.map((item) =>
        item.id === activeProjectId
          ? {
              ...item,
              slideCount: slides.length,
              thumbnailImage: slides[0]?.image ?? item.thumbnailImage,
              updatedAt: new Date().toISOString(),
            }
          : item,
      );
      const current = videoProjects.find((item) => item.id === activeProjectId);
      if (current) {
        $("editor-project-meta").textContent = `${current.slideCount} slajdów · ostatnia zmiana ${formatPlDateTime(current.updatedAt)}`;
      }
    }
    renderSlides();
    setDescriptionsStatus(data.message ?? "Opisy slajdów wygenerowane.", "ok");
  } catch (error) {
    setDescriptionsStatus(error instanceof Error ? error.message : "Błąd", "err");
  } finally {
    if (btn) btn.disabled = false;
  }
};

const setExportStatus = (message, type = "") => {
  const el = $("export-status");
  if (!el) return;
  el.textContent = message;
  el.className = `generate-action-status${type ? ` ${type}` : ""}`;
};

const setExportProgressUi = ({ visible, percent = 0, label = "" } = {}) => {
  const wrap = $("export-progress");
  const bar = $("export-progress-bar");
  const labelEl = $("export-progress-label");
  if (wrap) {
    if (visible) wrap.removeAttribute("hidden");
    else wrap.setAttribute("hidden", "");
  }
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  if (labelEl) labelEl.textContent = label;
};

const waitForExportJob = async (projectId, jobId) => {
  for (;;) {
    const res = await fetch(
      `/api/video-projects/${encodeURIComponent(projectId)}/export/${encodeURIComponent(jobId)}`,
    );
    const data = await parseApiResponse(res, "Nie udało się sprawdzić postępu renderu.");

    const percent = Math.round((data.progress ?? 0) * 100);
    const frameLabel =
      data.totalFrames > 0
        ? ` · ${data.renderedFrames}/${data.totalFrames} klatek`
        : "";
    setExportProgressUi({
      visible: true,
      percent,
      label: `${data.message ?? "Renderuję wideo…"} (${percent}%)${frameLabel}`,
    });
    setExportStatus(data.message ?? "Renderuję wideo…");

    if (data.status === "done") {
      return data;
    }
    if (data.status === "error") {
      throw new Error(data.error ?? "Render wideo nieudany.");
    }

    await sleep(1000);
  }
};

const sanitizeExportFilename = (name) => {
  const cleaned = String(name ?? "wideo-autka")
    .normalize("NFKD")
    .replace(/[^\w\sąćęłńóśźżĄĆĘŁŃÓŚŹŻ.-]+/gi, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (cleaned || "wideo-autka").slice(0, 80);
};

const pickLocalVideoSaveTarget = async (suggestedName) => {
  if (typeof window.showSaveFilePicker !== "function") {
    return { mode: "download", suggestedName };
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: "Wideo MP4",
          accept: { "video/mp4": [".mp4"] },
        },
      ],
    });
    return { mode: "handle", handle, suggestedName };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { mode: "cancelled" };
    }
    throw error;
  }
};

const saveVideoBlobLocally = async (blob, target) => {
  if (target.mode === "handle") {
    const writable = await target.handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = target.suggestedName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const exportVideoToDisk = async () => {
  if (!activeProjectId) {
    setExportStatus("Wybierz projekt wideo z listy.", "err");
    return;
  }

  if (!slides.length) {
    setExportStatus("Dodaj slajdy przed eksportem wideo.", "err");
    return;
  }

  const project = videoProjects.find((item) => item.id === activeProjectId);
  const suggestedName = `${sanitizeExportFilename(project?.name ?? "wideo-autka")}.mp4`;
  const saveTarget = await pickLocalVideoSaveTarget(suggestedName);
  if (saveTarget.mode === "cancelled") {
    setExportStatus("");
    return;
  }

  const btn = $("export-video-btn");
  if (btn) btn.disabled = true;
  setExportProgressUi({ visible: false, percent: 0, label: "" });

  try {
    if ($("sync-to-music")?.checked && !isFlowTimingFresh()) {
      throw new Error(
        "Muzyka lub rytm się zmieniły — najpierw kliknij «Generuj flow animacji», potem eksportuj MP4.",
      );
    }

    setExportStatus("Zapisuję projekt przed renderem…");
    await saveCurrentProjectDraft();

    setExportStatus("Uruchamiam render wideo…");
    const startRes = await fetch(
      `/api/video-projects/${encodeURIComponent(activeProjectId)}/export`,
      { method: "POST" },
    );
    const startData = await parseApiResponse(startRes, "Eksport wideo nieudany.");
    await waitForExportJob(activeProjectId, startData.jobId);

    setExportStatus("Pobieram plik MP4…");
    setExportProgressUi({ visible: true, percent: 100, label: "Pobieram plik MP4…" });

    const fileRes = await fetch(
      `/api/video-projects/${encodeURIComponent(activeProjectId)}/export/${encodeURIComponent(startData.jobId)}/file`,
    );
    if (!fileRes.ok) {
      await parseApiResponse(fileRes, "Pobieranie MP4 nieudane.");
    }

    setExportStatus("Zapisuję plik na dysku…");
    const blob = await fileRes.blob();
    await saveVideoBlobLocally(blob, saveTarget);

    setExportStatus(
      saveTarget.mode === "handle"
        ? `Zapisano: ${suggestedName}`
        : `Pobrano ${suggestedName} (zwykle folder Pobrane).`,
      "ok",
    );
  } catch (error) {
    setExportStatus(error instanceof Error ? error.message : "Eksport nieudany.", "err");
  } finally {
    if (btn) btn.disabled = false;
    setExportProgressUi({ visible: false, percent: 0, label: "" });
  }
};

const generate = async () => {
  if (!activeProjectId) {
    setStatus("Wybierz projekt wideo z listy.", "err");
    return;
  }

  const prompt = $("prompt").value.trim();
  const contentMode = getContentMode();
  const infoText = $("info-text").value.trim();

  if (!prompt) {
    setStatus("Wpisz prompt opisujący styl wideo.", "err");
    return;
  }

  $("generate-btn").disabled = true;

  if (!slides.length) {
    setStatus("Dodaj zdjęcia slajdów przed generowaniem.", "err");
    $("generate-btn").disabled = false;
    return;
  }

  setStatus("Generuję flow animacji...");

  try {
    const bpmValue = $("bpm").value.trim();
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: activeProjectId,
        prompt,
        contentMode,
        infoText: contentMode === "fromText" ? infoText : null,
        slides,
        audio: audioPath,
        bpm: bpmValue ? Number(bpmValue) : null,
        beatsPerSlide: Number($("beats-per-slide").value),
        textEnterDelayBeats: getTextEnterDelayBeats(),
        audioDurationSeconds,
        syncToMusic: $("sync-to-music").checked,
        syncMode: $("sync-mode").value,
        useAllPublicImages: false,
        allowedTransitions: getSelectedGraphicEffects(),
        allowedTextEffects: getSelectedTextEffects(),
        beatTimesSeconds: beatAnalysis?.beatTimesSeconds ?? undefined,
        beatStrengths: beatAnalysis?.beatStrengths ?? undefined,
        analyzer: beatAnalysis?.analyzer ?? undefined,
        confidence: beatAnalysis?.confidence ?? undefined,
      }),
    });
    const data = await parseApiResponse(res, "Generowanie nieudane");

    $("manifest-preview").textContent = JSON.stringify(data.project, null, 2);
    persistedManifestMeta = data.project;
    slides = data.project.slides ?? slides;
    applyEffectsFromManifest(data.project);
    renderSlides();
    markFlowTimingFresh();
    if (data.project) {
      videoProjects = videoProjects.map((item) =>
        item.id === activeProjectId
          ? {
              ...item,
              slideCount: (data.project.slides ?? []).length,
              thumbnailImage: data.project.slides?.[0]?.image ?? item.thumbnailImage,
              prompt: data.project.prompt ?? item.prompt,
              status: "ready",
              updatedAt: new Date().toISOString(),
            }
          : item,
      );
      const current = videoProjects.find((item) => item.id === activeProjectId);
      if (current) {
        $("editor-project-meta").textContent = `${current.slideCount} slajdów · ostatnia zmiana ${formatPlDateTime(current.updatedAt)}`;
      }
    }
    const sync = data.project.sync;
    const slideInfo =
      data.slideCount != null
        ? `${data.slideCount} slajdów`
        : `${(data.project.slides ?? []).length} slajdów`;
    const beatValues = (data.project.slides ?? [])
      .map((s) => s.beats)
      .filter((b) => b != null);
    const beatRange =
      beatValues.length > 1
        ? `, rytm ${Math.min(...beatValues)}–${Math.max(...beatValues)}♩`
        : beatValues.length === 1
          ? `, ${beatValues[0]}♩/slajd`
          : "";
    const syncLabel = sync?.enabled
      ? sync.mode === "beats"
        ? `beaty ~${sync.bpm} BPM, ${sync.beatCount} uderzeń${sync.accentCount != null ? `, ${sync.accentCount} akcentów` : ""}${sync.analyzer ? ` (${sync.analyzer})` : ""}`
        : sync.mode === "bpm"
          ? `BPM ${sync.bpm}`
          : `długość ${formatDuration(sync.audioDurationSeconds)}`
      : "bez synchro";
    setStatus(`${data.message} (${data.project.generatedBy}, ${slideInfo}, ${syncLabel}${beatRange})`, "ok");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Błąd", "err");
  } finally {
    $("generate-btn").disabled = false;
  }
};

const setupDropzone = (elementId, inputId, onFiles) => {
  const zone = $(elementId);
  const input = $(inputId);

  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", async (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    const files = [...e.dataTransfer.files];
    try {
      await onFiles(files);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Błąd uploadu", "err");
    }
  });
  input.addEventListener("change", async () => {
    const files = [...input.files];
    input.value = "";
    try {
      await onFiles(files);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Błąd uploadu", "err");
    }
  });
};

setupDropzone("image-drop-exterior", "image-input-exterior", (files) =>
  uploadImages(
    files.filter((f) => f.type.startsWith("image/")),
    "exterior",
  ),
);

setupDropzone("image-drop-interior", "image-input-interior", (files) =>
  uploadImages(
    files.filter((f) => f.type.startsWith("image/")),
    "interior",
  ),
);

setupDropzone("image-drop", "image-input", (files) =>
  uploadImages(files.filter((f) => f.type.startsWith("image/"))),
);

setupDropzone("audio-drop", "audio-input", (files) => {
  const audio = files.find((f) => f.type.startsWith("audio/"));
  if (!audio) throw new Error("To nie jest plik audio.");
  return uploadAudio(audio);
});

$("audio-select")?.addEventListener("change", async (event) => {
  const path = event.target.value || null;
  if (path === audioPath) return;
  await applyAudioTrack(path);
});

$("generate-btn").addEventListener("click", generate);
$("export-video-btn")?.addEventListener("click", exportVideoToDisk);
$("generate-descriptions-btn")?.addEventListener("click", generateDescriptions);

$("slides-section-toggle")?.addEventListener("click", () => {
  const toggle = $("slides-section-toggle");
  const expanded = toggle?.getAttribute("aria-expanded") !== "true";
  setSlidesSectionExpanded(expanded);
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    $("prompt").value = chip.getAttribute("data-prompt") ?? "";
  });
});

$("sync-mode").addEventListener("change", () => {
  invalidateDerivedTiming();
  updateAudioMeta();
});
$("beats-per-slide")?.addEventListener("change", invalidateDerivedTiming);
$("beats-per-slide")?.addEventListener("input", invalidateDerivedTiming);
$("bpm")?.addEventListener("change", invalidateDerivedTiming);
$("sync-to-music")?.addEventListener("change", () => {
  invalidateDerivedTiming();
  updateAudioMeta();
});

document.querySelectorAll('input[name="content-mode"]').forEach((input) => {
  input.addEventListener("change", updateContentModeUi);
});

document.querySelectorAll("[data-modal-close]").forEach((el) => {
  el.addEventListener("click", closeSlideModal);
});

$("open-graphic-effects-btn")?.addEventListener("click", openGraphicEffectsModal);
$("open-text-effects-btn")?.addEventListener("click", openTextEffectsModal);
$("graphic-effects-save")?.addEventListener("click", saveGraphicEffectsDraft);
$("text-effects-save")?.addEventListener("click", saveTextEffectsDraft);
$("graphic-effects-select-all")?.addEventListener("click", () => {
  graphicEffectsDraft = new Set(ALL_GRAPHIC_EFFECTS);
  renderEffectsCheckboxGrid(
    "graphic-effects-list",
    ALL_GRAPHIC_EFFECTS,
    graphicEffectsDraft,
    "graphic",
  );
});
$("graphic-effects-select-none")?.addEventListener("click", () => {
  graphicEffectsDraft = new Set();
  renderEffectsCheckboxGrid(
    "graphic-effects-list",
    ALL_GRAPHIC_EFFECTS,
    graphicEffectsDraft,
    "graphic",
  );
});
$("text-effects-select-all")?.addEventListener("click", () => {
  textEffectsDraft = new Set(ALL_TEXT_EFFECTS);
  renderEffectsCheckboxGrid(
    "text-effects-list",
    ALL_TEXT_EFFECTS,
    textEffectsDraft,
    "text",
  );
});
$("text-effects-select-none")?.addEventListener("click", () => {
  textEffectsDraft = new Set();
  renderEffectsCheckboxGrid(
    "text-effects-list",
    ALL_TEXT_EFFECTS,
    textEffectsDraft,
    "text",
  );
});
document.querySelectorAll("[data-graphic-effects-close]").forEach((el) => {
  el.addEventListener("click", closeGraphicEffectsModal);
});
document.querySelectorAll("[data-text-effects-close]").forEach((el) => {
  el.addEventListener("click", closeTextEffectsModal);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (editingSlideIndex != null) {
    closeSlideModal();
    return;
  }
  if (!$("graphic-effects-modal")?.hidden) {
    closeGraphicEffectsModal();
    return;
  }
  if (!$("text-effects-modal")?.hidden) {
    closeTextEffectsModal();
  }
});

$("save-project-btn")?.addEventListener("click", async () => {
  const btn = $("save-project-btn");
  if (!activeProjectId || !btn) return;
  btn.disabled = true;
  setSaveProjectStatus("Zapisywanie…");
  try {
    await saveCurrentProjectDraft();
    setSaveProjectStatus("Zapisano.", "ok");
  } catch (error) {
    setSaveProjectStatus(
      error instanceof Error ? error.message : "Nie udało się zapisać projektu.",
      "err",
    );
  } finally {
    updateSaveProjectButton();
  }
});

$("create-project-btn")?.addEventListener("click", async () => {
  try {
    await createVideoProject();
  } catch (error) {
    const errorEl = $("projects-error");
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = error instanceof Error ? error.message : "Nie udało się utworzyć projektu.";
    }
  }
});

$("back-to-projects")?.addEventListener("click", async () => {
  try {
    if (activeProjectId) {
      await saveCurrentProjectDraft();
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Nie udało się zapisać projektu.", "err");
    return;
  }
  showProjectsView();
  try {
    await loadVideoProjects();
  } catch (error) {
    const errorEl = $("projects-error");
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = error instanceof Error ? error.message : "Nie udało się odświeżyć listy.";
    }
  }
});

$("project-delete-confirm")?.addEventListener("click", async () => {
  try {
    await confirmDeleteProject();
  } catch (error) {
    const errorEl = $("projects-error");
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = error instanceof Error ? error.message : "Nie udało się usunąć projektu.";
    }
  }
});

document.querySelectorAll("[data-project-modal-close]").forEach((el) => {
  el.addEventListener("click", closeDeleteProjectModal);
});

const initPanel = async () => {
  updateEffectsSummary();
  await loadHealth();
  await loadSessionUser();
  await loadAudioLibrary();
  updateSyncPanelVisibility();
  try {
    await loadVideoProjects();
  } catch (error) {
    const errorEl = $("projects-error");
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = error instanceof Error ? error.message : "Nie udało się wczytać projektów.";
    }
  }

  const projectId = getProjectIdFromUrl();
  if (projectId) {
    await openProject(projectId, { skipUrl: true });
    return;
  }

  showProjectsView();
};

initPanel();
