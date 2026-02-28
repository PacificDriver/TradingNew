"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { AuthGuard } from "../../components/AuthGuard";
import { setSupportLastSeen } from "../../lib/useSupportUnread";
import { useTradingStore } from "../../store/useTradingStore";
import { apiFetch, authHeaders, isAuthError, getDisplayMessage } from "../../lib/api";
import { useLocale } from "../../lib/i18n";

type Message = { id: number; role: string; body: string; createdAt: string };

const POLL_INTERVAL_MS = 2500;

function formatDateKey(iso: string, locale: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "today";
  if (sameDay(d, yesterday)) return "yesterday";
  return d.toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined
  });
}

export default function SupportPage() {
  const { t, locale } = useLocale();
  const token = useTradingStore((s) => s.token);
  const clearAuth = useTradingStore((s) => s.clearAuth);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const fetchThread = async () => {
    if (!token) return;
    try {
      const data = await apiFetch<{ thread: { id: number }; messages: Message[] }>("/support/thread", {
        headers: authHeaders(token)
      });
      const msgs = data.messages ?? [];
      setMessages(msgs);
      setError(null);
      const last = msgs[msgs.length - 1];
      if (last) setSupportLastSeen(last.createdAt);
    } catch (err) {
      if (isAuthError(err)) {
        clearAuth();
        return;
      }
      setError(getDisplayMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThread();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(fetchThread, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !token || sending) return;
    setSending(true);
    setInput("");
    try {
      const data = await apiFetch<{ message: Message }>("/support/message", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ text })
      });
      setMessages((prev) => [...prev, data.message]);
    } catch (err) {
      setInput(text);
      setError(getDisplayMessage(err, t));
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString(locale === "ru" ? "ru-RU" : "en-US", {
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  };

  return (
    <AuthGuard>
      <div className="fixed inset-0 z-40 flex flex-col bg-[#0f1216] overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:relative md:inset-auto md:z-auto md:pt-0 md:pb-0 md:flex-1 md:min-h-0 md:max-h-full">
        {/* Header — компактный */}
        <header className="shrink-0 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-sm">
          <Link
            href="/trade"
            className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-700/50 transition-colors touch-manipulation"
            aria-label={t("support.backToTrading")}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0 flex flex-col">
            <h1 className="font-semibold text-slate-100 truncate text-sm sm:text-base">{t("support.title")}</h1>
            <p className="text-[11px] sm:text-xs text-emerald-400/90 truncate">{t("support.subtitle")} • Online</p>
          </div>
        </header>

        {/* Сообщения — только эта область скроллится */}
        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-3 sm:py-4 space-y-1 surface-scroll bg-[#0f1216]"
          style={{ backgroundImage: "radial-gradient(circle at 20% 30%, rgba(30,41,59,0.15) 0%, transparent 50%)" }}
        >
          {error && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-red-950/50 border border-red-900/40 text-xs text-red-300 flex items-center gap-2">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="truncate">{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 sm:py-16 min-h-[120px]">
              <div className="w-8 h-8 border-2 border-accent/40 border-t-accent rounded-full animate-spin mb-3" />
              <p className="text-slate-500 text-sm">{t("support.chatLoading")}</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 sm:py-16 min-h-[120px] text-center">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-slate-800/60 border border-slate-600/40 flex items-center justify-center text-slate-500 mb-3 sm:mb-4">
                <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
              <p className="text-slate-300 font-medium">{t("support.noMessages")}</p>
              <p className="text-slate-500 text-sm mt-1 max-w-[220px]">{t("support.writeQuestion")}</p>
            </div>
          ) : (
            (() => {
              let lastDateKey: string | null = null;
              return messages.map((m) => {
                const dateKey = formatDateKey(m.createdAt, locale);
                const showDateSep = dateKey !== lastDateKey;
                if (showDateSep) lastDateKey = dateKey;

                const dateLabel =
                  dateKey === "today"
                    ? t("support.today")
                    : dateKey === "yesterday"
                      ? t("support.yesterday")
                      : dateKey;

                return (
                  <div key={m.id}>
                    {showDateSep && (
                      <div className="flex justify-center my-4">
                        <span className="px-3 py-1 rounded-full bg-slate-800/60 text-slate-400 text-xs">
                          {dateLabel}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 shadow-sm ${
                          m.role === "user"
                            ? "rounded-br-md bg-accent/20 border border-accent/30 text-slate-100"
                            : "rounded-bl-md bg-slate-800/80 border border-slate-600/40 text-slate-200"
                        }`}
                      >
                        <p className="text-[14px] sm:text-[15px] leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`text-[11px] mt-1 ${m.role === "user" ? "text-accent/80" : "text-slate-500"}`}>
                          {formatTime(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>

        {/* Поле ввода — компактное на мобильных */}
        <form
          onSubmit={handleSend}
          className="shrink-0 p-2 sm:p-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-3 border-t border-slate-800/80 bg-slate-900/40 backdrop-blur-sm"
        >
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("support.messagePlaceholder")}
              className="flex-1 rounded-2xl py-2.5 px-3 sm:py-3 sm:px-4 text-[14px] sm:text-[15px] bg-slate-800/80 border border-slate-600/50 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40 min-w-0 transition-all"
              maxLength={4000}
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="shrink-0 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-accent text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all touch-manipulation"
              aria-label={t("support.sendShort")}
            >
              {sending ? (
                <span className="h-5 w-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
              ) : (
                <svg className="h-5 w-5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </form>
      </div>
    </AuthGuard>
  );
}
