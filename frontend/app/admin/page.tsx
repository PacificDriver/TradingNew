"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "../../components/AuthGuard";
import { useTradingStore } from "../../store/useTradingStore";
import { apiFetch, authHeaders, isAuthError } from "../../lib/api";
import { useLocale } from "../../lib/i18n";

type AdminUser = {
  id: number;
  email: string;
  demoBalance: number;
  balance: number;
  isAdmin: boolean;
  createdAt: string;
  blockedAt: string | null;
  withdrawBlockedAt: string | null;
  blockReason: string | null;
  tradesCount?: number;
};

type TradingPairRow = {
  id: number;
  symbol: string;
  name: string;
  currentPrice: number;
};

type AdminTab = "dashboard" | "users" | "pairs" | "audit" | "trades" | "partners" | "referral" | "trading";

type ReferralSettings = {
  viaManager: boolean;
  managerTelegram: string;
};

type TradingSettings = {
  winPayoutPercent: number;
  maxActiveTrades: number;
  minStake: number;
  maxStake: number;
};

type AdminStats = {
  usersTotal: number;
  usersToday: number;
  tradesToday: number;
  tradesWeek: number;
  volumeToday: number;
  volumeWeek: number;
  payinsCountToday: number;
  payinsSumToday: number;
  payinsCountWeek: number;
  payinsSumWeek: number;
  payoutsCountToday: number;
  payoutsSumToday: number;
  payoutsCountWeek: number;
  payoutsSumWeek: number;
};

type BalanceAuditRow = {
  id: number;
  userId: number;
  userEmail: string | null;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  refBalanceType: string | null;
  createdAt: string;
};

type AdminTradeRow = {
  id: number;
  userId: number;
  userEmail: string;
  tradingPairId: number;
  symbol: string;
  pairName: string;
  amount: number;
  direction: string;
  status: string;
  entryPrice: number;
  closePrice: number | null;
  balanceType: string;
  expiresAt: string;
  createdAt: string;
};

type ReferralPartnerRow = {
  id: number;
  email: string;
  name: string | null;
  referralCode: string;
  referralClicks: number;
  referralBalance: number;
  cpaAmount: number | null;
  referredCount: number;
  createdAt: string;
};

