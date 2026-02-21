const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export type ApiError = Error & { status?: number };

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...options
    });
  } catch (e) {
    const err = new Error("Сервер недоступен") as ApiError;
    err.status = 0;
    throw err;
  }
  if (!res.ok) {
    let message = "Request failed";
    try {
      const text = await res.text();
      if (text) {
        if (text.trimStart().startsWith("<!") || text.includes("Cannot GET ") || text.includes("Cannot POST ")) {
          message =
            "Запрос попал не на API или бэкенд не перезапущен. Проверьте NEXT_PUBLIC_API_BASE_URL (должен быть http://localhost:4000) и перезапустите бэкенд (npm run dev в папке backend).";
        } else {
          try {
            const data = JSON.parse(text) as { message?: string };
            message = data.message ?? message;
          } catch {
            message = text.length < 200 ? text : `Ошибка ${res.status}`;
          }
        }
      } else {
        message = res.status === 401 ? "Необходимо войти снова" : res.status === 500 ? "Ошибка сервера" : `Ошибка ${res.status}`;
      }
    } catch {
      message = res.status === 401 ? "Необходимо войти снова" : `Ошибка ${res.status}`;
    }
    const err = new Error(message) as ApiError;
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export function isAuthError(e: unknown): boolean {
  const err = e as ApiError;
  return err?.status === 401 || err?.status === 403;
}

