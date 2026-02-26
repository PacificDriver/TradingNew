"use client";

import { memo } from "react";
import { useLocale } from "../lib/i18n";
import { useTradingStore } from "../store/useTradingStore";

const MAX_VISIBLE_TRADES = 80;
function formatTradeTime(
  ts: string | number | Date,
  t: (k: string) => string,
  locale: string
) {
  const d = new Date(ts);
  return d.toLocaleDateString(locale === "en" ? "en-US" : "ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export const CompletedTrades = memo(function CompletedTrades() {
  const { t, locale } = useLocale();
  const completed = useTradingStore((s) => s.completedTrades);
  const visible = completed.slice(0, MAX_VISIBLE_TRADES);

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
              {t("trade.historyTitle")}
            </h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {t("trade.completedOrders")}
            </p>
          </div>
        </div>
        {completed.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-slate-800/80 px-2.5 py-1 text-[10px] font-medium text-slate-400 font-mono">
              {completed.length > MAX_VISIBLE_TRADES ? `${MAX_VISIBLE_TRADES}+` : completed.length}
            </span>
            <span className="text-[10px] text-slate-500">{t("trade.records")}</span>
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
          <p className="text-sm font-medium text-slate-400">{t("trade.noCompletedHint")}</p>
          <p className="text-xs text-slate-500 mt-1">{t("trade.noCompletedHint2")}</p>
        </div>
      ) : (
        <div className="h-[240px] overflow-y-auto overflow-x-auto surface-scroll">
          <table className="min-w-full text-[11px]">
            <thead className="sticky top-0 z-10 glass-strong rounded-none text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
              <tr>
                <th className="px-5 py-3 text-left font-medium w-24">{t("trade.time")}</th>
                <th className="px-5 py-3 text-left font-medium">{t("trade.pair")}</th>
                <th className="px-5 py-3 text-left font-medium">{t("trade.direction")}</th>
                <th className="px-5 py-3 text-right font-medium">{t("trade.amount")}</th>
                <th className="px-5 py-3 text-right font-medium">{t("trade.entry")}</th>
                <th className="px-5 py-3 text-right font-medium">{t("trade.exit")}</th>
                <th className="px-5 py-3 text-right font-medium">P/L</th>
                <th className="px-5 py-3 text-right font-medium w-20">{t("trade.result")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {visible.map((trade, i) => {
                const isWin = trade.status === "WIN";
                const pnl = isWin ? Number(trade.amount) : -Number(trade.amount);
                return (
                  <tr
                    key={trade.id}
                    className={`transition-colors hover:bg-slate-800/50 ${
                      i % 2 === 0 ? "bg-slate-950/30" : "bg-slate-950/50"
                    }`}
                  >
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                      {formatTradeTime(trade.expiresAt, t, locale)}
                    </td>
                    <td className="px-5 py-3 font-mono font-medium text-slate-100">
                      {trade.tradingPair?.symbol ?? trade.tradingPairId}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          trade.direction === "LONG"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-orange-500/15 text-orange-400"
                        }`}
                      >
                        {trade.direction === "LONG" ? "↑" : "↓"} {trade.direction}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-slate-200">
                      ${Number(trade.amount).toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-slate-400 tabular-nums">
                      {Number(trade.entryPrice).toFixed(5)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-slate-400 tabular-nums">
                      {trade.closePrice != null ? Number(trade.closePrice).toFixed(5) : "—"}
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
});
