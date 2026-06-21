import type { ProjectSlide } from "../src/projectTypes";

const SCENE_HEADLINES: { match: RegExp; titles: string[] }[] = [
  {
    match: /fotel|siedzen|kanap|tapicer|kierownic/i,
    titles: [
      "Komfort na dłuższe dystanse",
      "Fotele, które trzymają w kierunku",
      "Tapicerka bez kompromisów",
    ],
  },
  {
    match: /bagażnik|ładown|kufr/i,
    titles: ["Przestrzeń na codzienne tempo", "Bagażnik na dalsze plany"],
  },
  {
    match: /kokpit|deska|ekran|wyświetlacz|navi/i,
    titles: [
      "Kokpit skoncentrowany na kierowcy",
      "Technologia w zasięgu wzroku",
    ],
  },
  {
    match: /przód|mask|grill|lamp|reflektor/i,
    titles: ["Charakter od pierwszego spojrzenia", "Frontowa sygnatura marki"],
  },
  {
    match: /profil|bok|lini/i,
    titles: ["Sylwetka z charakterem", "Proporcje dopracowane w detalu"],
  },
  {
    match: /tył|tyln|spoiler/i,
    titles: ["Tył z wyrazem", "Zakończenie z klasą"],
  },
  {
    match: /felg|koł/i,
    titles: ["Felgi dopełniające sylwetkę", "Styl w ruchu"],
  },
  {
    match: /silnik|moc|moment|turbo|0-100|przyspiesz/i,
    titles: [
      "Napęd bez kompromisów",
      "Moc w czystej formie",
      "Dynamika na wyciągnięcie gazu",
    ],
  },
  {
    match: /skrzyni|bieg|automat|manual/i,
    titles: ["Skrzynia dopasowana do charakteru", "Płynna zmiana biegów"],
  },
  {
    match: /napęd|xdrive|quattro|4x4|awd/i,
    titles: ["Trakcja na każdą nawierzchnię", "Napęd z pewnością siebie"],
  },
];

const TOPIC_HEADLINES: { match: RegExp; titles: string[] }[] = [
  {
    match: /^moc|mocy|silnik|motor/i,
    titles: ["Napęd bez kompromisów", "Serce maszyny"],
  },
  {
    match: /^moment|obrot/i,
    titles: ["Moment, który czuć", "Krzywa momentu bez luki"],
  },
  {
    match: /^0-100|przyspiesz/i,
    titles: ["Przyspieszenie z impetem", "Zero do setki w rytmie"],
  },
  {
    match: /^skrzyni|bieg/i,
    titles: ["Skrzynia dopasowana do charakteru"],
  },
  {
    match: /^napęd|xdrive|quattro/i,
    titles: ["Napęd z pewnością siebie"],
  },
  {
    match: /^bagaż|ładown/i,
    titles: ["Przestrzeń na codzienne tempo"],
  },
];

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const pickHeadline = (options: string[], seed: string) =>
  options[hashString(seed) % options.length];

const polishSpecLine = (text: string): string => {
  let line = text.trim();
  if (!line) return "";

  line = line
    .replace(/\s*[,;]\s*/g, " · ")
    .replace(/\s*\/\s*/g, " · ")
    .replace(/\s{2,}/g, " ")
    .replace(/\bkm\/h\b/gi, "km/h")
    .replace(/\b(\d+)\s*km\b(?!\s*\/)/gi, "$1 KM")
    .replace(/\b(\d+)\s*nm\b/gi, "$1 Nm")
    .replace(/\b(\d+)\s*km\/h\b/gi, "$1 km/h")
    .replace(/\b(\d+)\s*l\b/gi, "$1 l");

  return line.replace(/\s·\s·\s/g, " · ").replace(/^·\s*/, "").trim();
};

const headlineFromRawTitle = (title: string, slide: ProjectSlide): string => {
  const scene = `${slide.sceneLabel ?? ""} ${slide.image}`.toLowerCase();
  const raw = title.trim();

  for (const entry of SCENE_HEADLINES) {
    if (entry.match.test(scene)) {
      return pickHeadline(entry.titles, `${slide.image}-${scene}`);
    }
  }

  for (const entry of TOPIC_HEADLINES) {
    if (entry.match.test(raw)) {
      return pickHeadline(entry.titles, `${slide.image}-${raw}`);
    }
  }

  if (raw.length <= 4 || /^\d/.test(raw)) {
    return raw;
  }

  if (/^[A-ZĄĆĘŁŃÓŚŹŻ\s-]{2,28}$/.test(raw) && raw === raw.toUpperCase()) {
    return raw
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

/** Redakcyjny styl motoryzacyjny dla title/subtitle. */
export const formatMagazineCopy = (slide: ProjectSlide): ProjectSlide => {
  const title = headlineFromRawTitle(slide.title, slide);
  const subtitle = slide.subtitle ? polishSpecLine(slide.subtitle) : undefined;

  return {
    ...slide,
    title,
    subtitle,
  };
};

export const MAGAZINE_STYLE_PROMPT = `
STYL TEKSTÓW — redakcja motoryzacyjna (np. Auto Świat, Top Gear, Autocar):
- title: nagłówek redakcyjny, 3–6 słów, bez wykrzykników i clickbaitu. Np. „Precyzja na asfalcie”, „Wnętrze bez kompromisów”, „Moc w czystej formie”.
- subtitle: zwięzła specyfikacja lub opis kadru · poprawne jednostki (KM, Nm, km/h, l) · separator „ · ” zamiast przecinków.
- Ton: profesjonalny, pewny, rzeczowy — jak test redakcyjny, NIE ogłoszenie OLX, NIE slang.
- Unikaj: „super”, „zajebiste”, caps lock, powtórzeń, ogólników („piękne auto”).
- Parametry elegancko: „3,0 l R6 twin-turbo · 510 KM · 650 Nm · 0–100 km/h w 3,9 s”.
- Każdy slajd = inny wątek. Liczby podawaj tylko raz w całym wideo.`;
