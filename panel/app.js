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
/** @type {Record<string, unknown> | null} */
let persistedManifestMeta = null;

const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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

  if (beatAnalysis) {
    const analyzer =
      beatAnalysis.analyzer === "essentia" ? "Essentia" : "legacy";
    const accents =
      beatAnalysis.accentCount != null
        ? ` · ${beatAnalysis.accentCount} mocnych akcentów`
        : "";
    beatMeta.textContent = `Detekcja (${analyzer}): ~${beatAnalysis.bpm} BPM · ${beatAnalysis.beatCount} beatów${accents} · pewność ${Math.round(beatAnalysis.confidence * 100)}%`;
  } else if ($("sync-mode")?.value === "beats") {
    beatMeta.textContent = "Detekcja beatów przy generowaniu (lub wrzuć plik ponownie)";
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
  updateSaveProjectButton();
};

const showEditorView = (project) => {
  $("view-projects").hidden = true;
  $("view-editor").hidden = false;
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

const buildManifestFromEditor = () => ({
  version: 1,
  prompt: $("prompt").value.trim(),
  contentMode: getContentMode(),
  infoText: $("info-text").value.trim(),
  generatedAt: new Date().toISOString(),
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
  useAllPublicImages: $("use-all-public").checked,
  slideTimings: persistedManifestMeta?.slideTimings,
  totalDurationFrames: persistedManifestMeta?.totalDurationFrames,
  sync: {
    ...(persistedManifestMeta?.sync ?? {}),
    enabled: $("sync-to-music").checked,
    mode: $("sync-mode").value,
    beatsPerSlide: Number($("beats-per-slide").value) || 16,
    bpm: $("bpm").value.trim()
      ? Number($("bpm").value)
      : (detectedBpm ?? beatAnalysis?.bpm ?? persistedManifestMeta?.sync?.bpm ?? null),
    beatCount: beatAnalysis?.beatCount ?? persistedManifestMeta?.sync?.beatCount ?? null,
    confidence: beatAnalysis?.confidence ?? persistedManifestMeta?.sync?.confidence ?? null,
    audioDurationSeconds:
      audioDurationSeconds ?? persistedManifestMeta?.sync?.audioDurationSeconds ?? 0,
  },
});

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
  slides = [];
  audioPath = null;
  audioDurationSeconds = null;
  detectedBpm = null;
  beatAnalysis = null;
  $("prompt").value = "";
  $("info-text").value = "";
  $("audio-name").textContent = "";
  $("audio-meta").textContent = "";
  $("beat-meta").textContent = "";
  $("manifest-preview").textContent = "";
  $("bpm").value = "";
  $("sync-to-music").checked = true;
  $("sync-mode").value = "beats";
  $("beats-per-slide").value = "16";
  $("use-all-public").checked = false;
  setContentMode("manual");
  updateAudioMeta();
  renderSlides();
  updateSlideCountHint();
  setSlidesSectionExpanded(false);
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
  if (audioPath) {
    $("audio-name").textContent = `Audio: ${audioPath}`;
  }
  $("beats-per-slide").value = String(project.sync?.beatsPerSlide ?? 16);
  if (project.sync?.mode) {
    $("sync-mode").value = project.sync.mode;
  }
  if (project.sync?.bpm) {
    $("bpm").value = String(project.sync.bpm);
  }
  $("use-all-public").checked = project.useAllPublicImages === true;
  if (project.sync?.beatCount && project.sync?.bpm) {
    beatAnalysis = {
      bpm: project.sync.bpm,
      beatCount: project.sync.beatCount,
      confidence: project.sync.confidence ?? 0.7,
    };
  }
  $("sync-to-music").checked = project.sync?.enabled !== false;
  updateAudioMeta();
  renderSlides();
  updateSlideCountHint();
  $("manifest-preview").textContent = JSON.stringify(project, null, 2);
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
  const location = slide.location ?? inferLocationFromPath(slide.image);
  const parts = [getLocationLabel(location)];
  if (slide.subtitle?.trim() && getContentMode() !== "fromText") {
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
    updateSlideCountHint();
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
            <span class="slide-tile-badge${needsScene ? " warn" : ""}">${escapeHtml(getLocationLabel(location))}</span>
          </span>
          <span class="slide-tile-caption">
            <span class="slide-tile-title">${escapeHtml(caption)}</span>
            <span class="slide-tile-meta">${escapeHtml(getSlideMetaLine(slide))}</span>
          </span>
        </button>
        <button
          type="button"
          class="slide-tile-drag"
          draggable="true"
          title="Przeciągnij, żeby zmienić kolejność"
          aria-label="Zmień kolejność slajdu ${index + 1}"
        >⠿</button>
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
  renderSlides();
  updateSlideCountHint();
  return added;
};

const sortSlidePaths = (paths) =>
  [...paths].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );

