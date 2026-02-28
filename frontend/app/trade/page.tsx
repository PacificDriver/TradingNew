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
  Trade,
  type TradeStatus
} from "../../store/useTradingStore";
import { SettledResultOverlay } from "../../components/SettledResultOverlay";
import { ChartResultFeedback } from "../../components/ChartResultFeedback";
import { CompletedTrades } from "../../components/CompletedTrades";
import { PairSelectDropdown } from "../../components/PairSelectDropdown";
import { apiFetch, authHeaders, isAuthError, getDisplayMessage } from "../../lib/api";
import { useLocale } from "../../lib/i18n";

function ChartSkeleton() {
  return (
    <div className="min-h-[260px] sm:min-h-[320px] xl:min-h-[380px] w-full rounded-xl overflow-hidden bg-slate-900/40 animate-pulse relative">
      <div className="absolute inset-0 flex flex-col p-3">
        <div className="h-4 w-24 rounded bg-slate-700/60 shrink-0" />
        <div className="flex-1 flex items-end justify-around gap-1 px-2 pb-6">
          {[40, 55, 45, 60, 50, 55, 45, 55, 48].map((h, i) => (
            <div
              key={i}
              className="flex-1 max-w-4 rounded-t bg-slate-700/50 min-h-[20%]"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const PriceChart = dynamic(
  () => import("../../components/PriceChart").then((m) => ({ default: m.PriceChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
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
  /** Панель ордера: false = развёрнута, true = свёрнута (только ручка + кнопки LONG/SHORT) */
  const [mobileOrderCollapsed, setMobileOrderCollapsed] = useState(false);
  /** Режим fullscreen графика (мобильные) */
  const [chartFullscreen, setChartFullscreen] = useState(false);
  /** Открытый выпадающий список в 70% зоне */
  const [openDropdown, setOpenDropdown] = useState<"chart" | "timeframe" | "indicators" | null>(null);
  const orderSheetRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
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
      .filter((p) => p != null);
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

  // Закрытие выпадающих списков по клику снаружи
  useEffect(() => {
    if (openDropdown == null) return;
    const onPointerDown = (e: PointerEvent) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpenDropdown(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [openDropdown]);

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
      const res = await apiFetch<{ trade?: Record<string, unknown>; balance: number }>("/trade/open", {
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

  /* Нижний отступ для графика — new order фиксирован внизу, не перекрывает график */
  const chartAreaPadding = mobileOrderCollapsed
    ? "pb-[calc(110px+env(safe-area-inset-bottom,0px))] xl:pb-0"
    : "pb-[calc(170px+env(safe-area-inset-bottom,0px))] xl:pb-0";

  const content = (
    <>
      <WebSocketBridge />
      <SettledResultOverlay />
      {/* Fullscreen график (мобильные) */}
      {chartFullscreen && (
        <div className="xl:hidden fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 shrink-0">
            <span className="font-mono text-slate-200">{selectedPair?.symbol ?? "—"}</span>
            <button
              type="button"
              onClick={() => setChartFullscreen(false)}
              className="flex items-center justify-center w-10 h-10 rounded-lg glass text-slate-400 hover:text-slate-200 touch-manipulation"
              aria-label={t("trade.exitFullscreen")}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 min-h-0 p-2">
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
              containerClassName="rounded-xl glass h-full"
            />
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col min-h-0 gap-0 xl:gap-6 mt-1 sm:mt-2 xl:mt-4 pb-0 xl:pb-0">
        {/* Верхняя часть: график + ордер. На мобильных: ордер наезжает на график снизу и всегда виден */}
        <div className="relative grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(340px,380px)] gap-0 xl:gap-6 min-h-0 xl:min-h-[480px] flex-1 items-stretch">
          {/* Левая часть — пара + график. На мобильных без рамки, график во всю ширину */}
          <div className="flex flex-col gap-2 xl:gap-4 min-h-0 min-w-0 overflow-hidden flex-1 rounded-none border-0 bg-transparent px-2 sm:px-3 py-2 -mx-2 sm:-mx-1 xl:mx-0 xl:glass xl:rounded-2xl xl:p-6 animate-fade-in-up stagger-1 opacity-0 transition-shadow duration-300 xl:hover:shadow-soft-glow/30">
            {/* Верхняя строка: выбор пары 30% + остальные кнопки 70% */}
            <div className="flex items-center gap-2 sm:gap-3 flex-nowrap w-full shrink-0">
              {/* Выбор криптовалюты — 30% ширины */}
              <div className="w-[30%] min-w-0 shrink-0 flex items-center">
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
                    fullWidthOverlay
                  />
                ) : (
                  <span className="text-[11px] text-slate-500">{t("trade.selectPairInHeader")}</span>
                )}
              </div>
              {/* 3 выпадающих списка — 70% */}
              <div
                ref={dropdownRef}
                className="flex-1 min-w-0 flex items-center gap-2 overflow-visible"
              >
                {/* 1. Chart */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown((d) => (d === "chart" ? null : "chart"))}
                    className="chip min-h-[34px] px-2.5 text-[11px] py-1.5 flex items-center gap-1 touch-manipulation"
                  >
                    <span>{chartMode === "line" ? t("trade.line") : t("trade.candles")}</span>
                    <svg className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${openDropdown === "chart" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openDropdown === "chart" && (
                    <div className="absolute top-full left-0 mt-1 min-w-[120px] py-1 rounded-lg glass border border-slate-600/60 shadow-xl z-50">
                      <button
                        type="button"
                        onClick={() => { setChartSettings({ chartMode: "line" }); setOpenDropdown(null); }}
                        className={`w-full text-left px-3 py-2 text-[11px] ${chartMode === "line" ? "text-emerald-400 font-medium" : "text-slate-300"}`}
                      >
                        {t("trade.line")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setChartSettings({ chartMode: "candles" }); setOpenDropdown(null); }}
                        className={`w-full text-left px-3 py-2 text-[11px] ${chartMode === "candles" ? "text-emerald-400 font-medium" : "text-slate-300"}`}
                      >
                        {t("trade.candles")}
                      </button>
                    </div>
                  )}
                </div>
                {/* 2. Timeframe */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown((d) => (d === "timeframe" ? null : "timeframe"))}
                    className="chip min-h-[34px] px-2.5 text-[11px] py-1.5 flex items-center gap-1 touch-manipulation"
                  >
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
                    <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform ${openDropdown === "timeframe" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openDropdown === "timeframe" && (
                    <div className="absolute top-full left-0 mt-1 min-w-[90px] py-1 rounded-lg glass border border-slate-600/60 shadow-xl z-50 max-h-[40vh] overflow-y-auto overscroll-contain">
                      {TIMEFRAMES.map((tf) => (
                        <button
                          key={tf}
                          type="button"
                          onClick={() => { setChartSettings({ timeframe: tf }); setOpenDropdown(null); }}
                          className={`w-full text-left px-3 py-2 text-[11px] ${timeframe === tf ? "text-emerald-400 font-medium" : "text-slate-300"}`}
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
                {/* 3. Indicators */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown((d) => (d === "indicators" ? null : "indicators"))}
                    className="chip min-h-[34px] px-2.5 text-[11px] py-1.5 flex items-center gap-1 touch-manipulation"
                  >
                    <span>{[showMA && "MA", showRSI && "RSI", showMACD && "MACD", showBB && "BB"].filter(Boolean).join(", ") || "—"}</span>
                    <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform ${openDropdown === "indicators" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openDropdown === "indicators" && (
                    <div className="absolute top-full left-0 mt-1 min-w-[100px] py-1 rounded-lg glass border border-slate-600/60 shadow-xl z-50">
                      {[
                        { key: "ma" as const, label: "MA", on: showMA, set: (v: boolean) => setChartSettings({ showMA: v }) },
                        { key: "rsi" as const, label: "RSI", on: showRSI, set: (v: boolean) => setChartSettings({ showRSI: v }) },
                        { key: "macd" as const, label: "MACD", on: showMACD, set: (v: boolean) => setChartSettings({ showMACD: v }) },
                        { key: "bb" as const, label: "BB", on: showBB, set: (v: boolean) => setChartSettings({ showBB: v }) }
                      ].map(({ label, on, set }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => { set(!on); setOpenDropdown(null); }}
                          className={`w-full text-left px-3 py-2 text-[11px] flex items-center justify-between ${on ? "text-emerald-400 font-medium" : "text-slate-300"}`}
                        >
                          {label}
                          {on && <span className="text-emerald-400">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedPair && (
                  <div className="ml-auto flex items-center gap-2 shrink-0 border-l border-slate-700/50 pl-2">
                    <span className="text-[10px] text-slate-500">{t("trade.currentPrice")}</span>
                    <span className="text-sm font-semibold text-accent font-mono">
                      {Number.isNaN(Number(selectedPair.currentPrice)) ? "-" : Number(selectedPair.currentPrice).toFixed(5)}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setChartFullscreen(true)}
                  className="xl:hidden chip min-h-[34px] min-w-[34px] flex items-center justify-center shrink-0 touch-manipulation"
                  aria-label={t("trade.fullscreenChart")}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Область графика — сразу после строки контролов */}
              <div className={"mt-2 min-h-[200px] sm:min-h-[260px] xl:min-h-[380px] flex-1 w-full min-w-0 overflow-x-auto overflow-y-hidden xl:overflow-hidden flex flex-col relative surface-scroll transition-[padding-bottom] duration-300 " + chartAreaPadding}>
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
              {lastSettledResult && (
                <ChartResultFeedback
                  status={lastSettledResult.status}
                  onDone={clearLastSettledResult}
                />
              )}
              </div>
              </div>
            </div>

          {/* Правая часть. На мобильных: fixed внизу с safe-area; на ПК — обычная колонка */}
          <div
            ref={orderSheetRef}
            className="flex flex-col-reverse xl:flex-col gap-0 xl:gap-5 min-h-0 xl:max-h-none animate-fade-in-up stagger-2 opacity-0 fixed xl:static bottom-0 left-0 right-0 z-20 xl:z-0 xl:bottom-auto xl:left-auto xl:right-auto max-h-[85vh] xl:max-h-none overflow-hidden xl:overflow-visible overscroll-contain"
            style={{
              paddingBottom: "env(safe-area-inset-bottom, 0px)"
            }}
          >
            {/* Новый ордер — bottom sheet на мобильных с sticky низом */}
            <div
              className="flex flex-col gap-2 xl:gap-5 shrink-0 rounded-t-2xl xl:rounded-2xl p-3 sm:p-4 xl:p-6 transition-shadow duration-300 xl:hover:shadow-soft-glow/20 bg-slate-900/97 backdrop-blur-md border border-slate-700/50 border-t border-slate-600/40 xl:border-t xl:border-b-0 xl:bg-transparent xl:backdrop-blur-none xl:border xl:border-slate-700/50 xl:glass shadow-[0_-4px_24px_rgba(0,0,0,0.3)] xl:shadow-none touch-manipulation"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
            >
              {/* Мобильные: ручка для сворачивания */}
              <button
                type="button"
                onClick={() => setMobileOrderCollapsed((c) => !c)}
                onTouchEnd={(e) => e.currentTarget.blur()}
                className="xl:hidden flex items-center justify-center py-2 -mt-1 -mx-2 touch-manipulation active:bg-slate-800/50 rounded-t-2xl transition-colors min-h-[36px]"
                aria-label={mobileOrderCollapsed ? t("trade.expandOrder") : t("trade.collapseOrder")}
              >
                <div className="w-8 h-0.5 rounded-full bg-slate-600" />
              </button>

              <div className="grid grid-cols-1 gap-2 xl:gap-3">
                {/* Строка: сумма + время — в одну линию на всех экранах */}
                {!mobileOrderCollapsed && (
                <div className="flex flex-row gap-2 sm:gap-3 w-full">
                  <div className="flex flex-1 w-1/2 min-w-0 items-center gap-1.5">
                    <span className="text-slate-500 text-xs sm:text-sm shrink-0">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step={1}
                      value={amount}
                      onChange={(e) =>
                        setAmount(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="flex-1 min-w-0 input-glass py-2 sm:py-2.5 text-sm sm:text-base font-mono min-h-[36px] sm:min-h-[40px] text-center"
                    />
                  </div>
                  <div className="flex flex-1 w-1/2 min-w-0 items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={60}
                      step={15}
                      value={duration}
                      onChange={(e) =>
                        setDuration(Math.max(60, Number(e.target.value) || 60))
                      }
                      className="flex-1 min-w-0 input-glass py-2 sm:py-2.5 text-sm sm:text-base font-mono min-h-[36px] sm:min-h-[40px] text-center"
                    />
                    <span className="text-slate-500 text-xs sm:text-sm shrink-0">{t("trade.sec")}</span>
                  </div>
                </div>
                )}
                {/* Кнопки LONG / SHORT */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <button
                    type="button"
                    className="rounded-xl min-h-[48px] sm:min-h-[52px] py-3 text-base font-semibold bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 touch-manipulation shadow-[0_0_16px_rgba(16,185,129,0.2)] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    disabled={placing}
                    onClick={() => place("LONG")}
                  >
                    {placing ? (
                      <span className="h-5 w-5 rounded-full border-2 border-slate-900/30 border-t-slate-900 animate-spin" />
                    ) : null}
                    LONG ↑
                  </button>
                  <button
                    type="button"
                    className="rounded-xl min-h-[48px] sm:min-h-[52px] py-3 text-base font-semibold bg-orange-500/95 hover:bg-orange-400 active:scale-[0.98] text-slate-950 touch-manipulation shadow-[0_0_16px_rgba(249,115,22,0.2)] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    disabled={placing}
                    onClick={() => place("SHORT")}
                  >
                    {placing ? (
                      <span className="h-5 w-5 rounded-full border-2 border-slate-900/30 border-t-slate-900 animate-spin" />
                    ) : null}
                    SHORT ↓
                  </button>
                </div>

                {selectedPair && (
                  <p className="text-[11px] text-slate-500 text-center">
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
            {/* Активные сделки — выше ордера, прокручиваются если много; ордер всегда внизу */}
            <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-visible overscroll-contain xl:flex-none">
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
    </>
  );
  const Guard = AuthGuard;
  return <Guard>{content}</Guard>;
}

function ActiveTrades() {
  const { t } = useLocale();
  const active = useTradingStore((s) => s.activeTrades);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col min-h-0 glass rounded-xl xl:rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between w-full py-2 px-3 sm:px-4 min-h-[40px] shrink-0 hover:bg-slate-800/40 active:bg-slate-800/60 transition-colors touch-manipulation"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("trade.activeTradesTitle")}
        </span>
        <span className="flex items-center gap-1.5">
          {active.length > 0 && (
            <span className="text-[10px] text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded">
              {active.length}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-700/50 p-2 sm:p-3 max-h-[200px] overflow-y-auto overflow-x-hidden surface-scroll">
          {active.length === 0 ? (
            <div className="text-[11px] text-slate-500 py-3 text-center">
              {t("trade.noActiveHint")}
            </div>
          ) : (
            <>
              {/* Компактный список — одна строка на сделку */}
              <div className="flex flex-col gap-1">
                {active.map((trade) => (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-slate-800/40 text-[11px]"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 shrink">
                      <span className="font-mono text-slate-100 truncate max-w-[60px] sm:max-w-[80px]">
                        {trade.tradingPair?.symbol ?? trade.tradingPairId}
                      </span>
                      <span
                        className={`px-1 py-0.5 rounded text-[9px] font-medium shrink-0 ${
                          trade.direction === "LONG"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-orange-500/15 text-orange-400"
                        }`}
                      >
                        {trade.direction}
                      </span>
                    </div>
                    <span className="font-mono text-slate-300 shrink-0">${Number(trade.amount).toFixed(0)}</span>
                    <Countdown expiresAt={trade.expiresAt} compact />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
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

