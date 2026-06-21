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

const getContentMode = () => {
  const selected = document.querySelector('input[name="content-mode"]:checked');
  return /** @type {"manual" | "fromText"} */ (
    selected?.getAttribute("value") ?? "manual"
  );
};

const updateContentModeUi = () => {
  const fromText = getContentMode() === "fromText";
  $("info-text-block").hidden = !fromText;
  renderSlides();
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
  el.textContent = message;
  el.className = `status ${type}`;
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
  if (fromText) return title || "Brak opisu kadru";
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
    <label class="modal-field">
      <span>Co widać na kadru</span>
      <input type="text" data-field="sceneLabel" value="${escapeHtml(slide.sceneLabel ?? "")}" placeholder="np. fotel kierowcy, bagażnik, przód auta" />
    </label>
    <label class="modal-field">
      <span>Tytuł na wideo</span>
      <input type="text" data-field="title" value="${escapeHtml(slide.title)}" placeholder="${fromText ? "AI wybierze tytuł…" : "Tytuł na wideo"}"${fromText ? " disabled" : ""} />
    </label>
    <label class="modal-field">
      <span>Podtytuł</span>
      <input type="text" data-field="subtitle" value="${escapeHtml(slide.subtitle ?? "")}" placeholder="${fromText ? "AI wybierze podtytuł…" : "Podtytuł"}"${fromText ? " disabled" : ""} />
    </label>
    ${slide.beats ? `<p class="modal-hint">Rytm slajdu: <span class="beats-badge">${slide.beats}♩</span> (ustawione przy generowaniu)</p>` : ""}
    ${fromText && !slide.sceneLabel?.trim() ? `<p class="modal-hint">Uzupełnij opis kadru — AI dopasuje tekst bez powtórzeń.</p>` : ""}
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
    updateSlideTileInGrid(index);
  });

  if (!fromText) {
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
  }

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
  try {
    const res = await fetch("/api/project");
    if (!res.ok) {
      $("manifest-preview").textContent =
        res.status === 404
          ? "Brak wygenerowanego projektu — kliknij „Generuj flow animacji”."
          : `Nie udało się wczytać manifestu (HTTP ${res.status}).`;
      return;
    }
    const project = await res.json();
    $("prompt").value = project.prompt ?? "";
    setContentMode(project.contentMode ?? "manual");
    $("info-text").value = project.infoText ?? "";
    slides = project.slides ?? [];
    if ($("use-all-public").checked) {
      await syncAllPublicImages();
    } else {
      renderSlides();
      updateSlideCountHint();
    }
    audioPath = project.audio ?? null;
    audioDurationSeconds = project.sync?.audioDurationSeconds ?? null;
    detectedBpm = project.sync?.bpm ?? null;
    if (audioPath) {
      $("audio-name").textContent = `Audio: ${audioPath}`;
    }
    if (project.sync?.beatsPerSlide) {
      $("beats-per-slide").value = String(project.sync.beatsPerSlide);
    }
    if (project.sync?.mode) {
      $("sync-mode").value = project.sync.mode;
    }
    if (project.sync?.bpm) {
      $("bpm").value = String(project.sync.bpm);
    }
    if (project.sync?.beatCount && project.sync?.bpm) {
      beatAnalysis = {
        bpm: project.sync.bpm,
        beatCount: project.sync.beatCount,
        confidence: project.sync.confidence ?? 0.7,
      };
    }
    $("sync-to-music").checked = project.sync?.enabled !== false;
    updateAudioMeta();
    $("manifest-preview").textContent = JSON.stringify(project, null, 2);
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
};

const generate = async () => {
  const prompt = $("prompt").value.trim();
  const contentMode = getContentMode();
  const infoText = $("info-text").value.trim();

  if (!prompt) {
    setStatus("Wpisz prompt opisujący styl wideo.", "err");
    return;
  }
  if (contentMode === "fromText" && !infoText) {
    setStatus("Wklej opis auta / parametry techniczne.", "err");
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
    contentMode === "fromText"
      ? addedFromPublic > 0
        ? `Dodano ${addedFromPublic} obrazków — AI układa teksty i flow...`
        : "AI układa teksty i flow animacji..."
      : addedFromPublic > 0
        ? `Dodano ${addedFromPublic} obrazków — generuję flow...`
        : "Generuję flow animacji...",
  );

  try {
    const bpmValue = $("bpm").value.trim();
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
    slides = data.project.slides ?? slides;
    renderSlides();
    updateSlideCountHint();
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
$("scan-btn").addEventListener("click", scanPublicAssets);
$("clear-slides-btn").addEventListener("click", () => {
  slides = [];
  renderSlides();
  updateSlideCountHint();
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

loadHealth();
updateSyncPanelVisibility();
loadProject();
updateSlideCountHint();
renderSlides();
