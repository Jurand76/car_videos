"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const name = (form.get("name") as string) || undefined;
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    try {
      await api.register(email, password, name);
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rejestracja nie powiodła się");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
      <Card className="w-full">
        <h1 className="text-2xl font-bold">Rejestracja</h1>
        <p className="mt-1 text-sm text-slate-600">Utwórz konto, aby zapisywać projekty</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input label="Imię (opcjonalnie)" name="name" type="text" autoComplete="name" />
          <Input label="Email" name="email" type="email" required autoComplete="email" />
          <Input
            label="Hasło (min. 8 znaków)"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" loading={loading}>
            Załóż konto
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          Masz już konto?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Zaloguj się
          </Link>
        </p>
      </Card>
    </div>
  );
}
