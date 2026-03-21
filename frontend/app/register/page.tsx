"use client";

import { FormEvent, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTradingStore } from "../../store/useTradingStore";
import { apiFetch, authHeaders, getDisplayMessage } from "../../lib/api";
import { useLocale } from "../../lib/i18n";

type RegisterResponse = {
  token?: string;
  user: {
    id: number;
    email: string;
    demoBalance: number;
  };
};

type CaptchaResponse = { id: string; image: string };

const inputClass = "mt-1.5 input-glass";

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refFromUrl = searchParams.get("ref")?.trim() || undefined;
  const { t, locale } = useLocale();
  const setAuth = useTradingStore((s) => s.setAuth);
  const setAuthChecked = useTradingStore((s) => s.setAuthChecked);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(refFromUrl ?? "");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaImage, setCaptchaImage] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptPolicies, setAcceptPolicies] = useState(false);

  const refCode = refFromUrl || (referralCode?.trim() || undefined);

  const loadCaptcha = useCallback(async () => {
    try {
      const data = await apiFetch<CaptchaResponse>("/auth/captcha", { method: "GET" });
      setCaptchaId(data.id);
      setCaptchaImage(data.image);
      setCaptchaAnswer("");
    } catch {
      setCaptchaId("");
      setCaptchaImage("");
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  useEffect(() => {
    if (refFromUrl) {
      apiFetch(`/ref/click?code=${encodeURIComponent(refFromUrl)}`, { method: "GET" }).catch(() => {});
    }
  }, [refFromUrl]);

  useEffect(() => {
    if (refFromUrl) setReferralCode(refFromUrl);
  }, [refFromUrl]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<RegisterResponse>("/auth/register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email,
          password,
          captchaId,
          captchaAnswer,
          acceptPolicies,
          ...(refCode && { referralCode: refCode })
        })
      });
      setAuth(data.token ?? null, data.user);
      setAuthChecked(true);
      router.push("/trade");
    } catch (err) {
      setError(getDisplayMessage(err, t));
      loadCaptcha();
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
          {t("auth.createDemoAccount")}
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          {t("auth.registerSubtitle")}
          {refCode && (
            <span className="block mt-2 text-emerald-400/90 text-sm">
              {t("auth.registerByReferral")}
            </span>
          )}
        </p>

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
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500">
              {t("auth.password")}
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
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
              {t("auth.captcha")}
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <div className="rounded-lg border border-slate-600/60 bg-slate-900/60 overflow-hidden flex items-center justify-center min-h-[52px] min-w-[140px]">
                {captchaImage ? (
                  <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(captchaImage)}`} alt="" className="max-h-12 w-auto" />
                ) : (
                  <span className="text-slate-500 text-sm">…</span>
                )}
              </div>
              <button
                type="button"
                onClick={loadCaptcha}
                className="text-[11px] font-medium text-slate-400 hover:text-accent transition-colors"
              >
                {t("auth.captchaRefresh")}
              </button>
            </div>
            <input
              type="text"
              className={`${inputClass} w-28 font-mono uppercase`}
              placeholder={t("auth.captchaPlaceholder")}
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value.slice(0, 6))}
              maxLength={6}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500">
              {t("auth.referralCode")}
            </label>
            <input
              type="text"
              className={`${inputClass} ${refFromUrl ? "bg-slate-800/50 cursor-default" : ""}`}
              placeholder={t("auth.referralCodePlaceholder")}
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              readOnly={!!refFromUrl}
              autoComplete="off"
            />
          </div>
          <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-3">
            <input
              type="checkbox"
              checked={acceptPolicies}
              onChange={(e) => setAcceptPolicies(e.target.checked)}
              className="mt-0.5 rounded border-slate-600 bg-slate-800 text-accent focus:ring-accent/50"
              required
            />
            <span className="text-xs text-slate-300">
              Я принимаю{" "}
              <Link href="/policy" className="text-accent hover:underline">
                политику обработки данных
              </Link>{" "}
              и{" "}
              <Link href="/privacy" className="text-accent hover:underline">
                политику конфиденциальности
              </Link>
              .
            </span>
          </label>
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
            {loading ? t("auth.creating") : t("auth.createAccount")}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/5">
          <p className="text-sm text-slate-500 text-center">
            {t("auth.haveAccount")}{" "}
            <Link
              href="/login"
              className="text-accent font-medium hover:text-emerald-400 transition-colors"
            >
              {t("auth.loginLink")}
            </Link>
          </p>
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

