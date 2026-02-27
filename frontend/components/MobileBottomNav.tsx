"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "../lib/i18n";
import { useDepositModal } from "./DepositModal";

const NAV_ITEMS = [
  { href: "/trade", key: "mobileNav.trade", icon: "chart" },
  { href: "/pairs", key: "mobileNav.pairs", icon: "pairs" },
  { href: "/history", key: "mobileNav.history", icon: "history" },
  { href: "/profile", key: "mobileNav.profile", icon: "profile" },
  { href: "/deposit", key: "mobileNav.deposit", icon: "wallet", openDepositModal: true }
] as const;

function NavIcon({ icon }: { icon: string }) {
  const className = "w-6 h-6 shrink-0";
  switch (icon) {
    case "pairs":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    case "chart":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-8M7 21h10" />
        </svg>
      );
    case "history":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "profile":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case "wallet":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      );
    default:
      return null;
  }
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useLocale();
  const { openDepositModal } = useDepositModal() ?? {};

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-slate-800/80 glass-strong pb-[env(safe-area-inset-bottom,0px)]"
      aria-label="Нижнее меню"
    >
      <div className="flex items-center justify-around h-14 px-2">
        {NAV_ITEMS.map((item) => {
          const { href, key, icon } = item;
          const isDeposit = "openDepositModal" in item && item.openDepositModal;
          const isActive = !isDeposit && pathname === href;
          const baseClass = `flex flex-col items-center justify-center gap-0.5 min-w-[64px] py-2 rounded-lg transition-colors touch-manipulation ${
            isActive ? "text-accent" : "text-slate-400 hover:text-slate-200"
          }`;
          if (isDeposit) {
            return (
              <button
                key={href}
                type="button"
                onClick={() => openDepositModal?.()}
                className={baseClass}
              >
                <NavIcon icon={icon} />
                <span className="text-[10px] font-medium">{t(key)}</span>
              </button>
            );
          }
          return (
            <Link key={href} href={href} className={baseClass}>
              <NavIcon icon={icon} />
              <span className="text-[10px] font-medium">{t(key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