const syncAllPublicImages = async () => {
  const res = await fetch("/api/assets");
  const data = await res.json();
  const images = sortSlidePaths(
    data.assets.filter((asset) => /\.(jpg|jpeg|png|webp|gif)$/i.test(asset)),
  );
  return addSlidesFromPaths(images);
};

const updateSlideCountHint = () => {
  const hint = $("slide-count-hint");
  if (!hint) return;
  if (!slides.length) {
    hint.textContent = "";
    return;
  }
  hint.textContent = `${slides.length} slajdów w kolejce — generowanie tworzy flow tylko z tej listy.`;
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

  setStatus("Wgrywam i analizuję beaty...");
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
  $("audio-name").textContent = `Wybrano: ${data.audio.filename}`;
  updateAudioMeta();
    setStatus(
    beatAnalysis
      ? `Analiza (${beatAnalysis.analyzer === "essentia" ? "Essentia" : "legacy"}): ${beatAnalysis.bpm} BPM, ${beatAnalysis.beatCount} beatów, ${beatAnalysis.accentCount ?? "?"} akcentów.`
      : "Muzyka gotowa (detekcja beatów przy generowaniu).",
    "ok",
  );
};

const scanPublicAssets = async () => {
  const added = await syncAllPublicImages();
  setStatus(
    added > 0
      ? `Dodano ${added} obrazków z public/ (razem ${slides.length}).`
      : `W public/ jest ${slides.length} obrazków — wszystkie już na liście.`,
    "ok",
  );
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

  let addedFromPublic = 0;
  if (!slides.length) {
    if ($("use-all-public").checked) {
      addedFromPublic = await syncAllPublicImages();
    }
    if (!slides.length) {
      setDescriptionsStatus("Brak obrazków w public/. Wrzuć pliki do public/ lub uploads/.", "err");
      if (btn) btn.disabled = false;
      return;
    }
  } else if ($("use-all-public").checked) {
    addedFromPublic = await syncAllPublicImages();
  }

  setDescriptionsStatus(
    addedFromPublic > 0
      ? `Dodano ${addedFromPublic} obrazków — generuję opisy slajdów...`
      : "Generuję opisy slajdów...",
  );

  try {
    const res = await fetch("/api/generate-descriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: activeProjectId,
        infoText,
        slides,
        useAllPublicImages: $("use-all-public").checked,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Generowanie opisów nieudane");

    slides = data.slides ?? data.project?.slides ?? slides;
    persistedManifestMeta = data.project ?? persistedManifestMeta;
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
    updateSlideCountHint();
    setDescriptionsStatus(data.message ?? "Opisy slajdów wygenerowane.", "ok");
  } catch (error) {
    setDescriptionsStatus(error instanceof Error ? error.message : "Błąd", "err");
  } finally {
    if (btn) btn.disabled = false;
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

  let addedFromPublic = 0;
  if (!slides.length) {
    if ($("use-all-public").checked) {
      addedFromPublic = await syncAllPublicImages();
    }
    if (!slides.length) {
      setStatus("Brak obrazków w public/. Wrzuć pliki do public/ lub uploads/.", "err");
      $("generate-btn").disabled = false;
      return;
    }
  } else if ($("use-all-public").checked) {
    addedFromPublic = await syncAllPublicImages();
  }

  setStatus(
    addedFromPublic > 0
      ? `Dodano ${addedFromPublic} obrazków — generuję flow animacji...`
      : "Generuję flow animacji...",
  );

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
        audioDurationSeconds,
        syncToMusic: $("sync-to-music").checked,
        syncMode: $("sync-mode").value,
        useAllPublicImages: $("use-all-public").checked,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Generowanie nieudane");

    $("manifest-preview").textContent = JSON.stringify(data.project, null, 2);
    persistedManifestMeta = data.project;
    slides = data.project.slides ?? slides;
    renderSlides();
    updateSlideCountHint();
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

  zone.addEventListener("click", () => input.click());
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

$("generate-btn").addEventListener("click", generate);
$("generate-descriptions-btn")?.addEventListener("click", generateDescriptions);
$("scan-btn").addEventListener("click", scanPublicAssets);
$("clear-slides-btn").addEventListener("click", () => {
  slides = [];
  renderSlides();
  updateSlideCountHint();
  setSlidesSectionExpanded(false);
});

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

$("sync-mode").addEventListener("change", updateAudioMeta);

document.querySelectorAll('input[name="content-mode"]').forEach((input) => {
  input.addEventListener("change", updateContentModeUi);
});

document.querySelectorAll("[data-modal-close]").forEach((el) => {
  el.addEventListener("click", closeSlideModal);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editingSlideIndex != null) {
    closeSlideModal();
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
  await loadHealth();
  await loadSessionUser();
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
