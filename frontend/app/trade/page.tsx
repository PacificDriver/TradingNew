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
  TradeStatus,
  Trade
} from "../../store/useTradingStore";
import { SettledResultOverlay } from "../../components/SettledResultOverlay";
import { ChartResultFeedback } from "../../components/ChartResultFeedback";
import { CompletedTrades } from "../../components/CompletedTrades";
import { PairSelectDropdown } from "../../components/PairSelectDropdown";
import { apiFetch, authHeaders, isAuthError, getDisplayMessage } from "../../lib/api";
import { useLocale } from "../../lib/i18n";

function ChartLoadingFallback() {
  const { t } = useLocale();
  return (
    <div className="min-h-[260px] sm:min-h-[320px] xl:min-h-[380px] w-full rounded-xl glass flex items-center justify-center text-slate-500 text-sm">
      {t("trade.chartLoading")}
    </div>
  );
}

const PriceChart = dynamic(
  () => import("../../components/PriceChart").then((m) => ({ default: m.PriceChart })),
  { ssr: false, loading: () => <ChartLoadingFallback /> }
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
  const { t, locale } = useLocale();
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
  const upsertPrice = useTradingStore((s) => s.upsertPrice);
  const setActiveTrades = useTradingStore((s) => s.setActiveTrades);
  const setCompletedTrades = useTradingStore((s) => s.setCompletedTrades);
  const applyTradeUpdate = useTradingStore((s) => s.applyTradeUpdate);
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
  /** На мобильных: какое выпадающее меню на графике открыто */
  const [mobileChartMenu, setMobileChartMenu] = useState<"chart" | "timeframe" | "indicators" | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
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
          setError(getDisplayMessage(err, t));
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

  // Скролл к блоку «История» при переходе по ссылке /trade#history (нижнее меню на мобильных)
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#history") return;
    const el = document.getElementById("history");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Закрытие выпадающих меню на графике (мобильные) по клику снаружи
  useEffect(() => {
    if (mobileChartMenu == null) return;
    const onPointerDown = (e: PointerEvent) => {
      if (mobileMenuRef.current?.contains(e.target as Node)) return;
      setMobileChartMenu(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [mobileChartMenu]);

  // Резервный опрос цен по API (если WebSocket не доставляет обновления — график всё равно обновляется)
  useEffect(() => {
    if (!authChecked || selectedPairId == null || !token) return;
    const POLL_MS = 2000;
    const t = setInterval(async () => {
      try {
        const { pairs: nextPairs } = await apiFetch<PairsResponse>("/trading-pairs", {
          headers: authHeaders(token)
        });
        const pair = nextPairs?.find((p) => p.id === selectedPairId);
        if (pair && Number.isFinite(Number(pair.currentPrice))) {
          upsertPrice(selectedPairId, Number(pair.currentPrice));
        }
      } catch {
        // ignore
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [authChecked, selectedPairId, token, upsertPrice]);

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
              ? t("trade.chartTimeout")
              : (e as Error)?.message || t("trade.chartError");
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
  }, [authChecked, token, selectedPairId, timeframe, candleLimitFor5h, t]);

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
<<<<<<< HEAD
      const res = await apiFetch<{ trade?: Record<string, unknown>; balance: number }>("/trade/open", {
=======
      const res = await apiFetch<{
        trade: {
          id: number;
          tradingPairId: number;
          amount: number;
          direction: string;
          entryPrice: number;
          closePrice: number | null;
          status: string;
          expiresAt: string;
          createdAt: string;
        };
        balance: number;
      }>("/trade/open", {
>>>>>>> 346535b5c6ca07f3075f719c0dc37cd9bc5235bd
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
<<<<<<< HEAD
      if (res.trade && (res.trade.status as string) === "ACTIVE") {
        const newTrade: Trade = {
          id: res.trade.id as number,
          tradingPairId: res.trade.tradingPairId as number,
          amount: res.trade.amount as number,
          direction: res.trade.direction as TradeDirection,
          entryPrice: res.trade.entryPrice as number,
          closePrice: (res.trade.closePrice as number | null) ?? null,
          status: res.trade.status as TradeStatus,
          expiresAt: res.trade.expiresAt as string,
          createdAt: res.trade.createdAt as string,
          tradingPair: selectedPair
        };
        applyTradeUpdate(newTrade);
=======
      if (res.trade && res.trade.status === "ACTIVE") {
        const newTrade: Trade = {
          ...res.trade,
          direction: res.trade.direction as TradeDirection,
          tradingPair: selectedPair,
          closePrice: res.trade.closePrice ?? null
        };
        setActiveTrades([newTrade, ...activeTrades]);
>>>>>>> 346535b5c6ca07f3075f719c0dc37cd9bc5235bd
      }
    } catch (err) {
      setError(getDisplayMessage(err, t));
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
      <div className="flex flex-1 flex-col min-h-0 gap-0 xl:gap-6 mt-2 xl:mt-4 pb-[env(safe-area-inset-bottom,0px)]">
        {/* Верхняя часть: график + ордер. На мобильных: график на всю высоту, ордер прижат к низу */}
        <div className="relative grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(340px,380px)] gap-0 xl:gap-6 min-h-[min(45vh,320px)] xl:min-h-[480px] flex-1 items-stretch">
          {/* Левая часть — пара + график. На мобильных без рамки, график во всю ширину */}
          <div className="flex flex-col gap-2 xl:gap-4 min-h-0 min-w-0 overflow-hidden flex-1 rounded-none border-0 bg-transparent p-2 -mx-2 xl:mx-0 xl:glass xl:rounded-2xl xl:p-6 animate-fade-in-up stagger-1 opacity-0 transition-shadow duration-300 xl:hover:shadow-soft-glow/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* Мобильные: полный выбор пары (перенесён из шапки) */}
                <div className="flex md:hidden min-w-0 flex-1">
                  {pairs.length > 0 ? (
                    <PairSelectDropdown
                      pairs={pairs}
                      selectedPair={selectedPair ?? null}
                      onSelectPair={(pair) => {
                        setChartSettings({ selectedPairId: pair.id });
                        addRecentPair(pair.id);
                        router.replace(`/trade?pairId=${pair.id}`, { scroll: false });
                      }}
                      favoritePairIds={favoritePairIds}
                      recentPairIds={recentPairIds}
                      toggleFavoritePair={toggleFavoritePair}
                      addRecentPair={addRecentPair}
                    />
                  ) : (
                    <span className="text-[11px] text-slate-500">{t("trade.selectPairInHeader")}</span>
                  )}
                </div>
                {/* ПК: 3 избранные/недавние пары */}
                <div className="hidden md:flex items-center gap-2">
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
                        className={`chip text-xs font-mono min-h-[44px] min-w-[44px] flex items-center justify-center px-3 xl:min-h-0 xl:min-w-0 xl:px-2.5 xl:py-1 ${
                          selectedPair?.id === pair.id ? "chip-active" : ""
                        }`}
                      >
                        {pair.symbol}
                      </button>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-500">{t("trade.selectPairInHeader")}</span>
                  )}
                </div>
              </div>
              {selectedPair && (
                <div className="flex items-end gap-3">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      {t("trade.currentPrice")}
                    </span>
                    <span className="text-lg sm:text-xl font-semibold text-accent font-mono tabular-nums">
                      {(() => {
                        const v = Number(selectedPair.currentPrice);
                        return Number.isNaN(v) ? "-" : v.toFixed(5);
                      })()}
                    </span>
                  </div>
                </div>
              )}
            </div>
            {/* График (линия/свечи) + таймфрейм: только на ПК; на мобильных — выпадающие кнопки на графике */}
            <div className="hidden xl:flex items-center gap-2 overflow-x-auto pb-1 -mx-1 sm:mx-0 surface-scroll sm:flex-wrap">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-wide text-slate-500 shrink-0 hidden sm:inline">
                  {t("trade.chart")}
                </span>
                <div className="inline-flex rounded-full glass p-0.5 shrink-0">
                  <button
                    type="button"
                    className={`chip min-h-[36px] px-3 text-[11px] xl:min-h-0 xl:px-2.5 xl:py-1 ${
                      chartMode === "line"
                        ? "chip-active"
                        : ""
                    }`}
                    onClick={() => setChartSettings({ chartMode: "line" })}
                  >
                    {t("trade.line")}
                  </button>
                  <button
                    type="button"
                    className={`chip min-h-[36px] px-3 text-[11px] xl:min-h-0 xl:px-2.5 xl:py-1 ${
                      chartMode === "candles"
                        ? "chip-active"
                        : ""
                    }`}
                    onClick={() => setChartSettings({ chartMode: "candles" })}
                  >
                    {t("trade.candles")}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 border-l border-slate-700/50 pl-2">
                <span className="text-[10px] sm:text-[11px] text-slate-500 shrink-0 hidden sm:inline">{t("trade.timeframe")}</span>
                <div className="flex gap-1 shrink-0">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      className={`chip min-h-[36px] min-w-[36px] flex items-center justify-center text-[11px] shrink-0 xl:min-h-0 xl:min-w-0 xl:shrink ${
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
            <div className="hidden xl:flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px] surface-scroll shrink-0">
              <span className="text-slate-500 shrink-0">{t("trade.indicators")}</span>
              {[
                { key: "ma" as const, label: "MA", on: showMA, set: (v: boolean) => setChartSettings({ showMA: v }) },
                { key: "rsi" as const, label: "RSI", on: showRSI, set: (v: boolean) => setChartSettings({ showRSI: v }) },
                { key: "macd" as const, label: "MACD", on: showMACD, set: (v: boolean) => setChartSettings({ showMACD: v }) },
                { key: "bb" as const, label: "BB", on: showBB, set: (v: boolean) => setChartSettings({ showBB: v }) }
              ].map(({ label, on, set }) => (
                <button
                  key={label}
                  type="button"
                  className={`chip min-h-[34px] min-w-[34px] flex items-center justify-center shrink-0 xl:min-h-0 xl:min-w-0 ${
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
<<<<<<< HEAD
            {/* На мобильных — график без краёв; компактный отступ снизу, панель ордера не загораживает */}
            <div className="mt-1 xl:mt-2 min-h-[260px] sm:min-h-[320px] xl:min-h-[380px] flex-1 w-full min-w-0 overflow-x-auto overflow-y-hidden xl:overflow-hidden flex flex-col relative surface-scroll pb-[240px] xl:pb-0">
              {/* Мобильные: компактные выпадающие кнопки поверх графика */}
=======
            {/* На мобильных — график; отступ снизу под панель ордера (~44px) + нижнее меню (56px) */}
            <div className="mt-1 xl:mt-2 min-h-[200px] sm:min-h-[260px] xl:min-h-[380px] flex-1 w-full min-w-0 overflow-x-auto overflow-y-hidden xl:overflow-hidden flex flex-col relative surface-scroll pb-[100px] xl:pb-0">
              {/* Мобильные: выпадающие кнопки поверх графика (тип графика, таймфрейм, индикаторы) */}
>>>>>>> 346535b5c6ca07f3075f719c0dc37cd9bc5235bd
              <div
                ref={mobileMenuRef}
                className="xl:hidden absolute top-2 left-2 right-2 z-20 flex flex-wrap gap-1.5 pointer-events-none [&>*]:pointer-events-auto"
              >
                {/* Тип графика */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMobileChartMenu((m) => (m === "chart" ? null : "chart"))}
                    className="flex items-center gap-1 min-h-[38px] px-2.5 rounded-lg bg-slate-800/95 backdrop-blur-md border border-slate-600/60 text-slate-200 text-xs font-medium shadow-lg touch-manipulation"
                  >
                    <span className="text-slate-400 text-xs">{t("trade.chart")}</span>
                    <span>{chartMode === "line" ? t("trade.line") : t("trade.candles")}</span>
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {mobileChartMenu === "chart" && (
                    <div className="absolute top-full left-0 mt-1 min-w-[140px] py-1 rounded-xl bg-slate-800/95 backdrop-blur-md border border-slate-600/60 shadow-xl z-30">
                      <button
                        type="button"
                        onClick={() => { setChartSettings({ chartMode: "line" }); setMobileChartMenu(null); }}
                        className={`w-full text-left px-3 py-2.5 text-sm ${chartMode === "line" ? "text-emerald-400 font-medium" : "text-slate-300"}`}
                      >
                        {t("trade.line")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setChartSettings({ chartMode: "candles" }); setMobileChartMenu(null); }}
                        className={`w-full text-left px-3 py-2.5 text-sm ${chartMode === "candles" ? "text-emerald-400 font-medium" : "text-slate-300"}`}
                      >
                        {t("trade.candles")}
                      </button>
                    </div>
                  )}
                </div>
                {/* Таймфрейм */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMobileChartMenu((m) => (m === "timeframe" ? null : "timeframe"))}
                    className="flex items-center gap-1 min-h-[38px] px-2.5 rounded-lg bg-slate-800/95 backdrop-blur-md border border-slate-600/60 text-slate-200 text-xs font-medium shadow-lg touch-manipulation"
                  >
                    <span className="text-slate-400 text-xs">{t("trade.timeframe")}</span>
                    <span>
                      {timeframe === "30s" && "30с"}
                      {timeframe === "1m" && "1м"}
                      {timeframe === "5m" && "5м"}
                      {timeframe === "10m" && "10м"}
                      {timeframe === "15m" && "15м"}
                      {timeframe === "1h" && "1ч"}
                      {timeframe === "2h" && "2ч"}
                      {timeframe === "5h" && "5ч"}
                    </span>
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {mobileChartMenu === "timeframe" && (
                    <div className="absolute top-full left-0 mt-1 min-w-[100px] py-1 rounded-xl bg-slate-800/95 backdrop-blur-md border border-slate-600/60 shadow-xl z-30 max-h-[60vh] overflow-y-auto">
                      {TIMEFRAMES.map((tf) => (
                        <button
                          key={tf}
                          type="button"
                          onClick={() => { setChartSettings({ timeframe: tf }); setMobileChartMenu(null); }}
                          className={`w-full text-left px-3 py-2.5 text-sm ${timeframe === tf ? "text-emerald-400 font-medium" : "text-slate-300"}`}
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
                  )}
                </div>
                {/* Индикаторы */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMobileChartMenu((m) => (m === "indicators" ? null : "indicators"))}
                    className="flex items-center gap-1 min-h-[38px] px-2.5 rounded-lg bg-slate-800/95 backdrop-blur-md border border-slate-600/60 text-slate-200 text-xs font-medium shadow-lg touch-manipulation"
                  >
                    <span className="text-slate-400 text-xs">{t("trade.indicators")}</span>
                    <span>
                      {[showMA && "MA", showRSI && "RSI", showMACD && "MACD", showBB && "BB"].filter(Boolean).join(", ") || "—"}
                    </span>
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {mobileChartMenu === "indicators" && (
                    <div className="absolute top-full left-0 mt-1 min-w-[140px] py-1 rounded-xl bg-slate-800/95 backdrop-blur-md border border-slate-600/60 shadow-xl z-30">
                      {[
                        { key: "ma" as const, label: "MA", on: showMA, set: (v: boolean) => setChartSettings({ showMA: v }) },
                        { key: "rsi" as const, label: "RSI", on: showRSI, set: (v: boolean) => setChartSettings({ showRSI: v }) },
                        { key: "macd" as const, label: "MACD", on: showMACD, set: (v: boolean) => setChartSettings({ showMACD: v }) },
                        { key: "bb" as const, label: "BB", on: showBB, set: (v: boolean) => setChartSettings({ showBB: v }) }
                      ].map(({ label, on, set }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => { set(!on); }}
                          className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between ${on ? "text-emerald-400 font-medium" : "text-slate-300"}`}
                        >
                          {label}
                          {on && <span className="text-emerald-400">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="min-w-[min(100%,800px)] xl:min-w-0 h-full flex flex-col">
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
                containerClassName="rounded-none bg-transparent border-0 shadow-none xl:rounded-xl xl:glass"
              />
              {/* Компактная плашка «Новый ордер» — всегда в углу графика */}
              <button
                type="button"
                onClick={() => document.getElementById("order-panel")?.scrollIntoView({ behavior: "smooth" })}
                className="absolute bottom-3 left-2 xl:bottom-2 xl:left-2 z-20 flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-500/40 text-emerald-400 backdrop-blur-sm touch-manipulation"
              >
                {t("trade.newOrder")}
              </button>
              {lastSettledResult && (
                <ChartResultFeedback
                  status={lastSettledResult.status}
                  onDone={clearLastSettledResult}
                />
              )}
              </div>
            </div>
          </div>

<<<<<<< HEAD
          {/* Правая часть. На мобильных: ордер внизу (фиксирован), активные сделки сверху (max 5 рядов + горизонтальный скролл) */}
          <div className="flex flex-col-reverse xl:flex-col gap-4 xl:gap-5 min-h-0 max-h-[75vh] xl:max-h-none animate-fade-in-up stagger-2 opacity-0 absolute bottom-0 left-0 right-0 z-10 xl:static xl:z-0 overflow-hidden xl:overflow-visible">
            {/* Новый ордер — на мобильных внизу (flex-col-reverse), на ПК сверху */}
            <div className="flex flex-col gap-2 xl:gap-5 shrink-0 rounded-b-2xl xl:rounded-2xl p-4 xl:p-6 transition-shadow duration-300 xl:hover:shadow-soft-glow/20 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 border-t-0 xl:border-t xl:border-b-0 xl:bg-transparent xl:backdrop-blur-none xl:border xl:border-slate-700/50 xl:glass">
              <div className="flex items-center justify-between gap-2 xl:gap-3 pb-1 xl:pb-3">
                <div className="min-w-0 flex items-center gap-2">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 xl:text-xs xl:text-slate-400">
                    {t("trade.newOrder")}
                  </h3>
                  <p className="text-xs xl:text-sm font-medium text-slate-200 truncate">
                    {selectedPair ? selectedPair.name : t("trade.selectAsset")}
                  </p>
=======
          {/* Правая часть. На мобильных: ордер fixed внизу (всегда виден), активные сделки над ним */}
          <div className="flex flex-col-reverse xl:flex-col gap-2 xl:gap-5 min-h-0 max-h-[75vh] xl:max-h-none animate-fade-in-up stagger-2 opacity-0 absolute bottom-0 left-0 right-0 z-10 xl:static xl:z-0 overflow-y-auto overflow-x-hidden xl:overflow-visible pb-[72px] xl:pb-0">
            {/* Новый ордер — на мобильных fixed над нижней навигацией, всегда виден, очень компактный */}
            <div id="order-panel" className="xl:static fixed left-0 right-0 z-20 xl:z-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] xl:bottom-auto flex flex-col xl:flex-col gap-1 xl:gap-5 shrink-0 rounded-t-xl xl:rounded-2xl p-1.5 xl:p-6 transition-shadow duration-300 xl:hover:shadow-soft-glow/20 bg-slate-900/95 backdrop-blur-md border border-slate-700/50 border-t border-b-0 xl:border-b xl:border xl:bg-transparent xl:backdrop-blur-none xl:glass xl:pb-0">
              {/* Мобильные: одна строка — всё в одну линию: $сумма | время | LONG | SHORT */}
              <div className="xl:hidden flex items-center gap-1.5 flex-nowrap">
                <span className="text-[9px] text-slate-500 shrink-0">$</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-10 input-glass py-1 px-1.5 text-[13px] font-mono min-h-[28px] max-h-[28px] shrink-0"
                />
                <input
                  type="number"
                  min={60}
                  step={15}
                  value={duration}
                  onChange={(e) => setDuration(Math.max(60, Number(e.target.value) || 60))}
                  className="w-9 input-glass py-1 px-1.5 text-[13px] font-mono min-h-[28px] max-h-[28px] shrink-0"
                />
                <span className="text-[8px] text-slate-500 shrink-0">{t("trade.sec")}</span>
                <span className="text-[10px] font-mono text-accent shrink-0 ml-0.5">${formatBalance(user?.demoBalance)}</span>
                <div className="flex gap-1 flex-1 justify-end min-w-0">
                  <button
                    type="button"
                    className="flex-1 min-w-0 max-w-[70px] rounded-md min-h-[28px] py-1 text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 touch-manipulation disabled:opacity-70 transition-opacity"
                    disabled={placing}
                    onClick={() => place("LONG")}
                  >
                    {placing ? "…" : "LONG ↑"}
                  </button>
                  <button
                    type="button"
                    className="flex-1 min-w-0 max-w-[70px] rounded-md min-h-[28px] py-1 text-[11px] font-semibold bg-orange-500/95 hover:bg-orange-400 text-slate-950 touch-manipulation disabled:opacity-70 transition-opacity"
                    disabled={placing}
                    onClick={() => place("SHORT")}
                  >
                    {placing ? "…" : "SHORT ↓"}
                  </button>
>>>>>>> 346535b5c6ca07f3075f719c0dc37cd9bc5235bd
                </div>
              </div>
              <div className="hidden xl:contents">
                <div className="flex items-center justify-between gap-2 xl:gap-3 pb-0.5 xl:pb-3">
                  <div className="min-w-0 flex items-center gap-1.5 xl:gap-2 flex-1">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 xl:text-xs xl:text-slate-400 shrink-0">
                      {t("trade.newOrder")}
                    </h3>
                    <p className="text-[11px] xl:text-sm font-medium text-slate-200 truncate">
                      {selectedPair ? selectedPair.symbol : t("trade.selectAsset")}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] xl:text-[10px] uppercase tracking-wider text-slate-500">{t("trade.balance")}</p>
                    <p className="text-xs xl:text-base font-semibold text-accent font-mono tabular-nums">
                      ${formatBalance(user?.demoBalance)}
                    </p>
                  </div>
                </div>
              </div>

<<<<<<< HEAD
              <div className="grid grid-cols-1 gap-2 xl:gap-5">
                {/* Мобильные: сумма, время, кнопки LONG/SHORT — удобные зоны нажатия, быстрые чипы */}
                <div className="xl:hidden flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t("trade.amountLabel")}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={amount}
                        onChange={(e) =>
                          setAmount(Math.max(1, Number(e.target.value) || 1))
                        }
                        className="w-20 input-glass py-3 text-base font-mono min-h-[48px] touch-manipulation"
                      />
                      {[1, 5, 10, 25, 50].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setAmount(v)}
                          className={`chip rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center text-sm font-semibold touch-manipulation ${
                            amount === v ? "chip-active" : ""
                          }`}
                        >
                          ${v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t("trade.expiryLabel")}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={60}
                        step={15}
                        value={duration}
                        onChange={(e) =>
                          setDuration(Math.max(60, Number(e.target.value) || 60))
                        }
                        className="w-20 input-glass py-3 text-base font-mono min-h-[48px] touch-manipulation"
                      />
                      <span className="text-slate-500 text-xs">{t("trade.sec")}</span>
                      {[60, 120, 180].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setDuration(v)}
                          className={`chip rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center text-sm font-semibold touch-manipulation ${
                            duration === v ? "chip-active" : ""
                          }`}
                        >
                          {v}s
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      className="rounded-xl min-h-[52px] py-3.5 text-base font-bold bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] touch-manipulation"
                      disabled={placing}
                      onClick={() => place("LONG")}
                    >
                      LONG ↑
                    </button>
                    <button
                      type="button"
                      className="rounded-xl min-h-[52px] py-3.5 text-base font-bold bg-orange-500/95 hover:bg-orange-400 active:scale-[0.98] text-slate-950 shadow-[0_0_20px_rgba(249,115,22,0.3)] touch-manipulation"
                      disabled={placing}
                      onClick={() => place("SHORT")}
                    >
                      SHORT ↓
                    </button>
                  </div>
                </div>
=======
              <div className="hidden xl:grid grid-cols-1 gap-1.5 xl:gap-5">
>>>>>>> 346535b5c6ca07f3075f719c0dc37cd9bc5235bd
                <div className="hidden xl:block">
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2">
                    {t("trade.amountLabel")}
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
                      className="w-20 sm:w-24 input-glass py-3 xl:py-2.5 text-base xl:text-sm font-mono min-h-[48px] xl:min-h-0"
                    />
                    <div className="flex flex-wrap gap-2">
                      {[1, 5, 10, 25, 50].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setAmount(v)}
                          className={`chip rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2.5 xl:min-h-0 xl:min-w-0 text-sm xl:text-xs font-medium ${
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

                <div className="hidden xl:block">
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2">
                    {t("trade.expiryLabel")}
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
                      className="w-20 sm:w-24 input-glass py-3 xl:py-2.5 text-base xl:text-sm font-mono min-h-[48px] xl:min-h-0"
                    />
                    <span className="text-slate-500 text-xs">{t("trade.sec")}</span>
                    <div className="flex flex-wrap gap-2">
                      {[60, 120, 180].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setDuration(v)}
                          className={`chip rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2.5 xl:min-h-0 xl:min-w-0 text-sm xl:text-xs font-medium ${
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

                <div className="hidden xl:grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    className="rounded-xl min-h-[52px] xl:min-h-0 py-4 xl:py-3 text-base xl:text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all active:scale-[0.98] touch-manipulation disabled:opacity-70"
                    disabled={placing}
                    onClick={() => place("LONG")}
                  >
                    {placing ? "…" : "LONG ↑"}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl min-h-[52px] xl:min-h-0 py-4 xl:py-3 text-base xl:text-sm font-semibold bg-orange-500/95 hover:bg-orange-400 text-slate-950 shadow-[0_0_20px_rgba(249,115,22,0.25)] transition-all active:scale-[0.98] touch-manipulation disabled:opacity-70"
                    disabled={placing}
                    onClick={() => place("SHORT")}
                  >
                    {placing ? "…" : "SHORT ↓"}
                  </button>
                </div>

                {selectedPair && (
                  <p className="hidden xl:block text-[11px] text-slate-500 text-center">
                    {t("trade.entryPrice")}{" "}
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
            {/* Активные сделки — на мобильных под ордером, горизонтальный скролл карточек */}
            <div className="shrink-0 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overflow-visible overflow-x-hidden">
              <ActiveTrades />
            </div>
          </div>
        </div>

        {/* История сделок — только на ПК; на мобильных отдельная страница /history */}
        <div id="history" className="hidden xl:block shrink-0 mt-auto w-screen relative left-1/2 right-1/2 -translate-x-1/2 overflow-x-hidden scroll-mt-4">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <CompletedTrades />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

function ActiveTrades() {
  const { t } = useLocale();
  const active = useTradingStore((s) => s.activeTrades);

  return (
<<<<<<< HEAD
    <div className="flex flex-col min-h-0 flex-1 glass rounded-t-2xl xl:rounded-b-2xl p-3 xl:p-6">
=======
    <div className="flex flex-col min-h-0 flex-1 glass rounded-t-xl xl:rounded-b-2xl p-2.5 xl:p-6">
>>>>>>> 346535b5c6ca07f3075f719c0dc37cd9bc5235bd
      <div className="flex items-center justify-between mb-2 xl:mb-3 shrink-0">
        <h2 className="text-[10px] xl:text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t("trade.activeTradesTitle")}
        </h2>
        {active.length > 0 && (
          <span className="text-[9px] xl:text-[10px] text-slate-500">{active.length}</span>
        )}
      </div>

      {active.length === 0 ? (
        <div className="text-[11px] xl:text-xs text-slate-500 py-2 xl:py-4 text-center">
          {t("trade.noActiveHint")}
        </div>
      ) : (
        <>
          {/* Мобильные: компактная полоса, карточки вправо со скроллом */}
<<<<<<< HEAD
          <div className="xl:hidden overflow-x-auto overflow-y-hidden rounded-lg bg-slate-950/40 surface-scroll -mx-1 px-1">
            <div className="flex gap-1.5 pb-1.5">
              {active.map((trade) => (
                <div
                  key={trade.id}
                  className="flex shrink-0 items-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-slate-800/60 min-h-[40px]"
=======
          <div className="xl:hidden overflow-x-auto overflow-y-hidden rounded-lg bg-slate-950/40 surface-scroll -mx-0.5 px-0.5">
            <div className="flex gap-1.5 pb-1">
              {active.map((trade) => (
                <div
                  key={trade.id}
                  className="flex shrink-0 items-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-slate-800/60 min-h-[36px]"
>>>>>>> 346535b5c6ca07f3075f719c0dc37cd9bc5235bd
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-mono text-slate-100 text-[10px] truncate max-w-[50px]">
                      {trade.tradingPair?.symbol ?? trade.tradingPairId}
                    </span>
                    <span
                      className={`px-1 py-0.5 rounded text-[8px] font-medium shrink-0 ${
                        trade.direction === "LONG"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-orange-500/15 text-orange-400"
                      }`}
                    >
                      {trade.direction}
                    </span>
                  </div>
                  <span className="font-mono text-slate-300 text-[9px] shrink-0">${Number(trade.amount).toFixed(0)}</span>
                  <Countdown expiresAt={trade.expiresAt} compact />
                </div>
              ))}
            </div>
          </div>
          {/* ПК: обычная таблица */}
          <div className="hidden xl:block min-h-0 overflow-auto rounded-lg bg-slate-950/40 surface-scroll">
            <table className="min-w-full text-[11px]">
              <thead className="sticky top-0 z-10 glass-strong rounded-none text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">{t("trade.pair")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">$</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("trade.untilExpiry")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {active.map((tr) => (
                  <tr key={tr.id} className="hover:bg-slate-800/50 min-h-[44px]">
                    <td className="px-3 py-2.5 align-middle">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-100">
                          {tr.tradingPair?.symbol ?? tr.tradingPairId}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            tr.direction === "LONG"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-orange-500/15 text-orange-400"
                          }`}
                        >
                          {tr.direction}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                      ${Number(tr.amount).toFixed(0)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Countdown expiresAt={tr.expiresAt} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Countdown({ expiresAt, compact = false }: { expiresAt: string; compact?: boolean }) {
  const { t } = useLocale();
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
      {t("trade.untilExpiryFull")}{" "}
      <span className="font-mono text-accent">{diff.toString()} c</span>
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

