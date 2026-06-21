import { Suspense } from "react";

import LoginPage from "./login-page";

export default function LoginRoute() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-12 text-center text-slate-600">Ładowanie…</div>}>
      <LoginPage />
    </Suspense>
  );
}
