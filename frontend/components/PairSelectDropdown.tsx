"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { TradingPair } from "../store/useTradingStore";

const MAX_FAVORITES = 10;
const MAX_RECENT = 3;

type Props = {
  pairs: TradingPair[];
  selectedPair: TradingPair | null;
  onSelectPair: (pair: TradingPair) => void;
  favoritePairIds: number[];
  recentPairIds: number[];
  toggleFavoritePair: (pairId: number) => void;
  addRecentPair: (pairId: number) => void;
  /** Открыть выпадающий список по запросу (из поиска в шапке) */
  openRequest?: boolean;
  onOpenRequestConsumed?: () => void;
};

function PairRow({
  pair,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite
}: {
  pair: TradingPair;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-800/80 ${
        isSelected ? "bg-accent/10" : ""
      }`}
    >
      <span
        className={`font-mono text-sm font-medium ${
          isSelected ? "text-accent" : "text-slate-100"
        }`}
      >
        {pair.symbol}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
        {pair.name}
      </span>
      <span className="text-xs font-mono text-slate-400">
        {Number(pair.currentPrice).toFixed(2)}
      </span>
      <button
        type="button"
        onClick={onToggleFavorite}
        className="shrink-0 rounded p-0.5 text-slate-500 hover:text-accent"
        title={isFavorite ? "Убрать из избранного" : "В избранное"}
      >
        {isFavorite ? (
          <span className="text-accent">★</span>
        ) : (
          <span className="opacity-60">☆</span>
        )}
      </button>
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 bg-slate-900/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </div>
  );
}

export function PairSelectDropdown({
  pairs,
  selectedPair,
  onSelectPair,
  favoritePairIds,
  recentPairIds,
  toggleFavoritePair,
  addRecentPair,
  openRequest,
  onOpenRequestConsumed
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openRequest && onOpenRequestConsumed) {
      setOpen(true);
      onOpenRequestConsumed();
    }
  }, [openRequest, onOpenRequestConsumed]);

  const pairById = useMemo(() => {
    const map = new Map<number, TradingPair>();
    pairs.forEach((p) => map.set(p.id, p));
    return map;
  }, [pairs]);

  const matchesQuery = useMemo(() => {
    if (!query.trim()) return () => true;
    const q = query.trim().toLowerCase();
    return (p: TradingPair) =>
      p.symbol.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  }, [query]);

  const { recentPairs, favoritePairs, otherPairs } = useMemo(() => {
    const recent: TradingPair[] = [];
    for (const id of recentPairIds.slice(0, MAX_RECENT)) {
      const p = pairById.get(id);
      if (p && matchesQuery(p)) recent.push(p);
    }
    const favIds = favoritePairIds.slice(0, MAX_FAVORITES);
    const favorite: TradingPair[] = [];
    const seen = new Set(recent.map((p) => p.id));
    for (const id of favIds) {
      const p = pairById.get(id);
      if (p && matchesQuery(p) && !seen.has(p.id)) {
        favorite.push(p);
        seen.add(p.id);
      }
    }
    const other: TradingPair[] = [];
    for (const p of pairs) {
      if (matchesQuery(p) && !seen.has(p.id)) other.push(p);
    }
    return { recentPairs: recent, favoritePairs: favorite, otherPairs: other };
  }, [pairs, pairById, recentPairIds, favoritePairIds, matchesQuery]);

  const totalVisible = recentPairs.length + favoritePairs.length + otherPairs.length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleSelect = (pair: TradingPair) => {
    addRecentPair(pair.id);
    onSelectPair(pair);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-left transition-all hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        <span className="font-semibold text-slate-100">
          {selectedPair?.symbol ?? "—"}
        </span>
        <span className="text-slate-500">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[100] mt-1.5 w-[320px] overflow-hidden rounded-xl glass-strong shadow-2xl">
          <div className="border-b border-slate-800 p-2">
            <div className="flex items-center gap-2 rounded-lg glass px-3 py-2">
              <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск пар (BTC, ETH…)"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
              />
            </div>
          </div>
          <div className="max-h-[360px] overflow-y-auto py-1 surface-scroll">
            {totalVisible === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                Ничего не найдено
              </div>
            ) : (
              <>
                {recentPairs.length > 0 && (
                  <>
                    <SectionTitle>Последние</SectionTitle>
                    {recentPairs.map((pair) => (
                      <PairRow
                        key={pair.id}
                        pair={pair}
                        isSelected={selectedPair?.id === pair.id}
                        isFavorite={favoritePairIds.includes(pair.id)}
                        onSelect={() => handleSelect(pair)}
                        onToggleFavorite={(e) => {
                          e.stopPropagation();
                          toggleFavoritePair(pair.id);
                        }}
                      />
                    ))}
                  </>
                )}
                {favoritePairs.length > 0 && (
                  <>
                    <SectionTitle>Избранное</SectionTitle>
                    {favoritePairs.map((pair) => (
                      <PairRow
                        key={pair.id}
                        pair={pair}
                        isSelected={selectedPair?.id === pair.id}
                        isFavorite
                        onSelect={() => handleSelect(pair)}
                        onToggleFavorite={(e) => {
                          e.stopPropagation();
                          toggleFavoritePair(pair.id);
                        }}
                      />
                    ))}
                  </>
                )}
                {otherPairs.length > 0 && (
                  <>
                    <SectionTitle>Все пары</SectionTitle>
                    {otherPairs.map((pair) => (
                      <PairRow
                        key={pair.id}
                        pair={pair}
                        isSelected={selectedPair?.id === pair.id}
                        isFavorite={favoritePairIds.includes(pair.id)}
                        onSelect={() => handleSelect(pair)}
                        onToggleFavorite={(e) => {
                          e.stopPropagation();
                          toggleFavoritePair(pair.id);
                        }}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
