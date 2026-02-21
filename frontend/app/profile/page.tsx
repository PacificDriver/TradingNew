"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "../../components/AuthGuard";
import { OsIcon } from "../../components/OsIcon";
import { useTradingStore, type Trade } from "../../store/useTradingStore";
import { apiFetch, authHeaders, isAuthError } from "../../lib/api";

type MeResponse = {
  user: {
    id: number;
    email: string;
    demoBalance: number;
    createdAt?: string;
    totpEnabled?: boolean;
    blockedAt?: string | null;
    withdrawBlockedAt?: string | null;
    blockReason?: string | null;
  };
};

type TradesResponse = { trades: Trade[] };

type ReferralResponse = {
  referralCode: string;
  referralLink: string;
  referralBalance: number;
  referralClicks: number;
  referredCount: number;
  totalBetsByReferred: number;
  totalLossesAmount: number;
  totalEarnedFromLosses: number;
};

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

/** Скрыто из дизайна; логика и API остаются в коде */
const SHOW_REFERRAL_UI = false;

type ProfileSection = "overview" | "history" | "analytics" | "settings" | "security";

const PROFILE_SECTIONS: { id: ProfileSection; label: string }[] = [
  { id: "overview", label: "Сводка" },
  { id: "history", label: "История" },
  { id: "analytics", label: "Аналитика" },
  { id: "settings", label: "Настройки" },
  { id: "security", label: "Безопасность" }
];

function formatBalance(value: number | undefined | null) {
  if (value == null) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(iso: string | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return "—";
  }
}

