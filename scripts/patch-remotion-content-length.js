/**
 * Remotion Studio wymaga Content-Length w odpowiedzi HEAD.
 * Reverse proxy Mikrus (wykr.es) często go usuwa → "content-length is null".
 * Fallback: Range GET albo rozmiar blobu.
 */
const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "@remotion",
  "studio",
  "dist",
  "helpers",
  "get-asset-metadata.js",
);

const marker = "autka-content-length-fallback";
const replacement = `        let size = file.headers.get('content-length');
        if (!size) {
            /* ${marker} */
            const probe = await fetch(src, { method: 'GET', headers: { Range: 'bytes=0-0' } });
            const contentRange = probe.headers.get('content-range');
            if (contentRange) {
                const total = contentRange.split('/')[1];
                if (total && total !== '*') {
                    size = total;
                }
            }
            if (!size) {
                const blob = await probe.blob();
                size = String(blob.size);
            }
        }`;

const original = `        const size = file.headers.get('content-length');
        if (!size) {
            throw new Error('Unexpected error: content-length is null');
        }`;

if (!fs.existsSync(target)) {
  console.warn(`[patch-remotion] Pominięto — brak pliku: ${target}`);
  process.exit(0);
}

const content = fs.readFileSync(target, "utf-8");

if (content.includes(marker)) {
  console.log("[patch-remotion] Już załatwione (content-length fallback).");
  process.exit(0);
}

if (!content.includes(original)) {
  console.warn(
    "[patch-remotion] Nieznana wersja @remotion/studio — patch nie zastosowany.",
  );
  process.exit(0);
}

fs.writeFileSync(target, content.replace(original, replacement), "utf-8");
console.log("[patch-remotion] Naprawiono get-asset-metadata (Content-Length fallback).");
