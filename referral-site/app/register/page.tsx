"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReferralAuth } from "../ReferralAuthContext";
import { referralApiFetch, setReferralToken } from "../../lib/referralApi";

const inputClass = "mt-1.5 input-glass";

type RegisterResponse = {
  token?: string;
  partner: { id: number; email: string; name: string | null; referralCode: string };
};

export default function ReferralRegisterPage() {
  const router = useRouter();
  const { setPartner } = useReferralAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await referralApiFetch<RegisterResponse>("/referral-partners/register", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
        }),
      });
      if (data.token) setReferralToken(data.token);
      setPartner(data.partner);
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error)?.message || "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="card w-full max-w-md p-6 sm:p-8 animate-fade-in-up">
        <h1 className="font-display text-2xl font-semibold text-slate-100 tracking-tight mb-2">
          Регистрация партнёра
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Создайте аккаунт для доступа к реферальной программе и аналитике
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
              Имя (необязательно)
            </label>
            <input
              type="text"
              className={inputClass}
              placeholder="Ваше имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500">
              Пароль (мин. 6 символов)
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
            {loading ? "Регистрация..." : "Зарегистрироваться"}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/5">
          <p className="text-sm text-slate-500 text-center">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-accent font-medium hover:text-emerald-400">
              Войти
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
