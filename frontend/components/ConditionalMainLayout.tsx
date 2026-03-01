"use client";

import dynamic from "next/dynamic";
import { AppHeader } from "./AppHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { PageTransition } from "./PageTransition";
import { DepositModalProvider } from "./DepositModal";
import { WebSocketBridge } from "./WebSocketBridge";
import { SupportNotificationToasts } from "./SupportNotificationToasts";
import { useTradingStore } from "../store/useTradingStore";
import { ReactNode } from "react";

const BlockedOverlay = dynamic(
  () => import("./BlockedOverlay").then((m) => ({ default: m.BlockedOverlay })),
  { ssr: false }
);

export function ConditionalMainLayout({ children }: { children: ReactNode }) {
  const user = useTradingStore((s) => s.user);
  const authChecked = useTradingStore((s) => s.authChecked);
  const isBlocked = authChecked && user?.blockedAt;

  return (
    <DepositModalProvider>
      <header className="relative z-20 border border-slate-800/60 glass-strong mx-2 mt-2 rounded-2xl xl:rounded-3xl animate-fade-in opacity-0 sm:mx-4 sm:mt-4 lg:mx-6 lg:mt-4 xl:mx-8">
        <div className="w-full px-3 py-2.5 sm:px-4 sm:py-3 lg:px-6 xl:px-8">
          <AppHeader />
        </div>
      </header>
      <main className="flex-1 flex flex-col w-full px-2 py-3 sm:px-4 sm:py-4 lg:px-6 xl:px-8 min-h-0 [contain:layout] pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:pb-[env(safe-area-inset-bottom,0px)]">
        <PageTransition>{children}</PageTransition>
      </main>
      <MobileBottomNav />
      {isBlocked && <BlockedOverlay />}
      <WebSocketBridge />
      <SupportNotificationToasts />
    </DepositModalProvider>
  );
}
