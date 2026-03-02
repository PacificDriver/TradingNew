"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SocialBonusState = {
  instagramClicked: boolean;
  telegramClicked: boolean;
  bonusClaimed: boolean;
};

type User = {
  id: number;
  email: string;
  demoBalance: number;
  isAdmin?: boolean;
  /** Полная блокировка: торги и вывод запрещены */
  blockedAt?: string | null;
  /** Частичная блокировка: вывод запрещён */
  withdrawBlockedAt?: string | null;
  blockReason?: string | null;
  /** Бонус $100 за клики по соцсетям */
  socialBonus?: SocialBonusState;
};

type TradingPair = {
  id: number;
  symbol: string;
  name: string;
  category?: string; // crypto | stablecoin
  currentPrice: number;
};

type TradeStatus = "ACTIVE" | "WIN" | "LOSS";
type TradeDirection = "LONG" | "SHORT";

type Trade = {
  id: number;
  tradingPairId: number;
  amount: number;
  direction: TradeDirection;
  entryPrice: number;
  closePrice: number | null;
  status: TradeStatus;
  expiresAt: string;
  createdAt: string;
  tradingPair?: TradingPair;
  /** Прибыль/убыток по сделке с учётом процента выигрыша (P/L) */
  pnl?: number;
};

type PricePoint = {
  ts: number;
  price: number;
};

export type SettledResult = { status: "WIN" | "LOSS"; tradeId: number };

export type ChartSettings = {
  selectedPairId: number | null;
  timeframe: string;
  chartMode: "line" | "candles" | "baseline" | "heikin_ashi" | "bars";
  showMA: boolean;
  showRSI: boolean;
  showMACD: boolean;
  showBB: boolean;
};

type State = {
  token: string | null;
  user: User | null;
  pairs: TradingPair[];
  /** id пар в избранном (порядок = порядок отображения сверху), макс. 10 */
  favoritePairIds: number[];
  /** Последние выбранные пары (макс. 3) для блока «Последние» в селекторе */
  recentPairIds: number[];
  /** Сохранённые настройки графика (пара, таймфрейм, режим, индикаторы) */
  chartSettings: ChartSettings;
  prices: Record<number, PricePoint[]>;
  activeTrades: Trade[];
  completedTrades: Trade[];
  /** Полная история завершённых сделок (persist), для профиля */
  tradeHistory: Trade[];
  /** Результат только что закрытой сделки — для визуального отклика (не persist) */
  lastSettledResult: SettledResult | null;
  wsConnected: boolean;
  authChecked: boolean;
  /** Открыть селектор пары (например из поиска в шапке на /trade) */
  openPairSelector: boolean;
  /** Звук при выигрыше (по умолчанию включён, сохраняется) */
  soundOnWin: boolean;
};

type Actions = {
  setAuth: (token: string | null, user: User) => void;
  clearAuth: () => void;
  setPairs: (pairs: TradingPair[]) => void;
  toggleFavoritePair: (pairId: number) => void;
  setChartSettings: (settings: Partial<ChartSettings>) => void;
  addRecentPair: (pairId: number) => void;
  upsertPrice: (pairId: number, price: number) => void;
  setActiveTrades: (trades: Trade[]) => void;
  setCompletedTrades: (trades: Trade[]) => void;
  /** Добавить/обновить сделки в истории (по id), сохраняется в localStorage */
  setTradeHistory: (trades: Trade[]) => void;
  mergeTradeHistory: (trades: Trade[]) => void;
  applyTradeUpdate: (trade: Trade) => void;
  clearLastSettledResult: () => void;
  setWsConnected: (v: boolean) => void;
  setAuthChecked: (v: boolean) => void;
  setOpenPairSelector: (v: boolean) => void;
  setSoundOnWin: (v: boolean) => void;
};

