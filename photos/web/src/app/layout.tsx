import type { Metadata } from "next";

import { Header } from "@/components/header";
import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "AUTKA.PL — zdjęcia i videoprezentacje",
  description: "Generator zdjęć produktowych i videoprezentacje motoryzacyjne",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="font-sans antialiased">
        <Providers>
          <Header />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
