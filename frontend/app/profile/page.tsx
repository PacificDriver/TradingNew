"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "../../components/AuthGuard";
import { OsIcon } from "../../components/OsIcon";
import { SocialLink } from "../../components/SocialLink";
import { useTradingStore, type Trade } from "../../store/useTradingStore";
import { apiFetch, authHeaders, isAuthError, getDisplayMessage } from "../../lib/api";
import { useLocale } from "../../lib/i18n";

type MeResponse = {
  user: {
    id: number;
    email: string;
    demoBalance: number;
    balance?: number;
    useDemoMode?: boolean;
    createdAt?: string;
    totpEnabled?: boolean;
    blockedAt?: string | null;
    withdrawBlockedAt?: string | null;
    blockReason?: string | null;
    socialBonus?: { instagramClicked: boolean; telegramClicked: boolean; bonusClaimed: boolean };
  };
};

type TradesResponse = { trades: Trade[] };

type SessionItem = {
  id: number;
  ip: string;
  userAgentShort: string;
  osShort: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
};

type SessionsResponse = { sessions: SessionItem[] };

const INITIAL_TRADES_VISIBLE = 10;

function ProfileAvatar({ email }: { email?: string }) {
  const [imgError, setImgError] = useState(false);
  if (!imgError) {
    return (
      <>
        <img
          src="/Kd6nHrn42s.png"
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      </>
    );
  }
  return (
    <span className="text-slate-300 text-lg font-semibold font-mono">
      {(email ?? "?").slice(0, 2).toUpperCase()}
    </span>
  );
}

type ProfileSection = "overview" | "history" | "analytics" | "settings" | "security";

function formatBalance(value: number | undefined | null) {
  if (value == null) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(iso: string | undefined, locale?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return "—";
  }
}

function formatDateTime(iso: string | undefined, locale?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "—";
  }
}

