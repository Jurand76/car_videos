/**
 * Za proxy wykr.es HMR update check zwraca HTML → process-update robi reload w pętli.
 * Na wykr.es ignorujemy błąd i pełny reload zamiast przeładowywać stronę.
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
  "hot-middleware-client",
  "process-update.js",
);

const markerError = "autka-vps-skip-hmr-reload";
const markerPerform = "autka-vps-skip-hmr-perform-reload";

const patches = [
  {
    marker: markerError,
    original: `        if (options.warn) {
            console.warn('[Fast refresh] Update check failed: ' + (err.stack || err.message));
            (0, url_state_1.reloadUrl)();
        }`,
    replacement: `        if (options.warn) {
            console.warn('[Fast refresh] Update check failed: ' + (err.stack || err.message));
            /* ${markerError} */
            if (typeof window !== 'undefined' && /wykr\\.es$/i.test(window.location.hostname)) {
                return;
            }
            (0, url_state_1.reloadUrl)();
        }`,
  },
  {
    marker: markerPerform,
    original: `    function performReload() {
        if (!reload) {
            return;
        }
        if (options.warn)
            console.warn('[Fast refresh] Reloading page');
        (0, url_state_1.reloadUrl)();
    }`,
    replacement: `    function performReload() {
        if (!reload) {
            return;
        }
        /* ${markerPerform} */
        if (typeof window !== 'undefined' && /wykr\\.es$/i.test(window.location.hostname)) {
            if (options.warn)
                console.warn('[Fast refresh] Reload suppressed on VPS proxy');
            return;
        }
        if (options.warn)
            console.warn('[Fast refresh] Reloading page');
        (0, url_state_1.reloadUrl)();
    }`,
  },
];

if (!fs.existsSync(target)) {
  console.warn(`[patch-remotion] Pominięto process-update — brak: ${target}`);
  process.exit(0);
}

let content = fs.readFileSync(target, "utf-8");
let applied = 0;

for (const patch of patches) {
  if (content.includes(patch.marker)) {
    continue;
  }
  if (!content.includes(patch.original)) {
    console.warn(
      `[patch-remotion] Nieznana wersja process-update.js — pominięto fragment (${patch.marker}).`,
    );
    continue;
  }
  content = content.replace(patch.original, patch.replacement);
  applied++;
}

if (applied === 0) {
  console.log("[patch-remotion] process-update VPS patch już załatwiony.");
  process.exit(0);
}

fs.writeFileSync(target, content, "utf-8");
console.log(`[patch-remotion] Naprawiono process-update (${applied} fragmentów, bez reload na wykr.es).`);
