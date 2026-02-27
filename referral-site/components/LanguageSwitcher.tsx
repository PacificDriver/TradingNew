"use client";

import { useLocale } from "../lib/i18n";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "../lib/i18n/messages";
import { useState, useRef, useEffect } from "react";

function LocaleIcon({ locale, className }: { locale: Locale; className?: string }) {
  const cn = `h-4 w-4 shrink-0 rounded-sm overflow-hidden ${className ?? ""}`.trim();
  if (locale === "es") {
    return (
      <span className={`${cn} flex items-center justify-center text-[10px] font-bold bg-[#AA151B] text-[#F1BF00]`} aria-hidden>
        ES
      </span>
    );
  }
  return (
    <span className={`${cn} flex items-center justify-center text-[8px] font-bold bg-[#3C3B6E] text-white`} aria-hidden>
      EN
    </span>
  );
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl glass border border-slate-700/60 px-2.5 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:text-slate-100"
        aria-label={t("ref.language")}
        aria-expanded={open}
      >
        <LocaleIcon locale={locale} />
        <span>{LOCALE_LABELS[locale]}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[7rem] overflow-hidden rounded-xl glass-strong border border-slate-700/60 py-1 shadow-xl">
          {SUPPORTED_LOCALES.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => {
                setLocale(loc);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                locale === loc
                  ? "bg-accent/20 text-accent"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-slate-100"
              }`}
            >
              <LocaleIcon locale={loc} />
              <span>{LOCALE_LABELS[loc]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