function formatDateTime(iso: string | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
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
  const token = useTradingStore((s) => s.token);
  const authChecked = useTradingStore((s) => s.authChecked);
  const user = useTradingStore((s) => s.user);
  const setAuth = useTradingStore((s) => s.setAuth);
  const clearAuth = useTradingStore((s) => s.clearAuth);
  const activeTrades = useTradingStore((s) => s.activeTrades);
  const completedTrades = useTradingStore((s) => s.completedTrades);
  const tradeHistory = useTradingStore((s) => s.tradeHistory);
  const setCompletedTrades = useTradingStore((s) => s.setCompletedTrades);
  const mergeTradeHistory = useTradingStore((s) => s.mergeTradeHistory);

  const [profile, setProfile] = useState<MeResponse["user"] | null>(null);
  const [referral, setReferral] = useState<ReferralResponse | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
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
            demoBalance: meData.user.demoBalance
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
          setError((err as Error).message);
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
    if (!authChecked || !token) return;
    let cancelled = false;
    (async () => {
      setReferralLoading(true);
      try {
        const data = await apiFetch<ReferralResponse>("/referral", {
          headers: authHeaders(token)
        });
        if (!cancelled) setReferral(data);
      } catch {
        if (!cancelled) setReferral(null);
      } finally {
        if (!cancelled) setReferralLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authChecked, token]);

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
      setPasswordMsg({ type: "error", text: "Пароли не совпадают" });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: "error", text: "Новый пароль не менее 6 символов" });
      return;
    }
    setPasswordLoading(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setPasswordMsg({ type: "success", text: "Пароль успешно изменён" });
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
      setTotpMsg({ type: "error", text: "Введите 6-значный код" });
      return;
    }
    setTotpLoading(true);
    try {
      await apiFetch("/auth/totp/enable", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ secret: totpSetup.secret, code })
      });
      setTotpMsg({ type: "success", text: "Двухфакторная аутентификация включена" });
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
      setTotpMsg({ type: "error", text: "Введите 6-значный код для отключения" });
      return;
    }
    setTotpLoading(true);
    try {
      await apiFetch("/auth/totp/disable", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ code })
      });
      setTotpMsg({ type: "success", text: "2FA отключена" });
      setTotpCode("");
      setProfile((p) => (p ? { ...p, totpEnabled: false } : null));
    } catch (err) {
      setTotpMsg({ type: "error", text: (err as Error).message });
    } finally {
      setTotpLoading(false);
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

  const handleCopyLink = async () => {
    if (!referral?.referralLink) return;
    try {
      await navigator.clipboard.writeText(referral.referralLink);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setCopySuccess(false);
    }
  };

  const handleWithdraw = async () => {
    if (!token || withdrawing || (referral && Number(referral.referralBalance) <= 0)) return;
    setWithdrawing(true);
    try {
      const res = await apiFetch<{ demoBalance: number; referralBalance: number; withdrawn: number }>(
        "/referral/withdraw",
        { method: "POST", headers: authHeaders(token) }
      );
      setAuth(token, { ...user!, demoBalance: res.demoBalance });
      setReferral((prev) => (prev ? { ...prev, referralBalance: 0 } : null));
    } catch {
      // keep state
    } finally {
      setWithdrawing(false);
    }
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

  const sectionTitles: Record<ProfileSection, string> = {
    overview: "Сводка счёта",
    history: "История сделок",
    analytics: "Аналитика",
    settings: "Настройки",
    security: "Безопасность"
  };

  return (
    <AuthGuard>
      <div className="min-h-screen">
        <div className="mb-6 sm:mb-8 animate-fade-in-up stagger-1 opacity-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">Кабинет</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-100 tracking-tight">
            {sectionTitles[activeSection]}
          </h1>
        </div>

        {loading && (
          <div className="card py-12 text-center text-slate-400 rounded-xl animate-fade-in animate-shimmer">
            Загрузка…
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
                {PROFILE_SECTIONS.map(({ id, label }) => (
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
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 border border-slate-600/60 text-slate-300 text-lg font-semibold font-mono">
                        {(displayUser?.email ?? "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-300 truncate">{displayUser?.email ?? "—"}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          ID {displayUser?.id ?? "—"}
                          {profile?.createdAt && <span className="ml-2">· С {formatDate(profile.createdAt)}</span>}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:ml-auto">
                        <Link href="/trade" className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg">
                          Торговля
                        </Link>
                      </div>
                    </div>
                  </div>
                  <section className="mb-6">
                    <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3">Показатели</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                      <div className="glass-panel p-4">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Баланс</p>
                        <p className="text-xl sm:text-2xl font-semibold text-accent font-mono tabular-nums">${formatBalance(displayUser.demoBalance)}</p>
                      </div>
                      <div className="glass-panel p-4">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Открыто</p>
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
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Win Rate</p>
                        <p className="text-xl sm:text-2xl font-semibold text-slate-200 font-mono tabular-nums">{winRatePct != null ? `${winRatePct}%` : "—"}</p>
                      </div>
                      <div className="glass-panel p-4">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Итого P/L</p>
                        <p className={`text-xl sm:text-2xl font-semibold font-mono tabular-nums ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    {closedCount > 0 && winRatePct != null && (
                      <div className="mt-4 glass-panel p-3">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                          <span>Соотношение сделок</span>
                          <span className="font-mono text-slate-400">{wins} / {losses}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500/80 transition-all duration-500" style={{ width: `${winRatePct}%` }} />
                        </div>
                      </div>
                    )}
                  </section>
                </>
              )}

              {activeSection === "history" && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    {history.length > 0 && (
                      <span className="text-[11px] text-slate-500 font-mono tabular-nums">{history.length} записей</span>
                    )}
                  </div>
                  <div className="glass-panel overflow-hidden">
                    <div className="border-b border-slate-700/60 px-4 sm:px-6 py-2.5">
                      <p className="text-[10px] text-slate-500">
                        {tradeHistory.length > 0 ? "Локальная история · синхронизировано с сервером" : "Завершённые сделки"}
                      </p>
                    </div>
                    {history.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-14 px-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/60 border border-slate-700/60 mb-3">
                          <svg className="h-6 w-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-slate-400">Завершённых сделок пока нет</p>
                        <p className="text-xs text-slate-500 mt-1">Перейдите в раздел торговли</p>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[700px] text-base">
                            <thead className="sticky top-0 z-10 glass-strong rounded-none border-b border-white/5">
                              <tr>
                                <th className="px-4 py-3 text-left text-sm uppercase tracking-wider text-slate-500 font-medium w-36">Дата</th>
                                <th className="px-4 py-3 text-left text-sm uppercase tracking-wider text-slate-500 font-medium">Пара</th>
                                <th className="px-4 py-3 text-left text-sm uppercase tracking-wider text-slate-500 font-medium">Направление</th>
                                <th className="px-4 py-3 text-right text-sm uppercase tracking-wider text-slate-500 font-medium">Сумма</th>
                                <th className="px-4 py-3 text-right text-sm uppercase tracking-wider text-slate-500 font-medium">Вход</th>
                                <th className="px-4 py-3 text-right text-sm uppercase tracking-wider text-slate-500 font-medium">Выход</th>
                                <th className="px-4 py-3 text-right text-sm uppercase tracking-wider text-slate-500 font-medium">P/L</th>
                                <th className="px-4 py-3 text-right text-sm uppercase tracking-wider text-slate-500 font-medium w-24">Результат</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                              {displayedTrades.map((t) => {
                                const isWin = t.status === "WIN";
                                const pnl = isWin ? Number(t.amount) : -Number(t.amount);
                                return (
                                  <tr key={t.id} className="transition-colors hover:bg-slate-800/40 border-b border-slate-800/30 last:border-0">
                                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDateTime(t.createdAt)}</td>
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
                              {showAllTrades ? "Свернуть" : `Показать все (${history.length})`}
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
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Всего сделок</p>
                      <p className="text-xl font-semibold text-slate-200 font-mono tabular-nums">{closedCount}</p>
                    </div>
                    <div className="glass-panel p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Выигрышей</p>
                      <p className="text-xl font-semibold text-emerald-400 font-mono tabular-nums">{wins}</p>
                    </div>
                    <div className="glass-panel p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Проигрышей</p>
                      <p className="text-xl font-semibold text-red-400 font-mono tabular-nums">{losses}</p>
                    </div>
                    <div className="glass-panel p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Итого P/L</p>
                      <p className={`text-xl font-semibold font-mono tabular-nums ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  {closedCount > 0 && winRatePct != null && (
                    <>
                      <div className="glass-panel p-4">
                        <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">Win Rate</h3>
                        <p className="text-3xl font-semibold text-slate-100 font-mono tabular-nums mb-4">{winRatePct}%</p>
                        <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500/80 transition-all duration-500" style={{ width: `${winRatePct}%` }} />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">Соотношение: {wins} выигрышей / {losses} проигрышей</p>
                      </div>
                      {history.length > 0 && (
                        <div className="glass-panel p-4">
                          <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">История</h3>
                          <p className="text-sm text-slate-400">В разделе «История» доступно {history.length} записей о сделках.</p>
                        </div>
                      )}
                    </>
                  )}
                  {closedCount === 0 && (
                    <div className="glass-panel p-8 text-center">
                      <p className="text-slate-500 text-sm">Нет данных для аналитики</p>
                      <p className="text-slate-600 text-xs mt-1">Завершите хотя бы одну сделку в разделе торговли</p>
                    </div>
                  )}
                </section>
              )}

              {activeSection === "settings" && (
                <section className="space-y-6">
                  <div className="glass-panel p-5">
                    <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">Аккаунт</h3>
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
                          <dt className="text-slate-500">Регистрация</dt>
                          <dd className="font-mono text-slate-200">{formatDate(profile.createdAt)}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                  <div className="glass-panel p-5">
                    <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">Выход</h3>
                    <p className="text-sm text-slate-400 mb-4">Завершить сессию на этом устройстве.</p>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="rounded-lg border border-red-500/50 bg-red-950/20 hover:bg-red-950/40 py-2.5 px-4 text-sm font-medium text-red-400 transition-colors"
                    >
                      Выйти из аккаунта
                    </button>
                  </div>
                </section>
              )}

              {activeSection === "security" && (
                <section className="space-y-6">
                  {/* Смена пароля */}
                  <div className="glass-panel p-5">
                    <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">Смена пароля</h3>
                    <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Текущий пароль</label>
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
                        <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Новый пароль</label>
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
                        <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Подтверждение</label>
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
                        {passwordLoading ? "Сохранение…" : "Изменить пароль"}
                      </button>
                    </form>
                  </div>

                  {/* OTP / 2FA */}
                  <div className="glass-panel p-5">
                    <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">Двухфакторная аутентификация (2FA)</h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Подключите приложение вроде Google Authenticator или Authy для входа по одноразовому коду.
                    </p>
                    {profile?.totpEnabled ? (
                      <div>
                        <p className="text-sm text-emerald-400 mb-3">2FA включена</p>
                        <form onSubmit={handleTotpDisable} className="flex flex-wrap items-end gap-3">
                          <div>
                            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Код из приложения</label>
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
                            {totpLoading ? "…" : "Отключить 2FA"}
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
                            <p className="text-xs text-slate-500">Отсканируйте QR-код в приложении или введите ключ вручную.</p>
                            <p className="text-[11px] font-mono text-slate-400 break-all">{totpSetup.secret}</p>
                            <div>
                              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Код из приложения</label>
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
                            {totpLoading ? "…" : "Подтвердить и включить"}
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
                          {totpLoading ? "Загрузка…" : "Подключить 2FA (Google Authenticator)"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* История сессий / устройств */}
                  <div className="glass-panel overflow-hidden">
                    <div className="border-b border-slate-700/60 px-4 sm:px-6 py-3">
                      <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-500">История сессий и устройств</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Все входы в аккаунт. Можно завершить любую сессию.</p>
                    </div>
                    {sessionsLoading ? (
                      <div className="py-12 text-center text-slate-500 text-sm">Загрузка…</div>
                    ) : sessionsError ? (
                      <div className="py-8 px-4 text-center text-red-400 text-sm">{sessionsError}</div>
                    ) : sessions.length === 0 ? (
                      <div className="py-10 px-4 text-center text-slate-500 text-sm">Сессий пока нет</div>
                    ) : (
                      <ul className="divide-y divide-slate-800/50">
                        {sessions.map((s) => (
                          <li key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-4 hover:bg-slate-800/30 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-600/60 text-slate-400">
                                <OsIcon osShort={s.osShort ?? s.userAgentShort} className="w-6 h-6" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-200 truncate">{s.userAgentShort || "Устройство"}</p>
                                <p className="text-[11px] text-slate-500 font-mono mt-0.5">{s.ip || "—"}</p>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11px] text-slate-500">
                                  <span>Первый вход: <span className="font-mono text-slate-400">{formatDateTime(s.firstSeenAt)}</span></span>
                                  <span>Последний: <span className="font-mono text-slate-400">{formatDateTime(s.lastSeenAt)}</span></span>
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
                                {revokingId === s.id ? "…" : s.isCurrent ? "Текущая" : "Завершить"}
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

        {/* Реферальная программа — скрыта из дизайна, код оставлен */}
        {SHOW_REFERRAL_UI && !loading && displayUser && (
          <section className="mb-6 sm:mb-8 mt-8">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3">
                Реферальная программа
              </h2>
              <div className="glass-panel overflow-hidden">
              <div className="border-b border-slate-700/60 px-4 sm:px-6 py-3">
                <p className="text-xs text-slate-500">
                  50% с проигрыша приглашённого зачисляется на реферальный баланс
                </p>
              </div>
              <div className="p-4 sm:p-6">
                {referralLoading ? (
                  <div className="py-8 text-center text-slate-500 text-sm">
                    Загрузка…
                  </div>
                ) : referral ? (
                  <>
                    <div className="flex flex-col sm:flex-row gap-3 mb-5">
                      <div className="flex-1 flex gap-2 rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2.5">
                        <input
                          type="text"
                          readOnly
                          value={referral.referralLink}
                          className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-slate-300 font-mono outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleCopyLink}
                          className="shrink-0 rounded-md border border-slate-600 bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1.5 text-[11px] font-medium text-slate-300 transition-colors"
                        >
                          {copySuccess ? "Скопировано" : "Копировать"}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                      <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Клики</p>
                        <p className="text-lg font-semibold text-slate-200 font-mono tabular-nums">{referral.referralClicks}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Рефералов</p>
                        <p className="text-lg font-semibold text-slate-200 font-mono tabular-nums">{referral.referredCount}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Ставок</p>
                        <p className="text-lg font-semibold text-slate-200 font-mono tabular-nums">{referral.totalBetsByReferred}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Заработано</p>
                        <p className="text-lg font-semibold text-emerald-400 font-mono tabular-nums">
                          ${formatBalance(referral.totalEarnedFromLosses)}
                        </p>
                      </div>
                    </div>
                    {displayUser?.withdrawBlockedAt && (
                      <div className="mb-4 rounded-xl border border-red-500/50 bg-red-950/30 px-4 py-3">
                        <p className="text-sm font-medium text-red-300 mb-2">
                          Вывод средств временно заблокирован. Обратитесь в поддержку.
                        </p>
                        <Link
                          href="/support"
                          className="inline-flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/20 hover:bg-red-500/30 px-3 py-2 text-sm font-semibold text-red-300 transition-colors"
                        >
                          Обратиться в поддержку
                        </Link>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-slate-700/60 bg-slate-900/40 p-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
                          К зачислению на баланс
                        </p>
                        <p className="text-2xl font-semibold text-emerald-400 font-mono tabular-nums">
                          ${formatBalance(referral.referralBalance)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleWithdraw}
                        disabled={withdrawing || Number(referral.referralBalance) <= 0 || !!displayUser?.withdrawBlockedAt}
                        className="rounded-lg border border-emerald-500/50 bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed py-2.5 px-5 text-sm font-semibold text-emerald-400 transition-colors"
                      >
                        {withdrawing ? "Вывод…" : "Зачислить"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-slate-500 text-sm">
                    Не удалось загрузить реферальные данные
                  </div>
                )}
              </div>
              </div>
            </section>
        )}
      </div>
    </AuthGuard>
  );
}
