import Link from "next/link";

import { Card } from "@/components/ui/card";

type ProductHubCardsProps = {
  photosHref: string;
};

export function ProductHubCards({ photosHref }: ProductHubCardsProps) {
  return (
    <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:auto-rows-fr">
      <Link href={photosHref} className="group block h-full text-left">
        <HubCard
          badge="Zdjęcia"
          badgeClassName="bg-violet-100 text-violet-800"
          hoverBorderClassName="hover:border-violet-400"
          title="Generator zdjęć produktowych"
          description="Wgraj ujęcia auta, wybierz tło i wygeneruj realistyczne kompozycje — pojedynczo albo w serii (zewnątrz, wnętrze, detale)."
          cta="Otwórz projekt zdjęć →"
        />
      </Link>

      <Link href="/service" className="group block h-full text-left">
        <HubCard
          badge="Serwis"
          badgeClassName="bg-amber-100 text-amber-800"
          hoverBorderClassName="hover:border-amber-400"
          title="Obsługa serwisowa"
          description="Baza klientów, samochodów i zleceń serwisowych z pozycjami, VAT i podglądem do wydruku."
          cta="Wejdź w obsługę serwisową →"
        />
      </Link>
    </div>
  );
}

type HubCardProps = {
  badge: string;
  badgeClassName: string;
  hoverBorderClassName: string;
  title: string;
  description: string;
  cta: string;
};

function HubCard({
  badge,
  badgeClassName,
  hoverBorderClassName,
  title,
  description,
  cta,
}: HubCardProps) {
  return (
    <Card className={`flex h-full flex-col transition hover:shadow-md ${hoverBorderClassName}`}>
      <span
        className={`inline-flex w-fit self-start rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${badgeClassName}`}
      >
        {badge}
      </span>
      <h2 className="mt-4 text-xl font-semibold text-slate-900 group-hover:text-brand-600">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{description}</p>
      <p className="mt-6 text-sm font-medium text-brand-600 group-hover:underline">{cta}</p>
    </Card>
  );
}
