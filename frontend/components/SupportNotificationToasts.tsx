"use client";

import { useSupportNotificationsStore, type SupportNotification } from "../store/useSupportNotifications";
import Link from "next/link";
import { useLocale } from "../lib/i18n";

function formatTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleTimeString(locale === "ru" ? "ru-RU" : "en-US", {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function SupportAvatar() {
  return (
    <div className="shrink-0 w-10 h-10 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center">
      <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    </div>
  );
}

function ToastItem({
  item,
  onClose,
  locale,
  t
}: {
  item: SupportNotification;
  onClose: () => void;
  locale: string;
  t: (key: string) => string;
}) {
  const preview = item.body.length > 120 ? item.body.slice(0, 120) + "…" : item.body;
  return (
    <div className="flex gap-3 p-3 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-600/60 shadow-lg animate-fade-in-up min-w-[280px] max-w-[340px]">
      <SupportAvatar />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            {t("support.fromSupport")}
          </span>
          <span className="text-xs text-slate-500">{formatTime(item.createdAt, locale)}</span>
        </div>
        <p className="text-sm text-slate-200 whitespace-pre-wrap break-words line-clamp-3">{preview}</p>
        <Link
          href="/support"
          className="inline-block mt-2 text-xs font-medium text-accent hover:text-accent/80"
        >
          {t("support.notificationOpenChat")}
        </Link>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/80 transition-colors"
        aria-label={t("support.notificationClose")}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function SupportNotificationToasts() {
  const { t, locale } = useLocale();
  const notifications = useSupportNotificationsStore((s) => s.notifications);
  const removeNotification = useSupportNotificationsStore((s) => s.removeNotification);
  const clearAllNotifications = useSupportNotificationsStore((s) => s.clearAllNotifications);

  if (notifications.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 items-end pb-[env(safe-area-inset-bottom,0px)] pr-[env(safe-area-inset-right,0px)]"
      role="region"
      aria-label="Уведомления поддержки"
    >
      {notifications.length > 1 && (
        <button
          type="button"
          onClick={clearAllNotifications}
          className="text-xs font-medium text-slate-500 hover:text-slate-300 px-2 py-1 rounded transition-colors"
        >
          {t("support.notificationCloseAll")}
        </button>
      )}
      {notifications.map((item) => (
        <ToastItem
          key={item.id}
          item={item}
          onClose={() => removeNotification(item.id)}
          locale={locale}
          t={t}
        />
      ))}
    </div>
  );
}
