import type { Metadata } from "next";
import { Unbounded, Manrope } from "next/font/google";
import "./globals.css";
import { ReactNode } from "react";
import { AppHeader } from "../components/AppHeader";
import { StoreRehydrateTrigger } from "../components/StoreRehydrateTrigger";
import { BlockedOverlay } from "../components/BlockedOverlay";
import { PageTransition } from "../components/PageTransition";
import { GradientBackground } from "../components/GradientBackground";

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  variable: "--font-unbounded",
  display: "swap"
});
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap"
});

export const metadata: Metadata = {
  title: "MVP бинарных опционов (демо)",
  description:
    "Минимальный демо-MVP платформы бинарных опционов. Вся торговая логика на сервере."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`dark ${unbounded.variable} ${manrope.variable}`}>
      <body className="min-h-screen bg-background text-slate-100 font-body relative">
        <StoreRehydrateTrigger />
        <div className="min-h-screen flex flex-col relative">
          <GradientBackground />
          <div className="relative z-10 flex flex-col flex-1 min-h-screen">
          <header className="relative z-20 border border-slate-800/60 glass-strong mx-4 mt-4 rounded-3xl animate-fade-in opacity-0 sm:mx-6 lg:mx-8">
            <div className="w-full px-4 sm:px-6 lg:px-8 py-3">
              <AppHeader />
            </div>
          </header>
          <main className="flex-1 flex flex-col w-full px-4 sm:px-6 lg:px-8 py-4 min-h-0 [contain:layout]">
            <PageTransition>{children}</PageTransition>
          </main>
          <BlockedOverlay />
          </div>
        </div>
      </body>
    </html>
  );
}

