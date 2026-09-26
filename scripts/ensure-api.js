const http = require("http");
const { execSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

const dockerOk = () => {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const apiUp = () =>
  new Promise((resolve) => {
    const req = http.get(
      { hostname: "localhost", port: 8010, path: "/docs", timeout: 2500 },
      (res) => resolve(res.statusCode === 200),
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  if (!dockerOk()) {
    console.error(
      "[ensure-api] Docker Desktop nie działa.\n" +
        "  → Uruchom Docker Desktop i poczekaj aż będzie „Running”.\n" +
        "  → Potem: npm run dev:photos:api",
    );
    process.exit(1);
  }

  if (await apiUp()) {
    console.log("[ensure-api] Backend zdjęć działa na http://localhost:8010");
    return;
  }

  console.log("[ensure-api] Backend na :8010 nie odpowiada — uruchamiam…");

  // Startuje też lokalny postgres (depends_on w docker-compose.yml)
  execSync("docker compose --env-file project.env up -d api", {
    cwd: root,
    stdio: "inherit",
  });

  for (let i = 0; i < 12; i += 1) {
    await sleep(2500);
    if (await apiUp()) {
      console.log("[ensure-api] Backend zdjęć gotowy na http://localhost:8010");
      return;
    }
  }

  console.error(
    "[ensure-api] API nie wstało na :8010.\n" +
      "  → docker logs projekt_autka-api-1\n" +
      "  → sprawdź czy postgres działa: docker compose ps postgres",
  );
  process.exit(1);
})();
