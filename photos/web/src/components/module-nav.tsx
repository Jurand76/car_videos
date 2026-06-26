"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ModuleNavProps = {
  videoHref: string | null;
  serviceHref: string | null;
};

const linkClass = "text-sm text-slate-600 hover:text-slate-900";
const activeClass = "text-sm font-semibold text-brand-600";

export function ModuleNav({ videoHref, serviceHref }: ModuleNavProps) {
  const pathname = usePathname();
  const isStart = pathname === "/hub";
  const isPhotos = pathname.startsWith("/dashboard");

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
      {serviceHref ? (
        <a href={serviceHref} className={linkClass}>
          Serwis
        </a>
      ) : null}
    </>
  );
}
