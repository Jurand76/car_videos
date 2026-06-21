/**
 * Weryfikuje layout siatki na PRAWDZIWYM panelu (/video/index.html + app.js + project.json).
 * Uruchom: node scripts/verify-slides-grid.mjs
 */
const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:4000";
const PANEL_URL = `${GATEWAY}/video/index.html`;
const VIEWPORT_WIDTH = 1400;

const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
};

const main = async () => {
  const health = await fetch(`${GATEWAY}/api/health`);
  if (!health.ok) {
    throw new Error(`Gateway niedostępny (${GATEWAY}). Uruchom: npm run dev:gateway`);
  }

  const project = await fetchJson(`${GATEWAY}/api/project`);
  if ((project.slides ?? []).length < 5) {
    throw new Error("Za mało slajdów w project.json do testu siatki (min. 5).");
  }

  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: VIEWPORT_WIDTH, height: 1200 });
    await page.goto(PANEL_URL, { waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForFunction(
      () => document.querySelectorAll(".slide-tile").length >= 5,
      { timeout: 20000 },
    );
    await page.waitForFunction(
      () => {
        const img = document.querySelector(".slide-tile-photo > img");
        return img && img.naturalWidth > 0;
      },
      { timeout: 15000 },
    );

    const result = await page.evaluate(() => {
      const grid = document.getElementById("slides-list");
      const tiles = [...document.querySelectorAll(".slide-tile")];
      const gs = getComputedStyle(grid);
      const first = tiles[0];
      const photo = first?.querySelector(".slide-tile-photo");
      const img = first?.querySelector("img");
      const colCount = gs.gridTemplateColumns.split(" ").filter(Boolean).length;
      const gridWidth = grid.getBoundingClientRect().width;
      const tileWidth = first?.getBoundingClientRect().width ?? 0;
      const photoHeight = photo?.getBoundingClientRect().height ?? 0;
      const imgHeight = img?.getBoundingClientRect().height ?? 0;
      const row1Lefts = tiles.slice(0, 5).map((t) => Math.round(t.getBoundingClientRect().left));
      const row1Tops = tiles.slice(0, 5).map((t) => Math.round(t.getBoundingClientRect().top));
      const row2Top =
        tiles[5] != null ? Math.round(tiles[5].getBoundingClientRect().top) : null;

      return {
        slideCount: tiles.length,
        colCount,
        gridDisplay: gs.display,
        gridWidth: Math.round(gridWidth),
        tileWidth: Math.round(tileWidth),
        photoHeight: Math.round(photoHeight),
        imgHeight: Math.round(imgHeight),
        imgNatural: img ? { w: img.naturalWidth, h: img.naturalHeight } : null,
        row1SameLine: new Set(row1Tops).size === 1,
        row2BelowRow1: row2Top != null && row2Top > row1Tops[0] + 40,
        cssLoaded: Boolean(document.querySelector('link[href*="styles.css"]')),
      };
    });

    const failures = [];
    if (!result.cssLoaded) failures.push("brak styles.css");
    if (result.gridDisplay !== "grid") failures.push(`display=${result.gridDisplay}`);
    if (result.colCount !== 5) failures.push(`kolumn=${result.colCount}`);
    if (result.gridWidth > VIEWPORT_WIDTH) failures.push(`grid ${result.gridWidth}px > viewport`);
    if (result.tileWidth > 280) failures.push(`kafel ${result.tileWidth}px za szeroki`);
    if (result.photoHeight > 180) failures.push(`miniatura ${result.photoHeight}px za wysoka`);
    if (result.imgHeight > result.photoHeight + 2) failures.push("obraz wystaje poza miniaturę");
    if (!result.row1SameLine) failures.push("pierwszy rząd nie w jednej linii");
    if (result.slideCount > 5 && !result.row2BelowRow1) failures.push("brak drugiego rzędu");

    if (failures.length) {
      console.error("FAIL — panel wideo:", failures.join("; "));
      console.error(JSON.stringify(result, null, 2));
      process.exit(1);
    }

    console.log("OK — panel wideo (prawdziwy index.html):");
    console.log(
      `  ${result.slideCount} slajdów · siatka ${result.gridWidth}px · 5× ~${result.tileWidth}px · miniatura ${result.photoHeight}px (natural ${result.imgNatural?.w}×${result.imgNatural?.h})`,
    );
  } finally {
    await browser.close();
  }
};

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
