"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { useTradingStore } from "../store/useTradingStore";
import type { TradingPair } from "../store/useTradingStore";
import { apiFetch, authHeaders } from "../lib/api";
import { useLocale } from "../lib/i18n";
import { ChartLogo } from "./ChartLogo";
import { PairSelectDropdown } from "./PairSelectDropdown";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useDepositModal } from "./DepositModal";

function formatBalance(value: number | undefined | null) {
  if (value == null) return "-";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "-";
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

type PairsResponse = { pairs: TradingPair[] };

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLocale();
  const token = useTradingStore((s) => s.token);
  const user = useTradingStore((s) => s.user);
  const clearAuth = useTradingStore((s) => s.clearAuth);
  const [menuOpen, setMenuOpen] = useState(false);
  const isLoggedIn = Boolean(user ?? token);

  const pairs = useTradingStore((s) => s.pairs);
  const setPairs = useTradingStore((s) => s.setPairs);
  const chartSettings = useTradingStore((s) => s.chartSettings);
  const setChartSettings = useTradingStore((s) => s.setChartSettings);
  const favoritePairIds = useTradingStore((s) => s.favoritePairIds);
  const recentPairIds = useTradingStore((s) => s.recentPairIds);
  const toggleFavoritePair = useTradingStore((s) => s.toggleFavoritePair);
  const addRecentPair = useTradingStore((s) => s.addRecentPair);

  const selectedPair = useMemo(
    () => pairs.find((p) => p.id === chartSettings.selectedPairId) ?? pairs[0] ?? null,
    [pairs, chartSettings.selectedPairId]
  );

  useEffect(() => {
    if (pairs.length > 0 || !token) return;
    apiFetch<PairsResponse>("/trading-pairs", { headers: authHeaders(token) })
      .then((data) => setPairs(data.pairs ?? []))
      .catch(() => {});
  }, [pairs.length, token, setPairs]);

  const navLinks: { href: string; label: string }[] = [];
  if (user?.isAdmin) {
    navLinks.push({ href: "/admin", label: t("header.admin") });
  }

  const handleLogout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    clearAuth();
    setMenuOpen(false);
    router.push("/login");
  };

  const { openDepositModal } = useDepositModal() ?? {};

  const linkClass = (href: string) => {
    const active = pathname === href;
    return `py-2 text-sm font-medium transition-colors ${
      active ? "text-slate-100" : "text-slate-400 hover:text-slate-100"
    }`;
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-3 md:gap-6 min-w-0">
      {/* Слева: логотип + навигация. На мобильных — только логотип, навигация скрыта (лого ведёт на /trade) */}
      <div className="flex items-center gap-2 sm:gap-6 md:gap-8 shrink-0 min-w-0">
        <Link
          href={isLoggedIn ? "/trade" : "/login"}
          className="flex shrink-0 rounded-lg overflow-hidden transition-opacity hover:opacity-90"
        >
          <ChartLogo className="h-8 w-8 sm:h-9 sm:w-9" />
        </Link>
        <nav className="hidden sm:flex items-center gap-6 md:gap-8">
          <Link href="/trade" className={linkClass("/trade")}>
            {t("header.trading")}
          </Link>
          {navLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(item.href)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* По центру: выпадающий список пар. Скрыт до авторизации и на мобильных */}
      {isLoggedIn && (
      <div className="hidden md:flex flex-1 justify-center min-w-0 max-w-[50%] sm:max-w-none">
        {pairs.length > 0 ? (
          <PairSelectDropdown
              pairs={pairs}
              selectedPair={selectedPair}
              onSelectPair={(pair) => {
                setChartSettings({ selectedPairId: pair.id });
                addRecentPair(pair.id);
                const url = `/trade?pairId=${pair.id}`;
                if (pathname === "/trade") {
                  router.replace(url, { scroll: false });
                } else {
                  router.push(url);
                }
              }}
              favoritePairIds={favoritePairIds}
              recentPairIds={recentPairIds}
              toggleFavoritePair={toggleFavoritePair}
              addRecentPair={addRecentPair}
            />
          ) : (
            <div className="flex items-center rounded-xl glass px-4 py-2.5 text-sm text-slate-500">
              {t("header.loadingPairs")}
            </div>
          )}
      </div>
      )}

      {/* Справа: язык + баланс + пополнение + аватар. ml-auto чтобы всегда справа, flex-nowrap чтобы не переносились */}
      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 shrink-0 flex-nowrap ml-auto">
        <LanguageSwitcher />
        {user && (
          <>
            {/* Мобильный баланс: только сумма + иконка пополнения */}
            <div className="flex sm:hidden items-center gap-1 min-h-[40px]">
              <button
                type="button"
                onClick={() => openDepositModal?.()}
                className="flex items-center rounded-lg glass border border-slate-700/60 px-2 py-1.5 text-xs font-semibold text-accent font-mono touch-manipulation tabular-nums"
              >
                ${formatBalance(user.demoBalance)}
              </button>
              <button
                type="button"
                onClick={() => openDepositModal?.()}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20 border border-accent/40 text-accent touch-manipulation shrink-0"
                aria-label={t("header.deposit")}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            </div>
            {/* Десктоп: баланс + кнопка пополнения */}
            <div className="hidden sm:flex items-center gap-2 rounded-xl glass px-3 py-2 min-h-[44px]">
              <div className="flex flex-col items-end pr-1 border-r border-slate-700/60">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">{t("header.balance")}</span>
                <span className="text-sm font-semibold text-accent font-mono leading-tight">
                  ${formatBalance(user.demoBalance)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => openDepositModal?.()}
                className="flex items-center gap-1.5 rounded-lg bg-accent/15 border border-accent/40 px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25 hover:border-accent/50"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                {t("header.deposit")}
              </button>
            </div>
          </>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex h-11 w-11 xl:h-9 xl:w-9 items-center justify-center rounded-full text-sm font-semibold text-slate-950 transition-all touch-manipulation min-h-[44px] min-w-[44px] ${
              menuOpen
                ? "bg-accent/90 ring-2 ring-slate-500/50"
                : "bg-slate-600 hover:bg-slate-500 text-slate-100"
            }`}
          >
            {(user?.email ?? "G").slice(0, 2).toUpperCase()}
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-[90]"
                aria-hidden
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-[100] mt-1.5 w-64 origin-top-right overflow-hidden rounded-lg glass-strong py-1 shadow-xl shadow-black/20">
                {/* Верх: аватар + email + баланс */}
                <div className="px-4 pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-amber-600 text-sm font-bold text-slate-950 shadow-lg shadow-accent/25">
                      {(user?.email ?? "Гость").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-100">
                        {user?.email ?? t("header.guest")}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">
                        {user ? (user.isAdmin ? t("header.administrator") : t("header.demoAccount")) : t("header.notAuthorized")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-700/60 py-1.5">
                  {isLoggedIn ? (
                    <>
                      <Link
                        href="/profile"
                        className="flex items-center gap-3 px-4 py-3 xl:py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-800/60 min-h-[48px] xl:min-h-0 touch-manipulation"
                        onClick={() => setMenuOpen(false)}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 text-slate-400">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </span>
                        <span>{t("header.profile")}</span>
                      </Link>
                      <Link
                        href="/support"
                        className="flex items-center gap-3 px-4 py-3 xl:py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-800/60 min-h-[48px] xl:min-h-0 touch-manipulation"
                        onClick={() => setMenuOpen(false)}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 text-slate-400">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </span>
                        <span>{t("header.support")}</span>
                      </Link>
                      {user?.isAdmin && (
                        <Link
                          href="/admin"
                          className="flex items-center gap-3 px-4 py-3 xl:py-2.5 text-sm text-slate-200 transition-colors hover:bg-slate-800/60 min-h-[48px] xl:min-h-0 touch-manipulation"
                          onClick={() => setMenuOpen(false)}
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/80 text-slate-400">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </span>
                          <span>{t("header.adminPanel")}</span>
                        </Link>
                      )}
                      <div className="my-1 border-t border-slate-700/60" />
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 px-4 py-3 xl:py-2.5 text-sm text-red-400 transition-colors hover:bg-red-950/30 min-h-[48px] xl:min-h-0 touch-manipulation"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                        </span>
                        <span>{t("header.logout")}</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col gap-1.5 px-3 pb-3 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push("/login");
                        }}
                        className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-slate-950 hover:opacity-90 transition-colors"
                      >
                        {t("header.login")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push("/register");
                        }}
                        className="w-full rounded-lg border border-slate-600 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800/80 transition-colors"
                      >
                        {t("header.register")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
