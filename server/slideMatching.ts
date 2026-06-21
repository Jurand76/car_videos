import type { ProjectSlide, SlideLocation } from "../src/projectTypes";

export type InfoChunk = { title: string; subtitle?: string };

export const inferLocationFromPath = (image: string): SlideLocation => {
  const lower = image.toLowerCase().replace(/\\/g, "/");
  if (
    /(?:^|\/)(exterior|zewnatrz|outside|ext|zewn)(?:\/|[-_]|$)/.test(lower)
  ) {
    return "exterior";
  }
  if (
    /(?:^|\/)(interior|wewnatrz|inside|int|wewn)(?:\/|[-_]|$)/.test(lower)
  ) {
    return "interior";
  }
  if (/(?:^|\/)detail(?:\/|[-_]|$)/.test(lower)) {
    return "detail";
  }
  return "other";
};

const chunkText = (chunk: InfoChunk) =>
  `${chunk.title} ${chunk.subtitle ?? ""}`.toLowerCase();

const sceneText = (slide: ProjectSlide) =>
  `${slide.sceneLabel ?? ""} ${slide.title}`.toLowerCase();

const scoreChunkForSlide = (
  chunk: InfoChunk,
  slide: ProjectSlide,
): number => {
  const text = chunkText(chunk);
  const scene = sceneText(slide);
  const location = slide.location ?? inferLocationFromPath(slide.image);
  let score = 0;

  for (const word of scene.split(/\s+/).filter((part) => part.length > 3)) {
    if (text.includes(word)) {
      score += 12;
    }
  }

  const interiorChunk =
    /fotel|siedzen|kanap|tapicer|kokpit|deska|kierownic|ekran|wyświetlacz|wnętrz|navi|audio/i.test(
      text,
    );
  const exteriorChunk =
    /przód|tył|profil|bok|felg|lamp|mask|karoser|lakier|zderzak|nadwozi|lini/i.test(
      text,
    );
  const trunkChunk = /bagaż|ładown|boot|luggage|\d+\s*l/i.test(text);
  const powerChunk =
    /silnik|moc|moment|\bkm\b|km\/h|0-100|przyspiesz|turbo|\bnm\b/i.test(text);
  const gearboxChunk = /skrzyni|bieg|automat|manual|steptronic/i.test(text);
  const driveChunk = /napęd|xdrive|quattro|4x4|awd|4matic/i.test(text);

  const interiorScene =
    /fotel|siedzen|kanap|tapicer|kokpit|deska|kierownic|ekran|wyświetlacz|wnętrz/i.test(
      scene,
    );
  const exteriorScene =
    /przód|tył|profil|bok|felg|lamp|mask|karoser|lakier|zderzak|nadwozi/i.test(
      scene,
    );
  const trunkScene = /bagaż|ładown|boot|kufr/i.test(scene);
  const powerScene = /silnik|moc|moment|0-100|przyspiesz/i.test(scene);

  if (interiorScene && interiorChunk) score += 18;
  if (exteriorScene && exteriorChunk) score += 18;
  if (trunkScene && trunkChunk) score += 20;
  if (powerScene && powerChunk) score += 16;
  if (gearboxChunk && /skrzyni|bieg|automat/i.test(scene)) score += 16;
  if (driveChunk && /napęd|4x4|xdrive|quattro/i.test(scene)) score += 16;

  if (location === "interior") {
    if (interiorChunk) score += 8;
    if (exteriorChunk || trunkChunk) score -= 10;
  }
  if (location === "exterior") {
    if (exteriorChunk || powerChunk) score += 6;
    if (interiorChunk) score -= 10;
  }

  if (interiorScene && (trunkChunk || exteriorChunk)) score -= 14;
  if (trunkScene && interiorChunk) score -= 14;
  if (exteriorScene && interiorChunk) score -= 12;

  return score;
};

/** Przypisuje unikalne fragmenty opisu do slajdów wg sceneLabel / location. */
export const assignInfoChunksToSlides = (
  slides: ProjectSlide[],
  chunks: InfoChunk[],
): ProjectSlide[] => {
  if (chunks.length === 0) {
    return slides;
  }

  const used = new Set<number>();
  const assignments = new Map<number, number>();

  const pairs: { slideIndex: number; chunkIndex: number; score: number }[] = [];
  slides.forEach((slide, slideIndex) => {
    chunks.forEach((chunk, chunkIndex) => {
      pairs.push({
        slideIndex,
        chunkIndex,
        score: scoreChunkForSlide(chunk, slide),
      });
    });
  });

  pairs.sort((a, b) => b.score - a.score);

  const assignedSlides = new Set<number>();
  for (const pair of pairs) {
    if (assignedSlides.has(pair.slideIndex) || used.has(pair.chunkIndex)) {
      continue;
    }
    if (pair.score < 1) {
      continue;
    }
    assignments.set(pair.slideIndex, pair.chunkIndex);
    assignedSlides.add(pair.slideIndex);
    used.add(pair.chunkIndex);
  }

  for (let slideIndex = 0; slideIndex < slides.length; slideIndex++) {
    if (assignments.has(slideIndex)) continue;
    const chunkIndex = chunks.findIndex((_, index) => !used.has(index));
    if (chunkIndex === -1) break;
    assignments.set(slideIndex, chunkIndex);
    used.add(chunkIndex);
  }

  return slides.map((slide, slideIndex) => {
    const chunkIndex = assignments.get(slideIndex);
    if (chunkIndex == null) {
      return slide;
    }
    const chunk = chunks[chunkIndex];
    return {
      ...slide,
      title: chunk.title,
      subtitle: chunk.subtitle ?? "",
    };
  });
};
