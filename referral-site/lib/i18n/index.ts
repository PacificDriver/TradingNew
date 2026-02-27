"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Locale } from "./messages";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, getMessage } from "./messages";

const STORAGE_KEY = "referral_locale";

function getStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && SUPPORTED_LOCALES.includes(raw as Locale)) return raw as Locale;
  } catch {
    // ignore
  }
  return null;
}

export function setStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

export function getPreferredLocale(): Locale {
  const stored = getStoredLocale();
  if (stored) return stored;
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const lang = navigator.language?.split("-")[0]?.toLowerCase();
  if (lang && SUPPORTED_LOCALES.includes(lang as Locale)) return lang as Locale;
  if (Array.isArray(navigator.languages)) {
    for (const l of navigator.languages) {
      const code = l?.split("-")[0]?.toLowerCase();
      if (code && SUPPORTED_LOCALES.includes(code as Locale)) return code as Locale;
    }
  }
  return DEFAULT_LOCALE;
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, placeholders?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const preferred = getPreferredLocale();
    const stored = getStoredLocale();
    if (!stored) setStoredLocale(preferred);
    setLocaleState(stored ?? preferred);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      document.documentElement.lang = locale;
    } catch {
      // ignore
    }
  }, [mounted, locale]);

  const setLocale = useCallback((next: Locale) => {
    setStoredLocale(next);
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: string, placeholders?: Record<string, string | number>) =>
      getMessage(locale, key, placeholders),
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return React.createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
