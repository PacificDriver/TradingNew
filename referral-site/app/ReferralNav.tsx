"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useReferralAuth } from "./ReferralAuthContext";
import { useLocale } from "../lib/i18n";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

const navLinkClass = "text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors";
const navLinkAccentClass = "text-sm font-medium text-accent hover:text-emerald-400 transition-colors flex items-center gap-1.5";

export function ReferralNav() {
  const { partner, loading, logout } = useReferralAuth();
  const { t } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  if (!loading && !partner) {
    return (
      <div className="flex items-center gap-3 sm:gap-4">
        <LanguageSwitcher />
        <Link href="/login" className={navLinkClass}>
          {t("ref.login")}
        </Link>
        <Link href="/register" className={navLinkAccentClass}>
          {t("ref.register")}
        </Link>
      </div>
    );
  }

  if (!partner) return null;

  const navItems = (
    <>
      <LanguageSwitcher />
      <Link href="/dashboard?tab=withdraw" onClick={closeMenu} className={navLinkAccentClass}>
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {t("ref.withdrawFunds")}
      </Link>
      <Link href="/dashboard?tab=report" onClick={closeMenu} className={navLinkClass}>
        {t("ref.report")}
      </Link>
      <Link href="/dashboard?tab=referrals" onClick={closeMenu} className={navLinkClass}>
        {t("ref.referrals")}
      </Link>
      <button
        type="button"
        onClick={() => { closeMenu(); logout(); }}
        className="text-sm text-slate-500 hover:text-red-400 transition-colors"
      >
        {t("ref.logout")}
      </button>
    </>
  );

  return (
    <>
      {/* Desktop: inline links */}
      <nav className="hidden md:flex items-center gap-4">
        {navItems}
      </nav>

      {/* Mobile: burger button */}
      <div className="flex md:hidden items-center">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="relative flex h-10 w-10 items-center justify-center rounded-xl glass border border-slate-700/60 text-slate-300 hover:text-slate-100 hover:border-slate-600/60 transition-colors touch-manipulation"
          aria-label={menuOpen ? t("ref.closeMenu") : t("ref.openMenu")}
          aria-expanded={menuOpen}
        >
          <span className="sr-only">{menuOpen ? t("ref.closeMenu") : t("ref.menu")}</span>
          <div className="flex flex-col gap-1.5">
            <span
              className={`block h-0.5 w-5 rounded-full bg-current transition-all duration-300 ${
                menuOpen ? "translate-y-2 rotate-45" : ""
              }`}
            />
            <span
              className={`block h-0.5 w-5 rounded-full bg-current transition-all duration-300 ${
                menuOpen ? "opacity-0 scale-0" : ""
              }`}
            />
            <span
              className={`block h-0.5 w-5 rounded-full bg-current transition-all duration-300 ${
                menuOpen ? "-translate-y-2 -rotate-45" : ""
              }`}
            />
          </div>
        </button>
      </div>

      {/* Mobile: slide-in menu — портал в body, чтобы быть поверх всего */}
      {menuOpen && typeof document !== "undefined" && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm md:hidden animate-fade-in"
            aria-hidden
            onClick={closeMenu}
          />
          <div
            className="fixed top-0 right-0 z-[9999] h-full w-[min(85vw,320px)] glass-strong border-l border-slate-700/60 shadow-2xl md:hidden flex flex-col animate-slide-in-right"
            role="dialog"
            aria-modal="true"
            aria-label={t("ref.navigation")}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
              <span className="text-xs uppercase tracking-wider text-slate-500">{t("ref.menu")}</span>
              <button
                type="button"
                onClick={closeMenu}
                className="p-2 -mr-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
                aria-label={t("ref.closeMenu")}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-col p-4 gap-1">
              <Link
                href="/dashboard?tab=withdraw"
                onClick={closeMenu}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-slate-200 hover:bg-slate-800/60 hover:text-emerald-400 transition-colors touch-manipulation"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 text-accent">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </span>
                <span className="font-medium">{t("ref.withdrawFunds")}</span>
              </Link>
              <Link
                href="/dashboard?tab=report"
                onClick={closeMenu}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-slate-200 hover:bg-slate-800/60 transition-colors touch-manipulation"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.5a2 2 0 012 2v5.5a2 2 0 01-2 2z" />
                  </svg>
                </span>
                <span className="font-medium">{t("ref.report")}</span>
              </Link>
              <Link
                href="/dashboard?tab=referrals"
                onClick={closeMenu}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-slate-200 hover:bg-slate-800/60 transition-colors touch-manipulation"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </span>
                <span className="font-medium">{t("ref.referrals")}</span>
              </Link>
              <div className="my-2 border-t border-slate-700/60" />
              <button
                type="button"
                onClick={() => { closeMenu(); logout(); }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-red-400 hover:bg-red-950/30 transition-colors touch-manipulation w-full text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </span>
                <span className="font-medium">{t("ref.logout")}</span>
              </button>
            </nav>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
