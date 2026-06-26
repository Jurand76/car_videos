/**
 * Docker ma NODE_ENV=production, a HTML Studia nie wstrzykuje NODE_ENV do window.process.
 * setup-environment.js rzuca błąd → biały ekran / Studio się nie odpala.
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
  "setup-environment.js",
);

const marker = "autka-node-env-fallback";
const replacement = `        /* ${marker} */
        return {
            NODE_ENV: process.env.NODE_ENV || "development",
        };`;

const original = `        if (!process.env.NODE_ENV) {
            throw new Error(\`\${getEnvVar()} is not set\`);
        }
        return {
            NODE_ENV: process.env.NODE_ENV,
        };`;

if (!fs.existsSync(target)) {
  console.warn(`[patch-remotion] Pominięto NODE_ENV — brak: ${target}`);
  process.exit(0);
}

const content = fs.readFileSync(target, "utf-8");
if (content.includes(marker)) {
  console.log("[patch-remotion] NODE_ENV fallback już załatwiony.");
  process.exit(0);
}

if (!content.includes(original)) {
  console.warn("[patch-remotion] Nieznana wersja setup-environment.js — patch pominięty.");
  process.exit(0);
}

fs.writeFileSync(target, content.replace(original, replacement), "utf-8");
console.log("[patch-remotion] Naprawiono NODE_ENV w setup-environment.js.");
