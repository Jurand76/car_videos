"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ModuleNavProps = {
  videoHref: string | null;
};

const linkClass = "text-sm text-slate-600 hover:text-slate-900";
const activeClass = "text-sm font-semibold text-brand-600";

export function ModuleNav({ videoHref }: ModuleNavProps) {
  const pathname = usePathname();
  const isStart = pathname === "/hub";
  const isPhotos = pathname.startsWith("/dashboard");
  const isService = pathname.startsWith("/service");

  return (
    <>
      {isStart ? (
        <span className={activeClass}>Start</span>
      ) : (
        <Link href="/hub" className={linkClass}>
          Start
        </Link>
      )}
      {isPhotos ? (
        <span className={activeClass}>Zdjęcia</span>
      ) : (
        <Link href="/dashboard" className={linkClass}>
          Zdjęcia
        </Link>
      )}
      {videoHref ? (
        <a href={videoHref} className={linkClass}>
          Wideo
        </a>
      ) : null}
      {isService ? (
        <span className={activeClass}>Serwis</span>
      ) : (
        <Link href="/service" className={linkClass}>
          Serwis
        </Link>
      )}
    </>
  );
}
