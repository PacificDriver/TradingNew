import type { Metadata } from "next";
import { Unbounded, Manrope } from "next/font/google";
import "./globals.css";
import { ReactNode } from "react";
import Link from "next/link";
import { GradientBackground } from "../components/GradientBackground";
import { ReferralAuthProvider } from "./ReferralAuthContext";
import { ReferralNav } from "./ReferralNav";
import { ChartLogo } from "../components/ChartLogo";
import { LocaleProvider } from "../lib/i18n";

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  variable: "--font-unbounded",
  display: "swap",
});
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Referral Program",
  description: "Partner dashboard — referral analytics",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${unbounded.variable} ${manrope.variable}`}>
      <body className="min-h-screen bg-background text-slate-100 font-body relative">
        <LocaleProvider>
        <ReferralAuthProvider>
          <div className="min-h-screen flex flex-col relative">
            <GradientBackground />
            <div className="relative z-10 flex flex-col flex-1 min-h-screen">
              <header className="border-b border-slate-800/60 glass-strong mx-2 mt-2 rounded-2xl xl:rounded-3xl sm:mx-4 sm:mt-4 lg:mx-6 xl:mx-8">
                <div className="flex items-center justify-between px-4 py-3 sm:px-6">
                  <Link href="/" className="flex shrink-0 rounded-lg overflow-hidden transition-opacity hover:opacity-90">
                    <ChartLogo className="h-8 w-8 sm:h-9 sm:w-9" />
                  </Link>
                  <ReferralNav />
                </div>
              </header>
              <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
                {children}
              </main>
            </div>
          </div>
        </ReferralAuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
