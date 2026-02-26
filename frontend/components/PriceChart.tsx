"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import {
  LineStyle,
  LineType,
  LastPriceAnimationMode,
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type CandlestickData,
  type Time,
  type UTCTimestamp
} from "lightweight-charts";
import {
  sma,
  rsi,
  macd,
  bollingerBands,
  filterNaN,
  type CandleLike
} from "../lib/chartIndicators";

type MarkerKind = "entry" | "exit";

type CandlePoint = {
  startTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type EntryMarker = {
  id: number;
  kind: MarkerKind;
  ts: number;
  price: number;
  direction: "LONG" | "SHORT";
  status: "ACTIVE" | "WIN" | "LOSS";
  isLatest?: boolean;
};

type ChartMode = "line" | "candles";

type Props = {
  candles: CandlePoint[];
  markers?: EntryMarker[];
  mode?: ChartMode;
  loading?: boolean;
  error?: string | null;
  /** Индикаторы (выключены по умолчанию) */
  showMA?: boolean;
  showRSI?: boolean;
  showMACD?: boolean;
  showBB?: boolean;
  /** На мобильных — без рамки и скруглений (график «без краёв») */
  containerClassName?: string;
};

const DARK_THEME = {
  layout: {
    background: { color: "transparent" },
    textColor: "#94a3b8",
    attributionLogo: false
  },
  grid: {
    vertLines: { color: "#1e293b" },
    horzLines: { color: "#1e293b" }
  },
  rightPriceScale: {
    scaleMargins: { top: 0.1, bottom: 0.1 },
    borderVisible: false,
    entireTextOnly: false
  },
  timeScale: {
    borderVisible: false,
    timeVisible: true,
    secondsVisible: true,
    rightOffset: 12,
    barSpacing: 6,
    minBarSpacing: 2,
    fixLeftEdge: false,
    fixRightEdge: false,
    lockVisibleTimeRangeOnResize: true
  },
  crosshair: {
    vertLine: {
      color: "#475569",
      width: 1,
      style: 2,
      labelBackgroundColor: "#334155"
    },
    horzLine: {
      color: "#475569",
      width: 1,
      style: 2,
      labelBackgroundColor: "#334155"
    }
  }
};

/**
 * График на TradingView Lightweight Charts: свечи/линия, маркеры сделок, ценовые линии.
 */
function PriceChartInner({
  candles,
  markers = [],
  mode = "candles",
  loading = false,
  error = null,
  showMA = false,
  showRSI = false,
  showMACD = false,
  showBB = false,
  containerClassName
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | ISeriesApi<"Area"> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<ReturnType<ISeriesApi<"Line">["createPriceLine"]>[]>([]);
  const shouldFitOnNextDataRef = useRef(true);
  const indicatorSeriesRef = useRef<{
    ma: ISeriesApi<"Line"> | null;
    bbMiddle: ISeriesApi<"Line"> | null;
    bbUpper: ISeriesApi<"Line"> | null;
    bbLower: ISeriesApi<"Line"> | null;
    rsi: ISeriesApi<"Line"> | null;
    macdHist: ISeriesApi<"Histogram"> | null;
    macdLine: ISeriesApi<"Line"> | null;
    signalLine: ISeriesApi<"Line"> | null;
  }>({
    ma: null,
    bbMiddle: null,
    bbUpper: null,
    bbLower: null,
    rsi: null,
    macdHist: null,
    macdLine: null,
    signalLine: null
  });
  const panesAddedRef = useRef(false);

  const normalizedCandles = useMemo(() => {
    const sorted = [...candles].sort((a, b) => a.startTime - b.startTime);
    const byTime = new Map<number, CandlePoint>();
    for (const candle of sorted) {
      byTime.set(candle.startTime, candle);
    }
    return [...byTime.values()]
      .sort((a, b) => a.startTime - b.startTime)
      .map((c): CandlestickData => ({
        time: Math.floor(c.startTime / 1000) as UTCTimestamp,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close)
      }));
  }, [candles]);

  const chartMarkers = useMemo(
    () =>
      markers.map((m) => ({
        time: Math.floor(m.ts / 1000) as UTCTimestamp,
        position: ("inBar" as const),
        price: Number(m.price),
        color:
          m.direction === "LONG"
            ? "rgba(34, 197, 94, 0.72)"
            : "rgba(239, 68, 68, 0.72)",
        shape: m.direction === "LONG" ? ("arrowUp" as const) : ("arrowDown" as const),
        size: 0.45,
        text: ""
      })),
    [markers]
  );

  const candleLike = useMemo<CandleLike[]>(
    () =>
      normalizedCandles.map((c) => ({
        time: Number(c.time),
        close: Number(c.close)
      })),
    [normalizedCandles]
  );

  const indicatorData = useMemo(() => {
    if (candleLike.length < 20) return null;
    const ma20 = filterNaN(sma(candleLike, 20));
    const bb = bollingerBands(candleLike, 20, 2);
    const rsiData = filterNaN(rsi(candleLike, 14));
    const macdData = macd(candleLike, 12, 26, 9);
    return {
      ma: ma20,
      bbMiddle: filterNaN(bb.middle),
      bbUpper: filterNaN(bb.upper),
      bbLower: filterNaN(bb.lower),
      rsi: rsiData,
      macdLine: filterNaN(macdData.macdLine),
      signalLine: filterNaN(macdData.signalLine),
      histogram: macdData.histogram.map((p) => ({
        time: p.time,
        value: p.value,
        color: p.value >= 0 ? "rgba(14, 203, 129, 0.6)" : "rgba(246, 70, 93, 0.6)"
      }))
    };
  }, [candleLike]);

  function clearPriceLines() {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) {
      series.removePriceLine(line);
    }
    priceLinesRef.current = [];
  }

  function applyPriceLines(latestClose: number) {
    const series = seriesRef.current;
    if (!series) return;
    clearPriceLines();
    const activeEntries = markers.filter((m) => m.kind === "entry" && m.status === "ACTIVE");
    priceLinesRef.current = activeEntries.map((m) => {
      const inProfit =
        m.direction === "LONG" ? latestClose > m.price : latestClose < m.price;
      return series.createPriceLine({
        price: Number(m.price),
        color: inProfit ? "#0ECB81" : "#F6465D",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed
      });
    });
  }

  function applyDataAndAnnotations() {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !normalizedCandles.length) return;

    if (mode === "candles") {
      (series as ISeriesApi<"Candlestick">).setData(normalizedCandles);
    } else {
      (series as ISeriesApi<"Line"> | ISeriesApi<"Area">).setData(
        normalizedCandles.map((c) => ({ time: c.time, value: c.close }))
      );
    }

    const latestClose = Number(normalizedCandles[normalizedCandles.length - 1].close);
    applyPriceLines(latestClose);
    markersPluginRef.current?.setMarkers(chartMarkers);

    const ind = indicatorSeriesRef.current;
    const toLineData = (arr: { time: number; value: number }[]) =>
      arr as { time: Time; value: number }[];
    if (indicatorData) {
      ind.ma?.setData(toLineData(indicatorData.ma));
      ind.bbMiddle?.setData(toLineData(indicatorData.bbMiddle));
      ind.bbUpper?.setData(toLineData(indicatorData.bbUpper));
      ind.bbLower?.setData(toLineData(indicatorData.bbLower));
      ind.rsi?.setData(toLineData(indicatorData.rsi));
      ind.macdLine?.setData(toLineData(indicatorData.macdLine));
      ind.signalLine?.setData(toLineData(indicatorData.signalLine));
      ind.macdHist?.setData(indicatorData.histogram as { time: Time; value: number; color?: string }[]);
    } else {
      ind.ma?.setData([]);
      ind.bbMiddle?.setData([]);
      ind.bbUpper?.setData([]);
      ind.bbLower?.setData([]);
      ind.rsi?.setData([]);
      ind.macdLine?.setData([]);
      ind.signalLine?.setData([]);
      ind.macdHist?.setData([]);
    }

    const ts = chart.timeScale();
    if (shouldFitOnNextDataRef.current) {
      ts.fitContent();
      const n = normalizedCandles.length;
      const rightOffset = 12;
      const visibleBars = 80;
      ts.setVisibleLogicalRange({
        from: Math.max(0, n - visibleBars),
        to: n + rightOffset
      });
      shouldFitOnNextDataRef.current = false;
    }
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      ...DARK_THEME,
      width: container.clientWidth,
      height: container.clientHeight,
      autoSize: true
    } as Parameters<typeof createChart>[1]);
    chartRef.current = chart;

    let rafId: number | undefined;
    const observer = new ResizeObserver(() => {
      rafId = requestAnimationFrame(() => {
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
      });
    });
    observer.observe(container);

    return () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      observer.disconnect();
      clearPriceLines();
      markersPluginRef.current = null;
      seriesRef.current = null;
      panesAddedRef.current = false;
      indicatorSeriesRef.current = {
        ma: null,
        bbMiddle: null,
        bbUpper: null,
        bbLower: null,
        rsi: null,
        macdHist: null,
        macdLine: null,
        signalLine: null
      };
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const ind = indicatorSeriesRef.current;

    clearPriceLines();
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }

    const removeSeries = (s: ISeriesApi<"Line"> | ISeriesApi<"Histogram"> | null) => {
      if (s) {
        chart.removeSeries(s);
      }
    };

    if (!showMA && ind.ma) {
      removeSeries(ind.ma);
      ind.ma = null;
    }
    if (!showBB) {
      [ind.bbMiddle, ind.bbUpper, ind.bbLower].forEach((s) => {
        if (s) {
          chart.removeSeries(s);
        }
      });
      ind.bbMiddle = null;
      ind.bbUpper = null;
      ind.bbLower = null;
    }
    if (!showRSI && ind.rsi) {
      removeSeries(ind.rsi);
      ind.rsi = null;
    }
    if (!showMACD) {
      [ind.macdHist, ind.macdLine, ind.signalLine].forEach((s) => {
        if (s) chart.removeSeries(s);
      });
      ind.macdHist = null;
      ind.macdLine = null;
      ind.signalLine = null;
    }

    const needPanes = showRSI || showMACD;
    if (needPanes && !panesAddedRef.current) {
      chart.addPane(false);
      chart.addPane(false);
      const panes = chart.panes();
      if (panes[0]) panes[0].setStretchFactor(0.55);
      if (panes[1]) panes[1].setStretchFactor(0.22);
      if (panes[2]) panes[2].setStretchFactor(0.23);
      panesAddedRef.current = true;
    } else if (!needPanes && panesAddedRef.current) {
      if (chart.panes().length >= 3) {
        chart.removePane(2);
        chart.removePane(1);
      }
      panesAddedRef.current = false;
    }

    if (showMA && !ind.ma) {
      ind.ma = chart.addSeries(LineSeries, {
        color: "#818cf8",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceScaleId: "right",
        lastValueVisible: true,
        priceLineVisible: false
      }, 0);
    }
    if (showBB && !ind.bbMiddle) {
      ind.bbMiddle = chart.addSeries(LineSeries, {
        color: "rgba(251, 191, 36, 0.9)",
        lineWidth: 1,
        priceScaleId: "right",
        lastValueVisible: false,
        priceLineVisible: false
      }, 0);
      ind.bbUpper = chart.addSeries(LineSeries, {
        color: "rgba(251, 191, 36, 0.5)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceScaleId: "right",
        lastValueVisible: false,
        priceLineVisible: false
      }, 0);
      ind.bbLower = chart.addSeries(LineSeries, {
        color: "rgba(251, 191, 36, 0.5)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceScaleId: "right",
        lastValueVisible: false,
        priceLineVisible: false
      }, 0);
    }
    if (showRSI && !ind.rsi && panesAddedRef.current) {
      ind.rsi = chart.addSeries(LineSeries, {
        color: "#a78bfa",
        lineWidth: 2,
        priceScaleId: "rsi",
        lastValueVisible: true,
        priceLineVisible: true
      }, 1);
      chart.priceScale("rsi", 1).applyOptions({
        scaleMargins: { top: 0.1, bottom: 0.1 },
        borderVisible: false,
        entireTextOnly: false
      });
    }
    if (showMACD && !ind.macdHist && panesAddedRef.current) {
      ind.macdHist = chart.addSeries(HistogramSeries, {
        priceScaleId: "macd",
        base: 0
      }, 2);
      ind.macdLine = chart.addSeries(LineSeries, {
        color: "#0ea5e9",
        lineWidth: 2,
        priceScaleId: "macd",
        lastValueVisible: true,
        priceLineVisible: false
      }, 2);
      ind.signalLine = chart.addSeries(LineSeries, {
        color: "#f97316",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceScaleId: "macd",
        lastValueVisible: false,
        priceLineVisible: false
      }, 2);
      chart.priceScale("macd", 2).applyOptions({
        scaleMargins: { top: 0.2, bottom: 0.2 },
        borderVisible: false
      });
    }

    if (mode === "candles") {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#0ECB81",
        downColor: "#F6465D",
        wickUpColor: "#0ECB81",
        wickDownColor: "#F6465D",
        borderUpColor: "#0ECB81",
        borderDownColor: "#F6465D"
      }, 0);
      seriesRef.current = series as ISeriesApi<"Candlestick">;
      markersPluginRef.current = createSeriesMarkers(series, []);
    } else {
      // Area series: линия + заливка области под ней по мере продвижения
      const series = chart.addSeries(AreaSeries, {
        topColor: "rgba(14, 203, 129, 0.4)",
        bottomColor: "rgba(14, 203, 129, 0)",
        lineColor: "#0ECB81",
        lineWidth: 3,
        lineType: LineType.Curved,
        lineStyle: LineStyle.Solid,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 5,
        crosshairMarkerBorderWidth: 2,
        crosshairMarkerBorderColor: "#0ECB81",
        crosshairMarkerBackgroundColor: "#0f172a",
        lastValueVisible: true,
        priceLineVisible: true,
        pointMarkersVisible: false,
        lastPriceAnimation: LastPriceAnimationMode.Continuous
      }, 0);
      seriesRef.current = series as ISeriesApi<"Area">;
      markersPluginRef.current = createSeriesMarkers(series, []);
    }

    shouldFitOnNextDataRef.current = true;
    applyDataAndAnnotations();
  }, [mode, showMA, showRSI, showMACD, showBB]);

  useEffect(() => {
    applyDataAndAnnotations();
  }, [normalizedCandles, chartMarkers, mode]);

  const overlay = loading ? (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center glass rounded-xl"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
        <span className="text-xs text-slate-400">Загрузка графика…</span>
      </div>
    </div>
  ) : error ? (
    <div className="absolute inset-0 z-10 flex items-center justify-center glass rounded-xl px-4">
      <div className="text-center">
        <p className="text-sm text-red-400/90">{error}</p>
        <p className="mt-1 text-xs text-slate-500">
          Смените пару или таймфрейм для повтора
        </p>
      </div>
    </div>
  ) : !candles.length ? (
    <div className="absolute inset-0 z-10 flex items-center justify-center glass rounded-xl text-sm text-slate-500">
      Ожидание данных цены…
    </div>
  ) : null;

  return (
    <div
      className={
        containerClassName
          ? `h-full min-h-[380px] w-full overflow-hidden relative ${containerClassName}`
          : "h-full min-h-[380px] w-full rounded-xl glass overflow-hidden relative"
      }
    >
      {overlay}
      <div ref={containerRef} className="w-full h-full min-h-0" />
    </div>
  );
}

export const PriceChart = memo(PriceChartInner);
