"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../lib/i18n";

const CONTACT_DELAY_MS = 3000;
const MODAL_COOLDOWN_MS = 10000;
const EMAIL = "edjost127@gmail.com";

export function InvestButton() {
  const { t } = useLocale();
  const [modalOpen, setModalOpen] = useState(false);
  const [contactReady, setContactReady] = useState(false);
  const [contactCooldown, setContactCooldown] = useState(false);
  const lastOpenRef = useRef<number>(0);

  useEffect(() => {
    if (!modalOpen) return;
    setContactReady(false);
    const t = setTimeout(() => setContactReady(true), CONTACT_DELAY_MS);
    return () => clearTimeout(t);
  }, [modalOpen]);

  const handleOpen = () => {
    const now = Date.now();
    if (now - lastOpenRef.current < MODAL_COOLDOWN_MS && lastOpenRef.current > 0) {
      return;
    }
    lastOpenRef.current = now;
    setModalOpen(true);
  };

  const handleContact = () => {
    if (!contactReady || contactCooldown) return;
    setContactCooldown(true);
    window.location.href = `mailto:${EMAIL}?subject=Инвестирование в AuraTrade`;
    setTimeout(() => setContactCooldown(false), 5000);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="btn-invest-gold relative overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
      >
        {t("header.investInAuraTrade")}
      </button>

      {modalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm animate-fade-in"
              aria-hidden
              onClick={() => setModalOpen(false)}
            />
            <div
              role="dialog"
              aria-modal
              aria-labelledby="invest-modal-title"
              className="fixed left-1/2 top-1/2 z-[9999] w-[90vw] max-w-md rounded-2xl glass-strong border border-slate-600/60 p-6 shadow-2xl animate-fade-in-up"
              style={{ transform: "translate(-50%, -50%)" }}
            >
              <h2 id="invest-modal-title" className="text-lg font-semibold text-slate-100 mb-4">
                {t("header.investModalTitle")}
              </h2>
            <p className="text-slate-300 text-sm leading-relaxed mb-6">
              {t("header.investModalText")}
            </p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleContact}
                disabled={!contactReady || contactCooldown}
                className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {contactReady
                  ? contactCooldown
                    ? t("header.contactSent")
                    : t("header.contact")
                  : t("header.contactIn", { sec: Math.ceil(CONTACT_DELAY_MS / 1000) })}
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-600 py-2.5 text-sm text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
          </>,
          document.body
        )}
    </>
  );
}
