"use client";

import { useEffect, useRef } from "react";
import { useTradingStore } from "../store/useTradingStore";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000";

/**
 * Small client-only component that maintains a single WebSocket connection
 * and updates the global store. Keeps client as a pure UI layer.
 */
export function WebSocketBridge() {
  const user = useTradingStore((s) => s.user);
  const authChecked = useTradingStore((s) => s.authChecked);
  const upsertPrice = useTradingStore((s) => s.upsertPrice);
  const applyTradeUpdate = useTradingStore((s) => s.applyTradeUpdate);
  const setWsConnected = useTradingStore((s) => s.setWsConnected);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!authChecked || !user) {
      // no auth -> no socket for now (simple MVP rule)
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "price") {
          upsertPrice(msg.pairId, msg.price);
        } else if (msg.type === "tradeUpdate") {
          const trade = msg.trade as { userId?: number };
          if (user && trade?.userId === user.id) {
            applyTradeUpdate(msg.trade);
          }
        }
      } catch {
        // ignore malformed for MVP
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [authChecked, user, upsertPrice, applyTradeUpdate, setWsConnected]);

  return null;
}

