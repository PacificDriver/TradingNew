"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "../lib/i18n";

type DepositModalContextValue = {
  openDepositModal: () => void;
};

const DepositModalContext = createContext<DepositModalContextValue | null>(null);

export function useDepositModal(): DepositModalContextValue | null {
  return useContext(DepositModalContext);
}

export function DepositModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openDepositModal = useCallback(() => setOpen(true), []);

  return (
    <DepositModalContext.Provider value={{ openDepositModal }}>
      {children}
      {open && <DepositModal onClose={() => setOpen(false)} />}
    </DepositModalContext.Provider>
  );
}

function DepositModal({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();

  return (
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm animate-fade-in"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deposit-modal-title"
      >
        <div
          className="w-full max-w-md rounded-2xl glass-strong border border-slate-700/60 p-6 shadow-2xl animate-fade-in-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 id="deposit-modal-title" className="font-display text-lg font-semibold text-slate-100">
              {t("depositModal.title")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 -mr-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-slate-400 text-sm mb-6">{t("depositModal.message")}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/support"
              onClick={onClose}
              className="btn-primary flex-1 py-3 px-4 rounded-xl text-center font-semibold transition-colors hover:opacity-90"
            >
              {t("depositModal.supportBtn")}
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="py-3 px-4 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800/60 transition-colors"
            >
              {t("depositModal.closeBtn")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
