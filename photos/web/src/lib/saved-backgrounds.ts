"use client";

import { useCallback, useEffect, useState } from "react";

import { api, formatFetchError, SavedBackground } from "@/lib/api";

export function backgroundIdFromPath(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  const normalized = path.replace(/\\/g, "/");
  const name = normalized.split("/").pop();
  return name || null;
}

export function useSavedBackgrounds(token: string) {
  const [backgrounds, setBackgrounds] = useState<SavedBackground[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const items = await api.listBackgrounds(token);
      setBackgrounds(items);
    } catch {
      setBackgrounds([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { backgrounds, loading, refresh };
}

export function backgroundThumbUrl(backgroundId: string, cacheVersion = 0) {
  const params = new URLSearchParams();
  if (cacheVersion > 0) {
    params.set("b", String(cacheVersion));
  }
  const query = params.toString();
  return `/api/backgrounds/${encodeURIComponent(backgroundId)}/file${query ? `?${query}` : ""}`;
}

export { formatFetchError };
