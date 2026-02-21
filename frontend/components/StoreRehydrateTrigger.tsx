"use client";

import { useEffect } from "react";
import { useTradingStore } from "../store/useTradingStore";
import { apiFetch, authHeaders, isAuthError } from "../lib/api";

/**
 * Централизованная проверка сессии при старте приложения.
 * В production-подходе источник истины — серверная cookie-сессия.
 */
export function StoreRehydrateTrigger() {
  const token = useTradingStore((s) => s.token);
  const setAuth = useTradingStore((s) => s.setAuth);
  const clearAuth = useTradingStore((s) => s.clearAuth);
  const setAuthChecked = useTradingStore((s) => s.setAuthChecked);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiFetch<{
          user: {
            id: number;
            email: string;
            demoBalance: number;
            isAdmin?: boolean;
            blockedAt?: string | null;
            withdrawBlockedAt?: string | null;
            blockReason?: string | null;
          };
        }>("/me", { headers: authHeaders(token) });
        if (!cancelled && me.user) {
          setAuth(token ?? null, me.user);
        }
      } catch (err) {
        if (!cancelled && isAuthError(err)) {
          clearAuth();
        }
      } finally {
        if (!cancelled) {
          setAuthChecked(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, setAuth, clearAuth, setAuthChecked]);
  return null;
}
