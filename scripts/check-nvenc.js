#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

const loadProjectEnv = () => {
  const file = path.join(ROOT, "project.env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] === undefined) {
      process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
};

const candidates = () => {
  const list = [];
  if (process.env.REMOTION_BINARIES_DIRECTORY) {
    list.push(process.env.REMOTION_BINARIES_DIRECTORY);
  }
  list.push(path.join(ROOT, "tools", "remotion-bin-win"));
  list.push("C:/ffmpeg/bin");
  return [...new Set(list)];
};

loadProjectEnv();

console.log("=== Remotion / NVENC ===");
console.log(`Platforma: ${process.platform}`);
console.log(`REMOTION_GPU_RENDER: ${process.env.REMOTION_GPU_RENDER ?? "(domyślnie win32=1)"}`);
console.log(
  `REMOTION_HARDWARE_ACCELERATION: ${process.env.REMOTION_HARDWARE_ACCELERATION ?? "(domyślnie if-possible na Windows)"}`,
);

let found = null;
for (const dir of candidates()) {
  const ff = path.join(dir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  if (!fs.existsSync(ff)) continue;
  const r = spawnSync(ff, ["-hide_banner", "-encoders"], { encoding: "utf8" });
  const nvenc = (r.stdout || "").includes("h264_nvenc");
  console.log(`\n${dir}`);
  console.log(`  ffmpeg: ${ff}`);
  console.log(`  h264_nvenc: ${nvenc ? "TAK" : "NIE"}`);
  if (nvenc && !found) found = dir;
}

if (found) {
  console.log(`\nOK — używany katalog: ${found}`);
  process.exit(0);
}

console.log("\nBrak FFmpeg z NVENC. Uruchom: npm run setup:nvenc");
process.exit(1);
