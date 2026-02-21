"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "../../components/AuthGuard";
import { useTradingStore } from "../../store/useTradingStore";
import { apiFetch } from "../../lib/api";

type TabId = "deposit" | "withdraw";

function formatBalance(value: number | undefined | null) {
  if (value == null) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TABS: { id: TabId; label: string }[] = [
  { id: "deposit", label: "Пополнение" },
  { id: "withdraw", label: "Вывод" }
];

const CARD_TYPES = [
  { id: "visa", label: "Visa", icon: "VISA" },
  { id: "mastercard", label: "Mastercard", icon: "MC" }
] as const;

export default function DepositPage() {
  const user = useTradingStore((s) => s.user);
  const refreshUser = useTradingStore((s) => s.setAuth);
  const token = useTradingStore((s) => s.token);
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>("deposit");
  const [cardType, setCardType] = useState<"visa" | "mastercard">("visa");
  const [highHelpEnabled, setHighHelpEnabled] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);

  // Deposit form
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [amount, setAmount] = useState("");
  const [saveCard, setSaveCard] = useState(false);
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  // Withdraw form
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawCard, setWithdrawCard] = useState("");
  const [withdrawCardHolder, setWithdrawCardHolder] = useState("");
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const doneReturn = searchParams.get("done") === "1";

  useEffect(() => {
    apiFetch<{ highHelpEnabled: boolean }>("/payments/config", {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then((data) => setHighHelpEnabled(data.highHelpEnabled))
      .catch(() => setHighHelpEnabled(false))
      .finally(() => setConfigLoading(false));
  }, [token]);

  useEffect(() => {
    if (!doneReturn || !token || !user) return;
    apiFetch<{ user: { demoBalance: number } }>("/me", {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((data) => refreshUser(token, { ...user, demoBalance: data.user.demoBalance }))
      .catch(() => {});
  }, [doneReturn]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatCardNumber = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardNumber(formatCardNumber(e.target.value));
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setExpiry(formatExpiry(e.target.value));
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount.replace(",", "."));
    const maxAmount = highHelpEnabled ? 500000 : 50000;
    if (!Number.isFinite(num) || num < 1 || num > maxAmount) return;
    setDepositSubmitting(true);
    setDepositSuccess(false);
    setDepositError(null);
    if (highHelpEnabled) {
      try {
        const data = await apiFetch<{ formUrl?: string; paymentId?: string; message?: string }>("/payments/deposit", {
          method: "POST",
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: num, currency: "RUB" })
        });
        if (data.formUrl) {
          window.location.href = data.formUrl;
          return;
        }
        setDepositSuccess(true);
        setAmount("");
      } catch (err) {
        setDepositError(err instanceof Error ? err.message : "Ошибка создания заявки");
      } finally {
        setDepositSubmitting(false);
      }
    } else {
      await new Promise((r) => setTimeout(r, 1200));
      setDepositSubmitting(false);
      setDepositSuccess(true);
      setCardNumber("");
      setExpiry("");
      setCvc("");
      setAmount("");
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(withdrawAmount.replace(",", "."));
    const balance = user?.demoBalance ?? 0;
    if (!Number.isFinite(num) || num < 1 || num > balance) return;
    if (highHelpEnabled && (withdrawCard.replace(/\s/g, "").length < 16 || !withdrawCardHolder.trim())) {
      setWithdrawError("Укажите номер карты (16+ цифр) и имя держателя");
      return;
    }
    setWithdrawSubmitting(true);
    setWithdrawSuccess(false);
    setWithdrawError(null);
    if (highHelpEnabled) {
      try {
        await apiFetch("/payments/withdraw", {
          method: "POST",
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: num,
            pan: withdrawCard.replace(/\s/g, ""),
            cardHolder: withdrawCardHolder.trim(),
            currency: "RUB"
          })
        });
        setWithdrawSuccess(true);
        setWithdrawAmount("");
        setWithdrawCard("");
        setWithdrawCardHolder("");
        if (user && token) {
          const updated = await apiFetch<{ user: { demoBalance: number } }>("/me", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
          refreshUser(token, { ...user, demoBalance: updated.user.demoBalance });
        }
      } catch (err) {
        setWithdrawError(err instanceof Error ? err.message : "Ошибка создания вывода");
      } finally {
        setWithdrawSubmitting(false);
      }
    } else {
      await new Promise((r) => setTimeout(r, 1200));
      setWithdrawSubmitting(false);
      setWithdrawSuccess(true);
      setWithdrawAmount("");
      setWithdrawCard("");
    }
  };

  const depositAmountNum = parseFloat(amount.replace(",", "."));
  const withdrawAmountNum = parseFloat(withdrawAmount.replace(",", "."));
  const balance = user?.demoBalance ?? 0;
  const depositMax = highHelpEnabled ? 500000 : 50000;
  const depositValid = Number.isFinite(depositAmountNum) && depositAmountNum >= 1 && depositAmountNum <= depositMax;
  const withdrawValid = Number.isFinite(withdrawAmountNum) && withdrawAmountNum >= 1 && withdrawAmountNum <= balance;

  return (
    <AuthGuard>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">Баланс</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-100 tracking-tight">
            Пополнение и вывод
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl glass mb-6">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex-1 rounded-lg py-3 px-4 text-sm font-semibold transition-all ${
                activeTab === id
                  ? "bg-surface text-slate-100 shadow-[0_1px_0_0_rgba(255,255,255,0.06)] border border-slate-600/60"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Balance card */}
        <div className="glass-panel p-4 mb-6">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Текущий баланс</p>
          <p className="text-2xl font-semibold text-accent font-mono tabular-nums">
            {highHelpEnabled ? `${formatBalance(balance)} ₽` : `$${formatBalance(balance)}`}
          </p>
        </div>

        {doneReturn && (
          <div className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            Оплата отправлена. Средства появятся на балансе после подтверждения платёжной системой.
          </div>
        )}

        {/* Deposit tab */}
        {activeTab === "deposit" && (
          <div className="glass-panel overflow-hidden">
            <div className="border-b border-slate-700/60 px-4 sm:px-6 py-4">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">Способ пополнения</h2>
              <p className="text-sm text-slate-400">
                {configLoading ? "Загрузка…" : highHelpEnabled ? "Пополнение через HighHelp (P2P, RUB)" : "Демо-режим"}
              </p>
            </div>
            <div className="p-4 sm:p-6">
              {!configLoading && !highHelpEnabled && (
                <div className="flex gap-3 mb-6">
                  {CARD_TYPES.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCardType(id)}
                      className={`flex-1 flex items-center justify-center gap-3 rounded-xl border py-4 px-4 transition-all ${
                        cardType === id
                          ? "border-accent/50 bg-accent/10 text-accent shadow-[0_0_20px_rgba(240,185,11,0.08)]"
                          : "border-slate-700/60 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                      }`}
                    >
                      <span className={`flex h-10 w-14 items-center justify-center rounded-lg font-mono text-sm font-bold ${
                        id === "visa" ? "bg-[#1A1F71] text-white" : "bg-[#EB001B] text-white"
                      }`}>
                        {id === "visa" ? "VISA" : "MC"}
                      </span>
                      <span className="text-sm font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              )}

              {depositError && (
                <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {depositError}
                </div>
              )}
              {depositSuccess && (
                <div className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                  {highHelpEnabled ? "Заявка создана." : "Запрос на пополнение принят. В демо-режиме баланс не изменяется."}
                </div>
              )}

              <form onSubmit={handleDepositSubmit} className="space-y-4">
                {!highHelpEnabled && (
                  <>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Номер карты</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="cc-number"
                        placeholder="0000 0000 0000 0000"
                        value={cardNumber}
                        onChange={handleCardNumberChange}
                        className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-3 text-slate-100 font-mono placeholder:text-slate-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Срок действия</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="cc-exp"
                          placeholder="MM/YY"
                          value={expiry}
                          onChange={handleExpiryChange}
                          className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-3 text-slate-100 font-mono placeholder:text-slate-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">CVC</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="cc-csc"
                          placeholder="•••"
                          maxLength={4}
                          value={cvc}
                          onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-3 text-slate-100 font-mono placeholder:text-slate-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                        />
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
                    Сумма пополнения, {highHelpEnabled ? "₽" : "$"}
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {[100, 500, 1000, 5000, 10000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAmount(String(preset))}
                        className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2 text-sm font-mono text-slate-300 hover:border-accent/40 hover:text-accent transition-colors"
                      >
                        {highHelpEnabled ? `${preset.toLocaleString()} ₽` : `$${preset.toLocaleString()}`}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={highHelpEnabled ? "100.00" : "100.00"}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-3 text-slate-100 font-mono text-lg placeholder:text-slate-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5">Мин. 1 — макс. {depositMax.toLocaleString()} {highHelpEnabled ? "₽" : "$"}</p>
                </div>
                {!highHelpEnabled && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveCard}
                      onChange={(e) => setSaveCard(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-800 text-accent focus:ring-accent/50"
                    />
                    <span className="text-sm text-slate-400">Сохранить карту для следующих пополнений</span>
                  </label>
                )}
                <button
                  type="submit"
                  disabled={!depositValid || depositSubmitting}
                  className="w-full btn-primary rounded-xl py-4 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {depositSubmitting ? (highHelpEnabled ? "Создание заявки…" : "Обработка…") : "Пополнить"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Withdraw tab */}
        {activeTab === "withdraw" && (
          <div className="glass-panel overflow-hidden">
            <div className="border-b border-slate-700/60 px-4 sm:px-6 py-4">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">Вывод средств</h2>
              <p className="text-sm text-slate-400">Укажите сумму и реквизиты карты для зачисления</p>
            </div>
            <div className="p-4 sm:p-6">
              {user?.withdrawBlockedAt && (
                <div className="mb-6 rounded-xl border border-red-500/50 bg-red-950/30 px-4 py-4">
                  <p className="text-sm font-medium text-red-300 mb-2">
                    Вывод средств временно заблокирован. Для выяснения причин обратитесь в поддержку.
                  </p>
                  <Link
                    href="/support"
                    className="inline-flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/20 hover:bg-red-500/30 px-4 py-2 text-sm font-semibold text-red-300 transition-colors"
                  >
                    Обратиться в поддержку
                  </Link>
                </div>
              )}
              {withdrawError && (
                <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {withdrawError}
                </div>
              )}
              {withdrawSuccess && (
                <div className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                  {highHelpEnabled ? "Заявка на вывод принята. Средства будут переведены на указанную карту после обработки." : "Заявка на вывод принята. В демо-режиме средства не списываются."}
                </div>
              )}

              <form onSubmit={handleWithdrawSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Сумма вывода, {highHelpEnabled ? "₽" : "$"}</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setWithdrawAmount(String(balance))}
                      className="rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2 text-sm font-mono text-slate-300 hover:border-accent/40 hover:text-accent transition-colors"
                    >
                      Всё ({highHelpEnabled ? formatBalance(balance) + " ₽" : "$" + formatBalance(balance)})
                    </button>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-3 text-slate-100 font-mono text-lg placeholder:text-slate-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5">Доступно: {highHelpEnabled ? formatBalance(balance) + " ₽" : "$" + formatBalance(balance)}</p>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Номер карты получателя</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={highHelpEnabled ? "16–19 цифр без пробелов" : "Последние 4 цифры или полный номер"}
                    value={withdrawCard}
                    onChange={(e) => setWithdrawCard(e.target.value.replace(/\D/g, "").slice(0, 19))}
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-3 text-slate-100 font-mono placeholder:text-slate-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                </div>
                {highHelpEnabled && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Имя держателя карты (как на карте)</label>
                    <input
                      type="text"
                      autoComplete="cc-name"
                      placeholder="IVAN IVANOV"
                      value={withdrawCardHolder}
                      onChange={(e) => setWithdrawCardHolder(e.target.value)}
                      className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                    />
                  </div>
                )}
                <button
                  type="submit"
                  disabled={!withdrawValid || withdrawSubmitting || !!user?.withdrawBlockedAt}
                  className="w-full rounded-xl border border-slate-600 bg-slate-800/80 hover:bg-slate-700/80 py-4 text-base font-semibold text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {withdrawSubmitting ? (highHelpEnabled ? "Создание заявки…" : "Обработка…") : "Вывести"}
                </button>
              </form>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-500">
          {highHelpEnabled ? "Пополнение и вывод через HighHelp (P2P, RUB)." : "Демо-режим. Платежи не выполняются."}
        </p>
        <div className="mt-4 text-center">
          <Link href="/trade" className="text-sm font-medium text-accent hover:underline">
            Вернуться к торговле
          </Link>
        </div>
      </div>
    </AuthGuard>
  );
}
