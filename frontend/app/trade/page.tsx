"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "../../components/AuthGuard";
import { WebSocketBridge } from "../../components/WebSocketBridge";
import {
  useTradingStore,
  TradingPair,
  TradeDirection,
  Trade
} from "../../store/useTradingStore";
import { SettledResultOverlay } from "../../components/SettledResultOverlay";
import { ChartResultFeedback } from "../../components/ChartResultFeedback";
import { apiFetch, authHeaders, isAuthError } from "../../lib/api";

const PriceChart = dynamic(
  () => import("../../components/PriceChart").then((m) => ({ default: m.PriceChart })),
  { ssr: false, loading: () => <div className="h-[380px] w-full rounded-xl glass flex items-center justify-center text-slate-500 text-sm">Загрузка графика…</div> }
);

type MeResponse = {
  user: {
    id: number;
    email: string;
    demoBalance: number;
    isAdmin?: boolean;
    blockedAt?: string | null;
    withdrawBlockedAt?: string | null;
    blockReason?: string | null;
  };
};

type PairsResponse = {
  pairs: TradingPair[];
};

type TradesResponse = {
  trades: any[];
};

function TradePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useTradingStore((s) => s.token);
  const authChecked = useTradingStore((s) => s.authChecked);
  const user = useTradingStore((s) => s.user);
  const setAuth = useTradingStore((s) => s.setAuth);
  const clearAuth = useTradingStore((s) => s.clearAuth);
  const pairs = useTradingStore((s) => s.pairs);
  const favoritePairIds = useTradingStore((s) => s.favoritePairIds);
  const recentPairIds = useTradingStore((s) => s.recentPairIds);
  const toggleFavoritePair = useTradingStore((s) => s.toggleFavoritePair);
  const addRecentPair = useTradingStore((s) => s.addRecentPair);
  const lastSettledResult = useTradingStore((s) => s.lastSettledResult);
  const clearLastSettledResult = useTradingStore((s) => s.clearLastSettledResult);
  const prices = useTradingStore((s) => s.prices);
  const activeTrades = useTradingStore((s) => s.activeTrades);
  const completedTrades = useTradingStore((s) => s.completedTrades);
  const setPairs = useTradingStore((s) => s.setPairs);
  const setActiveTrades = useTradingStore((s) => s.setActiveTrades);
  const setCompletedTrades = useTradingStore((s) => s.setCompletedTrades);
  const chartSettings = useTradingStore((s) => s.chartSettings);
  const setChartSettings = useTradingStore((s) => s.setChartSettings);

  const TIMEFRAMES = [
    "30s",
    "1m",
    "5m",
    "10m",
    "15m",
    "1h",
    "2h",
    "5h"
  ] as const;
  type TimeframeKey = (typeof TIMEFRAMES)[number];

  const selectedPairId = chartSettings.selectedPairId;
  const timeframe = (chartSettings.timeframe || "30s") as TimeframeKey;
  const chartMode = chartSettings.chartMode ?? "line";
  const showMA = chartSettings.showMA ?? false;
  const showRSI = chartSettings.showRSI ?? false;
  const showMACD = chartSettings.showMACD ?? false;
  const showBB = chartSettings.showBB ?? false;
  const [candles, setCandles] = useState<
    { startTime: number; open: number; high: number; low: number; close: number }[]
  >([]);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [candlesError, setCandlesError] = useState<string | null>(null);
  const [amount, setAmount] = useState(10);
  const [duration, setDuration] = useState(60);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeframeToMs: Record<TimeframeKey, number> = useMemo(
    () => ({
      "30s": 30_000,
      "1m": 60_000,
      "5m": 5 * 60_000,
      "10m": 10 * 60_000,
      "15m": 15 * 60_000,
      "1h": 60 * 60_000,
      "2h": 2 * 60 * 60_000,
      "5h": 5 * 60 * 60_000
    }),
    []
  );

  /** Количество свечей для отображения 5 часов истории */
  const candleLimitFor5h: Record<TimeframeKey, number> = useMemo(
    () => ({
      "30s": 600,
      "1m": 300,
      "5m": 60,
      "10m": 30,
      "15m": 20,
      "1h": 5,
      "2h": 3,
      "5h": 10
    }),
    []
  );

  useEffect(() => {
    if (!authChecked) return;
    async function bootstrap() {
      try {
        const me = await apiFetch<MeResponse>("/me", {
          headers: authHeaders(token)
        });
        setAuth(token ?? null, me.user);
        if (me.user.blockedAt) return;

        const { pairs } = await apiFetch<PairsResponse>("/trading-pairs", {
          headers: authHeaders(token)
        });
        setPairs(pairs);

        const active = await apiFetch<TradesResponse>("/trades/active", {
          headers: authHeaders(token)
        });
        const completed = await apiFetch<TradesResponse>("/trades/completed", {
          headers: authHeaders(token)
        });
        setActiveTrades(active.trades);
        setCompletedTrades(completed.trades);
      } catch (err) {
        if (isAuthError(err)) {
          clearAuth();
          router.replace("/login");
        } else {
          setError((err as Error).message);
        }
      }
    }
    bootstrap();
  }, [
    authChecked,
    token,
    clearAuth,
    router,
    setActiveTrades,
    setAuth,
    setCompletedTrades,
    setPairs
  ]);

  const selectedPair = useMemo(
    () => pairs.find((p) => p.id === selectedPairId) ?? pairs[0],
    [pairs, selectedPairId]
  );

  /** До 3 последних пар для быстрого доступа рядом с График/Линия/Свечи */
  const quickPairs = useMemo(() => {
    const ids = recentPairIds.slice(0, 3);
    return ids
      .map((id) => pairs.find((p) => p.id === id))
      .filter((p): p is TradingPair => p != null);
  }, [pairs, recentPairIds]);

  // Синхронизация пары: при выборе в поиске store обновляется первым, URL — позже; не перезаписывать store по старому URL
  useEffect(() => {
    if (!pairs.length) return;
    const urlId = searchParams.get("pairId");
    const urlIdNum = urlId ? parseInt(urlId, 10) : NaN;
    const savedId = chartSettings.selectedPairId;
    const validSaved = savedId != null && pairs.some((p) => p.id === savedId);
    const validUrl = Number.isFinite(urlIdNum) && pairs.some((p) => p.id === urlIdNum);
    // Если в store уже выбрана валидная пара и URL её не отражает — пользователь только что выбрал пару в поиске, доверяем store
    const id =
      validSaved && (!validUrl || urlIdNum !== savedId)
        ? savedId
        : validUrl
          ? urlIdNum
          : validSaved
            ? savedId
            : pairs[0].id;
    if (id !== chartSettings.selectedPairId) {
      setChartSettings({ selectedPairId: id });
    }
    const targetUrl = `/trade?pairId=${id}`;
    if (!validUrl || urlId !== String(id)) {
      router.replace(targetUrl, { scroll: false });
    }
  }, [pairs.length, searchParams, chartSettings.selectedPairId, router, setChartSettings]);

  // Подтягиваем историю свечей OHLC при загрузке и при смене пары/таймфрейма
  useEffect(() => {
    if (!authChecked || selectedPairId == null) {
      setCandlesLoading(false);
      return;
    }
    const pairId = selectedPairId;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    setCandlesError(null);
    setCandlesLoading(true);
    async function loadCandles() {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const limit = candleLimitFor5h[timeframe] ?? 200;
        const query = new URLSearchParams({
          pairId: String(pairId),
          timeframe,
          limit: String(limit)
        }).toString();
        const resp = await apiFetch<{
          candles: { startTime: string; open: number; high: number; low: number; close: number }[];
        }>(`/candles?${query}`, {
          headers: authHeaders(token),
          signal: controller.signal
        });
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = null;
        if (cancelled) return;
        const list = Array.isArray(resp?.candles) ? resp.candles : [];
        const mapped = list.map((c) => ({
          startTime: new Date(c.startTime).getTime(),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close)
        }));
        setCandles(mapped);
      } catch (e) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!cancelled) {
          const msg =
            (e as Error)?.name === "AbortError"
              ? "Таймаут загрузки графика"
              : (e as Error)?.message || "Ошибка загрузки графика";
          setCandlesError(msg);
          setCandles([]);
        }
      } finally {
        if (!cancelled) setCandlesLoading(false);
      }
    }
    loadCandles();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      setCandlesLoading(false);
    };
  }, [authChecked, token, selectedPairId, timeframe, candleLimitFor5h]);

  // Throttle: обновляем график по тикам не чаще чем раз в 120ms (меньше лишних ре-рендеров)
  const lastCandleUpdateRef = useRef<number>(0);
  const throttleMs = 120;

  // Live update графика: доклеиваем текущий тик цены в последнюю свечу/создаём новую свечу
  useEffect(() => {
    if (selectedPairId == null) return;
    const pairTicks = prices[selectedPairId];
    if (!pairTicks?.length) return;

    const lastTick = pairTicks[pairTicks.length - 1];
    const timeframeMs = timeframeToMs[timeframe];
    if (!timeframeMs) return;

    const bucketStart = Math.floor(lastTick.ts / timeframeMs) * timeframeMs;
    const tickPrice = Number(lastTick.price);
    if (!Number.isFinite(tickPrice)) return;

    const now = Date.now();
    const elapsed = now - lastCandleUpdateRef.current;
    const runUpdate = () => {
      lastCandleUpdateRef.current = Date.now();
      setCandles((prev) => {
        if (!prev.length) return prev;
        const next = [...prev];
        const last = next[next.length - 1];

        if (bucketStart > last.startTime) {
          const open = Number(last.close);
          const close = tickPrice;
          next.push({
            startTime: bucketStart,
            open,
            high: Math.max(open, close),
            low: Math.min(open, close),
            close
          });
          const maxCandles = candleLimitFor5h[timeframe] ?? 200;
          return next.slice(-maxCandles);
        }

        if (bucketStart === last.startTime) {
          const updated = {
            ...last,
            high: Math.max(Number(last.high), tickPrice),
            low: Math.min(Number(last.low), tickPrice),
            close: tickPrice
          };
          next[next.length - 1] = updated;
          return next;
        }

        return prev;
      });
    };

    if (elapsed >= throttleMs) {
      runUpdate();
    } else {
      const t = setTimeout(runUpdate, throttleMs - elapsed);
      return () => clearTimeout(t);
    }
  }, [selectedPairId, prices, timeframe, timeframeToMs, candleLimitFor5h]);

  const markers = useMemo(() => {
    if (!selectedPair) return [];
    const actives: Trade[] = activeTrades.filter(
      (t) => t.tradingPairId === selectedPair.id
    );
    const list: Array<{
      id: number;
      kind: "entry" | "exit";
      ts: number;
      price: number;
      direction: "LONG" | "SHORT";
      status: "ACTIVE" | "WIN" | "LOSS";
      isLatest?: boolean;
    }> = [];
    actives.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const latestActiveId = actives.length ? actives[actives.length - 1].id : null;
    for (const t of actives) {
      list.push({
        id: t.id,
        kind: "entry",
        ts: new Date(t.createdAt).getTime(),
        price: Number(t.entryPrice),
        direction: t.direction,
        status: t.status,
        isLatest: t.id === latestActiveId
      });
    }
    return list.sort((a, b) => a.ts - b.ts);
  }, [activeTrades, selectedPair]);

  async function place(direction: TradeDirection) {
    if (!authChecked || !user || !selectedPair) return;
    setError(null);
    setPlacing(true);
    try {
      const res = await apiFetch<{ trade: unknown; balance: number }>("/trade/open", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          tradingPairId: selectedPair.id,
          amount,
          direction,
          durationSeconds: duration
        })
      });
      if (user && res.balance != null) {
        setAuth(token ?? null, { ...user, demoBalance: res.balance });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPlacing(false);
    }
  }

  function formatBalance(value: number | undefined) {
    if (value == null) return "-";
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return "-";
    return numeric.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  return (
    <AuthGuard>
      <WebSocketBridge />
      <SettledResultOverlay />
      <div className="flex flex-1 flex-col min-h-0 gap-6 mt-4">
        {/* Верхняя часть: график + ордер — занимает доступное место */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(340px,380px)] gap-6 min-h-[480px] flex-1 items-stretch">
          {/* Левая часть — пара + график */}
          <div className="flex flex-col gap-4 min-h-0 min-w-0 overflow-hidden flex-1 glass p-5 sm:p-6 animate-fade-in-up stagger-1 opacity-0 transition-shadow duration-300 hover:shadow-soft-glow/30">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {quickPairs.length > 0 ? (
                  quickPairs.map((pair) => (
                    <button
                      key={pair.id}
                      type="button"
                      onClick={() => {
                        setChartSettings({ selectedPairId: pair.id });
                        addRecentPair(pair.id);
                        router.replace(`/trade?pairId=${pair.id}`, { scroll: false });
                      }}
                      className={`chip text-xs font-mono ${
                        selectedPair?.id === pair.id ? "chip-active" : ""
                      }`}
                    >
                      {pair.symbol}
                    </button>
                  ))
                ) : (
                  <span className="text-[11px] text-slate-500">Выберите пару в шапке</span>
                )}
              </div>
              {selectedPair && (
                <div className="flex items-end gap-3">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      Текущая цена
                    </span>
                    <span className="text-xl font-semibold text-accent font-mono">
                      {(() => {
                        const v = Number(selectedPair.currentPrice);
                        return Number.isNaN(v) ? "-" : v.toFixed(5);
                      })()}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">
                  График
                </span>
                <div className="inline-flex rounded-full glass p-0.5">
                  <button
                    type="button"
                    className={`chip ${
                      chartMode === "line"
                        ? "chip-active"
                        : ""
                    }`}
                    onClick={() => setChartSettings({ chartMode: "line" })}
                  >
                    Линия
                  </button>
                  <button
                    type="button"
                    className={`chip ${
                      chartMode === "candles"
                        ? "chip-active"
                        : ""
                    }`}
                    onClick={() => setChartSettings({ chartMode: "candles" })}
                  >
                    Свечи
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                <span className="text-slate-500 shrink-0">Таймфрейм:</span>
                <div className="flex flex-wrap gap-1">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      className={`chip ${
                        timeframe === tf
                          ? "chip-active"
                          : ""
                      }`}
                      onClick={() => setChartSettings({ timeframe: tf })}
                    >
                      {tf === "30s" && "30с"}
                      {tf === "1m" && "1м"}
                      {tf === "5m" && "5м"}
                      {tf === "10m" && "10м"}
                      {tf === "15m" && "15м"}
                      {tf === "1h" && "1ч"}
                      {tf === "2h" && "2ч"}
                      {tf === "5h" && "5ч"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px]">
              <span className="text-slate-500 shrink-0">Индикаторы:</span>
              {[
                { key: "ma" as const, label: "MA", on: showMA, set: (v: boolean) => setChartSettings({ showMA: v }) },
                { key: "rsi" as const, label: "RSI", on: showRSI, set: (v: boolean) => setChartSettings({ showRSI: v }) },
                { key: "macd" as const, label: "MACD", on: showMACD, set: (v: boolean) => setChartSettings({ showMACD: v }) },
                { key: "bb" as const, label: "BB", on: showBB, set: (v: boolean) => setChartSettings({ showBB: v }) }
              ].map(({ label, on, set }) => (
                <button
                  key={label}
                  type="button"
                  className={`chip ${
                    on
                      ? "chip-active"
                      : ""
                  }`}
                  onClick={() => set(!on)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-2 min-h-[380px] flex-1 w-full min-w-0 overflow-hidden flex flex-col relative">
              <PriceChart
                candles={candles}
                markers={markers}
                mode={chartMode}
                loading={candlesLoading}
                error={candlesError}
                showMA={showMA}
                showRSI={showRSI}
                showMACD={showMACD}
                showBB={showBB}
              />
              {lastSettledResult && (
                <ChartResultFeedback
                  status={lastSettledResult.status}
                  onDone={clearLastSettledResult}
                />
              )}
            </div>
          </div>

          {/* Правая часть — новый ордер (структурировано) + активные сделки */}
          <div className="flex flex-col gap-5 min-h-0 animate-fade-in-up stagger-2 opacity-0">
            {/* Карточка: новый ордер */}
            <div className="flex flex-col gap-5 shrink-0 glass p-6 transition-shadow duration-300 hover:shadow-soft-glow/20">
              <div className="flex items-center justify-between gap-4 pb-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Новый ордер
                  </h3>
                  <p className="text-sm font-medium text-slate-200 mt-0.5">
                    {selectedPair ? selectedPair.name : "Выберите актив"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Баланс</p>
                  <p className="text-base font-semibold text-accent font-mono">
                    ${formatBalance(user?.demoBalance)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2.5">
                    Сумма сделки
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={amount}
                      onChange={(e) =>
                        setAmount(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="w-24 input-glass py-2.5 text-sm font-mono"
                    />
                    <div className="flex gap-1.5">
                      {[1, 5, 10, 25, 50].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setAmount(v)}
                          className={`chip rounded-lg px-3 py-2 text-xs font-medium ${
                            amount === v
                              ? "chip-active"
                              : ""
                          }`}
                        >
                          ${v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2.5">
                    Экспирация
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={60}
                      step={15}
                      value={duration}
                      onChange={(e) =>
                        setDuration(Math.max(60, Number(e.target.value) || 60))
                      }
                      className="w-24 input-glass py-2.5 text-sm font-mono"
                    />
                    <span className="text-slate-500 text-xs">сек</span>
                    <div className="flex gap-1.5">
                      {[60, 120, 180].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setDuration(v)}
                          className={`chip rounded-lg px-3 py-2 text-xs font-medium ${
                            duration === v
                              ? "chip-active"
                              : ""
                          }`}
                        >
                          {v}s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    className="rounded-xl py-3 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all active:scale-[0.98]"
                    disabled={placing}
                    onClick={() => place("LONG")}
                  >
                    LONG ↑
                  </button>
                  <button
                    type="button"
                    className="rounded-xl py-3 text-sm font-semibold bg-orange-500/95 hover:bg-orange-400 text-slate-950 shadow-[0_0_20px_rgba(249,115,22,0.25)] transition-all active:scale-[0.98]"
                    disabled={placing}
                    onClick={() => place("SHORT")}
                  >
                    SHORT ↓
                  </button>
                </div>

                {selectedPair && (
                  <p className="text-[11px] text-slate-500 text-center">
                    Цена входа{" "}
                    <span className="font-mono text-slate-300">
                      {Number(selectedPair.currentPrice).toFixed(5)}
                    </span>
                  </p>
                )}
                {error && (
                  <p className="text-xs text-red-400 bg-red-950/40 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
              </div>
            </div>

            {/* Активные сделки — в той же колонке под ордером */}
            <ActiveTrades />
          </div>
        </div>

        {/* История сделок — на 100% ширины экрана (full bleed) */}
        <div className="shrink-0 mt-auto w-screen relative left-1/2 right-1/2 -translate-x-1/2 overflow-x-hidden">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <CompletedTrades />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

function ActiveTrades() {
  const active = useTradingStore((s) => s.activeTrades);

  return (
    <div className="flex flex-col min-h-0 flex-1 glass p-5 sm:p-6">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Активные сделки
        </h2>
        {active.length > 0 && (
          <span className="text-[10px] text-slate-500">{active.length}</span>
        )}
      </div>

      {active.length === 0 ? (
        <div className="text-xs text-slate-500 py-4 text-center">
          Нет активных. Откройте LONG или SHORT выше.
        </div>
      ) : (
        <div className="min-h-0 overflow-auto rounded-lg bg-slate-950/40 surface-scroll">
          <table className="min-w-full text-[11px]">
            <thead className="sticky top-0 z-10 glass-strong rounded-none text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">Пара</th>
                <th className="px-3 py-2.5 text-right font-medium">$</th>
                <th className="px-3 py-2.5 text-right font-medium">До эксп.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {active.map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/50">
                  <td className="px-3 py-2.5 align-middle">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-slate-100">
                        {t.tradingPair?.symbol ?? t.tradingPairId}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          t.direction === "LONG"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-orange-500/15 text-orange-400"
                        }`}
                      >
                        {t.direction}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                    ${Number(t.amount).toFixed(0)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Countdown expiresAt={t.expiresAt} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Countdown({ expiresAt, compact = false }: { expiresAt: string; compact?: boolean }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - now) / 1000)
  );

  if (compact) {
    return (
      <span className="inline-flex items-center justify-end gap-1 text-[11px] text-slate-300 font-mono">
        <span className="text-slate-500">≈</span>
        <span className="text-amber-400">{diff.toString()}s</span>
      </span>
    );
  }

  return (
    <div className="text-[11px] text-slate-300">
      До экспирации{" "}
      <span className="font-mono text-accent">{diff.toString()} c</span>
    </div>
  );
}

function formatTradeTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffH < 24) return `${diffH} ч назад`;
  if (diffD === 1) return "вчера";
  if (diffD < 7) return `${diffD} дн. назад`;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function CompletedTrades() {
  const completed = useTradingStore((s) => s.completedTrades);

  return (
    <div className="w-full glass overflow-hidden">
      <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/80">
            <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </span>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              История сделок
            </h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Завершённые ордера
            </p>
          </div>
        </div>
        {completed.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-slate-800/80 px-2.5 py-1 text-[10px] font-medium text-slate-400 font-mono">
              {completed.length}
            </span>
            <span className="text-[10px] text-slate-500">записей</span>
          </div>
        )}
      </div>

      {completed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/60 mb-3">
            <svg className="h-6 w-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-400">Завершённых сделок пока нет</p>
          <p className="text-xs text-slate-500 mt-1">Откройте LONG или SHORT — здесь появятся результаты</p>
        </div>
      ) : (
        <div className="h-[240px] overflow-y-auto overflow-x-auto surface-scroll">
          <table className="min-w-full text-[11px]">
            <thead className="sticky top-0 z-10 glass-strong rounded-none text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
              <tr>
                <th className="px-5 py-3 text-left font-medium w-24">Время</th>
                <th className="px-5 py-3 text-left font-medium">Пара</th>
                <th className="px-5 py-3 text-left font-medium">Направление</th>
                <th className="px-5 py-3 text-right font-medium">Сумма</th>
                <th className="px-5 py-3 text-right font-medium">Вход</th>
                <th className="px-5 py-3 text-right font-medium">Выход</th>
                <th className="px-5 py-3 text-right font-medium">P/L</th>
                <th className="px-5 py-3 text-right font-medium w-20">Результат</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {completed.map((t, i) => {
                const isWin = t.status === "WIN";
                const pnl = isWin ? Number(t.amount) : -Number(t.amount);
                return (
                  <tr
                    key={t.id}
                    className={`transition-colors hover:bg-slate-800/50 ${
                      i % 2 === 0 ? "bg-slate-950/30" : "bg-slate-950/50"
                    }`}
                  >
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                      {formatTradeTime(t.expiresAt)}
                    </td>
                    <td className="px-5 py-3 font-mono font-medium text-slate-100">
                      {t.tradingPair?.symbol ?? t.tradingPairId}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          t.direction === "LONG"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-orange-500/15 text-orange-400"
                        }`}
                      >
                        {t.direction === "LONG" ? "↑" : "↓"} {t.direction}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-slate-200">
                      ${Number(t.amount).toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-slate-400 tabular-nums">
                      {Number(t.entryPrice).toFixed(5)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-slate-400 tabular-nums">
                      {t.closePrice != null ? Number(t.closePrice).toFixed(5) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums">
                      <span className={isWin ? "text-emerald-400" : "text-red-400"}>
                        {isWin ? "+" : ""}${pnl.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                            isWin
                              ? "bg-emerald-500/25 text-emerald-400"
                              : "bg-red-500/25 text-red-400"
                        }`}
                      >
                        {isWin ? "✓ WIN" : "✕ LOSS"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TradePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
        </div>
      }
    >
      <TradePageContent />
    </Suspense>
  );
}

