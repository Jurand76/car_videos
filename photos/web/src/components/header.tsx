import Link from "next/link";

import { auth, signOut } from "@/auth";
import { ModuleNav } from "@/components/module-nav";
import { Button } from "@/components/ui/button";
import { getServicePanelUrl } from "@/lib/service-panel";
import { getVideoPanelUrl } from "@/lib/video-panel";

export async function Header() {
  const session = await auth();
  const videoHref =
    session?.accessToken != null ? getVideoPanelUrl(session.accessToken) : null;
  const serviceHref =
    session?.accessToken != null ? getServicePanelUrl(session.accessToken) : null;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href={session ? "/hub" : "/login"} className="text-lg font-bold tracking-tight text-slate-900">
          AUTKA.PL
        </Link>
        <nav className="flex items-center gap-4">
          {session ? (
            <>
              <ModuleNav videoHref={videoHref} serviceHref={serviceHref} />
              <span className="hidden text-sm text-slate-500 sm:inline">{session.user.email}</span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <Button type="submit" variant="secondary">
                  Wyloguj
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="secondary">Zaloguj</Button>
              </Link>
              <Link href="/register">
                <Button>Rejestracja</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