export const useTradingStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      pairs: [],
      favoritePairIds: [],
      recentPairIds: [],
      chartSettings: {
        selectedPairId: null,
        timeframe: "30s",
        chartMode: "line",
        showMA: false,
        showRSI: false,
        showMACD: false,
        showBB: false
      },
      prices: {},
      activeTrades: [],
      completedTrades: [],
      tradeHistory: [],
      lastSettledResult: null,
      wsConnected: false,
      authChecked: false,
      openPairSelector: false,
      soundOnWin: true,

      setAuth: (token, user) => set({ token, user }),
      clearAuth: () =>
        set({
          token: null,
          user: null,
          authChecked: true,
          activeTrades: [],
          completedTrades: [],
          tradeHistory: []
        }),
      setPairs: (pairs) =>
        set((state) => {
          const now = Date.now();
          const nextPrices = { ...state.prices };
          for (const p of pairs) {
            const cur = state.prices[p.id];
            const price = Number(p.currentPrice);
            if (!Number.isFinite(price)) continue;
            if (!cur?.length) {
              nextPrices[p.id] = [{ ts: now, price }];
            }
          }
          return { pairs, prices: nextPrices };
        }),
      setChartSettings: (settings) =>
        set((state) => ({
          chartSettings: { ...state.chartSettings, ...settings }
        })),
      addRecentPair: (pairId) =>
        set((state) => {
          const next = [pairId, ...state.recentPairIds.filter((id) => id !== pairId)].slice(0, 3);
          return { recentPairIds: next };
        }),
      toggleFavoritePair: (pairId) =>
        set((state) => {
          const ids = state.favoritePairIds;
          const has = ids.includes(pairId);
          const next = has
            ? ids.filter((id) => id !== pairId)
            : [...ids, pairId].slice(0, 10);
          return { favoritePairIds: next };
        }),
      upsertPrice: (pairId, price) =>
        set((state) => {
          const history = state.prices[pairId] ?? [];
          const next: PricePoint[] = [
            ...history,
            { ts: Date.now(), price }
          ].slice(-300); // храним до ~5 минут истории при обновлении раз в секунду
          // also update pair currentPrice if we have it
          const pairs = state.pairs.map((p) =>
            p.id === pairId ? { ...p, currentPrice: price } : p
          );
          return {
            prices: { ...state.prices, [pairId]: next },
            pairs
          };
        }),
      setActiveTrades: (trades) => set({ activeTrades: trades }),
      setCompletedTrades: (trades) => set({ completedTrades: trades }),
      setTradeHistory: (trades) => set({ tradeHistory: trades }),
      mergeTradeHistory: (trades) =>
        set((state) => {
          const byId = new Map(state.tradeHistory.map((t) => [t.id, t]));
          trades.forEach((t) => byId.set(t.id, t));
          const next = Array.from(byId.values()).sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          return { tradeHistory: next };
        }),
      applyTradeUpdate: (trade) =>
        set((state) => {
          const tradeUserId = (trade as { userId?: number }).userId;
          if (state.user && tradeUserId != null && tradeUserId !== state.user.id) {
            return state;
          }
          const isCompleted = trade.status !== "ACTIVE";
          const active = state.activeTrades.filter((t) => t.id !== trade.id);
          const completed = state.completedTrades.filter(
            (t) => t.id !== trade.id
          );
          if (isCompleted) {
            completed.unshift(trade);
          } else {
            active.unshift(trade);
          }
          const byId = new Map(state.tradeHistory.map((t) => [t.id, t]));
          if (isCompleted) byId.set(trade.id, trade);
          const tradeHistory = isCompleted
            ? Array.from(byId.values()).sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime()
              )
            : state.tradeHistory;
          const lastSettledResult: SettledResult | null =
            isCompleted && (trade.status === "WIN" || trade.status === "LOSS")
              ? { status: trade.status, tradeId: trade.id }
              : null;
          const user =
            state.user &&
            (trade as { userId?: number; user?: { demoBalance?: number } }).userId === state.user.id &&
            (trade as { user?: { demoBalance?: number } }).user?.demoBalance != null
              ? { ...state.user, demoBalance: Number((trade as unknown as { user: { demoBalance: number } }).user.demoBalance) }
              : state.user;
          return {
            activeTrades: active,
            completedTrades: completed,
            tradeHistory,
            lastSettledResult: lastSettledResult ?? state.lastSettledResult,
            user
          };
        }),
      clearLastSettledResult: () => set({ lastSettledResult: null }),
      setWsConnected: (v) => set({ wsConnected: v }),
      setAuthChecked: (v) => set({ authChecked: v }),
      setOpenPairSelector: (v) => set({ openPairSelector: v }),
      setSoundOnWin: (v) => set({ soundOnWin: v })
    }),
    {
      name: "trading-mvp-store",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        tradeHistory: state.tradeHistory,
        favoritePairIds: state.favoritePairIds,
        recentPairIds: state.recentPairIds,
        chartSettings: state.chartSettings,
        soundOnWin: state.soundOnWin
      })
    }
  )
);

export type { TradingPair, Trade, TradeDirection, TradeStatus, PricePoint };

