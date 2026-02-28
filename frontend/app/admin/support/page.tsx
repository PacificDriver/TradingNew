"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useLocale } from "../../../lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "../../../components/AuthGuard";
import { useTradingStore } from "../../../store/useTradingStore";
import { apiFetch, authHeaders, isAuthError } from "../../../lib/api";

const STORAGE_KEY_SOUND = "admin_support_sound_enabled";

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // ignore
  }
}

function getStoredSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(STORAGE_KEY_SOUND);
    return v === null || v === "true";
  } catch {
    return true;
  }
}

function setStoredSoundEnabled(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY_SOUND, String(value));
  } catch {
    // ignore
  }
}

type Message = { id: number; role: string; body: string; createdAt: string };
type ThreadSummary = {
  id: number;
  userId: number;
  userEmail: string;
  lastMessage: { body: string; createdAt: string; role: string } | null;
  updatedAt: string;
};

const POLL_INTERVAL_MS = 3000;

export default function AdminSupportPage() {
  const router = useRouter();
  const { t } = useLocale();
  const token = useTradingStore((s) => s.token);
  const user = useTradingStore((s) => s.user);
  const authChecked = useTradingStore((s) => s.authChecked);
  const clearAuth = useTradingStore((s) => s.clearAuth);

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [threadDetail, setThreadDetail] = useState<{
    thread: { id: number; userEmail: string; userId: number };
    messages: Message[];
  } | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const prevLastMessageByThreadRef = useRef<Map<number, string>>(new Map());
  const initialLoadRef = useRef(true);

  useEffect(() => {
    setSoundEnabled(getStoredSoundEnabled());
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    if (!user?.isAdmin) {
      router.replace("/trade");
      return;
    }
  }, [authChecked, user, router]);

  const fetchThreads = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch<{ threads: ThreadSummary[] }>("/support/threads", {
        headers: authHeaders(token)
      });
      const nextThreads = data.threads ?? [];

      if (!initialLoadRef.current && getStoredSoundEnabled()) {
        for (const t of nextThreads) {
          const lm = t.lastMessage;
          if (lm && lm.role === "user") {
            const prev = prevLastMessageByThreadRef.current.get(t.id);
            if (prev !== lm.createdAt) {
              playNotificationSound();
              break;
            }
          }
        }
      }
      initialLoadRef.current = false;

      const next = new Map<number, string>();
      for (const t of nextThreads) {
        if (t.lastMessage) next.set(t.id, t.lastMessage.createdAt);
      }
      prevLastMessageByThreadRef.current = next;

      setThreads(nextThreads);
    } catch (err) {
      if (isAuthError(err)) {
        clearAuth();
        router.replace("/login");
      }
    } finally {
      setLoadingThreads(false);
    }
  }, [token, clearAuth]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((v) => {
      const next = !v;
      setStoredSoundEnabled(next);
      return next;
    });
  }, []);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    if (!token || !user?.isAdmin) return;
    const t = setInterval(fetchThreads, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [token, user?.isAdmin]);

  useEffect(() => {
    if (selectedId == null || !token) {
      setThreadDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    (async () => {
      try {
        const data = await apiFetch<{
          thread: { id: number; userEmail: string; userId: number };
          messages: Message[];
        }>(`/support/threads/${selectedId}`, { headers: authHeaders(token) });
        if (!cancelled) setThreadDetail(data);
      } catch (err) {
        if (!cancelled && isAuthError(err)) {
          clearAuth();
          router.replace("/login");
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, token]);

  useEffect(() => {
    if (selectedId == null || !token) return;
    const id = selectedId;
    const t = setInterval(async () => {
      try {
        const data = await apiFetch<{
          thread: { id: number; userEmail: string; userId: number };
          messages: Message[];
        }>(`/support/threads/${id}`, { headers: authHeaders(token) });
        setThreadDetail(data);
      } catch {
        // ignore
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [selectedId, token]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [threadDetail?.messages]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = replyText.trim();
    if (!text || selectedId == null || !token || sending) return;
    setSending(true);
    setReplyText("");
    try {
      const data = await apiFetch<{ message: Message }>(`/support/threads/${selectedId}/reply`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ text })
      });
      setThreadDetail((prev) =>
        prev ? { ...prev, messages: [...prev.messages, data.message] } : null
      );
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  };

  if (!authChecked || !user?.isAdmin) return null;

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col lg:flex-row gap-6">
        <div className="lg:w-80 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-display text-xl font-semibold text-slate-100">{t("support.title")}</h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSound}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  soundEnabled ? "bg-accent/20 text-accent" : "bg-slate-800/60 text-slate-500"
                }`}
                title={soundEnabled ? t("admin.soundOff") : t("admin.soundOn")}
                aria-label={soundEnabled ? t("admin.soundOff") : t("admin.soundOn")}
                aria-pressed={!soundEnabled}
              >
                {soundEnabled ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  </svg>
                )}
                <span className="hidden sm:inline">{soundEnabled ? t("admin.soundOff") : t("admin.soundOn")}</span>
              </button>
              <Link
                href="/admin"
                className="text-sm text-slate-500 hover:text-slate-300"
              >
                {t("support.adminBack")}
              </Link>
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-4">{t("admin.supportChats")}</p>
          <div className="glass-panel overflow-hidden rounded-xl">
            {loadingThreads ? (
              <div className="p-4 text-slate-500 text-sm">{t("admin.supportLoading")}</div>
            ) : threads.length === 0 ? (
              <div className="p-4 text-slate-500 text-sm">{t("admin.noTickets")}</div>
            ) : (
              <ul className="divide-y divide-slate-800/50">
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        selectedId === t.id
                          ? "bg-accent/15 border-l-2 border-accent"
                          : "hover:bg-slate-800/40"
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-200 truncate">{t.userEmail}</p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {t.lastMessage
                          ? (t.lastMessage.body.slice(0, 50) + (t.lastMessage.body.length > 50 ? "…" : ""))
                          : "—"}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 glass-panel rounded-xl overflow-hidden">
          {selectedId == null ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm p-8">
              Выберите чат слева
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200">
                  {threadDetail?.thread.userEmail ?? "…"}
                </span>
              </div>
              <div
                ref={listRef}
                className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[320px]"
              >
                {loadingDetail ? (
                  <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
                    Загрузка…
                  </div>
                ) : (
                  (threadDetail?.messages ?? []).map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.role === "admin" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                          m.role === "admin"
                            ? "bg-accent/20 border border-accent/40 text-slate-100"
                            : "bg-slate-800/80 border border-slate-600/60 text-slate-200"
                        }`}
                      >
                        {m.role === "user" && (
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
                            Пользователь
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                        <p className="text-[10px] text-slate-500 mt-1.5">{formatTime(m.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleReply} className="p-4 border-t border-slate-700/60">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={t("admin.replyPlaceholder")}
                    className="flex-1 input-glass rounded-xl py-2.5 px-4 text-sm"
                    maxLength={4000}
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className="btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    {sending ? "…" : t("admin.send")}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
