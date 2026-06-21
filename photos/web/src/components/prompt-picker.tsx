"use client";

import { useEffect, useState } from "react";

import { api, formatFetchError, SavedPrompt } from "@/lib/api";

type PromptPickerProps = {
  token: string;
  disabled?: boolean;
  onSelect: (promptText: string, prompt: SavedPrompt) => void;
};

export function PromptPicker({ token, disabled, onSelect }: PromptPickerProps) {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listSavedPrompts(token)
      .then((list) => {
        if (!cancelled) setPrompts(list);
      })
      .catch((err) => {
        if (!cancelled) setError(formatFetchError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return <p className="text-xs text-slate-500">Ładowanie bazy promptów…</p>;
  }

  if (error) {
    return <p className="text-xs text-amber-700">{error}</p>;
  }

  if (prompts.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        Brak promptów w bazie — dodaj je w sekcji „Baza promptów” na dashboardzie.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="prompt-picker" className="text-sm font-medium text-slate-700">
        Z bazy promptów
      </label>
      <select
        id="prompt-picker"
        value={selectedId}
        disabled={disabled}
        onChange={(e) => {
          const id = e.target.value;
          setSelectedId(id);
          const prompt = prompts.find((p) => p.id === id);
          if (prompt) onSelect(prompt.prompt_text, prompt);
        }}
        className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60 sm:max-w-xs"
      >
        <option value="">— wybierz prompt —</option>
        {prompts.map((prompt) => (
          <option key={prompt.id} value={prompt.id}>
            {prompt.name}
          </option>
        ))}
      </select>
    </div>
  );
}
