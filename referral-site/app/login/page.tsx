"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReferralAuth } from "../ReferralAuthContext";
import { referralApiFetch, setReferralToken } from "../../lib/referralApi";

const inputClass = "mt-1.5 input-glass";

type LoginResponse = {
  token?: string;
  partner: { id: number; email: string; name: string | null; referralCode: string };
};

export default function ReferralLoginPage() {
  const router = useRouter();
  const { setPartner } = useReferralAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await referralApiFetch<LoginResponse>("/referral-partners/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (data.token) setReferralToken(data.token);
      setPartner(data.partner);
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error)?.message || "Неверные учетные данные");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="card w-full max-w-md p-6 sm:p-8 animate-fade-in-up">
        <h1 className="font-display text-2xl font-semibold text-slate-100 tracking-tight mb-2">
          Вход в кабинет партнёра
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Войдите в личный кабинет реферальной программы
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500">
              Email
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
          {error && (
            <p className="text-sm text-red-400 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary w-full py-3 mt-1 rounded-xl disabled:opacity-70"
            disabled={loading}
          >
            {loading ? "Вход..." : "Войти"}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/5">
          <p className="text-sm text-slate-500 text-center">
            Нет аккаунта?{" "}
            <Link href="/register" className="text-accent font-medium hover:text-emerald-400">
              Регистрация
            </Link>
          </p>
          <Link href="/" className="mt-3 block text-center text-xs text-slate-500 hover:text-slate-400">
            Назад
          </Link>
        </div>
      </div>
    </div>
  );
}
