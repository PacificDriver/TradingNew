/**
 * Аналитические индикаторы для графика (TradingView-стиль).
 * Все функции принимают массив свечей с полями time (UTCTimestamp) и close.
 */

export type CandleLike = { time: number; close: number };
export type Point = { time: number; value: number };

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = sum(arr) / arr.length;
  const squaredDiffs = arr.map((x) => (x - mean) ** 2);
  return Math.sqrt(sum(squaredDiffs) / arr.length);
}

/** Простая скользящая средняя (SMA) */
export function sma(data: CandleLike[], period: number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push({ time: data[i].time, value: NaN });
    } else {
      let s = 0;
      for (let j = 0; j < period; j++) s += data[i - j].close;
      result.push({ time: data[i].time, value: s / period });
    }
  }
  return result;
}

/** Экспоненциальная скользящая средняя (EMA) */
export function ema(data: CandleLike[], period: number): Point[] {
  const k = 2 / (period + 1);
  const result: Point[] = [];
  let prev = data[0]?.close ?? NaN;
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      prev = data[0].close;
      result.push({ time: data[0].time, value: prev });
    } else {
      prev = (data[i].close - prev) * k + prev;
      result.push({ time: data[i].time, value: prev });
    }
  }
  return result;
}

/** RSI (Relative Strength Index), период по умолчанию 14 */
export function rsi(data: CandleLike[], period = 14): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push({ time: data[i].time, value: NaN });
      continue;
    }
    let gains = 0;
    let losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = data[j].close - data[j - 1].close;
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const value = 100 - 100 / (1 + rs);
    result.push({ time: data[i].time, value });
  }
  return result;
}

/** MACD: возвращает macdLine, signalLine, histogram */
export function macd(
  data: CandleLike[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): { macdLine: Point[]; signalLine: Point[]; histogram: Point[] } {
  const emaFast = ema(data, fast);
  const emaSlow = ema(data, slow);
  const macdLine: Point[] = emaFast.map((p, i) => ({
    time: p.time,
    value: p.value - emaSlow[i].value
  }));
  const k = 2 / (signalPeriod + 1);
  const signalLine: Point[] = [];
  let prevSignal = NaN;
  for (let i = 0; i < macdLine.length; i++) {
    const v = macdLine[i].value;
    if (!Number.isFinite(v)) {
      signalLine.push({ time: macdLine[i].time, value: NaN });
    } else if (Number.isNaN(prevSignal)) {
      prevSignal = v;
      signalLine.push({ time: macdLine[i].time, value: v });
    } else {
      prevSignal = (v - prevSignal) * k + prevSignal;
      signalLine.push({ time: macdLine[i].time, value: prevSignal });
    }
  }
  const histogram: Point[] = macdLine.map((p, i) => ({
    time: p.time,
    value: p.value - (signalLine[i]?.value ?? 0)
  }));
  return { macdLine, signalLine, histogram };
}

/** Bollinger Bands: middle (SMA), upper, lower */
export function bollingerBands(
  data: CandleLike[],
  period = 20,
  mult = 2
): { middle: Point[]; upper: Point[]; lower: Point[] } {
  const middle = sma(data, period);
  const upper: Point[] = [];
  const lower: Point[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push({ time: data[i].time, value: NaN });
      lower.push({ time: data[i].time, value: NaN });
    } else {
      const closes = data
        .slice(i - period + 1, i + 1)
        .map((c) => c.close);
      const std = stdDev(closes);
      const m = middle[i].value;
      upper.push({ time: data[i].time, value: m + mult * std });
      lower.push({ time: data[i].time, value: m - mult * std });
    }
  }
  return { middle, upper, lower };
}

/** Фильтр точек с числовым value (убираем NaN для отображения в lightweight-charts) */
export function filterNaN(points: Point[]): Point[] {
  return points.filter((p) => Number.isFinite(p.value));
}
