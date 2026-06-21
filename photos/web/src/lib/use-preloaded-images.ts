"use client";

import { useLayoutEffect, useState } from "react";

export function usePreloadedImages(urls: string[]): boolean {
  const key = urls.join("\0");
  const [ready, setReady] = useState(urls.length === 0);

  useLayoutEffect(() => {
    if (urls.length === 0) {
      setReady(true);
      return;
    }

    setReady(false);
    let cancelled = false;
    let pending = urls.length;

    const finish = () => {
      pending -= 1;
      if (!cancelled && pending <= 0) {
        setReady(true);
      }
    };

    for (const url of urls) {
      const img = new window.Image();
      img.onload = finish;
      img.onerror = finish;
      img.src = url;
    }

    return () => {
      cancelled = true;
    };
  }, [key, urls]);

  return ready;
}
