"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { AuthGuard } from "../../components/AuthGuard";
import { useTradingStore } from "../../store/useTradingStore";
import { apiFetch, authHeaders, isAuthError } from "../../lib/api";

type Message = { id: number; role: string; body: string; createdAt: string };

const POLL_INTERVAL_MS = 2500;

export default function SupportPage() {
  const token = useTradingStore((s) => s.token);
  const user = useTradingStore((s) => s.user);
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
      setMessages(data.messages ?? []);
      setError(null);
    } catch (err) {
      if (isAuthError(err)) {
        clearAuth();
        return;
      }
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThread();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const t = setInterval(fetchThread, POLL_INTERVAL_MS);
    return () => clearInterval(t);
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
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <AuthGuard>
      <div className="h-screen max-h-[100dvh] flex flex-col max-w-2xl mx-auto px-3 pb-2">
        <div className="shrink-0 py-2 flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-semibold text-slate-100 tracking-tight truncate">Поддержка</h1>
            <p className="text-[11px] text-slate-500 truncate">Чат с поддержкой · история сохраняется</p>
          </div>
        </div>

        <div className="flex-1 min-h-0 max-h-[65vh] flex flex-col glass overflow-hidden rounded-xl border border-white/5 shadow-xl">
          {error && (
            <div className="shrink-0 px-3 py-2 bg-red-950/40 border-b border-red-900/40 text-xs text-red-300 rounded-t-xl flex items-center gap-2">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="truncate">{error}</span>
            </div>
          )}

          <div
            ref={listRef}
            className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5 surface-scroll"
          >
            {loading ? (
              <div className="flex flex-col items-center pt-4 text-center">
                <div className="w-7 h-7 border-2 border-accent/40 border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-slate-500 text-xs">Загрузка чата…</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center pt-4 text-center">
                <div className="w-10 h-10 rounded-lg bg-slate-800/60 border border-slate-600/40 flex items-center justify-center text-slate-500 mb-1.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                </div>
                <p className="text-slate-300 text-xs font-medium">Пока нет сообщений</p>
                <p className="text-slate-500 text-[11px] mt-0.5 max-w-[200px]">Напишите вопрос — ответим в этом чате.</p>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-1.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "admin" && (
                    <div className="flex h-6 w-6 shrink-0 rounded bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  )}
                  <div
                    className={`max-w-[88%] rounded-xl px-3 py-2 shadow-sm ${
                      m.role === "user"
                        ? "bg-accent/15 border border-accent/30 text-slate-100 rounded-br-sm"
                        : "bg-slate-800/70 border border-slate-600/50 text-slate-200 rounded-bl-sm"
                    }`}
                  >
                    <p className="text-xs whitespace-pre-wrap break-words leading-snug">{m.body}</p>
                    <p className="text-[10px] mt-1 opacity-70">{formatTime(m.createdAt)}</p>
                  </div>
                  {m.role === "user" && (
                    <div className="flex h-6 w-6 shrink-0 rounded bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSend} className="shrink-0 p-2.5 border-t border-white/5 bg-slate-900/30 rounded-b-xl">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Сообщение…"
                className="flex-1 input-glass rounded-lg py-2 px-3 text-sm placeholder-slate-500 min-w-0"
                maxLength={4000}
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="btn-primary rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 shrink-0 flex items-center gap-1.5 transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {sending ? (
                  <span className="h-3.5 w-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
                {sending ? "…" : "Отпр."}
              </button>
            </div>
          </form>
        </div>

        <div className="shrink-0 pt-1.5">
          <Link
            href="/trade"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors rounded py-1.5 px-2 -ml-2 hover:bg-white/5"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            К торговле
          </Link>
        </div>
      </div>
    </AuthGuard>
  );
}
