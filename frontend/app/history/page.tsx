"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "../../components/AuthGuard";
import { CompletedTrades } from "../../components/CompletedTrades";
import { useTradingStore, type Trade } from "../../store/useTradingStore";
import { apiFetch, authHeaders, isAuthError } from "../../lib/api";

type TradesResponse = { trades: Trade[] };

export default function HistoryPage() {
  const router = useRouter();
  const token = useTradingStore((s) => s.token);
  const authChecked = useTradingStore((s) => s.authChecked);
  const setCompletedTrades = useTradingStore((s) => s.setCompletedTrades);
  const clearAuth = useTradingStore((s) => s.clearAuth);

  useEffect(() => {
    if (!authChecked || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<TradesResponse>("/trades/completed", {
          headers: authHeaders(token)
        });
        if (!cancelled) setCompletedTrades(data.trades ?? []);
      } catch (err) {
        if (!cancelled && isAuthError(err)) {
          clearAuth();
          router.replace("/login");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [authChecked, token, setCompletedTrades, clearAuth, router]);

  return (
    <AuthGuard>
      <div className="flex flex-col min-h-0 flex-1 pt-2">
        <div className="w-full px-2 sm:px-4">
          <CompletedTrades />
        </div>
      </div>
    </AuthGuard>
  );
}
