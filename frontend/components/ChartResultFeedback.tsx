"use client";

import { useEffect, useState } from "react";
import { playWinSound } from "../lib/sounds";

const SHOW_MS = 2200;
const FADE_MS = 400;

type Props = {
  status: "WIN" | "LOSS";
  onDone: () => void;
  /** Воспроизвести звук при WIN (по умолчанию из настроек) */
  soundOn?: boolean;
};

export function ChartResultFeedback({ status, onDone, soundOn = true }: Props) {
  const [leaving, setLeaving] = useState(false);
  const [phase, setPhase] = useState<"pop" | "glow" | "hold">("pop");
  const isWin = status === "WIN";

  useEffect(() => {
    if (isWin && soundOn) playWinSound();
  }, [isWin, soundOn]);

  useEffect(() => {
    const t = setTimeout(() => setPhase("glow"), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setPhase("hold"), 550);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), SHOW_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onDone, FADE_MS);
    return () => clearTimeout(t);
  }, [leaving, onDone]);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 overflow-hidden"
      aria-live="polite"
      aria-label={isWin ? "Сделка выиграна" : "Сделка проиграна"}
    >
      {/* Фоновая пульсация */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          phase === "glow" || phase === "hold"
            ? "opacity-100"
            : "opacity-0"
        } ${phase === "glow" ? (isWin ? "animate-win-pulse" : "animate-loss-pulse") : ""} ${isWin ? "bg-emerald-500/10" : "bg-red-500/10"}`}
      />
      {/* Ripple-эффект от центра */}
      <div
        className={`absolute w-32 h-32 rounded-full ${
          isWin ? "bg-emerald-400/30" : "bg-red-400/30"
        } ${phase === "pop" ? "animate-result-ripple" : ""} ${leaving ? "scale-150 opacity-0" : ""}`}
      />
      {/* Основной текст WIN/LOSS */}
      <div
        className={`
          relative inline-flex items-center justify-center rounded-2xl px-8 py-4
          font-bold text-xl uppercase tracking-widest
          shadow-2xl backdrop-blur-md
          transition-all duration-300 ease-out
          ${leaving ? "scale-95 opacity-0" : "animate-chart-result-in"}
          ${isWin
            ? "bg-emerald-500/25 text-emerald-300 border-2 border-emerald-400/60 shadow-[0_0_40px_rgba(16,185,129,0.3)]"
            : "bg-red-500/25 text-red-300 border-2 border-red-400/60 shadow-[0_0_40px_rgba(239,68,68,0.25)]"
          }
        `}
      >
        <span className="drop-shadow-lg">{isWin ? "Win" : "Loss"}</span>
      </div>
    </div>
  );
}
