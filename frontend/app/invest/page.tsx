"use client";

import Link from "next/link";
import { useLocale } from "../../lib/i18n";

const EMAIL = "edjost127@gmail.com";

export default function InvestPage() {
  const { t } = useLocale();

  return (
    <div className="animate-fade-in-up opacity-0">
      <div className="mb-6 sm:mb-8">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">
          {t("invest.subtitle")}
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-100 tracking-tight">
          {t("invest.title")}
        </h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6 xl:gap-8 items-start">
        {/* Блок из 2 квадратов */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div className="glass-panel p-5 sm:p-6 rounded-2xl sm:aspect-square flex flex-col min-h-[220px] sm:min-h-[280px]">
            <h2 className="text-sm font-semibold text-accent uppercase tracking-wider mb-4 shrink-0">
              {t("invest.card1Title")}
            </h2>
            <div className="flex flex-col gap-3 text-sm text-slate-300 leading-relaxed">
              <p>{t("invest.card1p1")}</p>
              <p>{t("invest.card1p2")}</p>
              <p>{t("invest.card1p3")}</p>
            </div>
          </div>
          <div className="glass-panel p-5 sm:p-6 rounded-2xl sm:aspect-square flex flex-col min-h-[220px] sm:min-h-[280px]">
            <h2 className="text-sm font-semibold text-accent uppercase tracking-wider mb-4 shrink-0">
              {t("invest.card2Title")}
            </h2>
            <div className="flex flex-col gap-3 text-sm text-slate-300 leading-relaxed">
              <p>{t("invest.card2p1")}</p>
              <p>{t("invest.card2p2")}</p>
              <p>{t("invest.card2p3")}</p>
            </div>
          </div>
        </div>

        {/* Правая колонка — кнопка Инвестировать */}
        <div className="xl:sticky xl:top-24 flex flex-col items-center xl:items-stretch">
          <a
            href={`mailto:${EMAIL}?subject=${encodeURIComponent(t("invest.mailtoSubject"))}`}
            className="btn-invest-gold w-full xl:w-auto rounded-xl px-6 py-4 text-base font-semibold text-slate-950 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] text-center inline-flex items-center justify-center"
          >
            {t("invest.cta")}
          </a>
          <Link
            href="/trade"
            className="mt-4 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← {t("header.trading")}
          </Link>
        </div>
      </div>
    </div>
  );
}
