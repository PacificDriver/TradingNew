"use client";

import { useState } from "react";

export function WelcomeModal({
  open,
  onClose,
  title,
  children,
  dontShowAgainLabel,
  gotItLabel
}: {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
  title: string;
  children: React.ReactNode;
  dontShowAgainLabel: string;
  gotItLabel: string;
}) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    onClose(dontShowAgain);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm animate-fade-in"
        aria-hidden
      />
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-modal-title"
      >
        <div
          className="w-full max-w-md rounded-2xl glass-strong border border-slate-700/60 p-6 shadow-2xl animate-fade-in-up"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="welcome-modal-title" className="font-display text-lg font-semibold text-slate-100 mb-4">
            {title}
          </h2>
          <div className="text-slate-400 text-sm mb-6">{children}</div>
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-accent focus:ring-accent/50"
            />
            <span className="text-sm text-slate-400">{dontShowAgainLabel}</span>
          </label>
          <button
            type="button"
            onClick={handleClose}
            className="w-full btn-primary py-3 px-4 rounded-xl font-semibold"
          >
            {gotItLabel}
          </button>
        </div>
      </div>
    </>
  );
}
