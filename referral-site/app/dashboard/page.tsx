"use client";

import React, { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useReferralAuth } from "../ReferralAuthContext";
import { referralFetch } from "../../lib/referralApi";
import { useLocale } from "../../lib/i18n";

type Stats = {
  referredCount: number;
  totalBets: number;
  totalLossesAmount: number;
  totalWinsAmount: number;
  referralClicks: number;
  referralLink: string;
  referralBalance: number;
  totalEarnings: number;
};

type EarningsReferral = {
  userId: number;
  email: string;
  joinedAt: string;
  losses: number;
  earnings: number;
  trades: number;
};

type EarningsAnalytics = {
  referrals: EarningsReferral[];
  totalEarnings: number;
  recentEarnings: Array<{
    id: number;
    userId: number;
    userEmail: string;
    amount: number;
    earnings: number;
    pair: string;
    direction: string;
    createdAt: string;
  }>;
};

type Section = "overview" | "analytics" | "referrals" | "report" | "withdraw";

type ReferralListItem = {
  id: number;
  email: string;
  joinedAt: string;
  demoBalance: number;
  totalLosses: number;
  lossCount: number;
  totalWins: number;
  winCount: number;
};

type ReferralDetail = {
  referral: { id: number; email: string; joinedAt: string; demoBalance: number };
  stats: {
    totalTrades: number;
    lossCount: number;
    winCount: number;
    totalLosses: number;
    totalWins: number;
    ftd: { amount: number; date: string } | null;
    redeps: Array<{ amount: number; date: string }>;
    cpaAmount: number;
    revShare: number;
    totalEarnings: number;
  };
  recentTrades: Array<{
    id: number;
    pair: string;
    direction: string;
    amount: number;
    status: string;
    createdAt: string;
  }>;
};

type ReportRow = {
  date: string;
  totalClicks: number;
  uniqueClicks: number;
  registration: number;
  ftd: number;
  ftdAmount: number;
  redeps: number;
  redepsAmount: number;
  rewardCpaConfirm: number;
  rewardCpaHold: number;
  incomeRevConfirm: number;
  incomeRevHold: number;
  clickToFtd: number;
  epc: number;
  purchases: number;
  purchValue: number;
  withdrawal: number;
  depWithdrawal: number;
};

type ReportTotals = Omit<ReportRow, "date"> & {
  date?: string;
  clickToFtd?: number;
  epc?: number;
};

type ReportResponse = {
  rows: ReportRow[];
  totals: ReportTotals;
  dateFrom: string;
  dateTo: string;
  groupBy: string;
};

const ReferralAvatar = React.memo(function ReferralAvatar({ email }: { email?: string }) {
  return (
    <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden bg-slate-800/80 border border-slate-600/60 flex items-center justify-center">
      <span className="text-slate-300 text-lg font-semibold font-mono">
        {(email ?? "?").slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
});

const StatCard = React.memo(function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="glass-panel p-4 rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        {icon && <span className="text-slate-500/80">{icon}</span>}
      </div>
      <p className={`text-xl font-semibold font-mono tabular-nums ${accent ? "text-emerald-400" : "text-slate-100"}`}>
        {value}
      </p>
    </div>
  );
});

function SkeletonCard() {
  return (
    <div className="glass-panel p-4 rounded-xl animate-pulse">
      <div className="h-3 w-20 bg-slate-700/50 rounded mb-3" />
      <div className="h-7 w-16 bg-slate-700/50 rounded" />
    </div>
  );
}

