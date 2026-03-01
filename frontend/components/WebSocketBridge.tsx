"use client";

import { useEffect, useRef } from "react";
import { useTradingStore } from "../store/useTradingStore";
import { useSupportNotificationsStore } from "../store/useSupportNotifications";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000";
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 сек — присутствие в онлайне для админки
const STORAGE_KEY_SOUND = "support_notification_sound_enabled";

function getSupportSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(STORAGE_KEY_SOUND);
    return v === null || v === "true";
  } catch {
    return true;
  }
}

function playSupportNotificationSound() {
  if (!getSupportSoundEnabled()) return;
  try {
    const ctx = new (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // ignore
  }
}

/**
 * Small client-only component that maintains a single WebSocket connection
 * and updates the global store. Sends auth + heartbeat for presence tracking.
 */
export function WebSocketBridge() {
  const user = useTradingStore((s) => s.user);
  const token = useTradingStore((s) => s.token);
  const authChecked = useTradingStore((s) => s.authChecked);
  const upsertPrice = useTradingStore((s) => s.upsertPrice);
  const applyTradeUpdate = useTradingStore((s) => s.applyTradeUpdate);
  const setWsConnected = useTradingStore((s) => s.setWsConnected);
  const addSupportNotification = useSupportNotificationsStore((s) => s.addNotification);
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!authChecked || !user || !token) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      // Авторизация для трекинга онлайна в админке
      ws.send(JSON.stringify({ type: "auth", token }));
      // Heartbeat каждые 30 сек
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "heartbeat" }));
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onclose = () => {
      setWsConnected(false);
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
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
        } else if (msg.type === "supportMessage") {
          const m = msg.message as { body?: string; createdAt?: string };
          if (m?.body) {
            addSupportNotification({ body: String(m.body), createdAt: m.createdAt ?? new Date().toISOString() });
            playSupportNotificationSound();
          }
        }
      } catch {
        // ignore malformed
      }
    };

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      ws.close();
      wsRef.current = null;
    };
  }, [authChecked, user, token, upsertPrice, applyTradeUpdate, setWsConnected, addSupportNotification]);

  return null;
}

