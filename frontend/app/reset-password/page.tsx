"use client";

import { FormEvent, useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "../../lib/i18n";
import { apiFetch, getDisplayMessage } from "../../lib/api";

const inputClass = "mt-1.5 input-glass";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { t } = useLocale();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) setError(t("auth.resetPasswordInvalidLink"));
  }, [token, t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("profile.passwordMismatch"));
      return;
    }
    if (password.length < 6) {
      setError(t("profile.passwordMinLength"));
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password })
      });
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(getDisplayMessage(err, t));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <div className="card w-full max-w-md p-6 sm:p-8">
          <p className="text-sm text-red-400 mb-4">{t("auth.resetPasswordInvalidLink")}</p>
          <Link href="/forgot-password" className="text-accent font-medium hover:underline">
            {t("auth.forgotPasswordTitle")}
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <div className="card w-full max-w-md p-6 sm:p-8">
          <p className="text-sm text-emerald-400 mb-4">{t("auth.resetPasswordSuccess")}</p>
          <p className="text-xs text-slate-500">{t("auth.redirectToLogin")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="card w-full max-w-md p-6 sm:p-8 animate-fade-in-up stagger-1 opacity-0">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">
          {t("auth.demoPlatform")}
        </p>
        <h1 className="font-display text-2xl font-semibold text-slate-100 tracking-tight mb-2">
          {t("auth.resetPasswordTitle")}
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          {t("auth.resetPasswordSubtitle")}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500">
              {t("profile.newPassword")}
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
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500">
              {t("profile.confirmPassword")}
            </label>
            <input
              type="password"
              className={inputClass}
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
            className="btn-primary w-full py-3 mt-1 rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70"
            disabled={loading}
          >
            {loading ? t("profile.saving") : t("auth.resetPasswordSubmit")}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/5">
          <Link href="/login" className="text-sm text-slate-500 hover:text-accent transition-colors">
            ← {t("auth.backToLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <div className="card w-full max-w-md p-8 text-center text-slate-500">…</div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
