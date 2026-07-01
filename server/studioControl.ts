import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = path.join(__dirname, "..");
const ACTIVITY_FILE = path.join(ROOT, "generated/studio-activity.json");

export const STUDIO_DOCKER_CONTROL = process.env.STUDIO_DOCKER_CONTROL === "1";
const STUDIO_CONTAINER_NAME =
  process.env.STUDIO_CONTAINER_NAME ?? "car_photos-studio-1";
const STUDIO_INTERNAL_URL = (
  process.env.STUDIO_INTERNAL_URL ?? "http://studio:3000"
).replace(/\/$/, "");
const STUDIO_IDLE_MS = Number(process.env.STUDIO_IDLE_MS ?? 30 * 60 * 1000);
const IDLE_CHECK_MS = Number(process.env.STUDIO_IDLE_CHECK_MS ?? 60 * 1000);

let lastActivityAt = Date.now();
let idleTimer: ReturnType<typeof setInterval> | null = null;
let startInProgress = false;
let cachedRunning: boolean | null = null;
let cachedRunningAt = 0;
const RUNNING_CACHE_MS = 5000;

const loadActivity = () => {
  try {
    if (!fs.existsSync(ACTIVITY_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(ACTIVITY_FILE, "utf8")) as {
      lastActivityAt?: number;
    };
    if (typeof raw.lastActivityAt === "number" && raw.lastActivityAt > 0) {
      lastActivityAt = raw.lastActivityAt;
    }
  } catch {
    // ignore corrupt state file
  }
};

const persistActivity = () => {
  try {
    fs.mkdirSync(path.dirname(ACTIVITY_FILE), { recursive: true });
    fs.writeFileSync(
      ACTIVITY_FILE,
      JSON.stringify({ lastActivityAt }, null, 0),
      "utf8",
    );
  } catch (err) {
    console.warn("[studio-control] Nie zapisano stanu aktywności:", err);
  }
};

export const bumpStudioActivity = () => {
  if (!STUDIO_DOCKER_CONTROL) return;
  lastActivityAt = Date.now();
  persistActivity();
};

const docker = async (args: string[], timeoutMs = 120_000) => {
  try {
    const { stdout, stderr } = await execFileAsync("docker", args, {
      timeout: timeoutMs,
    });
    return { ok: true as const, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Błąd docker";
    return { ok: false as const, error: message };
  }
};

export const isStudioContainerRunning = async (): Promise<boolean> => {
  if (!STUDIO_DOCKER_CONTROL) return false;
  const now = Date.now();
  if (cachedRunning !== null && now - cachedRunningAt < RUNNING_CACHE_MS) {
    return cachedRunning;
  }
  const result = await docker([
    "inspect",
    "-f",
    "{{.State.Running}}",
    STUDIO_CONTAINER_NAME,
  ]);
  cachedRunning = result.ok && result.stdout === "true";
  cachedRunningAt = now;
  return cachedRunning;
};

const waitUntilStudioReady = async (maxMs = 120_000): Promise<boolean> => {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const res = await fetch(STUDIO_INTERNAL_URL, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok || res.status === 304) {
        return true;
      }
    } catch {
      // studio jeszcze nie odpowiada
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
};

export type StudioStatus = {
  enabled: boolean;
  running: boolean;
  ready: boolean;
  starting: boolean;
  idleMinutes: number;
  lastActivityAt: string | null;
  autoStopAt: string | null;
};

export const getStudioStatus = async (): Promise<StudioStatus> => {
  const idleMinutes = Math.round(STUDIO_IDLE_MS / 60_000);
  if (!STUDIO_DOCKER_CONTROL) {
    return {
      enabled: false,
      running: true,
      ready: true,
      starting: false,
      idleMinutes,
      lastActivityAt: null,
      autoStopAt: null,
    };
  }

  const running = await isStudioContainerRunning();
  let ready = false;
  if (running) {
    try {
      const res = await fetch(STUDIO_INTERNAL_URL, {
        signal: AbortSignal.timeout(4000),
      });
      ready = res.ok || res.status === 304;
    } catch {
      ready = false;
    }
  }

  const autoStopAt =
    running && lastActivityAt > 0
      ? new Date(lastActivityAt + STUDIO_IDLE_MS).toISOString()
      : null;

  return {
    enabled: true,
    running,
    ready,
    starting: startInProgress,
    idleMinutes,
    lastActivityAt:
      lastActivityAt > 0 ? new Date(lastActivityAt).toISOString() : null,
    autoStopAt,
  };
};

export const startStudioContainer = async (): Promise<{
  ok: boolean;
  ready: boolean;
  error?: string;
}> => {
  if (!STUDIO_DOCKER_CONTROL) {
    return { ok: true, ready: true };
  }
  if (startInProgress) {
    const ready = await waitUntilStudioReady();
    return { ok: true, ready };
  }

  startInProgress = true;
  try {
    bumpStudioActivity();

    const running = await isStudioContainerRunning();
    if (!running) {
      const startResult = await docker(["start", STUDIO_CONTAINER_NAME], 180_000);
      if (!startResult.ok) {
        return {
          ok: false,
          ready: false,
          error: `Nie udało się uruchomić kontenera ${STUDIO_CONTAINER_NAME}: ${startResult.error}`,
        };
      }
    }

    const ready = await waitUntilStudioReady();
    if (ready) {
      bumpStudioActivity();
    }
    return { ok: true, ready };
  } finally {
    startInProgress = false;
  }
};

export const stopStudioContainer = async (): Promise<{
  ok: boolean;
  error?: string;
}> => {
  if (!STUDIO_DOCKER_CONTROL) {
    return { ok: true };
  }

  const running = await isStudioContainerRunning();
  if (!running) {
    return { ok: true };
  }

  const stopResult = await docker(["stop", "-t", "15", STUDIO_CONTAINER_NAME], 60_000);
  cachedRunning = false;
  cachedRunningAt = Date.now();
  if (!stopResult.ok) {
    return {
      ok: false,
      error: `Nie udało się zatrzymać Studia: ${stopResult.error}`,
    };
  }
  return { ok: true };
};

const runIdleCheck = async () => {
  if (!STUDIO_DOCKER_CONTROL || startInProgress) return;

  const running = await isStudioContainerRunning();
  if (!running) return;

  if (Date.now() - lastActivityAt >= STUDIO_IDLE_MS) {
    console.log(
      `[studio-control] Auto-stop po ${Math.round(STUDIO_IDLE_MS / 60_000)} min bezczynności`,
    );
    const result = await stopStudioContainer();
    if (!result.ok) {
      console.warn("[studio-control] Auto-stop nieudany:", result.error);
    }
  }
};

export const initStudioControl = () => {
  if (!STUDIO_DOCKER_CONTROL) return;

  loadActivity();
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    void runIdleCheck();
  }, IDLE_CHECK_MS);

  console.log(
    `[studio-control] Włączone — kontener ${STUDIO_CONTAINER_NAME}, auto-stop po ${Math.round(STUDIO_IDLE_MS / 60_000)} min`,
  );
};
