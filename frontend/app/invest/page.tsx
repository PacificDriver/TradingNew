"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useLocale } from "../../lib/i18n";

const EMAIL = "edjost127@gmail.com";
const QUARTERLY_PERCENT = 0.3;
const QUARTERS_COUNT = 8;

export default function InvestPage() {
  const { t } = useLocale();
  const [amount, setAmount] = useState(10000);

  const calculated = useMemo(() => {
    const num = Number(amount) || 0;
    const perQuarter = num * QUARTERLY_PERCENT;
    const total = perQuarter * QUARTERS_COUNT;
    const totalPercent = QUARTERLY_PERCENT * QUARTERS_COUNT * 100;
    return {
      perQuarter,
      total,
      totalPercent
    };
  }, [amount]);

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

        {/* Правая колонка — кнопка Инвестировать + калькулятор */}
        <div className="xl:sticky xl:top-24 flex flex-col items-center xl:items-stretch gap-5">
          <a
            href={`mailto:${EMAIL}?subject=${encodeURIComponent(t("invest.mailtoSubject"))}`}
            className="btn-invest-gold w-full xl:w-auto rounded-xl px-6 py-4 text-base font-semibold text-slate-950 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] text-center inline-flex items-center justify-center"
          >
            {t("invest.cta")}
          </a>

          <div className="w-full xl:w-auto glass-panel p-4 rounded-xl">
            <h3 className="text-[11px] font-semibold text-accent uppercase tracking-wider mb-3">
              {t("invest.calculatorTitle")}
            </h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                  {t("invest.calculatorAmount")}
                </label>
                <input
                  type="number"
                  min={1}
                  step={100}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full input-glass rounded-lg py-2 px-3 text-sm font-mono"
                />
              </div>
              <div className="space-y-1 text-xs text-slate-300">
                <p>
                  {t("invest.perQuarter")}: <span className="font-semibold text-accent font-mono">${calculated.perQuarter.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </p>
                <p>
                  {t("invest.totalReturn")}: <span className="font-semibold text-emerald-400 font-mono">${calculated.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="text-slate-500">({calculated.totalPercent.toFixed(0)}% {t("invest.totalPercent")})</span>
                </p>
              </div>
            </div>
          </div>

          <Link
            href="/trade"
            className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← {t("header.trading")}
          </Link>
        </div>
      </div>
    </div>
  );
}
