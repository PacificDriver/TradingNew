/**
 * API-клиент реферальной программы (отдельный домен).
 * Всегда использует NEXT_PUBLIC_REFERRAL_API_URL и Bearer token.
 */

const REFERRAL_TOKEN_KEY = "referral_partner_token";

function getApiBase(): string {
  const url = process.env.NEXT_PUBLIC_REFERRAL_API_URL;
  if (!url || typeof url !== "string" || !url.trim()) {
    throw new Error("NEXT_PUBLIC_REFERRAL_API_URL не задан. Укажите URL API основного сайта в .env");
  }
  return url.replace(/\/$/, "");
}

export function getReferralToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFERRAL_TOKEN_KEY);
}

export function setReferralToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(REFERRAL_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(REFERRAL_TOKEN_KEY);
  }
}

export async function referralFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const base = getApiBase();
  const url = path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
  const headers = new Headers((options.headers as Record<string, string>) ?? {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const token = typeof window !== "undefined" ? getReferralToken() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  if (base.includes("ngrok")) {
    headers.set("ngrok-skip-browser-warning", "1");
  }

  return fetch(url, {
    ...options,
    headers: Object.fromEntries(headers),
    credentials: "omit",
  });
}

export async function referralApiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await referralFetch(path, options);

  if (!res.ok) {
    let message = "Request failed";
    try {
      const data = await res.json().catch(() => ({}));
      message = (data as { message?: string }).message ?? message;
    } catch {
      message = res.status === 401 ? "Необходимо войти снова" : `Ошибка ${res.status}`;
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}
