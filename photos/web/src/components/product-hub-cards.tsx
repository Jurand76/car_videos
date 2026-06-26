import Link from "next/link";

import { Card } from "@/components/ui/card";

type ProductHubCardsProps = {
  photosHref: string;
  videoHref: string;
  serviceHref: string | null;
};

export function ProductHubCards({ photosHref, videoHref, serviceHref }: ProductHubCardsProps) {
  const videoExternal = videoHref.startsWith("http");

  return (
    <div className="mt-12 grid gap-6 sm:grid-cols-2">
      <Link href={photosHref} className="group block text-left">
        <Card className="h-full transition hover:border-violet-400 hover:shadow-md">
          <span className="inline-flex rounded-md bg-violet-100 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-violet-800">
            Zdjęcia
          </span>
          <h2 className="mt-4 text-xl font-semibold text-slate-900 group-hover:text-brand-600">
            Generator zdjęć produktowych
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Wgraj ujęcia auta, wybierz tło i wygeneruj realistyczne kompozycje — pojedynczo
            albo w serii (zewnątrz, wnętrze, detale).
          </p>
          <p className="mt-6 text-sm font-medium text-brand-600 group-hover:underline">
            Otwórz projekt zdjęć →
          </p>
        </Card>
      </Link>

      {videoExternal ? (
        <a href={videoHref} className="group block text-left no-underline">
          <VideoCard />
        </a>
      ) : (
        <Link href={videoHref} className="group block text-left">
          <VideoCard />
        </Link>
      )}

      {serviceHref ? (
        <a href={serviceHref} className="group block text-left no-underline">
          <ServiceCard />
        </a>
      ) : null}
    </div>
  );
}

function VideoCard() {
  return (
    <Card className="h-full transition hover:border-teal-400 hover:shadow-md">
      <span className="inline-flex rounded-md bg-teal-100 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-teal-800">
        Wideo
      </span>
      <h2 className="mt-4 text-xl font-semibold text-slate-900 group-hover:text-brand-600">
        Videoprezentacja
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Złóż reel z muzyką i beatami: slajdy, przejścia, teksty AI i podgląd w Remotion Studio.
      </p>
      <p className="mt-6 text-sm font-medium text-brand-600 group-hover:underline">
        Otwórz panel wideo →
      </p>
    </Card>
  );
}

function ServiceCard() {
  return (
    <Card className="h-full transition hover:border-amber-400 hover:shadow-md">
      <span className="inline-flex rounded-md bg-amber-100 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-800">
        Serwis
      </span>
      <h2 className="mt-4 text-xl font-semibold text-slate-900 group-hover:text-brand-600">
        Obsługa serwisowa
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Baza klientów, samochodów i historii napraw warsztatowych. Moduł w przygotowaniu.
      </p>
      <p className="mt-6 text-sm font-medium text-brand-600 group-hover:underline">
        Wejdź w obsługę serwisową →
      </p>
    </Card>
  );
}
