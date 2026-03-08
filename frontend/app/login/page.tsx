"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTradingStore } from "../../store/useTradingStore";
import { useLocale } from "../../lib/i18n";
import { getDisplayMessage } from "../../lib/api";

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
  const { t } = useLocale();
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
      const apiBase = "/api-proxy";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiBase.includes("ngrok")) headers["ngrok-skip-browser-warning"] = "1";
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body)
      });
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
        setError(data.message || t("auth.loginError"));
      }
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
          {t("auth.loginTitle")}
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          {t("auth.loginSubtitle")}
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
            <div className="flex items-center justify-between">
              <label className="block text-[11px] uppercase tracking-wider text-slate-500">
                {t("auth.password")}
              </label>
              <Link href="/forgot-password" className="text-[11px] text-slate-500 hover:text-accent transition-colors">
                {t("auth.forgotPassword")}
              </Link>
            </div>
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
                  <h2 className="font-display text-base font-semibold text-slate-100">{t("auth.totpTitle")}</h2>
                  <p className="text-xs text-slate-400">{t("auth.totpSubtitle")}</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 mb-3">
                {t("auth.totpPrompt")}
              </p>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
                {t("auth.totpLabel")}
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
            {loading ? (requiresTotp ? t("auth.checkingTotp") : t("auth.loggingIn")) : t("auth.login")}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/5">
          <p className="text-sm text-slate-500 text-center">
            {t("auth.noAccount")}{" "}
            <Link
              href="/register"
              className="text-accent font-medium hover:text-emerald-400 transition-colors"
            >
              {t("auth.createDemoAccount")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