export default function AdminPage() {
  const router = useRouter();
  const { t } = useLocale();
  const user = useTradingStore((s) => s.user);
  const authChecked = useTradingStore((s) => s.authChecked);
  const token = useTradingStore((s) => s.token);
  const clearAuth = useTradingStore((s) => s.clearAuth);

  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");

  // Users
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [actingUserId, setActingUserId] = useState<number | null>(null);
  const [balanceEditId, setBalanceEditId] = useState<number | null>(null);
  const [balanceEditValue, setBalanceEditValue] = useState("");
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  const [filterOnlineOnly, setFilterOnlineOnly] = useState(false);

  // Pairs
  const [pairs, setPairs] = useState<TradingPairRow[]>([]);
  const [pairsLoading, setPairsLoading] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Referral settings
  const [referralSettings, setReferralSettings] = useState<ReferralSettings>({
    viaManager: false,
    managerTelegram: ""
  });
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralSaving, setReferralSaving] = useState(false);

  // Dashboard
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Balance audit
  const [auditItems, setAuditItems] = useState<BalanceAuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditUserIdInput, setAuditUserIdInput] = useState("");
  const [auditUserId, setAuditUserId] = useState("");

  // Trades
  const [tradesItems, setTradesItems] = useState<AdminTradeRow[]>([]);
  const [tradesTotal, setTradesTotal] = useState(0);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesUserIdInput, setTradesUserIdInput] = useState("");
  const [tradesUserId, setTradesUserId] = useState("");

  // Referral partners
  const [partners, setPartners] = useState<ReferralPartnerRow[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);

  // Trading settings (процент выигрыша, макс. активных сделок, мин/макс ставка)
  const [tradingSettings, setTradingSettings] = useState<TradingSettings>({
    winPayoutPercent: 100,
    maxActiveTrades: 0,
    minStake: 1,
    maxStake: 0
  });
  const [tradingLoading, setTradingLoading] = useState(false);
  const [tradingSaving, setTradingSaving] = useState(false);

  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!user.isAdmin) {
      router.replace("/trade");
    }
  }, [authChecked, user, router]);

  useEffect(() => {
    if (!authChecked || !user?.isAdmin || !token) return;
    if (activeTab === "users") {
      setUsersError(null);
      setUsersLoading(true);
      apiFetch<{ users: AdminUser[] }>("/admin/users", { headers: authHeaders(token) })
        .then((data) => setUsers(data.users ?? []))
        .catch((e) => setUsersError((e as Error).message))
        .finally(() => setUsersLoading(false));
    }
  }, [authChecked, user?.isAdmin, token, activeTab]);

  useEffect(() => {
    if (!authChecked || !user?.isAdmin || !token) return;
    if (activeTab === "dashboard") {
      setStatsLoading(true);
      apiFetch<AdminStats>("/admin/stats", { headers: authHeaders(token) })
        .then(setStats)
        .catch(() => setStats(null))
        .finally(() => setStatsLoading(false));
    }
  }, [authChecked, user?.isAdmin, token, activeTab]);

  useEffect(() => {
    if (!authChecked || !user?.isAdmin || !token) return;
    if (activeTab === "audit") {
      setAuditLoading(true);
      const params = new URLSearchParams();
      if (auditUserId.trim()) params.set("userId", auditUserId.trim());
      params.set("limit", "100");
      apiFetch<{ items: BalanceAuditRow[]; total: number }>(`/admin/balance-audit?${params}`, {
        headers: authHeaders(token)
      })
        .then((data) => {
          setAuditItems(data.items ?? []);
          setAuditTotal(data.total ?? 0);
        })
        .catch(() => { setAuditItems([]); setAuditTotal(0); })
        .finally(() => setAuditLoading(false));
    }
  }, [authChecked, user?.isAdmin, token, activeTab, auditUserId]);

  useEffect(() => {
    if (!authChecked || !user?.isAdmin || !token) return;
    if (activeTab === "trades") {
      setTradesLoading(true);
      const params = new URLSearchParams();
      if (tradesUserId.trim()) params.set("userId", tradesUserId.trim());
      params.set("limit", "100");
      apiFetch<{ items: AdminTradeRow[]; total: number }>(`/admin/trades?${params}`, {
        headers: authHeaders(token)
      })
        .then((data) => {
          setTradesItems(data.items ?? []);
          setTradesTotal(data.total ?? 0);
        })
        .catch(() => { setTradesItems([]); setTradesTotal(0); })
        .finally(() => setTradesLoading(false));
    }
  }, [authChecked, user?.isAdmin, token, activeTab, tradesUserId]);

  useEffect(() => {
    if (!authChecked || !user?.isAdmin || !token) return;
    if (activeTab === "partners") {
      setPartnersLoading(true);
      apiFetch<{ partners: ReferralPartnerRow[] }>("/admin/referral-partners", {
        headers: authHeaders(token)
      })
        .then((data) => setPartners(data.partners ?? []))
        .catch(() => setPartners([]))
        .finally(() => setPartnersLoading(false));
    }
  }, [authChecked, user?.isAdmin, token, activeTab]);

  // Polling онлайна пользователей (каждые 15 сек, без обновления страницы)
  useEffect(() => {
    if (!authChecked || !user?.isAdmin || !token || activeTab !== "users") return;
    const fetchOnline = () => {
      apiFetch<{ onlineUserIds: number[] }>("/admin/users-online", {
        headers: authHeaders(token)
      })
        .then((data) => setOnlineUserIds(data.onlineUserIds ?? []))
        .catch(() => setOnlineUserIds([]));
    };
    fetchOnline();
    const id = setInterval(fetchOnline, 15_000);
    return () => clearInterval(id);
  }, [authChecked, user?.isAdmin, token, activeTab]);

  useEffect(() => {
    if (!authChecked || !user?.isAdmin || !token) return;
    if (activeTab === "pairs") {
      setPairsLoading(true);
      apiFetch<{ pairs: TradingPairRow[] }>("/admin/trading-pairs", { headers: authHeaders(token) })
        .then((data) => setPairs(data.pairs ?? []))
        .catch(() => setPairs([]))
        .finally(() => setPairsLoading(false));
    }
  }, [authChecked, user?.isAdmin, token, activeTab]);

  useEffect(() => {
    if (!authChecked || !user?.isAdmin || !token) return;
    if (activeTab === "referral") {
      setReferralLoading(true);
      apiFetch<ReferralSettings>("/admin/settings/referral", { headers: authHeaders(token) })
        .then(setReferralSettings)
        .catch(() => {})
        .finally(() => setReferralLoading(false));
    }
    if (activeTab === "trading") {
      setTradingLoading(true);
      apiFetch<TradingSettings>("/admin/settings/trading", { headers: authHeaders(token) })
        .then(setTradingSettings)
        .catch(() => setTradingSettings({ winPayoutPercent: 100, maxActiveTrades: 0, minStake: 1, maxStake: 0 }))
        .finally(() => setTradingLoading(false));
    }
  }, [authChecked, user?.isAdmin, token, activeTab]);

  async function saveTradingSettings() {
    if (!token) return;
    setTradingSaving(true);
    try {
      const data = await apiFetch<TradingSettings>("/admin/settings/trading", {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({
          winPayoutPercent: tradingSettings.winPayoutPercent,
          maxActiveTrades: tradingSettings.maxActiveTrades,
          minStake: tradingSettings.minStake,
          maxStake: tradingSettings.maxStake
        })
      });
      setTradingSettings(data);
    } catch {
      // ignore
    } finally {
      setTradingSaving(false);
    }
  }

  async function saveReferralSettings() {
    if (!token) return;
    setReferralSaving(true);
    try {
      const data = await apiFetch<ReferralSettings>("/admin/settings/referral", {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({
          withdrawViaManager: referralSettings.viaManager,
          managerTelegram: referralSettings.managerTelegram
        })
      });
      setReferralSettings(data);
    } catch {
      // ignore
    } finally {
      setReferralSaving(false);
    }
  }

  async function setUserBalance(targetId: number, newBalance: number) {
    if (!token) return;
    setActingUserId(targetId);
    try {
      const { user } = await apiFetch<{ user: { id: number; balance: number; demoBalance: number } }>(
        `/admin/users/${targetId}/balance`,
        {
          method: "PATCH",
          headers: authHeaders(token),
          body: JSON.stringify({ balance: newBalance })
        }
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === targetId ? { ...u, balance: user.balance, demoBalance: user.demoBalance } : u))
      );
      setBalanceEditId(null);
      setBalanceEditValue("");
    } catch (err) {
      if (isAuthError(err)) {
        clearAuth();
        router.replace("/login");
        return;
      }
      setUsersError((err as Error)?.message ?? t("admin.error"));
    } finally {
      setActingUserId(null);
    }
  }

  async function setUserBlock(
    targetId: number,
    fullBlock: boolean,
    withdrawBlock: boolean,
    reason?: string
  ) {
    if (!token) return;
    setActingUserId(targetId);
    try {
      await apiFetch(`/admin/users/${targetId}/block`, {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({
          fullBlock,
          withdrawBlock,
          reason: reason || undefined
        })
      });
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== targetId) return u;
          return {
            ...u,
            blockedAt: fullBlock ? new Date().toISOString() : null,
            withdrawBlockedAt: withdrawBlock ? new Date().toISOString() : null,
            blockReason: fullBlock ? reason ?? null : null
          };
        })
      );
    } catch (err) {
      if (isAuthError(err)) {
        clearAuth();
        router.replace("/login");
        return;
      }
      setUsersError((err as Error)?.message ?? t("admin.error"));
    } finally {
      setActingUserId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const price = parseFloat(currentPrice);
    if (!symbol.trim() || !name.trim() || !Number.isFinite(price) || price <= 0) {
      setMessage({ type: "err", text: t("admin.fillPairFields") });
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/admin/trading-pairs", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          name: name.trim(),
          currentPrice: price
        })
      });
      setMessage({ type: "ok", text: t("admin.pairAdded") });
      setSymbol("");
      setName("");
      setCurrentPrice("");
      const data = await apiFetch<{ pairs: TradingPairRow[] }>("/admin/trading-pairs", {
        headers: authHeaders(token)
      });
      setPairs(data.pairs ?? []);
    } catch (err) {
      if (isAuthError(err)) {
        clearAuth();
        router.replace("/login");
        return;
      }
      setMessage({
        type: "err",
        text: (err as Error)?.message ?? t("admin.errorAddPair")
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function deletePair(id: number) {
    if (!token) return;
    setDeletingId(id);
    try {
      await apiFetch(`/admin/trading-pairs/${id}`, {
        method: "DELETE",
        headers: authHeaders(token)
      });
      setPairs((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      if (isAuthError(err)) {
        clearAuth();
        router.replace("/login");
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (!authChecked || !user) return null;
  if (!user.isAdmin) return null;

  return (
    <AuthGuard>
      <div className="max-w-4xl mx-auto mt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold mb-2">{t("admin.title")}</h1>
            <p className="text-sm text-slate-500">{t("admin.subtitle")}</p>
          </div>
          <Link
            href="/admin/support"
            className="rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700/80 transition-colors"
          >
            {t("admin.support")}
          </Link>
        </div>

        <div className="flex flex-wrap gap-1 p-1 rounded-xl glass mb-6">
          {[
            { id: "dashboard" as const, label: "Обзор" },
            { id: "users" as const, label: "Пользователи" },
            { id: "pairs" as const, label: "Пары" },
            { id: "audit" as const, label: "Аудит" },
            { id: "trades" as const, label: "Сделки" },
            { id: "partners" as const, label: "Партнёры" },
            { id: "referral" as const, label: "Реферал" },
            { id: "trading" as const, label: "Торговля" }
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`rounded-lg py-2 px-3 text-sm font-semibold transition-all ${
                activeTab === id
                  ? "bg-surface text-slate-100 border border-slate-600/60"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "dashboard" && (
          <div className="card space-y-6">
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Сводка</h2>
            {statsLoading ? (
              <div className="py-8 text-center text-slate-500 text-sm">Загрузка…</div>
            ) : stats ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-lg border border-slate-700/60 p-4">
                  <p className="text-[11px] uppercase text-slate-500">Пользователи</p>
                  <p className="text-2xl font-semibold text-slate-200 mt-1">{stats.usersTotal}</p>
                  <p className="text-xs text-slate-500 mt-0.5">+{stats.usersToday} за сегодня</p>
                </div>
                <div className="rounded-lg border border-slate-700/60 p-4">
                  <p className="text-[11px] uppercase text-slate-500">Сделки</p>
                  <p className="text-2xl font-semibold text-slate-200 mt-1">{stats.tradesToday} / {stats.tradesWeek}</p>
                  <p className="text-xs text-slate-500 mt-0.5">сегодня / за 7 дней</p>
                </div>
                <div className="rounded-lg border border-slate-700/60 p-4">
                  <p className="text-[11px] uppercase text-slate-500">Объём торгов</p>
                  <p className="text-2xl font-semibold text-slate-200 mt-1">
                    ${stats.volumeToday.toLocaleString()} / ${stats.volumeWeek.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">сегодня / за 7 дней</p>
                </div>
                <div className="rounded-lg border border-slate-700/60 p-4">
                  <p className="text-[11px] uppercase text-slate-500">Пополнения / Выводы</p>
                  <p className="text-lg font-semibold text-slate-200 mt-1">
                    +${stats.payinsSumToday.toFixed(0)} ({stats.payinsCountToday}) / −${stats.payoutsSumToday.toFixed(0)} ({stats.payoutsCountToday})
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">сегодня. За неделю: +${stats.payinsSumWeek.toFixed(0)} / −${stats.payoutsSumWeek.toFixed(0)}</p>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 text-sm">Не удалось загрузить</div>
            )}
          </div>
        )}

        {activeTab === "audit" && (
          <div className="card overflow-hidden">
            <div className="border-b border-slate-700/60 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Аудит баланса</h2>
              <input
                type="text"
                placeholder="User ID (пусто = все)"
                value={auditUserIdInput}
                onChange={(e) => setAuditUserIdInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setAuditUserId(auditUserIdInput)}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm w-36 font-mono"
              />
              <button
                type="button"
                onClick={() => setAuditUserId(auditUserIdInput)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
              >
                Показать
              </button>
            </div>
            {auditLoading ? (
              <div className="py-12 text-center text-slate-500 text-sm">Загрузка…</div>
            ) : auditItems.length === 0 ? (
              <div className="py-10 px-4 text-center text-slate-500 text-sm">Нет записей</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead className="border-b border-slate-700/60">
                    <tr>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Дата</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">User</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Тип</th>
                      <th className="px-4 py-3 text-right text-slate-500 font-medium">Сумма</th>
                      <th className="px-4 py-3 text-right text-slate-500 font-medium">До</th>
                      <th className="px-4 py-3 text-right text-slate-500 font-medium">После</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">ref</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {auditItems.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2 text-slate-400 text-xs">{new Date(r.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-2 text-slate-300">{r.userEmail ?? `#${r.userId}`}</td>
                        <td className="px-4 py-2 text-slate-400">{r.type}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-300">{r.amount >= 0 ? "+" : ""}{r.amount.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-500">{r.balanceBefore.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-300">{r.balanceAfter.toFixed(2)}</td>
                        <td className="px-4 py-2 text-slate-500 text-xs">{r.refType ?? ""} {r.refId ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {auditTotal > 0 && (
              <div className="px-4 py-2 border-t border-slate-700/60 text-xs text-slate-500">
                Показано {auditItems.length} из {auditTotal}
              </div>
            )}
          </div>
        )}

        {activeTab === "trades" && (
          <div className="card overflow-hidden">
            <div className="border-b border-slate-700/60 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Сделки</h2>
              <input
                type="text"
                placeholder="User ID (пусто = все)"
                value={tradesUserIdInput}
                onChange={(e) => setTradesUserIdInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setTradesUserId(tradesUserIdInput)}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm w-36 font-mono"
              />
              <button
                type="button"
                onClick={() => setTradesUserId(tradesUserIdInput)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
              >
                Показать
              </button>
            </div>
            {tradesLoading ? (
              <div className="py-12 text-center text-slate-500 text-sm">Загрузка…</div>
            ) : tradesItems.length === 0 ? (
              <div className="py-10 px-4 text-center text-slate-500 text-sm">Нет сделок</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="border-b border-slate-700/60">
                    <tr>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Дата</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">User</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Пара</th>
                      <th className="px-4 py-3 text-right text-slate-500 font-medium">Сумма</th>
                      <th className="px-4 py-3 text-center text-slate-500 font-medium">Направление</th>
                      <th className="px-4 py-3 text-center text-slate-500 font-medium">Результат</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {tradesItems.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2 text-slate-400 text-xs">{new Date(t.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-2 text-slate-300 truncate max-w-[180px]">{t.userEmail}</td>
                        <td className="px-4 py-2 font-mono text-slate-400">{t.symbol}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-300">${t.amount.toFixed(0)}</td>
                        <td className="px-4 py-2 text-center">{t.direction === "LONG" ? "↑" : "↓"}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={t.status === "WIN" ? "text-emerald-400" : t.status === "LOSS" ? "text-red-400" : "text-slate-500"}>{t.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tradesTotal > 0 && (
              <div className="px-4 py-2 border-t border-slate-700/60 text-xs text-slate-500">
                Показано {tradesItems.length} из {tradesTotal}
              </div>
            )}
          </div>
        )}

        {activeTab === "partners" && (
          <div className="card overflow-hidden">
            <div className="border-b border-slate-700/60 px-4 sm:px-6 py-3">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Реферальные партнёры</h2>
            </div>
            {partnersLoading ? (
              <div className="py-12 text-center text-slate-500 text-sm">Загрузка…</div>
            ) : partners.length === 0 ? (
              <div className="py-10 px-4 text-center text-slate-500 text-sm">Нет партнёров</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="border-b border-slate-700/60">
                    <tr>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">ID</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Email</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Код</th>
                      <th className="px-4 py-3 text-right text-slate-500 font-medium">Клики</th>
                      <th className="px-4 py-3 text-right text-slate-500 font-medium">Баланс</th>
                      <th className="px-4 py-3 text-right text-slate-500 font-medium">Привлечено</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {partners.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-mono text-slate-400">{p.id}</td>
                        <td className="px-4 py-3 text-slate-200 truncate max-w-[200px]">{p.email}</td>
                        <td className="px-4 py-3 font-mono text-slate-400">{p.referralCode}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-400">{p.referralClicks}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-300">{p.referralBalance.toFixed(2)} $</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-400">{p.referredCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "users" && (
          <div className="card overflow-hidden">
            <div className="border-b border-slate-700/60 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{t("admin.users")}</h2>
                <p className="text-sm text-slate-400 mt-0.5">{t("admin.usersHint")}</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={filterOnlineOnly}
                  onChange={(e) => setFilterOnlineOnly(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50"
                />
                <span className="text-sm text-slate-300">{t("admin.filterOnlineOnly")}</span>
                <span className="text-[11px] text-slate-500">
                  ({onlineUserIds.length} {t("admin.online")})
                </span>
              </label>
            </div>
            {usersLoading ? (
              <div className="py-12 text-center text-slate-500 text-sm">{t("admin.loading")}</div>
            ) : usersError ? (
              <div className="py-8 px-4 text-center text-red-400 text-sm">{usersError}</div>
            ) : users.length === 0 ? (
              <div className="py-10 px-4 text-center text-slate-500 text-sm">{t("admin.noUsers")}</div>
            ) : (() => {
              const filtered = filterOnlineOnly
                ? users.filter((u) => onlineUserIds.includes(u.id))
                : users;
              return filtered.length === 0 ? (
                <div className="py-10 px-4 text-center text-slate-500 text-sm">
                  {t("admin.noOnlineUsers")}
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-slate-700/60">
                    <tr>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">ID</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Email</th>
                      <th className="px-4 py-3 text-center text-slate-500 font-medium w-16">{t("admin.online")}</th>
                      <th className="px-4 py-3 text-right text-slate-500 font-medium">{t("admin.tradesCount")}</th>
                      <th className="px-4 py-3 text-right text-slate-500 font-medium">Баланс</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">{t("admin.status")}</th>
                      <th className="px-4 py-3 text-right text-slate-500 font-medium">{t("admin.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filtered.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-mono text-slate-400">{u.id}</td>
                        <td className="px-4 py-3 text-slate-200 truncate max-w-[200px]">{u.email}</td>
                        <td className="px-4 py-3 text-center">
                          {onlineUserIds.includes(u.id) ? (
                            <span
                              className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                              title={t("admin.online")}
                            />
                          ) : (
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-600" title={t("admin.offline")} />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-400 text-xs">
                          {u.tradesCount ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {balanceEditId === u.id ? (
                            <span className="inline-flex items-center gap-2">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={balanceEditValue}
                                onChange={(e) => setBalanceEditValue(e.target.value)}
                                className="w-24 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-200"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const val = parseFloat(balanceEditValue);
                                  if (Number.isFinite(val) && val >= 0) setUserBalance(u.id, val);
                                }}
                                disabled={actingUserId === u.id}
                                className="rounded border border-emerald-500/50 bg-emerald-950/40 px-2 py-1 text-[11px] font-medium text-emerald-400 hover:bg-emerald-950/60 disabled:opacity-50"
                              >
                                {actingUserId === u.id ? "…" : "OK"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setBalanceEditId(null);
                                  setBalanceEditValue("");
                                }}
                                className="rounded border border-slate-600 px-2 py-1 text-[11px] font-medium text-slate-400 hover:bg-slate-800"
                              >
                                Отмена
                              </button>
                            </span>
                          ) : (
                            <button
                                type="button"
                                onClick={() => {
                                  setBalanceEditId(u.id);
                                  setBalanceEditValue(String(u.balance ?? 0));
                                }}
                                className="font-mono text-slate-300 hover:text-accent transition-colors"
                              >
                              {Number(u.balance ?? 0).toLocaleString()} $
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex flex-wrap gap-1">
                            {u.isAdmin && (
                              <span className="rounded-md px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                                Админ
                              </span>
                            )}
                            {u.blockedAt && (
                              <span className="rounded-md px-2 py-0.5 text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/40">
                                Полная блокировка
                              </span>
                            )}
                            {u.withdrawBlockedAt && !u.blockedAt && (
                              <span className="rounded-md px-2 py-0.5 text-[10px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/40">
                                Блок вывода
                              </span>
                            )}
                            {!u.blockedAt && !u.withdrawBlockedAt && !u.isAdmin && (
                              <span className="text-slate-500 text-[10px]">—</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {u.isAdmin ? (
                            <span className="text-slate-500 text-xs">—</span>
                          ) : (
                            <span className="flex flex-wrap gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => setUserBlock(u.id, true, false, "Нарушение правил сайта")}
                                disabled={!!u.blockedAt || actingUserId === u.id}
                                className="rounded-md border border-red-500/50 bg-red-950/30 hover:bg-red-950/50 px-2 py-1.5 text-[11px] font-medium text-red-400 disabled:opacity-50"
                              >
                                {actingUserId === u.id ? "…" : "Полная блокировка"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setUserBlock(u.id, false, true)}
                                disabled={!!u.withdrawBlockedAt || actingUserId === u.id}
                                className="rounded-md border border-orange-500/50 bg-orange-950/30 hover:bg-orange-950/50 px-2 py-1.5 text-[11px] font-medium text-orange-400 disabled:opacity-50"
                              >
                                {actingUserId === u.id ? "…" : "Блок вывода"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setUserBlock(u.id, false, false)}
                                disabled={(!u.blockedAt && !u.withdrawBlockedAt) || actingUserId === u.id}
                                className="rounded-md border border-slate-600 bg-slate-800/80 hover:bg-slate-700/80 px-2 py-1.5 text-[11px] font-medium text-slate-300 disabled:opacity-50"
                              >
                                {actingUserId === u.id ? "…" : "Снять блокировки"}
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              );
            })()}
          </div>
        )}

        {activeTab === "pairs" && (
          <>
            <div className="card space-y-4 mb-6">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Добавить пару</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Символ</label>
                    <input
                      type="text"
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      placeholder="BTCUSDT"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Название</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Bitcoin / Tether"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Начальная цена</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={currentPrice}
                      onChange={(e) => setCurrentPrice(e.target.value)}
                      placeholder="60000"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </div>
                </div>
                {message && (
                  <p className={message.type === "ok" ? "text-emerald-400 text-sm" : "text-red-400 text-sm"}>
                    {message.text}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary py-2.5 px-5 disabled:opacity-50"
                >
                  {submitting ? "Добавление…" : "Добавить пару"}
                </button>
              </form>
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-slate-700/60 px-4 sm:px-6 py-3">
                <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Список пар</h2>
              </div>
              {pairsLoading ? (
                <div className="py-12 text-center text-slate-500 text-sm">{t("admin.loading")}</div>
              ) : pairs.length === 0 ? (
                <div className="py-10 px-4 text-center text-slate-500 text-sm">Нет пар</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-700/60">
                      <tr>
                        <th className="px-4 py-3 text-left text-slate-500 font-medium">ID</th>
                        <th className="px-4 py-3 text-left text-slate-500 font-medium">Символ</th>
                        <th className="px-4 py-3 text-left text-slate-500 font-medium">Название</th>
                        <th className="px-4 py-3 text-right text-slate-500 font-medium">Цена</th>
                        <th className="px-4 py-3 text-right text-slate-500 font-medium w-24"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {pairs.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3 font-mono text-slate-400">{p.id}</td>
                          <td className="px-4 py-3 font-mono text-slate-200">{p.symbol}</td>
                          <td className="px-4 py-3 text-slate-400">{p.name}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-300">
                            {Number(p.currentPrice).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => deletePair(p.id)}
                              disabled={deletingId === p.id}
                              className="rounded-md border border-red-500/50 bg-red-950/30 hover:bg-red-950/50 px-2 py-1.5 text-[11px] font-medium text-red-400 disabled:opacity-50"
                            >
                              {deletingId === p.id ? "…" : "Удалить"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "referral" && (
          <div className="card space-y-6">
            <div className="border-b border-slate-700/60 pb-4">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Вывод средств партнёров</h2>
              <p className="text-sm text-slate-400 mt-1">
                Если включено — партнёры не могут выводить средства автоматически, только через менеджера в Telegram.
              </p>
            </div>
            {referralLoading ? (
              <div className="py-8 text-center text-slate-500 text-sm">Загрузка…</div>
            ) : (
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={referralSettings.viaManager}
                    onChange={(e) =>
                      setReferralSettings((s) => ({ ...s, viaManager: e.target.checked }))
                    }
                    className="rounded border-slate-600 bg-slate-800 text-accent focus:ring-accent/50"
                  />
                  <span className="text-slate-200">Вывод только через менеджера в Telegram</span>
                </label>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Ссылка или username менеджера в Telegram
                  </label>
                  <input
                    type="text"
                    value={referralSettings.managerTelegram}
                    onChange={(e) =>
                      setReferralSettings((s) => ({ ...s, managerTelegram: e.target.value }))
                    }
                    placeholder="https://t.me/manager или @manager"
                    className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
                <button
                  type="button"
                  onClick={saveReferralSettings}
                  disabled={referralSaving}
                  className="btn-primary py-2.5 px-5 disabled:opacity-50"
                >
                  {referralSaving ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "trading" && (
          <div className="card space-y-6">
            <div className="border-b border-slate-700/60 pb-4">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Процент выигрыша
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                При ставке 1000 и выигрыше: при 80% на баланс зачислится 1800 (ставка + 80% прибыли).
                При 100% — 2000 (ставка + 100% прибыли).
              </p>
            </div>
            {tradingLoading ? (
              <div className="py-8 text-center text-slate-500 text-sm">Загрузка…</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">
                    Процент выигрыша: {tradingSettings.winPayoutPercent}%
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={1}
                      max={200}
                      step={1}
                      value={tradingSettings.winPayoutPercent}
                      onChange={(e) =>
                        setTradingSettings((s) => ({
                          ...s,
                          winPayoutPercent: Math.min(200, Math.max(1, Number(e.target.value) || 100))
                        }))
                      }
                      className="flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-accent bg-slate-700"
                    />
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={tradingSettings.winPayoutPercent}
                      onChange={(e) =>
                        setTradingSettings((s) => ({
                          ...s,
                          winPayoutPercent: Math.min(
                            200,
                            Math.max(1, Math.round(Number(e.target.value) || 100))
                          )
                        }))
                      }
                      className="w-20 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-accent"
                    />
                  </div>
                  <p className="text-slate-500 text-xs mt-2">
                    Пример: ставка 1000 → при выигрыше:{" "}
                    {(
                      1000 *
                      (1 + tradingSettings.winPayoutPercent / 100)
                    ).toLocaleString()}{" "}
                    $
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">
                    Макс. активных сделок: {tradingSettings.maxActiveTrades === 0 ? "без лимита" : tradingSettings.maxActiveTrades}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={tradingSettings.maxActiveTrades}
                    onChange={(e) =>
                      setTradingSettings((s) => ({
                        ...s,
                        maxActiveTrades: Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0)))
                      }))
                    }
                    className="w-24 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-accent"
                  />
                  <p className="text-slate-500 text-xs mt-1">0 = без лимита</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">Мин. ставка ($)</label>
                    <input
                      type="number"
                      min={0}
                      value={tradingSettings.minStake}
                      onChange={(e) =>
                        setTradingSettings((s) => ({
                          ...s,
                          minStake: Math.max(0, Math.round(Number(e.target.value) || 0))
                        }))
                      }
                      className="w-24 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">Макс. ставка ($)</label>
                    <input
                      type="number"
                      min={0}
                      value={tradingSettings.maxStake || ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? 0 : Math.max(0, Math.round(Number(e.target.value) || 0));
                        setTradingSettings((s) => ({ ...s, maxStake: v }));
                      }}
                      placeholder="0 = без лимита"
                      className="w-24 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-accent"
                    />
                    <p className="text-slate-500 text-xs mt-1">0 = без лимита</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={saveTradingSettings}
                  disabled={tradingSaving}
                  className="btn-primary py-2.5 px-5 disabled:opacity-50"
                >
                  {tradingSaving ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
