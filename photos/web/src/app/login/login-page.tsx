"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/hub";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = form.get("email") as string;
    const password = form.get("password") as string;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

    let loginResponse: Response;
    try {
      loginResponse = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      setLoading(false);
      setError(
        "Backend zdjęć nie odpowiada (port 8010). Uruchom Docker: npm run dev:all",
      );
      return;
    }

    if (!loginResponse.ok) {
      setLoading(false);
      try {
        const data = await loginResponse.json();
        setError(
          typeof data.detail === "string"
            ? data.detail
            : "Nieprawidłowy email lub hasło",
        );
      } catch {
        setError("Nieprawidłowy email lub hasło");
      }
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Sesja nie została utworzona — spróbuj ponownie");
      return;
    }

    router.push(callbackUrl.startsWith("/") ? callbackUrl : "/hub");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
      <Card className="w-full">
        <h1 className="text-2xl font-bold">Logowanie</h1>
        <p className="mt-1 text-sm text-slate-600">
          Zaloguj się, żeby wejść w zdjęcia lub videoprezentację
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input label="Email" name="email" type="email" required autoComplete="email" />
          <Input
            label="Hasło"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" loading={loading}>
            Zaloguj się
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          Nie masz konta?{" "}
          <Link href="/register" className="font-medium text-brand-600 hover:underline">
            Zarejestruj się
          </Link>
        </p>
      </Card>
    </div>
  );
}
