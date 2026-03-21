"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type PublicContent = {
  legalDetails: string;
};

export default function HomePage() {
  const [content, setContent] = useState<PublicContent | null>(null);

  useEffect(() => {
    apiFetch<PublicContent>("/public/content")
      .then(setContent)
      .catch(() => setContent(null));
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="glass-panel p-6 sm:p-8">
        <h1 className="font-display text-3xl font-semibold text-slate-100 mb-2">AuraTrade</h1>
        <p className="text-slate-400 mb-6">
          Торговая платформа с пополнением и выводом средств.
        </p>
        <div className="flex flex-wrap gap-3 mb-8">
          <Link href="/login" className="btn-primary px-5 py-2.5 rounded-lg">
            Войти
          </Link>
          <Link href="/register" className="rounded-lg border border-slate-600 bg-slate-800/80 px-5 py-2.5 text-slate-200 hover:bg-slate-700/80">
            Регистрация
          </Link>
        </div>

        <section className="mb-6">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2">Реквизиты юр.лица</h2>
          <pre className="whitespace-pre-wrap rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 text-sm text-slate-300 font-sans">
            {content?.legalDetails || "Загрузка..."}
          </pre>
        </section>

        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/policy" className="text-accent hover:underline">
            Политика обработки данных
          </Link>
          <Link href="/privacy" className="text-accent hover:underline">
            Политика конфиденциальности
          </Link>
        </div>
      </div>
    </main>
  );
}
