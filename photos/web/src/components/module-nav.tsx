"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const linkClass = "text-sm text-slate-600 hover:text-slate-900";
const activeClass = "text-sm font-semibold text-brand-600";

export function ModuleNav() {
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
      {isService ? (
        // Na /service zawsze wraca do menu głównego serwisu (#home), nawet z widoków głębiej
        <a
          href="/service#home"
          className={activeClass}
          onClick={(e) => {
            e.preventDefault();
            window.dispatchEvent(new Event("service:home"));
          }}
        >
          Serwis
        </a>
      ) : (
        <Link href="/service#home" className={linkClass}>
          Serwis
        </Link>
      )}
    </>
  );
}
