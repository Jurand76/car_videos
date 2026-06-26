#!/usr/bin/env node
/**
 * Windows: pobiera FFmpeg „full” (NVENC) i składa katalog binarek Remotion:
 * remotion.exe z @remotion/compositor + ffmpeg/ffprobe z gyan.dev.
 *
 * Uruchom: npm run setup:nvenc
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "tools", "remotion-bin-win");
const CACHE_DIR = path.join(ROOT, "tools", ".cache");
const ZIP_PATH = path.join(CACHE_DIR, "ffmpeg-8.1.1-full_build.zip");
const EXTRACT_DIR = path.join(CACHE_DIR, "ffmpeg-8.1.1-full_build");
const FFMPEG_URL =
  "https://github.com/GyanD/codexffmpeg/releases/download/8.1.1/ffmpeg-8.1.1-full_build.zip";

const log = (msg) => console.log(`[setup:nvenc] ${msg}`);
const fail = (msg) => {
  console.error(`[setup:nvenc] ${msg}`);
  process.exit(1);
};

const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
};

const findFile = (dir, name) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFile(full, name);
      if (nested) return nested;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return full;
    }
  }
  return null;
};

const download = (url, dest) =>
  new Promise((resolve, reject) => {
    log(`Pobieram ${url} …`);
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          download(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", reject);
  });

const extractZip = (zipPath, destDir) => {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    const ps = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
    const r = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", ps],
      { stdio: "inherit" },
    );
    if (r.status !== 0) fail("Nie udało się rozpakować ZIP (PowerShell).");
    return;
  }
  const r = spawnSync("tar", ["-xf", zipPath, "-C", destDir], { stdio: "inherit" });
  if (r.status !== 0) fail("Nie udało się rozpakować ZIP (tar).");
};

const hasNvenc = (ffmpegPath) => {
  const r = spawnSync(ffmpegPath, ["-hide_banner", "-encoders"], {
    encoding: "utf8",
  });
  return (r.stdout || "").includes("h264_nvenc");
};

const envPathForWrite = (absolutePath) =>
  absolutePath.replace(/\\/g, "/");

const upsertProjectEnv = (binDir) => {
  const envFile = path.join(ROOT, "project.env");
  const lines = fs.existsSync(envFile)
    ? fs.readFileSync(envFile, "utf-8").split("\n")
    : [];

  const setVar = (key, value) => {
    const idx = lines.findIndex((line) => line.startsWith(`${key}=`));
    const next = `${key}=${value}`;
    if (idx >= 0) lines[idx] = next;
    else lines.push(next);
  };

  setVar("REMOTION_BINARIES_DIRECTORY", envPathForWrite(binDir));
  setVar("REMOTION_GPU_RENDER", "1");
  setVar("REMOTION_HARDWARE_ACCELERATION", "if-possible");

  fs.writeFileSync(envFile, `${lines.filter((l, i, arr) => i < arr.length - 1 || l !== "").join("\n").replace(/\n*$/, "")}\n`);
  log(`Zaktualizowano ${path.basename(envFile)}`);
};

const main = async () => {
  if (process.platform !== "win32") {
    fail("Ten skrypt jest pod Windows + NVIDIA. Na Linuxie użyj FFmpeg z NVENC i ustaw REMOTION_BINARIES_DIRECTORY ręcznie.");
  }

  const compositorPkg = require.resolve("@remotion/compositor-win32-x64-msvc/package.json");
  const compositorDir = path.dirname(compositorPkg);

  log("Kopiuję remotion.exe i biblioteki compositora…");
  if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });
  copyDir(compositorDir, OUT_DIR);

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (!fs.existsSync(ZIP_PATH)) {
    await download(FFMPEG_URL, ZIP_PATH);
  } else {
    log(`Używam cache: ${ZIP_PATH}`);
  }

  if (fs.existsSync(EXTRACT_DIR)) fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
  extractZip(ZIP_PATH, EXTRACT_DIR);

  const ffmpegSrc = findFile(EXTRACT_DIR, "ffmpeg.exe");
  const ffprobeSrc = findFile(EXTRACT_DIR, "ffprobe.exe");
  if (!ffmpegSrc || !ffprobeSrc) {
    fail("W archiwum nie znaleziono ffmpeg.exe / ffprobe.exe.");
  }

  fs.copyFileSync(ffmpegSrc, path.join(OUT_DIR, "ffmpeg.exe"));
  fs.copyFileSync(ffprobeSrc, path.join(OUT_DIR, "ffprobe.exe"));

  const ffmpegOut = path.join(OUT_DIR, "ffmpeg.exe");
  if (!hasNvenc(ffmpegOut)) {
    fail("ffmpeg.exe nie ma h264_nvenc — sprawdź sterownik NVIDIA i build „full”.");
  }

  log("NVENC OK (h264_nvenc dostępny).");

  if (fs.existsSync(path.join(ROOT, "project.env"))) {
    upsertProjectEnv(OUT_DIR);
  } else {
    log(`Brak project.env — dodaj ręcznie:\nREMOTION_BINARIES_DIRECTORY=${envPathForWrite(OUT_DIR)}`);
  }

  log(`Gotowe: ${OUT_DIR}`);
  log("Sprawdzenie: npm run check:nvenc");
};

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
