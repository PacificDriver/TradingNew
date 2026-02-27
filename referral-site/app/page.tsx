"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useReferralAuth } from "./ReferralAuthContext";
import { useLocale } from "../lib/i18n";

const MAIN_SITE_URL = (process.env.NEXT_PUBLIC_MAIN_SITE_URL || "").replace(/\/$/, "");

export default function ReferralHomePage() {
  const { partner, loading } = useReferralAuth();
  const { t } = useLocale();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (partner) {
      router.replace("/dashboard");
    }
  }, [partner, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="card w-full max-w-md p-8 text-center animate-fade-in-up">
        <h1 className="font-display text-2xl font-semibold text-slate-100 mb-2">
          {t("ref.title")}
        </h1>
        <p className="text-slate-400 mb-6">
          {t("ref.subtitle")}
        </p>
        {MAIN_SITE_URL && (
          <p className="text-sm text-slate-500 mb-4">
            {t("ref.registrationOnMain")}{" "}
            <a
              href={`${MAIN_SITE_URL}/register`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-emerald-400 transition-colors"
            >
              {t("ref.mainSite")}
            </a>
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/login"
            className="btn-primary py-3 px-6 rounded-xl text-center"
          >
            {t("ref.login")}
          </Link>
          <Link
            href="/register"
            className="py-3 px-6 rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-800/50 transition-colors text-center"
          >
            {t("ref.register")}
          </Link>
        </div>
      </div>
    </div>
  );
}
