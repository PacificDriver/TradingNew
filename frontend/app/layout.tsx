import type { Metadata } from "next";
import { Unbounded, Manrope } from "next/font/google";
import "./globals.css";
import { ReactNode } from "react";
import { LocaleProvider } from "../lib/i18n";
import { StoreRehydrateTrigger } from "../components/StoreRehydrateTrigger";
import { GradientBackground } from "../components/GradientBackground";
import { ConditionalMainLayout } from "../components/ConditionalMainLayout";
import { DocumentHead } from "../components/DocumentHead";

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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://auratrade.com"),
  title: {
    default: "AuraTrade | Бинарные опционы",
    template: "%s | AuraTrade"
  },
  description:
    "Платформа бинарных опционов. Торговая логика на сервере. Пополнение и вывод через HighHelp (P2P).",
  keywords: ["бинарные опционы", "торговля", "криптовалюта", "AuraTrade", "binary options", "trading"],
  authors: [{ name: "AuraTrade" }],
  creator: "AuraTrade",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    alternateLocale: ["en_US", "es_ES"],
    siteName: "AuraTrade",
    title: "AuraTrade | Бинарные опционы",
    description: "Платформа бинарных опционов. Торговая логика на сервере. Пополнение и вывод через HighHelp (P2P)."
  },
  twitter: {
    card: "summary_large_image",
    title: "AuraTrade | Бинарные опционы",
    description: "Платформа бинарных опционов. Торговая логика на сервере. Пополнение и вывод через HighHelp (P2P)."
  },
  robots: {
    index: true,
    follow: true
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`dark ${unbounded.variable} ${manrope.variable}`}>
      <body className="min-h-screen bg-background text-slate-100 font-body relative">
        <LocaleProvider>
        <DocumentHead />
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

