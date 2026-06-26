#!/usr/bin/env node
/** Skan dysku — bez logowania. npm run video:scan */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const usersRoot = path.join(ROOT, "generated", "video-users");
const legacy = path.join(ROOT, "generated", "project.json");

console.log("=== Projekty wideo na dysku ===\n");

if (fs.existsSync(legacy)) {
  try {
    const m = JSON.parse(fs.readFileSync(legacy, "utf-8"));
    console.log(`legacy generated/project.json: ${m.slides?.length ?? 0} slajdów`);
  } catch {
    console.log("legacy generated/project.json: (uszkodzony)");
  }
} else {
  console.log("legacy generated/project.json: brak");
}

if (!fs.existsSync(usersRoot)) {
  console.log("\ngenerated/video-users/: brak katalogu");
  process.exit(0);
}

for (const userId of fs.readdirSync(usersRoot)) {
  const userPath = path.join(usersRoot, userId);
  if (!fs.statSync(userPath).isDirectory()) continue;

  const indexPath = path.join(userPath, "projects.json");
  let indexCount = 0;
  if (fs.existsSync(indexPath)) {
    try {
      indexCount = JSON.parse(fs.readFileSync(indexPath, "utf-8")).projects?.length ?? 0;
    } catch {
      indexCount = -1;
    }
  }

  const folders = fs
    .readdirSync(userPath, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((id) => fs.existsSync(path.join(userPath, id, "manifest.json")));

  console.log(`\nuser ${userId}`);
  console.log(`  projects.json: ${indexCount < 0 ? "uszkodzony" : indexCount} wpisów`);
  console.log(`  foldery z manifest.json: ${folders.length}`);
  for (const id of folders) {
    try {
      const m = JSON.parse(
        fs.readFileSync(path.join(userPath, id, "manifest.json"), "utf-8"),
      );
      const title = m.slides?.[0]?.title?.trim() || m.prompt?.slice(0, 40) || id;
      console.log(`    - ${title} (${m.slides?.length ?? 0} slajdów)`);
    } catch {
      console.log(`    - ${id} (manifest uszkodzony)`);
    }
  }
}
