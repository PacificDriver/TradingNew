"use client";

import Link from "next/link";
import { useLocale } from "../lib/i18n";

export function InvestButton() {
  const { t } = useLocale();

  return (
    <Link
      href="/invest"
      className="btn-invest-gold relative overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] inline-block"
    >
      {t("header.investInAuraTrade")}
    </Link>
  );
}
