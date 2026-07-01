import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ProductHubCards } from "@/components/product-hub-cards";
import { getVideoPanelUrl } from "@/lib/video-panel";

export default async function HubPage() {
  const session = await auth();
  if (!session?.accessToken) {
    redirect("/login?callbackUrl=/hub");
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-bold tracking-tight text-brand-600">
          AUTKA.PL
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Wybierz moduł
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Zalogowano jako {session.user?.email}. Co chcesz teraz zrobić?
        </p>
      </div>

      <ProductHubCards
        photosHref="/dashboard"
        videoHref={getVideoPanelUrl(session.accessToken)}
      />
    </div>
  );
}
