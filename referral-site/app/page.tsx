"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useReferralAuth } from "./ReferralAuthContext";

const cardBase =
  "group relative flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 sm:p-8 backdrop-blur-xl transition-all duration-300 hover:border-amber-500/20 hover:bg-white/[0.05]";

export default function ReferralHomePage() {
  const { partner, loading } = useReferralAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (partner) router.replace("/dashboard");
  }, [partner, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-amber-500/40 border-t-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl py-8 sm:py-12">
      <div className="mb-10 text-center">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-100 tracking-tight">
          Реферальная программа
        </h1>
        <p className="mt-2 text-slate-500 text-sm">
          Приводите пользователей и получайте доход
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <Link href="/login" className={cardBase}>
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-100">Вход</h2>
          <p className="mt-1 text-sm text-slate-500">
            Войдите в личный кабинет партнёра
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-amber-500 group-hover:gap-2 transition-all">
            Войти
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </Link>

        <div className={cardBase}>
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-100">Преимущества</h2>
          <p className="mt-1 text-sm text-slate-500">
            Аналитика по активности рефералов, детальная статистика по проигрышам, пассивный доход с каждой сделки
          </p>
        </div>

        <div className={cardBase}>
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012 2v6M5 11a2 2 0 012 2v6a2 2 0 002 2h2a2 2 0 002-2v-6a2 2 0 012-2" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-100">Принцип работы</h2>
          <p className="mt-1 text-sm text-slate-500">
            1. Зарегистрируйтесь как партнёр → 2. Делитесь ссылкой → 3. Получайте комиссию с сделок рефералов
          </p>
        </div>

        <Link href="/register" className={cardBase}>
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/15 text-teal-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-100">Регистрация партнёра</h2>
          <p className="mt-1 text-sm text-slate-500">
            Создайте аккаунт для доступа к реферальной программе и аналитике
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-400 group-hover:gap-2 transition-all">
            Зарегистрироваться
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </Link>
      </div>
    </div>
  );
}
