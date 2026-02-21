"use client";

import { useRouter, usePathname } from "next/navigation";
import { useMemo, useState, useRef, useEffect } from "react";
import { useTradingStore } from "../store/useTradingStore";

export function PairSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const pairs = useTradingStore((s) => s.pairs);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return pairs;
    const q = query.trim().toLowerCase();
    return pairs.filter(
      (p) =>
        p.symbol.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    );
  }, [pairs, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const setChartSettings = useTradingStore((s) => s.setChartSettings);
  const addRecentPair = useTradingStore((s) => s.addRecentPair);
  const setOpenPairSelector = useTradingStore((s) => s.setOpenPairSelector);

  const isOnTradePage = pathname === "/trade";
  const showDropdown = !isOnTradePage && open && (focused || query.length > 0);

  const handleFocus = () => {
    if (isOnTradePage) {
      setOpenPairSelector(true);
      setOpen(false);
      return;
    }
    setFocused(true);
    setOpen(true);
  };

  const handleSelectPair = (pair: { id: number }) => {
    setChartSettings({ selectedPairId: pair.id });
    addRecentPair(pair.id);
    const url = `/trade?pairId=${pair.id}`;
    if (pathname === "/trade") {
      router.replace(url, { scroll: false });
    } else {
      router.push(url);
    }
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xs md:max-w-sm">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (isOnTradePage) setOpenPairSelector(true);
            else setOpen(true);
          }}
          onFocus={handleFocus}
          onBlur={() => setFocused(false)}
          placeholder={isOnTradePage ? "Поиск пар — откроет выбор у графика" : "Поиск пар — откроется на графике"}
          className="input-glass py-2 pl-9 pr-3"
        />
      </div>
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-[100] mt-1.5 max-h-80 overflow-hidden rounded-xl glass-strong shadow-2xl animate-scale-in opacity-0 origin-top">
          <div className="border-b border-slate-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              Все пары · клик — открыть на графике
            </p>
          </div>
          <div className="max-h-56 overflow-y-auto py-1 surface-scroll">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                Ничего не найдено
              </div>
            ) : (
              filtered.map((pair) => (
                <button
                  key={pair.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-800/80"
                  onClick={() => handleSelectPair(pair)}
                >
                  <span className="font-mono font-medium text-slate-100">
                    {pair.symbol}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                    {pair.name}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {Number(pair.currentPrice).toFixed(2)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
