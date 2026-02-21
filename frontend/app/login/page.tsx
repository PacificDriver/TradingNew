"use client";

import { FormEvent, useState } from "react";
import { apiFetch, authHeaders } from "../../lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTradingStore } from "../../store/useTradingStore";

type LoginResponse = {
  token?: string;
  user: {
    id: number;
    email: string;
    demoBalance: number;
  };
};

const inputClass = "mt-1.5 input-glass";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useTradingStore((s) => s.setAuth);
  const setAuthChecked = useTradingStore((s) => s.setAuthChecked);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body: { email: string; password: string; totpCode?: string } = { email, password };
      if (requiresTotp) body.totpCode = totpToken.replace(/\s/g, "");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}/auth/login`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAuth(data.token ?? null, data.user);
        setAuthChecked(true);
        router.push("/trade");
        return;
      }
      if (data.requiresTotp === true) {
        setRequiresTotp(true);
        setError(data.message === "TOTP code required" ? null : (data.message || null));
      } else {
        setError(data.message || "Ошибка входа");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="card w-full max-w-md p-6 sm:p-8 animate-fade-in-up stagger-1 opacity-0">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">
          Демо‑платформа
        </p>
        <h1 className="font-display text-2xl font-semibold text-slate-100 tracking-tight mb-2">
          Вход
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Все расчёты и торговая логика выполняются на бэкенде.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500">
              E‑mail
            </label>
            <input
              type="email"
              className={inputClass}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500">
              Пароль
            </label>
            <input
              type="password"
              className={inputClass}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          {requiresTotp && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-4 sm:p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-100">Подтверждение входа</h2>
                  <p className="text-xs text-slate-400">Двухфакторная аутентификация включена</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 mb-3">
                Введите 6-значный код из приложения (Google Authenticator, Authy и т.п.)
              </p>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
                Код из приложения
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="mt-1.5 input-glass text-center text-lg tracking-[0.4em] font-mono placeholder:text-slate-500"
                placeholder="000000"
                value={totpToken}
                onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                autoFocus
              />
            </div>
          )}
          {error && (
            <p className="text-sm text-red-400 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary w-full py-3 mt-1 rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
            disabled={loading}
          >
            {loading ? (requiresTotp ? "Проверка…" : "Входим…") : "Войти"}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/5">
          <p className="text-sm text-slate-500 text-center">
            Нет аккаунта?{" "}
            <Link
              href="/register"
              className="text-accent font-medium hover:text-emerald-400 transition-colors"
            >
              Создать демо‑аккаунт
            </Link>
          </p>
          <Link
            href="/"
            className="mt-3 block text-center text-xs text-slate-500 hover:text-slate-400 transition-colors"
          >
            ← На главную
          </Link>
        </div>
      </div>
    </div>
  );
}

