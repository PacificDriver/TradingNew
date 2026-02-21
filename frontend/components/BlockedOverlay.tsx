"use client";

import Link from "next/link";
import { useTradingStore } from "../store/useTradingStore";

/**
 * Полная блокировка: размытый фон в стиле сайта и незакрываемое модальное окно.
 * Показывается когда user.blockedAt задан. Доступна только кнопка «Поддержка».
 */
export function BlockedOverlay() {
  const user = useTradingStore((s) => s.user);
  const authChecked = useTradingStore((s) => s.authChecked);

  if (!authChecked || !user?.blockedAt) return null;

  const message =
    user.blockReason?.trim() ||
    "Ваш аккаунт заблокирован за нарушение правил сайта. Для выяснения причин обратитесь в поддержку.";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{
        background: "rgba(11, 14, 17, 0.6)",
        backdropFilter: "blur(14px) saturate(1.1)",
        WebkitBackdropFilter: "blur(14px) saturate(1.1)"
      }}
      aria-modal="true"
      role="dialog"
      aria-labelledby="blocked-title"
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-slate-600/60 p-6 sm:p-8 shadow-2xl animate-fade-in-up"
        style={{
          background: "rgba(22, 26, 30, 0.72)",
          backdropFilter: "blur(12px) saturate(1.08)",
          WebkitBackdropFilter: "blur(12px) saturate(1.08)",
          boxShadow: "0 8px 30px rgba(2, 6, 23, 0.4), 0 0 0 1px rgba(255,255,255,0.04)"
        }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-red-500/20 border border-red-500/40 text-red-400 mb-4">
            <svg
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1
            id="blocked-title"
            className="font-display text-xl font-semibold text-slate-100 mb-2"
          >
            Аккаунт заблокирован
          </h1>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            {message}
          </p>
          <Link
            href="/support"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent/90 hover:bg-accent px-5 py-3 text-sm font-semibold text-slate-900 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Поддержка
          </Link>
        </div>
      </div>
    </div>
  );
}
