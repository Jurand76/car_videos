/**
 * Za proxy wykr.es Cloudflare cache'uje bundle.js na 4h.
 * Bez query stringa przeglądarka dostaje stary bundle (bez HMR runtime) → push na undefined.
 */
const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "@remotion",
  "bundler",
  "dist",
  "index-html.js",
);

const marker = "autka-bundle-cache-bust";
const original = '\t\t<script src="${publicPath}bundle.js"></script>';
const replacement =
  '\t\t<script src="${publicPath}bundle.js?v=${staticHash.replace(/^\\//, "").replace(/^static-/, "")}"></script> /* ' +
  marker +
  " */";

if (!fs.existsSync(target)) {
  console.warn(`[patch-remotion] Pominięto index-html — brak: ${target}`);
  process.exit(0);
}

const content = fs.readFileSync(target, "utf-8");
if (content.includes(marker)) {
  console.log("[patch-remotion] index-html cache bust już załatwiony.");
  process.exit(0);
}

if (!content.includes(original)) {
  console.warn("[patch-remotion] Nieznana wersja index-html.js — patch pominięty.");
  process.exit(0);
}

fs.writeFileSync(target, content.replace(original, replacement), "utf-8");
console.log("[patch-remotion] Naprawiono index-html (cache bust na bundle.js).");
