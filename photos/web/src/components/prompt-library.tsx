"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, formatFetchError, SavedPrompt } from "@/lib/api";
import { formatPlDateTime } from "@/lib/format-date";

type PromptLibraryProps = {
  token: string;
  initialPrompts: SavedPrompt[];
};

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; prompt: SavedPrompt };

function truncate(text: string, max = 120) {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
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
      className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition ${expanded ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function PromptLibrary({ token, initialPrompts }: PromptLibraryProps) {
  const [expanded, setExpanded] = useState(false);
  const [prompts, setPrompts] = useState(initialPrompts);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [name, setName] = useState("");
  const [promptText, setPromptText] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openCreate = useCallback(() => {
    setExpanded(true);
    setEditor({ mode: "create" });
    setName("");
    setPromptText("");
    setError(null);
  }, []);

  const openEdit = useCallback((prompt: SavedPrompt) => {
    setExpanded(true);
    setEditor({ mode: "edit", prompt });
    setName(prompt.name);
    setPromptText(prompt.prompt_text);
    setError(null);
  }, []);

  const closeEditor = useCallback(() => {
    if (loading) return;
    setEditor(null);
    setError(null);
  }, [loading]);

  async function handleSave() {
    const trimmedName = name.trim();
    const trimmedText = promptText.trim();
    if (!trimmedName || !trimmedText) {
      setError("Podaj nazwę i treść promptu.");
      return;
    }

    setError(null);
    setLoading("save");
    try {
      if (editor?.mode === "edit") {
        const updated = await api.updateSavedPrompt(token, editor.prompt.id, {
          name: trimmedName,
          prompt_text: trimmedText,
        });
        setPrompts((prev) =>
          prev
            .map((p) => (p.id === updated.id ? updated : p))
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
        );
      } else {
        const created = await api.createSavedPrompt(token, {
          name: trimmedName,
          prompt_text: trimmedText,
        });
        setPrompts((prev) => [created, ...prev]);
      }
      setEditor(null);
    } catch (err) {
      setError(formatFetchError(err));
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete(prompt: SavedPrompt) {
    if (!window.confirm(`Usunąć prompt „${prompt.name}”?`)) return;

    setError(null);
    setLoading(`delete-${prompt.id}`);
    try {
      await api.deleteSavedPrompt(token, prompt.id);
      setPrompts((prev) => prev.filter((p) => p.id !== prompt.id));
      if (editor?.mode === "edit" && editor.prompt.id === prompt.id) {
        setEditor(null);
      }
    } catch (err) {
      setError(formatFetchError(err));
    } finally {
      setLoading(null);
    }
  }

  const summaryText =
    prompts.length === 0
      ? "Brak zapisanych promptów"
      : `${prompts.length} ${prompts.length === 1 ? "zapisany prompt" : "zapisanych promptów"}`;

  return (
    <Card className="overflow-hidden p-0">
      <div className={`flex items-center gap-2 px-3 ${expanded ? "py-2" : "h-10"}`}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <ChevronIcon expanded={expanded} />
          <div className="min-w-0">
            {expanded ? (
              <>
                <h2 className="text-lg font-semibold leading-none text-slate-900">Baza promptów</h2>
                <p className="mt-1 truncate text-sm leading-none text-slate-600">
                  Twórz szablony i wybieraj je w projektach z listy rozwijanej
                </p>
              </>
            ) : (
              <div className="flex min-w-0 items-baseline gap-2">
                <h2 className="shrink-0 text-lg font-semibold leading-none text-slate-900">
                  Baza promptów
                </h2>
                <span className="truncate text-sm leading-none text-slate-600">{summaryText}</span>
              </div>
            )}
          </div>
        </button>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 px-2.5 py-1 text-xs"
          onClick={openCreate}
          disabled={!!loading}
        >
          Nowy prompt
        </Button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t px-3 pb-3 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3">
          {editor && (
            <Card className="border-brand-200 bg-brand-50/30 p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-slate-900 sm:text-base">
                {editor.mode === "create" ? "Nowy prompt" : "Edytuj prompt"}
              </h3>
              <div className="mt-3 space-y-3">
                <Input
                  label="Nazwa"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="np. Studio — zewnętrze"
                  disabled={loading === "save"}
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Treść promptu</label>
                  <textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    rows={5}
                    disabled={loading === "save"}
                    placeholder="Opisz jak AI ma obrabiać zdjęcie..."
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" loading={loading === "save"} onClick={handleSave}>
                    Zapisz
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={loading === "save"}
                    onClick={closeEditor}
                  >
                    Anuluj
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {prompts.length === 0 && !editor ? (
            <Card className="p-3 text-center sm:p-4">
              <p className="text-sm text-slate-600">Brak zapisanych promptów.</p>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                Utwórz pierwszy szablon — będzie dostępny w projektach pojedynczych i seryjnych.
              </p>
            </Card>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1 sm:max-h-80 sm:space-y-3">
              {prompts.map((prompt) => (
                <Card
                  key={prompt.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-slate-900 sm:text-base">
                      {prompt.name}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug text-slate-600 sm:text-sm">
                      {truncate(prompt.prompt_text)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400 sm:text-xs">
                      Ostatnia zmiana: {formatPlDateTime(prompt.updated_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-3 py-1.5 text-xs sm:text-sm"
                      disabled={!!loading}
                      onClick={() => openEdit(prompt)}
                    >
                      Edytuj
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      className="px-3 py-1.5 text-xs sm:text-sm"
                      loading={loading === `delete-${prompt.id}`}
                      disabled={!!loading && loading !== `delete-${prompt.id}`}
                      onClick={() => handleDelete(prompt)}
                    >
                      Usuń
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
