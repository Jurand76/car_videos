import fs from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..");

const parseEnvFile = (content: string) => {
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

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

export const loadProjectEnv = () => {
  const file = path.join(ROOT, "project.env");
  if (!fs.existsSync(file)) return;
  parseEnvFile(fs.readFileSync(file, "utf-8"));
};

export type AiProvider = "deepseek" | "openai" | "heuristic";

export const getAiStatus = (): {
  enabled: boolean;
  provider: AiProvider;
  model: string | null;
} => {
  const preferred = process.env.AI_PROVIDER?.toLowerCase();

  if (preferred === "openai" && process.env.OPENAI_API_KEY) {
    return {
      enabled: true,
      provider: "openai",
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    };
  }

  if (preferred === "deepseek" && process.env.DEEPSEEK_API_KEY) {
    return {
      enabled: true,
      provider: "deepseek",
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    };
  }

  if (process.env.DEEPSEEK_API_KEY) {
    return {
      enabled: true,
      provider: "deepseek",
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      enabled: true,
      provider: "openai",
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    };
  }

  return { enabled: false, provider: "heuristic", model: null };
};
