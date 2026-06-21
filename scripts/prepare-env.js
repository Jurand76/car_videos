const fs = require("fs");
const path = require("path");

const projectEnvPath = path.join(__dirname, "..", "project.env");
const photosEnvPath = path.join(__dirname, "..", "photos", "web", ".env.local");

const NEXT_KEYS = [
  "API_URL",
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_GATEWAY_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
];

const parseEnvFile = (content) => {
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    vars[key] = value;
  }
  return vars;
};

if (!fs.existsSync(projectEnvPath)) {
  console.log(
    "Brak project.env — skopiuj project.env.example jako project.env przed pierwszym dev:all",
  );
  process.exit(0);
}

const vars = parseEnvFile(fs.readFileSync(projectEnvPath, "utf-8"));
const lines = NEXT_KEYS.filter((key) => vars[key] != null && vars[key] !== "").map(
  (key) => `${key}=${vars[key]}`,
);

if (lines.length === 0) {
  console.log("project.env nie zawiera zmiennych Next.js (NEXTAUTH_*, NEXT_PUBLIC_*)");
  process.exit(0);
}

fs.writeFileSync(photosEnvPath, `${lines.join("\n")}\n`);
console.log("Wygenerowano photos/web/.env.local z project.env");
