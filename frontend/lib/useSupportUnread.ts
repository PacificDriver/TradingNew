"use client";

import { useState, useEffect, useCallback } from "react";
import { useTradingStore } from "../store/useTradingStore";
import { apiFetch, authHeaders, isAuthError } from "./api";

const STORAGE_KEY = "support_last_seen_at";
const POLL_INTERVAL_MS = 30000;

function getLastSeen(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setSupportLastSeen(iso: string) {
  try {
    localStorage.setItem(STORAGE_KEY, iso);
  } catch {
    // ignore
  }
}

export function useSupportUnread() {
  const token = useTradingStore((s) => s.token);
  const clearAuth = useTradingStore((s) => s.clearAuth);
  const [hasUnread, setHasUnread] = useState(false);

  const check = useCallback(async () => {
    if (!token) {
      setHasUnread(false);
      return;
    }
    try {
      const data = await apiFetch<{ thread: { id: number }; messages: { id: number; role: string; createdAt: string }[] }>(
        "/support/thread",
        { headers: authHeaders(token) }
      );
      const messages = data.messages ?? [];
      const last = messages[messages.length - 1];
      if (!last || last.role !== "admin") {
        setHasUnread(false);
        return;
      }
      const lastSeen = getLastSeen();
      setHasUnread(lastSeen == null || last.createdAt > lastSeen);
    } catch (err) {
      if (isAuthError(err)) clearAuth();
      setHasUnread(false);
    }
  }, [token, clearAuth]);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [token, check]);

  return hasUnread;
}
