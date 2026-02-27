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
  isAdmin: boolean;
  createdAt: string;
  blockedAt: string | null;
  withdrawBlockedAt: string | null;
  blockReason: string | null;
};

type TradingPairRow = {
  id: number;
  symbol: string;
  name: string;
  currentPrice: number;
};

type AdminTab = "users" | "pairs" | "referral";

type ReferralSettings = {
  viaManager: boolean;
  managerTelegram: string;
};

export default function AdminPage() {
  const router = useRouter();
  const { t } = useLocale();
  const user = useTradingStore((s) => s.user);
  const authChecked = useTradingStore((s) => s.authChecked);
  const token = useTradingStore((s) => s.token);
  const clearAuth = useTradingStore((s) => s.clearAuth);

  const [activeTab, setActiveTab] = useState<AdminTab>("users");

  // Users
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [actingUserId, setActingUserId] = useState<number | null>(null);

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
  }, [authChecked, user?.isAdmin, token, activeTab]);

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

        <div className="flex gap-1 p-1 rounded-xl glass mb-6">
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`flex-1 rounded-lg py-2.5 px-4 text-sm font-semibold transition-all ${
              activeTab === "users"
                ? "bg-surface text-slate-100 border border-slate-600/60"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Пользователи
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pairs")}
            className={`flex-1 rounded-lg py-2.5 px-4 text-sm font-semibold transition-all ${
              activeTab === "pairs"
                ? "bg-surface text-slate-100 border border-slate-600/60"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Торговые пары
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("referral")}
            className={`flex-1 rounded-lg py-2.5 px-4 text-sm font-semibold transition-all ${
              activeTab === "referral"
                ? "bg-surface text-slate-100 border border-slate-600/60"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Реферальная программа
          </button>
        </div>

        {activeTab === "users" && (
          <div className="card overflow-hidden">
            <div className="border-b border-slate-700/60 px-4 sm:px-6 py-3">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{t("admin.users")}</h2>
              <p className="text-sm text-slate-400 mt-0.5">{t("admin.usersHint")}</p>
            </div>
            {usersLoading ? (
              <div className="py-12 text-center text-slate-500 text-sm">{t("admin.loading")}</div>
            ) : usersError ? (
              <div className="py-8 px-4 text-center text-red-400 text-sm">{usersError}</div>
            ) : users.length === 0 ? (
              <div className="py-10 px-4 text-center text-slate-500 text-sm">{t("admin.noUsers")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-slate-700/60">
                    <tr>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">ID</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Email</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">{t("admin.status")}</th>
                      <th className="px-4 py-3 text-right text-slate-500 font-medium">{t("admin.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-mono text-slate-400">{u.id}</td>
                        <td className="px-4 py-3 text-slate-200 truncate max-w-[200px]">{u.email}</td>
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
            )}
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
      </div>
    </AuthGuard>
  );
}
