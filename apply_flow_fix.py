#!/usr/bin/env python3
from pathlib import Path
import re
import sys

TARGET = Path("server/generate.ts")

def fail(message: str) -> None:
    print(f"[ERROR] {message}", file=sys.stderr)
    sys.exit(1)

if not TARGET.exists():
    fail("Uruchom skrypt z katalogu głównego repozytorium car_videos.")

source = TARGET.read_text(encoding="utf-8")
original = source

needle = "const callLlmJson = async ("
if needle not in source:
    fail("Nie znaleziono callLlmJson w server/generate.ts.")

helpers = '''
const DEFAULT_LLM_TIMEOUT_MS = 75_000;

const getLlmTimeoutMs = (): number => {
  const configured = Number(process.env.FLOW_AI_TIMEOUT_MS ?? DEFAULT_LLM_TIMEOUT_MS);
  if (!Number.isFinite(configured)) {
    return DEFAULT_LLM_TIMEOUT_MS;
  }
  return Math.max(5_000, Math.min(configured, 180_000));
};

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isAbortLikeError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "AbortError" ||
    /aborted|abort|timeout|timed out/i.test(error.message));

'''

if "DEFAULT_LLM_TIMEOUT_MS" not in source:
    source = source.replace(needle, helpers + needle, 1)

pattern = re.compile(
    r'''const callLlmJson = async \(
.*?
\};\s*const getLlmConfig''',
    re.DOTALL,
)

replacement = '''const callLlmJson = async (
  config: LlmConfig,
  system: string,
  user: string,
  temperature = resolveFlowTemperature(),
): Promise<string> => {
  const timeoutMs = getLlmTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    console.info(
      `[flow-ai] ${config.provider}/${config.model} request started; timeout=${timeoutMs}ms`,
    );

    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `${config.provider} API error: ${response.status} ${text.slice(0, 2_000)}`,
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error(`${config.provider} returned an empty response.`);
    }

    console.info(
      `[flow-ai] ${config.provider}/${config.model} completed in ${Date.now() - startedAt}ms`,
    );
    return content;
  } catch (error) {
    if (isAbortLikeError(error) || controller.signal.aborted) {
      throw new Error(
        `${config.provider} request timed out after ${timeoutMs}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const getLlmConfig'''

source, count = pattern.subn(replacement, source, count=1)
if count != 1:
    fail("Nie udało się podmienić callLlmJson. Plik mógł się zmienić.")

source = source.replace(
    "  const merged = input.preserveSlideCopy",
    '''  if (!Array.isArray(parsed.slides)) {
    throw new Error(`${provider} returned JSON without a valid slides array.`);
  }

  const merged = input.preserveSlideCopy''',
    1,
)

source = source.replace(
    "  return mergeLlmSlides(input.slides, parsed.slides ?? []).map(formatMagazineCopy);",
    '''  if (!Array.isArray(parsed.slides)) {
    throw new Error("AI returned JSON without a valid slides array.");
  }
  return mergeLlmSlides(input.slides, parsed.slides).map(formatMagazineCopy);''',
    1,
)

project_pattern = re.compile(
    r'''export const generateProject = async \(
.*?
\};\s*export const writeProject''',
    re.DOTALL,
)

project_replacement = '''export const generateProject = async (
  input: GenerateInput,
): Promise<ProjectManifest> => {
  const totalStartedAt = Date.now();
  const flowInput: GenerateInput = {
    ...input,
    preserveSlideCopy: true,
  };
  const ai = getAiStatus();
  let manifest: ProjectManifest;

  if (!ai.enabled || ai.provider === "heuristic" || !ai.model) {
    manifest = generateHeuristic(flowInput);
  } else {
    const config = getLlmConfig();

    if (!config) {
      manifest = generateHeuristic(flowInput);
    } else {
      try {
        manifest = await generateWithLlm(flowInput, config);
      } catch (primaryError) {
        const alternate = getAlternateLlmConfig(config.provider);

        console.warn(
          `[flow-ai] Primary provider failed (${config.provider}): ${formatError(primaryError)}`,
        );

        if (!alternate) {
          console.warn(
            "[flow-ai] No alternate provider configured. Using heuristic fallback.",
          );
          manifest = generateHeuristic(flowInput);
        } else {
          try {
            manifest = await generateWithLlm(flowInput, alternate);
          } catch (alternateError) {
            console.warn(
              `[flow-ai] Alternate provider failed (${alternate.provider}): ${formatError(alternateError)}`,
            );
            console.warn(
              "[flow-ai] Both providers failed. Using heuristic fallback.",
            );
            manifest = generateHeuristic(flowInput);
          }
        }
      }
    }
  }

  const syncStartedAt = Date.now();
  const synced = await applyMusicSync(manifest, flowInput, ROOT);
  console.info(`[flow] music sync completed in ${Date.now() - syncStartedAt}ms`);

  const montageSeed = hashStringSeed(
    `${input.prompt}|${synced.slides.map((s) => s.image).join("|")}|${synced.generatedAt}|${Date.now()}`,
  );

  const result = {
    ...synced,
    slides: applySlideMontage(synced.slides, input.prompt, {
      allowedTransitions:
        synced.allowedTransitions ?? input.allowedTransitions,
      allowedTextEffects:
        synced.allowedTextEffects ?? input.allowedTextEffects,
      seed: montageSeed,
    }),
  };

  console.info(
    `[flow] project generation completed in ${Date.now() - totalStartedAt}ms; generatedBy=${result.generatedBy}`,
  );

  return result;
};

export const writeProject'''

source, count = project_pattern.subn(project_replacement, source, count=1)
if count != 1:
    fail("Nie udało się podmienić generateProject. Plik mógł się zmienić.")

if source == original:
    fail("Nie wykonano żadnych zmian.")

backup = TARGET.with_suffix(".ts.bak")
backup.write_text(original, encoding="utf-8")
TARGET.write_text(source, encoding="utf-8")

print("[OK] Zmieniono server/generate.ts")
print(f"[OK] Kopia: {backup}")
print("Następnie uruchom:")
print("  npx tsc --noEmit")
print("  npm run dev:all")
print("Opcjonalnie w .env:")
print("  FLOW_AI_TIMEOUT_MS=75000")