function ReferralDashboardContent() {
  const { partner, loading } = useReferralAuth();
  const { t, locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<EarningsAnalytics | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportFilters, setReportFilters] = useState({
    dateFrom: "",
    dateTo: "",
    groupBy: "day",
  });
  const [withdrawals, setWithdrawals] = useState<Array<{ id: number; amount: number; createdAt: string }>>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);
  const [withdrawFilters, setWithdrawFilters] = useState({ dateFrom: "", dateTo: "" });
  const [withdrawConfig, setWithdrawConfig] = useState<{ viaManager: boolean; managerTelegram: string }>({
    viaManager: false,
    managerTelegram: "",
  });
  const [referralsList, setReferralsList] = useState<ReferralListItem[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<ReferralDetail | null>(null);
  const [loadingReferralDetail, setLoadingReferralDetail] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "withdraw") setActiveSection("withdraw");
    if (tab === "report") setActiveSection("report");
    if (tab === "referrals") setActiveSection("referrals");
  }, [searchParams]);

  useEffect(() => {
    if (!loading && !partner) router.replace("/login");
  }, [partner, loading, router]);

  useEffect(() => {
    if (!partner) return;
    referralFetch("/referral-partners/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .finally(() => setLoadingStats(false));
  }, [partner]);

  useEffect(() => {
    if (!partner) return;
    referralFetch("/referral-partners/analytics/losses")
      .then((r) => (r.ok ? r.json() : null))
      .then(setAnalytics)
      .finally(() => setLoadingAnalytics(false));
  }, [partner]);

  const fetchReport = useCallback(() => {
    if (!partner) return;
    setLoadingReport(true);
    const params = new URLSearchParams();
    if (reportFilters.dateFrom) params.set("dateFrom", reportFilters.dateFrom);
    if (reportFilters.dateTo) params.set("dateTo", reportFilters.dateTo);
    if (reportFilters.groupBy) params.set("groupBy", reportFilters.groupBy);
    referralFetch(`/referral-partners/report?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setReport)
      .finally(() => setLoadingReport(false));
  }, [partner, reportFilters.dateFrom, reportFilters.dateTo, reportFilters.groupBy]);

  useEffect(() => {
    if (partner && activeSection === "report") {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - 30);
      setReportFilters((prev) => ({
        ...prev,
        dateFrom: prev.dateFrom || from.toISOString().slice(0, 10),
        dateTo: prev.dateTo || to.toISOString().slice(0, 10),
      }));
    }
  }, [partner, activeSection]);

  useEffect(() => {
    if (partner && activeSection === "report" && reportFilters.dateFrom && reportFilters.dateTo) {
      fetchReport();
    }
  }, [partner, activeSection, reportFilters.dateFrom, reportFilters.dateTo, reportFilters.groupBy, fetchReport]);

  const fetchWithdrawals = useCallback((overrides?: { dateFrom?: string; dateTo?: string }) => {
    if (!partner) return;
    setLoadingWithdrawals(true);
    const filters = overrides ?? withdrawFilters;
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    referralFetch(`/referral-partners/withdrawals?${params}`)
      .then((r) => (r.ok ? r.json() : { withdrawals: [] }))
      .then((r) => setWithdrawals(r.withdrawals ?? []))
      .finally(() => setLoadingWithdrawals(false));
  }, [partner, withdrawFilters.dateFrom, withdrawFilters.dateTo]);

  useEffect(() => {
    if (partner && activeSection === "withdraw") {
      fetchWithdrawals();
      referralFetch("/referral-partners/withdraw-config")
        .then((r) => (r.ok ? r.json() : { viaManager: false, managerTelegram: "" }))
        .then(setWithdrawConfig);
    }
  }, [partner, activeSection, fetchWithdrawals]);

  useEffect(() => {
    if (partner && activeSection === "referrals") {
      setLoadingReferrals(true);
      referralFetch("/referral-partners/referrals")
        .then((r) => (r.ok ? r.json() : { referrals: [] }))
        .then((r) => setReferralsList(r.referrals ?? []))
        .finally(() => setLoadingReferrals(false));
    }
  }, [partner, activeSection]);

  const fetchReferralDetail = useCallback((userId: number) => {
    setLoadingReferralDetail(true);
    setSelectedReferral(null);
    referralFetch(`/referral-partners/referrals/${userId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setSelectedReferral)
      .finally(() => setLoadingReferralDetail(false));
  }, []);

  const copyLink = async () => {
    if (stats?.referralLink) {
      try {
        await navigator.clipboard.writeText(stats.referralLink);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch {
        // ignore
      }
    }
  };

  const sections = useMemo(
    () => [
      { id: "overview" as const, label: t("ref.overview") },
      { id: "analytics" as const, label: t("ref.analytics") },
      { id: "referrals" as const, label: t("ref.referrals") },
      { id: "report" as const, label: t("ref.report") },
      { id: "withdraw" as const, label: t("ref.withdraw") },
    ],
    [t]
  );

  const balance = stats?.referralBalance ?? 0;

  if (loading || !partner) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="relative overflow-hidden glass-panel p-5 sm:p-6 mb-6 rounded-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-full blur-2xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <ReferralAvatar email={partner.email} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-0.5">
              {t("ref.dashboardTitle")}
            </p>
            <h1 className="font-display text-xl sm:text-2xl font-semibold text-slate-100 tracking-tight truncate">
              {partner.name || partner.email}
            </h1>
            <p className="text-sm text-slate-400 truncate mt-0.5">
              {partner.email} · {t("ref.code")} <span className="font-mono text-accent">{partner.referralCode}</span>
            </p>
          </div>
          {!loadingStats && stats && (
            <div className="shrink-0 text-right">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{t("ref.toWithdraw")}</p>
              <p className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400 tabular-nums">
                ${balance.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        <nav className="lg:w-44 shrink-0">
          <ul className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0 surface-scroll">
            {sections.map(({ id, label }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setActiveSection(id)}
                  className={`w-full text-left rounded-xl px-4 py-3 text-sm font-medium transition-all whitespace-nowrap ${
                    activeSection === id
                      ? "bg-slate-800/80 text-slate-100 border border-slate-600/60 shadow-sm"
                      : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
                  }`}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 space-y-6">
          {activeSection === "overview" && (
            <>
              <section className="glass-panel p-5 sm:p-6 rounded-2xl">
                <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3">
                  {t("ref.referralLink")}
                </h2>
                {loadingStats ? (
                  <div className="h-12 bg-slate-800/50 rounded-xl animate-pulse" />
                ) : stats ? (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      readOnly
                      value={stats.referralLink}
                      className="input-glass flex-1 font-mono text-sm py-3 px-4 rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={copyLink}
                      className={`btn-primary py-3 px-5 rounded-xl shrink-0 flex items-center justify-center gap-2 transition-all ${
                        copySuccess ? "bg-emerald-500/90" : ""
                      }`}
                    >
                      {copySuccess ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {t("ref.copied")}
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          {t("ref.copy")}
                        </>
                      )}
                    </button>
                  </div>
                ) : null}
              </section>

              <section>
                <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-3">
                  {t("ref.metrics")}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {loadingStats ? (
                    <>
                      <SkeletonCard />
                      <SkeletonCard />
                      <SkeletonCard />
                      <SkeletonCard />
                    </>
                  ) : stats ? (
                    <>
                      <StatCard
                        label={t("ref.referralsCount")}
                        value={stats.referredCount}
                        icon={
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        }
                      />
                      <StatCard
                        label={t("ref.clicks")}
                        value={stats.referralClicks}
                        icon={
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                          </svg>
                        }
                      />
                      <StatCard
                        label={t("ref.bets")}
                        value={stats.totalBets}
                        icon={
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        }
                      />
                      <StatCard
                        label={t("ref.earnings")}
                        value={`$${(stats.totalEarnings ?? stats.referralBalance ?? 0).toFixed(2)}`}
                        accent
                        icon={
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        }
                      />
                    </>
                  ) : null}
                </div>
              </section>
            </>
          )}

          {activeSection === "analytics" && (
            <section className="glass-panel p-5 sm:p-6 rounded-2xl">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">
                {t("ref.analyticsTitle")}
              </h2>
              {loadingAnalytics ? (
                <div className="flex justify-center py-16">
                  <div className="h-8 w-8 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
                </div>
              ) : analytics && analytics.referrals.length > 0 ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <span className="text-slate-400">{t("ref.totalEarned")}</span>
                    <span className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
                      ${(analytics.totalEarnings ?? 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl bg-slate-950/50 border border-slate-800/60 surface-scroll">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50">
                          <th className="px-4 py-3.5 text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.referral")}</th>
                          <th className="px-4 py-3.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.registration")}</th>
                          <th className="px-4 py-3.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.trades")}</th>
                          <th className="px-4 py-3.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.earnings")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {analytics.referrals.map((r) => (
                          <tr key={r.userId} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3 font-mono text-slate-200">{r.email}</td>
                            <td className="px-4 py-3 text-right text-slate-400 text-xs">{new Date(r.joinedAt).toLocaleDateString(locale === "es" ? "es-ES" : "en-US")}</td>
                            <td className="px-4 py-3 text-right text-slate-300">{r.trades}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-400">
                              ${(r.earnings ?? r.losses * 0.5).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {(analytics.recentEarnings ?? []).length > 0 && (
                    <div>
                      <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{t("ref.lastEarnings")}</h3>
                      <div className="overflow-x-auto rounded-xl bg-slate-950/50 border border-slate-800/60 surface-scroll max-h-[280px] overflow-y-auto">
                        <table className="min-w-full text-sm">
                          <thead className="sticky top-0 bg-slate-900/98 z-10 backdrop-blur-sm">
                            <tr className="border-b border-slate-700/50">
                              <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.referral")}</th>
                              <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.pair")}</th>
                              <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.amount")}</th>
                              <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.date")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {analytics.recentEarnings.map((t) => (
                              <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                                <td className="px-4 py-2.5 text-slate-300 truncate max-w-[140px]">{t.userEmail}</td>
                                <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{t.pair} {t.direction}</td>
                                <td className="px-4 py-2.5 text-right font-mono font-medium text-emerald-400">
                                  ${(t.earnings ?? t.amount * 0.5).toFixed(2)}
                                </td>
                                <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{new Date(t.createdAt).toLocaleString(locale === "es" ? "es-ES" : "en-US")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <p className="text-slate-400 font-medium text-center">{t("ref.noEarnings")}</p>
                  <p className="text-slate-500 text-sm text-center mt-1">{t("ref.noEarningsHint")}</p>
                </div>
              )}
            </section>
          )}

          {activeSection === "referrals" && (
            <section className="glass-panel p-5 sm:p-6 rounded-2xl">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">{t("ref.referralsTitle")}</h2>
              <p className="text-sm text-slate-400 mb-6">
                {t("ref.referralsSubtitle")}
              </p>

              {loadingReferrals ? (
                <div className="flex justify-center py-16">
                  <div className="h-8 w-8 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
                </div>
              ) : referralsList.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-800/60 surface-scroll">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50 bg-slate-900/60">
                        <th className="px-4 py-3.5 text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.referral")}</th>
                        <th className="px-4 py-3.5 text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.registration")}</th>
                        <th className="px-4 py-3.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.trades")}</th>
                        <th className="px-4 py-3.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.losses")}</th>
                        <th className="px-4 py-3.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.wins")}</th>
                        <th className="px-4 py-3.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.earnings")}</th>
                        <th className="px-4 py-3.5 text-center text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.action")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {referralsList.map((r) => {
                        const earnings = r.totalLosses * 0.5;
                        return (
                          <tr
                            key={r.id}
                            className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                            onClick={() => fetchReferralDetail(r.id)}
                          >
                            <td className="px-4 py-3 font-mono text-slate-200">{r.email}</td>
                            <td className="px-4 py-3 text-slate-400 text-xs">{new Date(r.joinedAt).toLocaleDateString(locale === "es" ? "es-ES" : "en-US")}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{r.lossCount + r.winCount}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-red-400/90">${r.totalLosses.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-emerald-400/90">${r.totalWins.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-400">${earnings.toFixed(2)}</td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); fetchReferralDetail(r.id); }}
                                className="text-accent hover:text-emerald-400 text-xs font-medium"
                              >
                                {t("ref.details")}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed border-slate-700/60 bg-slate-950/30">
                  <div className="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-4">
                    <svg className="w-7 h-7 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <p className="text-slate-400 font-medium">{t("ref.noReferrals")}</p>
                  <p className="text-slate-500 text-sm text-center mt-1">{t("ref.noReferralsHint")}</p>
                </div>
              )}

              {(selectedReferral || loadingReferralDetail) && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                  onClick={() => !loadingReferralDetail && setSelectedReferral(null)}
                >
                  <div className="glass-panel rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto surface-scroll" onClick={(e) => e.stopPropagation()}>
                    <div className="sticky top-0 bg-slate-900/98 backdrop-blur-sm border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-slate-100">
                        {loadingReferralDetail ? t("ref.loading") : selectedReferral?.referral.email ?? ""}
                      </h3>
                      <button type="button" onClick={() => setSelectedReferral(null)} className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/60">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="p-6">
                      {loadingReferralDetail ? (
                        <div className="flex justify-center py-16">
                          <div className="h-8 w-8 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
                        </div>
                      ) : selectedReferral ? (
                        <div className="space-y-6">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("ref.registration")}</p>
                            <p className="text-slate-200">{new Date(selectedReferral.referral.joinedAt).toLocaleString(locale === "es" ? "es-ES" : "en-US")}</p>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="rounded-xl bg-slate-800/50 p-4">
                              <p className="text-[10px] uppercase text-slate-500 mb-1">{t("ref.totalTrades")}</p>
                              <p className="text-xl font-semibold tabular-nums">{selectedReferral.stats.totalTrades}</p>
                            </div>
                            <div className="rounded-xl bg-slate-800/50 p-4">
                              <p className="text-[10px] uppercase text-slate-500 mb-1">{t("ref.losses")}</p>
                              <p className="text-xl font-semibold text-red-400/90 tabular-nums">${selectedReferral.stats.totalLosses.toFixed(2)}</p>
                            </div>
                            <div className="rounded-xl bg-slate-800/50 p-4">
                              <p className="text-[10px] uppercase text-slate-500 mb-1">{t("ref.wins")}</p>
                              <p className="text-xl font-semibold text-emerald-400/90 tabular-nums">${selectedReferral.stats.totalWins.toFixed(2)}</p>
                            </div>
                            <div className="rounded-xl bg-slate-800/50 p-4">
                              <p className="text-[10px] uppercase text-slate-500 mb-1">{t("ref.earnings")}</p>
                              <p className="text-xl font-semibold text-emerald-400 tabular-nums">${selectedReferral.stats.totalEarnings.toFixed(2)}</p>
                            </div>
                          </div>
                          {selectedReferral.stats.ftd && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">FTD</p>
                              <p className="text-slate-200">
                                ${selectedReferral.stats.ftd.amount.toFixed(2)} — {new Date(selectedReferral.stats.ftd.date).toLocaleString(locale === "es" ? "es-ES" : "en-US")}
                              </p>
                            </div>
                          )}
                          {selectedReferral.stats.redeps.length > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">ReDeps</p>
                              <ul className="space-y-1 text-sm text-slate-300">
                                {selectedReferral.stats.redeps.map((r, i) => (
                                  <li key={i}>${r.amount.toFixed(2)} — {new Date(r.date).toLocaleString(locale === "es" ? "es-ES" : "en-US")}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {selectedReferral.stats.cpaAmount > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">CPA</p>
                              <p className="text-emerald-400 font-mono">${selectedReferral.stats.cpaAmount.toFixed(2)}</p>
                            </div>
                          )}
                          {selectedReferral.recentTrades.length > 0 && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{t("ref.lastTrades")}</p>
                              <div className="overflow-x-auto rounded-xl border border-slate-800/60 max-h-48 overflow-y-auto">
                                <table className="min-w-full text-sm">
                                  <thead className="sticky top-0 bg-slate-900/98">
                                    <tr className="border-b border-slate-700/50">
                                      <th className="px-3 py-2 text-left text-[10px] uppercase text-slate-500">{t("ref.pair")}</th>
                                      <th className="px-3 py-2 text-left text-[10px] uppercase text-slate-500">{t("ref.direction")}</th>
                                      <th className="px-3 py-2 text-right text-[10px] uppercase text-slate-500">{t("ref.amount")}</th>
                                      <th className="px-3 py-2 text-right text-[10px] uppercase text-slate-500">{t("ref.status")}</th>
                                      <th className="px-3 py-2 text-right text-[10px] uppercase text-slate-500">{t("ref.date")}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/60">
                                    {selectedReferral.recentTrades.map((trade) => (
                                      <tr key={trade.id}>
                                        <td className="px-3 py-2 font-mono text-slate-300">{trade.pair}</td>
                                        <td className="px-3 py-2 text-slate-400">{trade.direction}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">${trade.amount.toFixed(2)}</td>
                                        <td className="px-3 py-2 text-right">
                                          <span className={trade.status === "WIN" ? "text-emerald-400" : "text-red-400/90"}>
                                            {trade.status === "WIN" ? t("ref.win") : t("ref.loss")}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-500 text-xs">{new Date(trade.createdAt).toLocaleString(locale === "es" ? "es-ES" : "en-US")}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeSection === "report" && (
            <section className="glass-panel p-5 sm:p-6 rounded-2xl">
              <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">{t("ref.reportTitle")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-3 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 sm:shrink-0">{t("ref.from")}</label>
                  <input type="date" value={reportFilters.dateFrom} onChange={(e) => setReportFilters((f) => ({ ...f, dateFrom: e.target.value }))} className="input-glass px-3 py-2.5 sm:py-2 rounded-lg text-sm min-h-[44px] sm:min-h-0 touch-manipulation" />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 sm:shrink-0">{t("ref.to")}</label>
                  <input type="date" value={reportFilters.dateTo} onChange={(e) => setReportFilters((f) => ({ ...f, dateTo: e.target.value }))} className="input-glass px-3 py-2.5 sm:py-2 rounded-lg text-sm min-h-[44px] sm:min-h-0 touch-manipulation" />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 sm:shrink-0">{t("ref.groupBy")}</label>
                  <select value={reportFilters.groupBy} onChange={(e) => setReportFilters((f) => ({ ...f, groupBy: e.target.value }))} className="input-glass px-3 py-2.5 sm:py-2 rounded-lg text-sm min-h-[44px] sm:min-h-0 touch-manipulation">
                    <option value="day">{t("ref.groupDay")}</option>
                    <option value="week">{t("ref.groupWeek")}</option>
                    <option value="month">{t("ref.groupMonth")}</option>
                  </select>
                </div>
                <button type="button" onClick={fetchReport} disabled={loadingReport} className="btn-primary px-4 py-3 sm:py-2 rounded-lg text-sm disabled:opacity-50 min-h-[44px] sm:min-h-0 touch-manipulation">
                  {loadingReport ? t("ref.loading") : t("ref.apply")}
                </button>
              </div>

              {loadingReport ? (
                <div className="flex justify-center py-16">
                  <div className="h-8 w-8 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
                </div>
              ) : report ? (
                <div className="overflow-x-auto rounded-xl bg-slate-950/50 border border-slate-800/60 surface-scroll">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium sticky left-0 bg-slate-900/98">{t("ref.date")}</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.clicksCol")}</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.uniqueCol")}</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.regCol")}</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.ftdCol")}</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.ftdAmountCol")}</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.redepsCol")}</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.redepsAmountCol")}</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">CPA</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">Rev</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">Click-FTD %</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">EPC</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.purchases")}</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.purchValue")}</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.withdrawalCol")}</th>
                        <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.depWithdrawal")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {report.rows.map((r) => (
                        <tr key={r.date} className="hover:bg-slate-800/30">
                          <td className="px-3 py-2 font-mono text-slate-300 sticky left-0 bg-slate-950/95">{r.date}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.totalClicks}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.uniqueClicks}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.registration}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.ftd}</td>
                          <td className="px-3 py-2 text-right tabular-nums">${r.ftdAmount.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.redeps}</td>
                          <td className="px-3 py-2 text-right tabular-nums">${r.redepsAmount.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-400">${r.rewardCpaConfirm.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-400">${r.incomeRevConfirm.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.clickToFtd}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">${r.epc.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.purchases}</td>
                          <td className="px-3 py-2 text-right tabular-nums">${r.purchValue.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">${r.withdrawal.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">${r.depWithdrawal.toFixed(2)}</td>
                        </tr>
                      ))}
                      {report.totals && (
                        <tr className="border-t-2 border-slate-600 bg-slate-800/40 font-semibold">
                          <td className="px-3 py-2.5 font-mono text-slate-100 sticky left-0 bg-slate-800/95">{t("ref.total")}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{report.totals.totalClicks}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{report.totals.uniqueClicks}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{report.totals.registration}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{report.totals.ftd}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">${(report.totals.ftdAmount ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{report.totals.redeps}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">${(report.totals.redepsAmount ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-emerald-400">${(report.totals.rewardCpaConfirm ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-emerald-400">${(report.totals.incomeRevConfirm ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{(report.totals.clickToFtd ?? 0)}%</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">${(report.totals.epc ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{report.totals.purchases}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">${(report.totals.purchValue ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">${(report.totals.withdrawal ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">${(report.totals.depWithdrawal ?? 0).toFixed(2)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">{t("ref.selectPeriod")}</p>
              )}
            </section>
          )}

          {activeSection === "withdraw" && (
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-6">
                <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-4">{t("ref.withdrawTitle")}</h3>
                {loadingStats ? (
                  <div className="h-24 bg-slate-800/50 rounded-xl animate-pulse" />
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                    <div>
                      <p className="text-3xl font-bold text-emerald-400 font-mono tabular-nums">
                        ${(stats?.referralBalance ?? 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{t("ref.toWithdraw")}</p>
                    </div>
                    {withdrawConfig.managerTelegram ? (
                      <a
                        href={
                          withdrawConfig.managerTelegram.startsWith("http")
                            ? withdrawConfig.managerTelegram
                            : withdrawConfig.managerTelegram.startsWith("@")
                              ? `https://t.me/${withdrawConfig.managerTelegram.slice(1)}`
                              : `https://t.me/${withdrawConfig.managerTelegram}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary py-3 px-6 rounded-xl shrink-0 flex items-center justify-center gap-2 min-w-[200px]"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.015 3.333-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.141.121.1.154.234.17.331.015.098.034.321.02.495z" />
                        </svg>
                        {t("ref.withdrawBtn")}
                      </a>
                    ) : (
                      <p className="text-slate-500 text-sm">{t("ref.contactAdmin")}</p>
                    )}
                  </div>
                )}
              </section>

              <section className="glass-panel p-5 sm:p-6 rounded-2xl">
                <h2 className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-4">{t("ref.historyTitle")}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-3 mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 sm:shrink-0">{t("ref.from")}</label>
                    <input type="date" value={withdrawFilters.dateFrom} onChange={(e) => setWithdrawFilters((f) => ({ ...f, dateFrom: e.target.value }))} className="input-glass px-3 py-2.5 sm:py-2 rounded-lg text-sm min-h-[44px] sm:min-h-0 touch-manipulation" />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-slate-500 sm:shrink-0">{t("ref.to")}</label>
                    <input type="date" value={withdrawFilters.dateTo} onChange={(e) => setWithdrawFilters((f) => ({ ...f, dateTo: e.target.value }))} className="input-glass px-3 py-2.5 sm:py-2 rounded-lg text-sm min-h-[44px] sm:min-h-0 touch-manipulation" />
                  </div>
                  <div className="flex gap-2 sm:items-center">
                    <button type="button" onClick={() => fetchWithdrawals()} disabled={loadingWithdrawals} className="btn-primary px-4 py-3 sm:py-2 rounded-lg text-sm disabled:opacity-50 min-h-[44px] sm:min-h-0 touch-manipulation">
                      {loadingWithdrawals ? t("ref.loading") : t("ref.apply")}
                    </button>
                    <button type="button" onClick={() => { setWithdrawFilters({ dateFrom: "", dateTo: "" }); fetchWithdrawals({ dateFrom: "", dateTo: "" }); }} className="text-sm text-slate-500 hover:text-slate-300 transition-colors py-2 min-h-[44px] sm:min-h-0 flex items-center touch-manipulation">
                      {t("ref.reset")}
                    </button>
                  </div>
                </div>

                {loadingWithdrawals ? (
                  <div className="flex justify-center py-16">
                    <div className="h-8 w-8 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
                  </div>
                ) : withdrawals.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-800/60 surface-scroll">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50 bg-slate-900/60">
                          <th className="px-4 py-3.5 text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.idDate")}</th>
                          <th className="px-4 py-3.5 text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.method")}</th>
                          <th className="px-4 py-3.5 text-right text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.sum")}</th>
                          <th className="px-4 py-3.5 text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium">{t("ref.statusCol")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {withdrawals.map((w) => (
                          <tr key={w.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-mono text-slate-400 text-xs">#{w.id}</span>
                              <span className="text-slate-300 ml-2">{new Date(w.createdAt).toLocaleString(locale === "es" ? "es-ES" : "en-US")}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-400">{t("ref.toTradingBalance")}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-400">+${w.amount.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                {t("ref.credited")}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed border-slate-700/60 bg-slate-950/30">
                    <div className="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-4">
                      <svg className="w-7 h-7 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <p className="text-slate-400 font-medium">{t("ref.noData")}</p>
                    <p className="text-slate-500 text-sm text-center mt-1 max-w-xs">
                      {withdrawFilters.dateFrom || withdrawFilters.dateTo ? t("ref.noCreditsPeriod") : t("ref.noCreditsHint")}
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ReferralDashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
      </div>
    }>
      <ReferralDashboardContent />
    </Suspense>
  );
}
