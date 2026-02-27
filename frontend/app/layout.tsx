import type { Metadata } from "next";
import { Unbounded, Manrope } from "next/font/google";
import "./globals.css";
import { ReactNode } from "react";
import { LocaleProvider } from "../lib/i18n";
import { StoreRehydrateTrigger } from "../components/StoreRehydrateTrigger";
import { GradientBackground } from "../components/GradientBackground";
import { ConditionalMainLayout } from "../components/ConditionalMainLayout";

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
  title: "Бинарные опционы",
  description:
    "Платформа бинарных опционов. Торговая логика на сервере. Пополнение и вывод через HighHelp (P2P)."
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${unbounded.variable} ${manrope.variable}`}>
      <body className="min-h-screen bg-background text-slate-100 font-body relative">
        <LocaleProvider>
        <StoreRehydrateTrigger />
        <div className="min-h-screen flex flex-col relative">
          <GradientBackground />
          <div className="relative z-10 flex flex-col flex-1 min-h-screen">
            <ConditionalMainLayout>{children}</ConditionalMainLayout>
          </div>
        </div>
        </LocaleProvider>
      </body>
    </html>
  );
}

