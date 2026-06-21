import { api, OpenAiBilling } from "@/lib/api";

export type GenerationCostResult = {
  costUsd: number | null;
  delayed: boolean;
};

const RETRY_DELAYS_MS = [2000, 5000, 10000];

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function roundUsd(value: number) {
  return Math.round(value * 100) / 100;
}

export function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

export function computeGenerationCost(before: OpenAiBilling, after: OpenAiBilling): number | null {
  if (before.available_usd != null && after.available_usd != null) {
    return roundUsd(Math.max(0, before.available_usd - after.available_usd));
  }
  if (before.month_spend_usd != null && after.month_spend_usd != null) {
    return roundUsd(Math.max(0, after.month_spend_usd - before.month_spend_usd));
  }
  if (before.used_usd != null && after.used_usd != null) {
    return roundUsd(Math.max(0, after.used_usd - before.used_usd));
  }
  return null;
}

export async function measureGenerationCost(
  token: string,
  before: OpenAiBilling,
): Promise<GenerationCostResult> {
  let lastCost: number | null = null;

  for (let i = 0; i < RETRY_DELAYS_MS.length; i += 1) {
    await sleep(RETRY_DELAYS_MS[i]);
    try {
      const after = await api.getOpenAiBilling(token, { fresh: true });
      const cost = computeGenerationCost(before, after);
      lastCost = cost;
      if (cost != null && cost > 0) {
        return { costUsd: cost, delayed: false };
      }
    } catch {
      /* retry */
    }
  }

  if (lastCost != null) {
    return { costUsd: lastCost, delayed: lastCost === 0 };
  }
  return { costUsd: null, delayed: false };
}

export function formatGenerationCostMessage(
  operationLabel: "zdjęcia" | "serii",
  result: GenerationCostResult,
): string {
  if (result.costUsd == null) {
    return `Nie udało się oszacować kosztu generowania ${operationLabel}.`;
  }
  const amount = formatUsd(result.costUsd);
  if (result.costUsd > 0) {
    return `Szacowany koszt generowania ${operationLabel}: ${amount}`;
  }
  return `Koszt generowania ${operationLabel}: ${amount} — OpenAI może zaktualizować wydatki z opóźnieniem (często do 24 h).`;
}

export async function captureBillingBefore(token: string): Promise<OpenAiBilling | null> {
  try {
    return await api.getOpenAiBilling(token, { fresh: true });
  } catch {
    return null;
  }
}

export async function reportGenerationCost(
  token: string,
  before: OpenAiBilling | null,
  operationLabel: "zdjęcia" | "serii",
): Promise<string | null> {
  if (!before) {
    return null;
  }
  const result = await measureGenerationCost(token, before);
  return formatGenerationCostMessage(operationLabel, result);
}
