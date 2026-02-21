"use client";

import { useEffect, useState } from "react";

const SHOW_MS = 1800;
const FADE_MS = 400;

type Props = {
  status: "WIN" | "LOSS";
  onDone: () => void;
};

export function ChartResultFeedback({ status, onDone }: Props) {
  const [leaving, setLeaving] = useState(false);
  const isWin = status === "WIN";

  useEffect(() => {
    const t = setTimeout(() => {
      setLeaving(true);
    }, SHOW_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onDone, FADE_MS);
    return () => clearTimeout(t);
  }, [leaving, onDone]);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
      aria-live="polite"
      aria-label={isWin ? "Сделка выиграна" : "Сделка проиграна"}
    >
      <div
        className={`
          inline-flex items-center justify-center rounded-2xl px-6 py-3
          font-semibold text-lg uppercase tracking-wider
          shadow-lg backdrop-blur-sm
          transition-all duration-300 ease-out
          ${leaving ? "scale-95 opacity-0" : "animate-chart-result-in"}
          ${isWin
            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
            : "bg-red-500/20 text-red-400 border border-red-500/40"
          }
        `}
      >
        {isWin ? "Win" : "Loss"}
      </div>
    </div>
  );
}