function formatPrice(value: number | null | undefined) {
  if (value == null) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

export default function ProfilePage() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const token = useTradingStore((s) => s.token);
  const authChecked = useTradingStore((s) => s.authChecked);
  const user = useTradingStore((s) => s.user);
  const setAuth = useTradingStore((s) => s.setAuth);
  const clearAuth = useTradingStore((s) => s.clearAuth);
  const soundOnWin = useTradingStore((s) => s.soundOnWin);
  const setSoundOnWin = useTradingStore((s) => s.setSoundOnWin);
  const activeTrades = useTradingStore((s) => s.activeTrades);
  const completedTrades = useTradingStore((s) => s.completedTrades);
  const tradeHistory = useTradingStore((s) => s.tradeHistory);
  const setCompletedTrades = useTradingStore((s) => s.setCompletedTrades);
  const mergeTradeHistory = useTradingStore((s) => s.mergeTradeHistory);

  const [profile, setProfile] = useState<MeResponse["user"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [activeSection, setActiveSection] = useState<ProfileSection>("overview");
  // Security: change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  // Security: TOTP
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpMsg, setTotpMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [totpLoading, setTotpLoading] = useState(false);
  // Security: sessions
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  // Смена email
  const [newEmail, setNewEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailStep, setEmailStep] = useState<"idle" | "code_sent">("idle");

  useEffect(() => {
    if (!authChecked || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const meData = await apiFetch<MeResponse>("/me", { headers: authHeaders(token) });
        if (cancelled) return;
        if (meData.user) {
          setProfile(meData.user);
          setAuth(token ?? null, {
            ...meData.user,
            demoBalance: meData.user.demoBalance,
            balance: meData.user.balance,
            useDemoMode: meData.user.useDemoMode
          });
        }
        if (meData.user?.blockedAt) {
          setLoading(false);
          return;
        }
        const completedData = await apiFetch<TradesResponse>("/trades/completed", {
          headers: authHeaders(token)
        });
        if (cancelled) return;
        setCompletedTrades(completedData.trades ?? []);
        mergeTradeHistory(completedData.trades ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(getDisplayMessage(err, t));
          if (isAuthError(err)) {
            clearAuth();
            router.replace("/login");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    authChecked,
    token,
    setAuth,
    setCompletedTrades,
    mergeTradeHistory,
    clearAuth,
    router
  ]);

  useEffect(() => {
    if (activeSection !== "security" || !token) return;
    let cancelled = false;
    setSessionsError(null);
    setSessionsLoading(true);
    (async () => {
      try {
        const data = await apiFetch<SessionsResponse>("/sessions", { headers: authHeaders(token) });
        if (!cancelled) setSessions(data.sessions ?? []);
      } catch (e) {
        if (!cancelled) setSessionsError((e as Error).message);
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSection, token]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== newPasswordConfirm) {
      setPasswordMsg({ type: "error", text: t("profile.passwordMismatch") });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: "error", text: t("profile.passwordMinLength") });
      return;
    }
    setPasswordLoading(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setPasswordMsg({ type: "success", text: t("profile.passwordChanged") });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
    } catch (err) {
      setPasswordMsg({ type: "error", text: (err as Error).message });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleTotpSetup = async () => {
    if (!token) return;
    setTotpMsg(null);
    setTotpLoading(true);
    try {
      const data = await apiFetch<{ secret: string; qrDataUrl: string }>("/auth/totp/setup", { headers: authHeaders(token) });
      setTotpSetup({ secret: data.secret, qrDataUrl: data.qrDataUrl });
      setTotpCode("");
    } catch (err) {
      setTotpMsg({ type: "error", text: (err as Error).message });
    } finally {
      setTotpLoading(false);
    }
  };

  const handleTotpEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !totpSetup) return;
    setTotpMsg(null);
    const code = totpCode.replace(/\s/g, "");
    if (code.length !== 6) {
      setTotpMsg({ type: "error", text: t("profile.totpEnterCode") });
      return;
    }
    setTotpLoading(true);
    try {
      await apiFetch("/auth/totp/enable", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ secret: totpSetup.secret, code })
      });
      setTotpMsg({ type: "success", text: t("profile.totpEnabled") });
      setTotpSetup(null);
      setTotpCode("");
      setProfile((p) => (p ? { ...p, totpEnabled: true } : null));
    } catch (err) {
      setTotpMsg({ type: "error", text: (err as Error).message });
    } finally {
      setTotpLoading(false);
    }
  };

  const handleTotpDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setTotpMsg(null);
    const code = totpCode.replace(/\s/g, "");
    if (code.length !== 6) {
      setTotpMsg({ type: "error", text: t("profile.totpEnterToDisable") });
      return;
    }
    setTotpLoading(true);
    try {
      await apiFetch("/auth/totp/disable", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ code })
      });
      setTotpMsg({ type: "success", text: t("profile.totpDisabled") });
      setTotpCode("");
      setProfile((p) => (p ? { ...p, totpEnabled: false } : null));
    } catch (err) {
      setTotpMsg({ type: "error", text: (err as Error).message });
    } finally {
      setTotpLoading(false);
    }
  };

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setEmailMsg(null);
    const email = newEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailMsg({ type: "error", text: t("profile.emailInvalid") });
      return;
    }
    setEmailLoading(true);
    try {
      await apiFetch("/auth/request-email-change", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ newEmail: email, locale: locale === "en" ? "en" : locale === "es" ? "es" : "ru" })
      });
      setEmailStep("code_sent");
      setEmailMsg({ type: "success", text: t("profile.emailCodeSent") });
    } catch (err) {
      setEmailMsg({ type: "error", text: (err as Error).message });
    } finally {
      setEmailLoading(false);
    }
  };

  const handleConfirmEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setEmailMsg(null);
    const email = newEmail.trim().toLowerCase();
    const code = emailCode.replace(/\s/g, "");
    if (!email || !code) {
      setEmailMsg({ type: "error", text: t("profile.emailAndCodeRequired") });
      return;
    }
    setEmailLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; email: string }>("/auth/confirm-email-change", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ newEmail: email, code })
      });
      setProfile((p) => (p ? { ...p, email: res.email } : null));
      setAuth(token, { ...user!, email: res.email });
      setNewEmail("");
      setEmailCode("");
      setEmailStep("idle");
      setEmailMsg({ type: "success", text: t("profile.emailChanged") });
    } catch (err) {
      setEmailMsg({ type: "error", text: (err as Error).message });
    } finally {
      setEmailLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: number, isCurrent: boolean) => {
    if (!token) return;
    setRevokingId(sessionId);
    try {
      await apiFetch(`/sessions/${sessionId}`, { method: "DELETE", headers: authHeaders(token) });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (isCurrent) {
        clearAuth();
        router.push("/login");
      }
    } catch {
      // keep list
    } finally {
      setRevokingId(null);
    }
  };

  const handleLogout = () => {
    apiFetch("/auth/logout", { method: "POST" })
      .catch(() => undefined)
      .finally(() => {
        clearAuth();
        router.push("/login");
      });
  };

  const displayUser = profile ?? user;
  const wins = completedTrades.filter((t) => t.status === "WIN").length;
  const losses = completedTrades.filter((t) => t.status === "LOSS").length;
  const closedCount = wins + losses;
  const totalPnl = completedTrades.reduce((sum, t) => {
    const amt = Number(t.amount);
    return sum + (t.status === "WIN" ? amt : -amt);
  }, 0);
  const winRatePct = closedCount > 0 ? Math.round((wins / closedCount) * 100) : null;
  const history = tradeHistory.length ? tradeHistory : completedTrades;
  const displayedTrades = showAllTrades
    ? history
    : history.slice(0, INITIAL_TRADES_VISIBLE);
  const hasMoreTrades = history.length > INITIAL_TRADES_VISIBLE;

  const sectionTitles: Record<ProfileSection, string> = useMemo(() => ({
    overview: t("profile.overviewTitle"),
    history: t("profile.history"),
    analytics: t("profile.analytics"),
    settings: t("profile.settings"),
    security: t("profile.security")
  }), [t]);

  const profileSections = useMemo(() => [
    { id: "overview" as const, label: t("profile.overview") },
    { id: "history" as const, label: t("profile.history") },
    { id: "analytics" as const, label: t("profile.analytics") },
    { id: "settings" as const, label: t("profile.settings") },
    { id: "security" as const, label: t("profile.security") }
  ], [t]);

  return (
    <AuthGuard>
      <div className="min-h-screen">
        <div className="mb-6 sm:mb-8 animate-fade-in-up stagger-1 opacity-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">{t("profile.cabinet")}</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-100 tracking-tight">
            {sectionTitles[activeSection]}
          </h1>
        </div>

        {loading && (
          <div className="card py-12 text-center text-slate-400 rounded-xl animate-fade-in animate-shimmer">
            {t("profile.totpLoading")}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-4 mb-6">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {!loading && displayUser && (
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
            {/* Sidebar menu */}
            <nav className="lg:w-52 shrink-0">
              <ul className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
                {profileSections.map(({ id, label }) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setActiveSection(id)}
                      className={`w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                        activeSection === id
                          ? "bg-slate-800/80 text-slate-100 border border-slate-600/60"
                          : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
                      }`}
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Main content by section */}
            <main className="min-w-0 flex-1">
              {activeSection === "overview" && (
                <>
                  <div className="relative overflow-hidden glass-panel p-4 sm:p-5 mb-6">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-accent/5 to-transparent rounded-full blur-2xl pointer-events-none" />
                    <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl overflow-hidden bg-slate-800/80 border border-slate-600/60">
                        <ProfileAvatar email={displayUser?.email} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-300 truncate">{displayUser?.email ?? "—"}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          ID {displayUser?.id ?? "—"}
                          {profile?.createdAt && <span className="ml-2">· С {formatDate(profile.createdAt, locale)}</span>}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:ml-auto">
                        <Link href="/trade" className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg">
                          {t("profile.trading")}
                        </Link>
                      </div>
                    </div>
                  </div>
                  <section className="mb-6">
                    <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3">{t("profile.indicators")}</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                      <div className="glass-panel p-4">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{t("profile.balance")}</p>
                        <p className="text-xl sm:text-2xl font-semibold text-accent font-mono tabular-nums">
                          ${formatBalance(displayUser?.useDemoMode !== false ? displayUser?.demoBalance : displayUser?.balance ?? 0)}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {displayUser?.useDemoMode !== false ? t("profile.demoMode") : t("profile.realMode")}
                        </p>
                      </div>
                      <div className="glass-panel p-4">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{t("profile.openCount")}</p>
                        <p className="text-xl sm:text-2xl font-semibold text-slate-200 font-mono tabular-nums">{activeTrades.length}</p>
                      </div>
                      <div className="glass-panel p-4">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">WIN</p>
                        <p className="text-xl sm:text-2xl font-semibold text-emerald-400 font-mono tabular-nums">{wins}</p>
                      </div>
                      <div className="glass-panel p-4">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">LOSS</p>
                        <p className="text-xl sm:text-2xl font-semibold text-red-400 font-mono tabular-nums">{losses}</p>
                      </div>
                      <div className="glass-panel p-4">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{t("profile.winRate")}</p>
                        <p className="text-xl sm:text-2xl font-semibold text-slate-200 font-mono tabular-nums">{winRatePct != null ? `${winRatePct}%` : "—"}</p>
                      </div>
                      <div className="glass-panel p-4">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{t("profile.totalPl")}</p>
                        <p className={`text-xl sm:text-2xl font-semibold font-mono tabular-nums ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    {closedCount > 0 && winRatePct != null && (
                      <div className="mt-4 glass-panel p-3">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                          <span>{t("profile.tradeRatio")}</span>
                          <span className="font-mono text-slate-400">{wins} / {losses}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500/80 transition-all duration-500" style={{ width: `${winRatePct}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="mt-6 glass-panel p-5">
                      <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3">{t("profile.soundTitle")}</h2>
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={soundOnWin}
                          onChange={(e) => setSoundOnWin(e.target.checked)}
                          className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-0"
                        />
                        <span className="text-sm text-slate-300 group-hover:text-slate-100">{t("profile.soundOnWin")}</span>
                      </label>
                    </div>

                    <div className="mt-6 glass-panel p-5">
                      <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2">{t("profile.bonusTitle")}</h2>
                      <p className="text-sm text-slate-400 mb-4">{t("profile.bonusText")}</p>
                      <div className="flex flex-wrap gap-3">
                        <SocialLink
                          href="https://www.instagram.com/auraretrade?igsh=Z253aTg4emw2NTl0"
                          platform="instagram"
                          token={token}
                          user={user}
                          setAuth={setAuth}
                          clicked={user?.socialBonus?.instagramClicked}
                          bonusClaimed={user?.socialBonus?.bonusClaimed}
                          label="Instagram"
                          iconPath="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-600/80 bg-slate-800/60 hover:bg-slate-700/60 px-4 py-3 text-sm font-medium text-slate-200 transition-colors"
                        />
                        <SocialLink
                          href="https://t.me/auraretrade"
                          platform="telegram"
                          token={token}
                          user={user}
                          setAuth={setAuth}
                          clicked={user?.socialBonus?.telegramClicked}
                          bonusClaimed={user?.socialBonus?.bonusClaimed}
                          label="Telegram"
                          iconPath="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-600/80 bg-slate-800/60 hover:bg-slate-700/60 px-4 py-3 text-sm font-medium text-slate-200 transition-colors"
                        />
                      </div>
                    </div>
                  </section>
                </>
              )}

              {activeSection === "history" && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    {history.length > 0 && (
                      <span className="text-[11px] text-slate-500 font-mono tabular-nums">{history.length} {t("profile.records")}</span>
                    )}
                  </div>
                  <div className="glass-panel overflow-hidden">
                    <div className="border-b border-slate-700/60 px-4 sm:px-6 py-2.5">
                      <p className="text-[10px] text-slate-500">
                        {tradeHistory.length > 0 ? t("profile.historySync") : t("profile.completedTrades")}
                      </p>
                    </div>
                    {history.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-14 px-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/60 border border-slate-700/60 mb-3">
                          <svg className="h-6 w-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-slate-400">{t("profile.noTradesYet")}</p>
                        <p className="text-xs text-slate-500 mt-1">{t("profile.goToTrading")}</p>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[700px] text-base">
                            <thead className="sticky top-0 z-10 glass-strong rounded-none border-b border-white/5">
                              <tr>
                                <th className="px-4 py-3 text-left text-sm uppercase tracking-wider text-slate-500 font-medium w-36">{t("profile.date")}</th>
                                <th className="px-4 py-3 text-left text-sm uppercase tracking-wider text-slate-500 font-medium">{t("profile.pair")}</th>
                                <th className="px-4 py-3 text-left text-sm uppercase tracking-wider text-slate-500 font-medium">{t("profile.direction")}</th>
                                <th className="px-4 py-3 text-right text-sm uppercase tracking-wider text-slate-500 font-medium">{t("profile.amount")}</th>
                                <th className="px-4 py-3 text-right text-sm uppercase tracking-wider text-slate-500 font-medium">{t("profile.entry")}</th>
                                <th className="px-4 py-3 text-right text-sm uppercase tracking-wider text-slate-500 font-medium">{t("profile.exit")}</th>
                                <th className="px-4 py-3 text-right text-sm uppercase tracking-wider text-slate-500 font-medium">P/L</th>
                                <th className="px-4 py-3 text-right text-sm uppercase tracking-wider text-slate-500 font-medium w-24">{t("profile.result")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                              {displayedTrades.map((t) => {
                                const isWin = t.status === "WIN";
                                const baseAmount = Number(t.amount);
                                const pnl =
                                  typeof t.pnl === "number"
                                    ? t.pnl
                                    : isWin
                                      ? baseAmount
                                      : -baseAmount;
                                return (
                                  <tr key={t.id} className="transition-colors hover:bg-slate-800/40 border-b border-slate-800/30 last:border-0">
                                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDateTime(t.createdAt, locale)}</td>
                                    <td className="px-4 py-3 font-mono font-medium text-slate-100">{t.tradingPair?.symbol ?? `#${t.tradingPairId}`}</td>
                                    <td className="px-4 py-3">
                                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold ${t.direction === "LONG" ? "bg-emerald-500/15 text-emerald-400" : "bg-orange-500/15 text-orange-400"}`}>
                                        {t.direction === "LONG" ? "↑" : "↓"} {t.direction}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-slate-200">${Number(t.amount).toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-slate-400 tabular-nums">{t.entryPrice != null ? Number(t.entryPrice).toFixed(5) : "—"}</td>
                                    <td className="px-4 py-3 text-right font-mono text-slate-400 tabular-nums">{t.closePrice != null ? Number(t.closePrice).toFixed(5) : "—"}</td>
                                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                                      <span className={isWin ? "text-emerald-400" : "text-red-400"}>{isWin ? "+" : ""}${pnl.toFixed(2)}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold ${isWin ? "bg-emerald-500/25 text-emerald-400 border border-emerald-500/50" : "bg-red-500/25 text-red-400 border border-red-500/50"}`}>
                                        {isWin ? "✓ WIN" : "✕ LOSS"}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {hasMoreTrades && (
                          <div className="px-4 sm:px-6 py-4 border-t border-slate-700/60 flex justify-center">
                            <button type="button" onClick={() => setShowAllTrades((v) => !v)} className="btn-outline py-2.5 px-5 text-sm font-semibold rounded-lg">
                              {showAllTrades ? t("profile.collapse") : `${t("profile.showAll")} (${history.length})`}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>
              )}

              {activeSection === "analytics" && (
                <section className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="glass-panel p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{t("profile.totalTrades")}</p>
                      <p className="text-xl font-semibold text-slate-200 font-mono tabular-nums">{closedCount}</p>
                    </div>
                    <div className="glass-panel p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{t("profile.wins")}</p>
                      <p className="text-xl font-semibold text-emerald-400 font-mono tabular-nums">{wins}</p>
                    </div>
                    <div className="glass-panel p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{t("profile.losses")}</p>
                      <p className="text-xl font-semibold text-red-400 font-mono tabular-nums">{losses}</p>
                    </div>
                    <div className="glass-panel p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{t("profile.totalPl")}</p>
                        <p className={`text-xl font-semibold font-mono tabular-nums ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  {closedCount > 0 && winRatePct != null && (
                    <>
                      <div className="glass-panel p-4">
                        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{t("profile.winRate")}</h3>
                        <p className="text-3xl font-semibold text-slate-100 font-mono tabular-nums mb-4">{winRatePct}%</p>
                        <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500/80 transition-all duration-500" style={{ width: `${winRatePct}%` }} />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">{t("profile.ratioLabel")}: {wins} {t("profile.wins")} / {losses} {t("profile.losses")}</p>
                      </div>
                      {history.length > 0 && (
                        <div className="glass-panel p-4">
                          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{t("profile.historySection")}</h3>
                          <p className="text-sm text-slate-400">{t("profile.historyRecords", { n: history.length })}</p>
                        </div>
                      )}
                    </>
                  )}
                  {closedCount === 0 && (
                    <div className="glass-panel p-8 text-center">
                      <p className="text-slate-500 text-sm">{t("profile.noAnalytics")}</p>
                      <p className="text-slate-600 text-xs mt-1">{t("profile.completeOneTrade")}</p>
                    </div>
                  )}
                </section>
              )}

              {activeSection === "settings" && (
                <section className="space-y-6">
                  <div className="glass-panel p-5">
                    <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">{t("profile.account")}</h3>
                    <dl className="space-y-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Email</dt>
                        <dd className="font-mono text-slate-200 truncate">{displayUser?.email ?? "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">ID</dt>
                        <dd className="font-mono text-slate-200">{displayUser?.id ?? "—"}</dd>
                      </div>
                      {profile?.createdAt && (
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">{t("profile.registered")}</dt>
                          <dd className="font-mono text-slate-200">{formatDate(profile.createdAt, locale)}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  <div className="glass-panel p-5">
                    <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">{t("profile.changeEmail")}</h3>
                    <p className="text-sm text-slate-400 mb-4">{t("profile.changeEmailHint")}</p>
                    {emailStep === "idle" ? (
                      <form onSubmit={handleRequestEmailChange} className="space-y-4 max-w-sm">
                        <div>
                          <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">{t("profile.newEmail")}</label>
                          <input
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            className="input-glass w-full"
                            placeholder="new@example.com"
                            autoComplete="email"
                          />
                        </div>
                        {emailMsg && <p className={`text-sm ${emailMsg.type === "error" ? "text-red-400" : "text-emerald-400"}`}>{emailMsg.text}</p>}
                        <button type="submit" disabled={emailLoading} className="btn-primary py-2.5 px-4 text-sm font-semibold rounded-lg disabled:opacity-50">
                          {emailLoading ? t("profile.sending") : t("profile.requestCode")}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleConfirmEmailChange} className="space-y-4 max-w-sm">
                        <p className="text-sm text-slate-300">{t("profile.enterCodeSentTo")} <span className="font-mono text-accent">{newEmail}</span></p>
                        <div>
                          <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">{t("profile.verificationCode")}</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={emailCode}
                            onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            className="input-glass w-32 font-mono text-lg"
                            placeholder="000000"
                          />
                        </div>
                        {emailMsg && <p className={`text-sm ${emailMsg.type === "error" ? "text-red-400" : "text-emerald-400"}`}>{emailMsg.text}</p>}
                        <div className="flex gap-2">
                          <button type="submit" disabled={emailLoading} className="btn-primary py-2.5 px-4 text-sm font-semibold rounded-lg disabled:opacity-50">
                            {emailLoading ? t("profile.saving") : t("profile.confirmEmailChange")}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEmailStep("idle"); setEmailCode(""); setEmailMsg(null); }}
                            className="btn-outline py-2.5 px-4 text-sm rounded-lg"
                          >
                            {t("common.close")}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  <div className="glass-panel p-5">
                    <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">{t("profile.logoutSection")}</h3>
                    <p className="text-sm text-slate-400 mb-4">{t("profile.logoutHint")}</p>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="rounded-lg border border-red-500/50 bg-red-950/20 hover:bg-red-950/40 py-2.5 px-4 text-sm font-medium text-red-400 transition-colors"
                    >
                      {t("profile.logout")}
                    </button>
                  </div>
                </section>
              )}

              {activeSection === "security" && (
                <section className="space-y-6">
                  {/* Смена пароля */}
                  <div className="glass-panel p-5">
                    <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">{t("profile.changePassword")}</h3>
                    <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">{t("profile.currentPassword")}</label>
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="input-glass w-full"
                          placeholder="••••••••"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">{t("profile.newPassword")}</label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="input-glass w-full"
                          placeholder="••••••••"
                          minLength={6}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">{t("profile.confirmPassword")}</label>
                        <input
                          type="password"
                          value={newPasswordConfirm}
                          onChange={(e) => setNewPasswordConfirm(e.target.value)}
                          className="input-glass w-full"
                          placeholder="••••••••"
                          minLength={6}
                          required
                        />
                      </div>
                      {passwordMsg && (
                        <p className={`text-sm ${passwordMsg.type === "error" ? "text-red-400" : "text-emerald-400"}`}>{passwordMsg.text}</p>
                      )}
                      <button type="submit" disabled={passwordLoading} className="btn-primary py-2.5 px-4 text-sm font-semibold rounded-lg disabled:opacity-50">
                        {passwordLoading ? t("profile.saving") : t("profile.changePasswordBtn")}
                      </button>
                    </form>
                  </div>

                  {/* OTP / 2FA */}
                  <div className="glass-panel p-5">
                    <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">{t("profile.totpSection")}</h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Подключите приложение вроде Google Authenticator или Authy для входа по одноразовому коду.
                    </p>
                    {profile?.totpEnabled ? (
                      <div>
                        <p className="text-sm text-emerald-400 mb-3">2FA включена</p>
                        <form onSubmit={handleTotpDisable} className="flex flex-wrap items-end gap-3">
                          <div>
                            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">{t("profile.totpAppCode")}</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              value={totpCode}
                              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              className="input-glass w-28 font-mono text-lg"
                              placeholder="000000"
                            />
                          </div>
                          <button type="submit" disabled={totpLoading} className="rounded-lg border border-red-500/50 bg-red-950/20 hover:bg-red-950/40 py-2.5 px-4 text-sm font-medium text-red-400 transition-colors disabled:opacity-50">
                            {totpLoading ? "…" : t("profile.disableTotp")}
                          </button>
                        </form>
                      </div>
                    ) : totpSetup ? (
                      <form onSubmit={handleTotpEnable} className="space-y-4">
                        <div className="flex flex-col sm:flex-row gap-4 items-start">
                          {totpSetup.qrDataUrl && (
                            <div className="shrink-0 rounded-lg border border-slate-600/60 bg-white p-2">
                              <img src={totpSetup.qrDataUrl} alt="QR для 2FA" width={200} height={200} />
                            </div>
                          )}
                          <div className="space-y-2">
                            <p className="text-xs text-slate-500">{t("profile.totpScanHint")}</p>
                            <p className="text-[11px] font-mono text-slate-400 break-all">{totpSetup.secret}</p>
                            <div>
                              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">{t("profile.totpAppCode")}</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                value={totpCode}
                                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                className="input-glass w-28 font-mono text-lg"
                                placeholder="000000"
                              />
                            </div>
                          </div>
                        </div>
                        {totpMsg && <p className={`text-sm ${totpMsg.type === "error" ? "text-red-400" : "text-emerald-400"}`}>{totpMsg.text}</p>}
                        <div className="flex gap-2">
                          <button type="submit" disabled={totpLoading} className="btn-primary py-2.5 px-4 text-sm font-semibold rounded-lg disabled:opacity-50">
                            {totpLoading ? "…" : t("profile.confirmEnable")}
                          </button>
                          <button type="button" onClick={() => { setTotpSetup(null); setTotpMsg(null); }} className="btn-outline py-2.5 px-4 text-sm rounded-lg">
                            Отмена
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div>
                        {totpMsg && <p className={`text-sm mb-2 ${totpMsg.type === "error" ? "text-red-400" : "text-emerald-400"}`}>{totpMsg.text}</p>}
                        <button type="button" onClick={handleTotpSetup} disabled={totpLoading} className="btn-primary py-2.5 px-4 text-sm font-semibold rounded-lg disabled:opacity-50">
                          {totpLoading ? t("profile.totpLoading") : t("profile.connectTotp")}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* История сессий / устройств */}
                  <div className="glass-panel overflow-hidden">
                    <div className="border-b border-slate-700/60 px-4 sm:px-6 py-3">
                      <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{t("profile.sessionsTitle")}</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">{t("profile.sessionsHint")}</p>
                    </div>
                    {sessionsLoading ? (
                      <div className="py-12 text-center text-slate-500 text-sm">{t("profile.sessionsLoading")}</div>
                    ) : sessionsError ? (
                      <div className="py-8 px-4 text-center text-red-400 text-sm">{sessionsError}</div>
                    ) : sessions.length === 0 ? (
                      <div className="py-10 px-4 text-center text-slate-500 text-sm">{t("profile.noSessions")}</div>
                    ) : (
                      <ul className="divide-y divide-slate-800/50">
                        {sessions.map((s) => (
                          <li key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-4 hover:bg-slate-800/30 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-600/60 text-slate-400">
                                <OsIcon osShort={s.osShort ?? s.userAgentShort} className="w-6 h-6" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-200 truncate">{s.userAgentShort || t("profile.device")}</p>
                                <p className="text-[11px] text-slate-500 font-mono mt-0.5">{s.ip || "—"}</p>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11px] text-slate-500">
                                  <span>{t("profile.firstLogin")} <span className="font-mono text-slate-400">{formatDateTime(s.firstSeenAt, locale)}</span></span>
                                  <span>{t("profile.lastSeen")} <span className="font-mono text-slate-400">{formatDateTime(s.lastSeenAt, locale)}</span></span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:ml-auto shrink-0">
                              {s.isCurrent && (
                                <span className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                  Текущая сессия
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRevokeSession(s.id, s.isCurrent)}
                                disabled={s.isCurrent || revokingId === s.id}
                                className="rounded-lg border border-slate-600 bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {revokingId === s.id ? "…" : s.isCurrent ? t("profile.currentSession") : t("profile.endSession")}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              )}
            </main>
          </div>
        )}

      </div>
    </AuthGuard>
  );
}
