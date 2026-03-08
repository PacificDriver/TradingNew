const API_BASE = "/api-proxy";

export function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

/** Коды для админа: E001 — сеть/бэкенд недоступен, E002 — ответ не от API (прокси/URL), E003 — ошибка сервера 5xx */
export type ApiError = Error & { status?: number; code?: string };

/** Возвращает сообщение для пользователя: по коду — из i18n, иначе err.message. Админ видит код в console. */
export function getDisplayMessage(e: unknown, t: (key: string) => string): string {
  const err = e as ApiError;
  if (err?.code && typeof t === "function") {
    const key = `errors.${err.code}`;
    const out = t(key);
    if (out !== key) return out;
  }
  return err?.message && typeof err.message === "string" ? err.message : t("errors.generic");
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers((options.headers as Record<string, string>) ?? {});
  if (API_BASE.includes("ngrok") || API_BASE === "/api-proxy") {
    headers.set("ngrok-skip-browser-warning", "1");
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: Object.fromEntries(headers)
    });
  } catch (e) {
    const err = new Error("E001") as ApiError;
    err.status = 0;
    err.code = "E001";
    if (typeof console !== "undefined" && console.error) console.error("[API] E001 (admin): backend unreachable");
    throw err;
  }
  if (!res.ok) {
    let message = "Request failed";
    let code: string | undefined;
    try {
      const text = await res.text();
      if (text) {
        if (text.trimStart().startsWith("<!") || text.includes("Cannot GET ") || text.includes("Cannot POST ")) {
          message = "E002";
          code = "E002";
          if (typeof console !== "undefined" && console.error) console.error("[API] E002 (admin): response not from API, check NEXT_PUBLIC_API_BASE_URL and backend");
        } else if (res.status >= 500) {
          message = "E003";
          code = "E003";
          if (typeof console !== "undefined" && console.error) console.error("[API] E003 (admin): server error", res.status);
        } else if (res.status === 429) {
          message = "E429";
          code = "E429";
        } else {
          try {
            const data = JSON.parse(text) as { message?: string; code?: string };
            message = data.message ?? message;
            if (data.code) code = data.code;
          } catch {
            message = res.status === 401 ? "Необходимо войти снова" : text.length < 200 ? text : `Ошибка ${res.status}`;
          }
        }
      } else {
        if (res.status === 429) {
          message = "E429";
          code = "E429";
        } else if (res.status === 401) message = "Необходимо войти снова";
        else if (res.status >= 500) {
          message = "E003";
          code = "E003";
          if (typeof console !== "undefined" && console.error) console.error("[API] E003 (admin): server error", res.status);
        } else message = `Ошибка ${res.status}`;
      }
    } catch {
      if (res.status === 401) message = "Необходимо войти снова";
      else if (res.status >= 500) {
        code = "E003";
        message = "E003";
        if (typeof console !== "undefined" && console.error) console.error("[API] E003 (admin): server error", res.status);
      } else message = `Ошибка ${res.status}`;
    }
    const err = new Error(message) as ApiError;
    err.status = res.status;
    if (code) err.code = code;
    throw err;
  }
  return res.json();
}

export function isAuthError(e: unknown): boolean {
  const err = e as ApiError;
  return err?.status === 401 || err?.status === 403;
}

