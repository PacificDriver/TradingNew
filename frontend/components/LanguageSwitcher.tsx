"use client";

import { useLocale } from "../lib/i18n";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "../lib/i18n/messages";
import { useState, useRef, useEffect, useId } from "react";

/** Флаг РФ: три горизонтальные полосы, скруглённые углы */
function IconFlagRU({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={className}
      viewBox="0 0 24 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <clipPath id={`ru-clip-${id}`}>
          <rect width="24" height="18" rx="2" />
        </clipPath>
      </defs>
      <g clipPath={`url(#ru-clip-${id})`}>
        <rect y="0" width="24" height="6" fill="#fff" />
        <rect y="6" width="24" height="6" fill="#0039A6" />
        <rect y="12" width="24" height="6" fill="#D52B1E" />
      </g>
    </svg>
  );
}

/** Упрощённый флаг ES: жёлто-красные полосы, скруглённые углы */
function IconFlagES({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={className}
      viewBox="0 0 24 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <clipPath id={`es-clip-${id}`}>
          <rect width="24" height="18" rx="2" />
        </clipPath>
      </defs>
      <g clipPath={`url(#es-clip-${id})`}>
        <rect y="0" width="24" height="6" fill="#AA151B" />
        <rect y="6" width="24" height="6" fill="#F1BF00" />
        <rect y="12" width="24" height="6" fill="#AA151B" />
      </g>
    </svg>
  );
}

/** Упрощённый флаг EN (US): полосы + синий кантон, скруглённые углы */
function IconFlagEN({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={className}
      viewBox="0 0 24 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <clipPath id={`en-clip-${id}`}>
          <rect width="24" height="18" rx="2" />
        </clipPath>
      </defs>
      <g clipPath={`url(#en-clip-${id})`}>
        <rect width="24" height="18" fill="#B22234" />
        <rect y="2.57" width="24" height="2.57" fill="#fff" />
        <rect y="5.14" width="24" height="2.57" fill="#fff" />
        <rect y="7.71" width="24" height="2.57" fill="#fff" />
        <rect y="10.28" width="24" height="2.57" fill="#fff" />
        <rect y="12.86" width="24" height="2.57" fill="#fff" />
        <rect y="15.43" width="24" height="2.57" fill="#fff" />
        <rect width="10" height="7.2" fill="#3C3B6E" />
        <circle cx="2" cy="1.4" r="0.45" fill="#fff" />
        <circle cx="5" cy="1.4" r="0.45" fill="#fff" />
        <circle cx="8" cy="1.4" r="0.45" fill="#fff" />
        <circle cx="3.5" cy="3.6" r="0.45" fill="#fff" />
        <circle cx="6.5" cy="3.6" r="0.45" fill="#fff" />
      </g>
    </svg>
  );
}

function LocaleIcon({ locale, className }: { locale: Locale; className?: string }) {
  const cn = `h-4 w-4 shrink-0 rounded-sm overflow-hidden shadow-sm ${className ?? ""}`.trim();
  if (locale === "ru") return <IconFlagRU className={cn} />;
  if (locale === "es") return <IconFlagES className={cn} />;
  return <IconFlagEN className={cn} />;
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
        className="flex items-center gap-1 sm:gap-2 rounded-lg sm:rounded-xl glass border border-slate-700/60 p-1.5 sm:pl-2 sm:pr-2.5 sm:py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 focus:ring-offset-[#0B0E11] min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 justify-center shrink-0"
        aria-label={t("header.language")}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <LocaleIcon locale={locale} />
        <span className="hidden sm:inline font-medium" aria-hidden>
          {LOCALE_LABELS[locale]}
        </span>
        <svg
          className={`h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 text-slate-500 transition-transform hidden sm:block ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t("header.language")}
          className="absolute right-0 top-full z-[100] mt-1.5 min-w-[7.5rem] origin-top-right overflow-hidden rounded-xl glass-strong border border-slate-700/60 py-1 shadow-xl shadow-black/20"
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <button
              key={loc}
              role="option"
              aria-selected={locale === loc}
              type="button"
              onClick={() => {
                setLocale(loc as Locale);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                locale === loc
                  ? "bg-accent/20 text-accent"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-slate-100"
              }`}
            >
              <LocaleIcon locale={loc as Locale} />
              <span>{LOCALE_LABELS[loc as Locale]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
