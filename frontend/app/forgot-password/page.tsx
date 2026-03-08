"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useLocale } from "../../lib/i18n";
import { apiFetch, getDisplayMessage } from "../../lib/api";

const inputClass = "mt-1.5 input-glass";

export default function ForgotPasswordPage() {
  const { t, locale } = useLocale();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          locale: locale === "en" ? "en" : locale === "es" ? "es" : "ru"
        })
      });
      setSent(true);
    } catch (err) {
      setError(getDisplayMessage(err, t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="card w-full max-w-md p-6 sm:p-8 animate-fade-in-up stagger-1 opacity-0">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">
          {t("auth.demoPlatform")}
        </p>
        <h1 className="font-display text-2xl font-semibold text-slate-100 tracking-tight mb-2">
          {t("auth.forgotPasswordTitle")}
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          {t("auth.forgotPasswordSubtitle")}
        </p>

        {sent ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-400">
            {t("auth.forgotPasswordSent")}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500">
                {t("auth.email")}
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
              {loading ? t("auth.sending") : t("auth.forgotPasswordSubmit")}
            </button>
          </form>
        )}

        <div className="mt-6 pt-5 border-t border-white/5">
          <Link
            href="/login"
            className="text-sm text-accent font-medium hover:text-emerald-400 transition-colors"
          >
            ← {t("auth.backToLogin")}
          </Link>
          <Link
            href="/"
            className="mt-3 block text-center text-xs text-slate-500 hover:text-slate-400 transition-colors"
          >
            {t("auth.backHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
