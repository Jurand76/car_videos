"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { api, OpenAiBilling } from "@/lib/api";

type OpenAiBalanceCardProps = {
  token: string;
};

function formatUsd(value: number | null | undefined) {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx("h-3.5 w-3.5 shrink-0 text-slate-500 transition", expanded && "rotate-180")}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function OpenAiBalanceCard({ token }: OpenAiBalanceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [billing, setBilling] = useState<OpenAiBilling | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getOpenAiBilling(token);
      setBilling(data);
    } catch {
      setBilling({
        status: "unavailable",
        available_usd: null,
        granted_usd: null,
        used_usd: null,
        pending_usd: null,
        month_spend_usd: null,
        message: "Nie udało się pobrać salda OpenAI",
        billing_url: "https://platform.openai.com/settings/organization/billing/overview",
        updated_at: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const available = billing?.available_usd;
  const monthSpend = billing?.month_spend_usd;
  const lowBalance = available != null && available < 5;
  const zeroSpendHint =
    monthSpend === 0
      ? "OpenAI raportuje wydatki z opóźnieniem (często do 24 h). Saldo konta $ — tylko w panelu billing."
      : null;

  const billingUrl =
    billing?.billing_url ?? "https://platform.openai.com/settings/organization/billing/overview";

  return (
    <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white p-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 leading-none">
          <p className="text-sm font-semibold text-emerald-900">Konto OpenAI</p>
          <span className="text-[11px] text-slate-600">Wydatki w tym miesiącu</span>
          <span className="text-base font-bold tabular-nums text-slate-900">
            {loading ? "…" : formatUsd(monthSpend)}
          </span>
        </div>
        <ChevronIcon expanded={expanded} />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-emerald-100 px-3 pb-3 pt-2">
          {loading ? (
            <p className="text-sm text-slate-600">Sprawdzam konto…</p>
          ) : billing ? (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                  Szczegóły konta
                </p>
                <p className="mt-1 text-sm text-slate-600">{billing.message}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Pozostałe środki</p>
                  <p className="font-semibold tabular-nums">{formatUsd(billing.available_usd)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Przyznane</p>
                  <p className="font-semibold tabular-nums">{formatUsd(billing.granted_usd)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Zużyte</p>
                  <p className="font-semibold tabular-nums">{formatUsd(billing.used_usd)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">W toku</p>
                  <p className="font-semibold tabular-nums">{formatUsd(billing.pending_usd)}</p>
                </div>
              </div>

              {lowBalance && (
                <p className="text-xs font-medium text-amber-700">
                  Niskie saldo — doładuj konto zanim generowanie AI przestanie działać.
                </p>
              )}

              {zeroSpendHint && <p className="text-xs text-slate-500">{zeroSpendHint}</p>}

              {billing.status === "unavailable" && (
                <p className="text-xs text-slate-500">
                  OpenAI nie udostępnia salda $ przez zwykły klucz API. Możesz dodać{" "}
                  <code className="rounded bg-slate-100 px-1">OPENAI_ADMIN_API_KEY</code> (scope{" "}
                  <code className="rounded bg-slate-100 px-1">api.usage.read</code>) w .env serwera,
                  żeby zobaczyć wydatki miesiąca. Ile zostało $ — tylko w panelu billing OpenAI.
                </p>
              )}

              <a
                href={billingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-sm font-medium text-emerald-700 hover:underline"
              >
                Ustawienia OpenAI →
              </a>
            </>
          ) : null}
        </div>
      )}
    </Card>
  );
}
