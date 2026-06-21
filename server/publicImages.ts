import fs from "fs";
import path from "path";
import type { ProjectSlide } from "../src/projectTypes";
import { inferLocationFromPath } from "./slideMatching";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export const sortImagePaths = (paths: string[]) =>
  [...paths].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );

export const listPublicImages = (publicDir: string): string[] => {
  const scan = (dir: string, prefix: string): string[] => {
    if (!fs.existsSync(dir)) {
      return [];
    }

    return fs.readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (fs.statSync(full).isDirectory()) {
        return scan(full, rel);
      }
      const ext = path.extname(name).toLowerCase();
      if (!IMAGE_EXT.has(ext)) {
        return [];
      }
      return [rel.replace(/\\/g, "/")];
    });
  };

  return sortImagePaths(scan(publicDir, ""));
};

export const slideTitleFromImage = (image: string): string => {
  const base = path.basename(image, path.extname(image));
  return base.replace(/[-_]/g, " ");
};

/** Scala slajdy z klienta z obrazkami z public/. Domyślnie bierze WSZYSTKIE pliki. */
export const mergeSlidesWithPublicImages = (
  slides: ProjectSlide[],
  publicDir: string,
  useAllPublic = true,
): { slides: ProjectSlide[]; added: number; removed: number } => {
  const available = listPublicImages(publicDir);
  const availableSet = new Set(available);

  if (!useAllPublic) {
    const kept = slides.filter((slide) => availableSet.has(slide.image));
    return {
      slides: kept,
      added: 0,
      removed: slides.length - kept.length,
    };
  }

  const byImage = new Map<string, ProjectSlide>();

  for (const slide of slides) {
    if (availableSet.has(slide.image)) {
      byImage.set(slide.image, {
        ...slide,
        location: slide.location ?? inferLocationFromPath(slide.image),
        sceneLabel: slide.sceneLabel ?? "",
      });
    }
  }

  let added = 0;
  for (const image of available) {
    if (!byImage.has(image)) {
      byImage.set(image, {
        image,
        title: slideTitleFromImage(image),
        subtitle: "",
        location: inferLocationFromPath(image),
        sceneLabel: "",
      });
      added++;
    }
  }

  const removed = slides.filter((slide) => !availableSet.has(slide.image)).length;

  return {
    slides: available.map((image) => byImage.get(image)!),
    added,
    removed,
  };
};
