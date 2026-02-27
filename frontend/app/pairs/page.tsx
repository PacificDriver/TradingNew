"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "../../components/AuthGuard";
import { WebSocketBridge } from "../../components/WebSocketBridge";
import { useTradingStore, type TradingPair } from "../../store/useTradingStore";
import { apiFetch, authHeaders } from "../../lib/api";
import { useLocale } from "../../lib/i18n";

type PairsResponse = { pairs: TradingPair[] };

const CATEGORIES = ["all", "crypto", "stablecoin"] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (price >= 1) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (price >= 0.0001) return price.toFixed(6);
  return price.toExponential(2);
}

function PairsPageContent() {
  const router = useRouter();
  const { t } = useLocale();
  const token = useTradingStore((s) => s.token);
  const pairs = useTradingStore((s) => s.pairs);
  const setPairs = useTradingStore((s) => s.setPairs);
  const prices = useTradingStore((s) => s.prices);
  const chartSettings = useTradingStore((s) => s.chartSettings);
  const setChartSettings = useTradingStore((s) => s.setChartSettings);
  const addRecentPair = useTradingStore((s) => s.addRecentPair);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<PairsResponse>("/trading-pairs", { headers: authHeaders(token) })
      .then((data) => setPairs(data.pairs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, setPairs]);

  const filteredPairs = useMemo(() => {
    let list = pairs;
    if (categoryFilter !== "all") {
      list = list.filter((p) => (p.category ?? "crypto") === categoryFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.symbol.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [pairs, categoryFilter, search]);

  const handleSelectPair = (pair: TradingPair) => {
    setChartSettings({ selectedPairId: pair.id });
    addRecentPair(pair.id);
    router.push(`/trade?pairId=${pair.id}`);
  };

  const getDisplayPrice = (pair: TradingPair): number => {
    const pts = prices[pair.id];
    if (pts && pts.length > 0) return pts[pts.length - 1].price;
    return Number(pair.currentPrice);
  };

  return (
    <div className="mx-auto max-w-4xl py-6 sm:py-8">
      <WebSocketBridge />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100 sm:text-2xl">
            {t("pairs.pageTitle")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("pairs.pageSubtitle")}
          </p>
        </div>
        <Link
          href="/trade"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800/80"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t("pairs.backToTrading")}
        </Link>
      </div>

      <div className="glass rounded-2xl p-4 sm:p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder={t("pairs.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-glass flex-1"
          />
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                  categoryFilter === cat
                    ? "bg-accent/20 text-accent border border-accent/40"
                    : "border border-slate-600 bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                {cat === "all"
                  ? t("pairs.categoryAll")
                  : cat === "crypto"
                    ? t("pairs.categoryCrypto")
                    : t("pairs.categoryCurrencies")}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center py-12">
            <div className="h-8 w-8 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
          </div>
        ) : filteredPairs.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            {t("pairs.noResults")}
          </div>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPairs.map((pair) => (
              <button
                key={pair.id}
                type="button"
                onClick={() => handleSelectPair(pair)}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-700/60 bg-slate-800/30 px-4 py-3.5 text-left transition-all hover:border-accent/30 hover:bg-slate-800/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-100">
                      {pair.symbol}
                    </span>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500 bg-slate-800/80">
                      {pair.category === "stablecoin"
                        ? t("pairs.categoryCurrencies")
                        : t("pairs.categoryCrypto")}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {pair.name}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm font-medium text-accent tabular-nums">
                  ${formatPrice(getDisplayPrice(pair))}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PairsPage() {
  return (
    <AuthGuard>
      <PairsPageContent />
    </AuthGuard>
  );
}
