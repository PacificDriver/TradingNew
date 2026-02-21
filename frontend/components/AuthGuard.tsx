"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTradingStore } from "../store/useTradingStore";

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const user = useTradingStore((s) => s.user);
  const authChecked = useTradingStore((s) => s.authChecked);

  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      router.replace("/login");
    }
  }, [authChecked, user, router]);

  if (!authChecked) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-slate-500">
        Загрузка…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-slate-500">
        Перенаправление на вход…
      </div>
    );
  }

  return <>{children}</>;
}

