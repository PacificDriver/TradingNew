"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "../../components/AuthGuard";
import { useTradingStore } from "../../store/useTradingStore";
import { apiFetch, getDisplayMessage } from "../../lib/api";
import { useLocale } from "../../lib/i18n";

type TabId = "deposit" | "withdraw";
type KycStatus = "pending" | "approved" | "rejected";

type KycMeResponse = {
  approved: boolean;
  kyc: null | {
    id: number;
    documentType: "passport" | "utility_bill";
    status: KycStatus;
    adminNote: string | null;
    createdAt: string;
    reviewedAt: string | null;
  };
};

type KycSubmitResponse = {
  kyc: NonNullable<KycMeResponse["kyc"]>;
};

function formatBalance(value: number | undefined | null) {
  if (value == null) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const getTabs = (t: (k: string) => string): { id: TabId; label: string }[] => [
  { id: "deposit", label: t("deposit.tabDeposit") },
  { id: "withdraw", label: t("deposit.tabWithdraw") }
];

const CARD_TYPES = [
  { id: "visa", label: "Visa", icon: "VISA" },
  { id: "mastercard", label: "Mastercard", icon: "MC" }
] as const;

export default function DepositPage() {
  const { t } = useLocale();
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
  const [kycLoading, setKycLoading] = useState(false);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycInfo, setKycInfo] = useState<KycMeResponse["kyc"]>(null);
  const [kycApproved, setKycApproved] = useState(false);
  const [kycDocumentType, setKycDocumentType] = useState<"passport" | "utility_bill">("passport");
  const [kycFile, setKycFile] = useState<File | null>(null);

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
    apiFetch<{ user: { demoBalance: number; balance?: number; useDemoMode?: boolean } }>("/me", {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((data) => refreshUser(token, { ...user, demoBalance: data.user.demoBalance, balance: data.user.balance, useDemoMode: data.user.useDemoMode }))
      .catch(() => {});
  }, [doneReturn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token) return;
    setKycLoading(true);
    apiFetch<KycMeResponse>("/kyc/me", {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((data) => {
        setKycInfo(data.kyc);
        setKycApproved(data.approved);
      })
      .catch(() => {
        setKycInfo(null);
        setKycApproved(false);
      })
      .finally(() => setKycLoading(false));
  }, [token]);

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
        setDepositError(getDisplayMessage(err, t) || t("deposit.errorCreate"));
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
    if (!kycApproved) {
      setWithdrawError("Для вывода сначала пройдите KYC.");
      return;
    }
    const num = parseFloat(withdrawAmount.replace(",", "."));
    const balance = Number(user?.balance ?? 0);
    if (!Number.isFinite(num) || num < 1 || num > balance) return;
    if (highHelpEnabled && (withdrawCard.replace(/\s/g, "").length < 16 || !withdrawCardHolder.trim())) {
      setWithdrawError(t("deposit.errorCard"));
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
          const updated = await apiFetch<{ user: { demoBalance: number; balance?: number; useDemoMode?: boolean } }>("/me", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
          refreshUser(token, { ...user, demoBalance: updated.user.demoBalance, balance: updated.user.balance, useDemoMode: updated.user.useDemoMode });
        }
      } catch (err) {
        setWithdrawError(getDisplayMessage(err, t) || t("deposit.errorWithdraw"));
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

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !kycFile) return;
    setKycError(null);
    setKycSubmitting(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
        reader.readAsDataURL(kycFile);
      });
      const data = await apiFetch<KycSubmitResponse>("/kyc/submission", {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: kycDocumentType,
          documentImage: dataUrl
        })
      });
      setKycInfo(data.kyc);
      setKycApproved(false);
      setKycFile(null);
    } catch (err) {
      setKycError(getDisplayMessage(err, t));
    } finally {
      setKycSubmitting(false);
    }
  };

  const depositAmountNum = parseFloat(amount.replace(",", "."));
  const withdrawAmountNum = parseFloat(withdrawAmount.replace(",", "."));
  const balance = Number(user?.balance ?? 0);
  const depositMax = highHelpEnabled ? 500000 : 50000;
  const depositValid = Number.isFinite(depositAmountNum) && depositAmountNum >= 1 && depositAmountNum <= depositMax;
  const withdrawValid = Number.isFinite(withdrawAmountNum) && withdrawAmountNum >= 1 && withdrawAmountNum <= balance;

  return (
    <AuthGuard>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">{t("deposit.balance")}</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-slate-100 tracking-tight">
            {t("deposit.title")}
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl glass mb-6">
          {getTabs(t).map(({ id, label }) => (
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
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("deposit.currentBalance")}</p>
          <p className="text-2xl font-semibold text-accent font-mono tabular-nums">
            {highHelpEnabled ? `${formatBalance(balance)} ₽` : `$${formatBalance(balance)}`}
          </p>
        </div>

        {doneReturn && (
          <div className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            {t("deposit.paymentSent")}
          </div>
        )}

        {/* Deposit tab */}
        {activeTab === "deposit" && (
          <div className="glass-panel overflow-hidden">
            <div className="border-b border-slate-700/60 px-4 sm:px-6 py-4">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">{t("deposit.methodTitle")}</h2>
              <p className="text-sm text-slate-400">
                {configLoading ? t("deposit.loading") : highHelpEnabled ? t("deposit.methodHighHelp") : t("deposit.demoMode")}
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
                  {highHelpEnabled ? t("deposit.requestCreated") : t("deposit.requestAcceptedDemo")}
                </div>
              )}

              <form onSubmit={handleDepositSubmit} className="space-y-4">
                {!highHelpEnabled && (
                  <>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">{t("deposit.cardNumber")}</label>
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
                        <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">{t("deposit.expiry")}</label>
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
                    {t("deposit.depositAmountLabel")}, {highHelpEnabled ? "₽" : "$"}
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
                  <p className="text-[11px] text-slate-500 mt-1.5">{t("deposit.minMax")} {depositMax.toLocaleString()} {highHelpEnabled ? "₽" : "$"}</p>
                </div>
                {!highHelpEnabled && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveCard}
                      onChange={(e) => setSaveCard(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-800 text-accent focus:ring-accent/50"
                    />
                    <span className="text-sm text-slate-400">{t("deposit.saveCard")}</span>
                  </label>
                )}
                <button
                  type="submit"
                  disabled={!depositValid || depositSubmitting}
                  className="w-full btn-primary rounded-xl py-4 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {depositSubmitting ? (highHelpEnabled ? t("deposit.creating") : t("deposit.processing")) : t("deposit.deposit")}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Withdraw tab */}
        {activeTab === "withdraw" && (
          <div className="glass-panel overflow-hidden">
            <div className="border-b border-slate-700/60 px-4 sm:px-6 py-4">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-1">{t("deposit.withdrawTitle")}</h2>
              <p className="text-sm text-slate-400">{t("deposit.withdrawHint")}</p>
            </div>
            <div className="p-4 sm:p-6">
              {user?.withdrawBlockedAt && (
                <div className="mb-6 rounded-xl border border-red-500/50 bg-red-950/30 px-4 py-4">
                  <p className="text-sm font-medium text-red-300 mb-2">
                    {t("deposit.withdrawBlocked")}
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
                  {highHelpEnabled ? t("deposit.withdrawSuccess") : t("deposit.withdrawSuccessDemo")}
                </div>
              )}

              <form onSubmit={handleWithdrawSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">{t("deposit.withdrawAmount")}, {highHelpEnabled ? "₽" : "$"}</label>
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
                  <p className="text-[11px] text-slate-500 mt-1.5">{t("deposit.available")} {highHelpEnabled ? formatBalance(balance) + " ₽" : "$" + formatBalance(balance)}</p>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">{t("deposit.recipientCard")}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={highHelpEnabled ? t("deposit.cardPlaceholderFull") : t("deposit.cardPlaceholderShort")}
                    value={withdrawCard}
                    onChange={(e) => setWithdrawCard(e.target.value.replace(/\D/g, "").slice(0, 19))}
                    className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-3 text-slate-100 font-mono placeholder:text-slate-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                </div>
                {highHelpEnabled && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">{t("deposit.cardHolder")}</label>
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
                  disabled={!withdrawValid || withdrawSubmitting || !!user?.withdrawBlockedAt || !kycApproved}
                  className="w-full rounded-xl border border-slate-600 bg-slate-800/80 hover:bg-slate-700/80 py-4 text-base font-semibold text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {withdrawSubmitting ? (highHelpEnabled ? t("deposit.creating") : t("deposit.processing")) : t("deposit.withdrawBtn")}
                </button>
              </form>
              <div className="mt-6 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                <h3 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2">KYC для вывода</h3>
                {kycLoading ? (
                  <p className="text-sm text-slate-400">Проверяем статус KYC...</p>
                ) : kycApproved ? (
                  <p className="text-sm text-emerald-400">KYC подтвержден. Вывод средств доступен.</p>
                ) : (
                  <>
                    <p className="text-sm text-slate-300 mb-3">
                      Загрузите паспорт или utility bill. Администратор проверит документ и подтвердит KYC.
                    </p>
                    {kycInfo?.status === "pending" && (
                      <p className="text-sm text-amber-300 mb-3">Заявка на проверке. Обычно проверка занимает до 24 часов.</p>
                    )}
                    {kycInfo?.status === "rejected" && (
                      <p className="text-sm text-red-300 mb-3">
                        KYC отклонен{kycInfo.adminNote ? `: ${kycInfo.adminNote}` : "."}
                      </p>
                    )}
                    {kycError && <p className="text-sm text-red-300 mb-3">{kycError}</p>}
                    <form onSubmit={handleKycSubmit} className="space-y-3">
                      <select
                        value={kycDocumentType}
                        onChange={(e) => setKycDocumentType(e.target.value as "passport" | "utility_bill")}
                        className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-200"
                      >
                        <option value="passport">Паспорт</option>
                        <option value="utility_bill">Utility bill</option>
                      </select>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => setKycFile(e.target.files?.[0] ?? null)}
                        className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border file:border-slate-600 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200"
                      />
                      <button
                        type="submit"
                        disabled={!kycFile || kycSubmitting}
                        className="rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-200 disabled:opacity-50"
                      >
                        {kycSubmitting ? "Отправка..." : "Отправить на проверку"}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-500">
          {highHelpEnabled ? t("deposit.footerHighHelp") : t("deposit.footerDemo")}
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
