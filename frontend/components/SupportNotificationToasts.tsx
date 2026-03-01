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
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 mb-1">{formatTime(item.createdAt, locale)}</p>
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
