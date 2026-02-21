/**
 * HighHelp API client (H2H).
 * Документация: https://awesomedoc.highhelp.io/ru/HEAD/
 * API: https://api.hh-processing.com
 */

import crypto from "crypto";

const API_BASE = process.env.HIGHHELP_API_BASE || "https://api.hh-processing.com";

export type HighHelpConfig = {
  projectId: string;
  privateKeyPem: string;
};

function getConfig(): HighHelpConfig {
  const projectId = process.env.HIGHHELP_PROJECT_ID;
  const privateKeyPem = process.env.HIGHHELP_PRIVATE_KEY_PEM;
  if (!projectId || !privateKeyPem) {
    throw new Error("HIGHHELP_PROJECT_ID and HIGHHELP_PRIVATE_KEY_PEM must be set");
  }
  return { projectId, privateKeyPem };
}

/** Нормализация тела запроса для подписи: рекурсивный обход, ключи сортируются */
function normalizeMessage(prefix: string, obj: unknown, result: string[]): void {
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    const entries = Object.entries(obj as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b, "en")
    );
    for (const [key, value] of entries) {
      const newPrefix = prefix ? `${prefix}:${key}` : key;
      normalizeMessage(newPrefix, value, result);
    }
    return;
  }
  if (Array.isArray(obj)) {
    (obj as unknown[]).forEach((item, index) => {
      const newPrefix = `${prefix}:${index}`;
      normalizeMessage(newPrefix, item, result);
    });
    return;
  }
  const str = obj === null || obj === undefined ? "None" : String(obj);
  result.push(`${prefix}:${str}`);
}

function buildNormalizedString(payload: object): string {
  const result: string[] = [];
  normalizeMessage("", payload, result);
  result.sort();
  return result.join(";");
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Формирование подписи по схеме HighHelp: base64url(normalize(payload)) + timestamp → SHA256 → RSA-SHA256 → base64url */
function buildSignature(payload: object, timestamp: number, privateKeyPem: string): string {
  const normalized = buildNormalizedString(payload);
  const normalizedBase64 = base64UrlEncode(Buffer.from(normalized, "utf8"));
  const message = `${normalizedBase64}${timestamp}`;
  const hash = crypto.createHash("sha256").update(message, "utf8").digest();
  const key = crypto.createPrivateKey({
    key: privateKeyPem,
    format: "pem"
  });
  const signature = crypto.sign("RSA-SHA256", hash, key);
  return base64UrlEncode(signature);
}

/** Публичный ключ в Base64Url для заголовка x-access-token */
function getApiKeyFromPrivateKey(privateKeyPem: string): string {
  const key = crypto.createPrivateKey({
    key: privateKeyPem,
    format: "pem"
  });
  const pub = crypto.createPublicKey(key);
  const der = pub.export({ type: "spki", format: "der" }) as Buffer;
  return base64UrlEncode(der);
}

function buildHeaders(payload: object, timestamp: number, config: HighHelpConfig) {
  const signature = buildSignature(payload, timestamp, config.privateKeyPem);
  const apiKey = getApiKeyFromPrivateKey(config.privateKeyPem);
  return {
    "content-type": "application/json",
    "x-access-timestamp": String(timestamp),
    "x-access-merchant-id": config.projectId,
    "x-access-token": apiKey,
    "x-access-signature": signature
  };
}

/** Сумма в основных единицах (рубли) → дробные единицы для API (RUB: копейки) */
export function toMinorUnits(amount: number, currency: string): number {
  const decimals = currency === "RUB" ? 2 : 2; // RUB/USD — 2 знака
  return Math.round(amount * Math.pow(10, decimals));
}

export type PayinParams = {
  paymentId: string;
  amount: number; // в основных единицах (рубли)
  currency: string;
  callbackUrl: string;
  successUrl: string;
  declineUrl: string;
  redirectUrl?: string;
  customerId: string;
  customerIp: string;
  customerCountry: string;
  method?: string;
  lifetime?: number;
};

export type PayinResponse = {
  status: string;
  sub_status?: string;
  request_id?: string;
  payment_id?: string;
  integration?: { form_url?: string; redirect_url?: string };
  status_description?: string;
};

export async function createPayin(params: PayinParams): Promise<PayinResponse> {
  const config = getConfig();
  const amountMinor = toMinorUnits(params.amount, params.currency);
  const payload = {
    general: {
      project_id: config.projectId,
      payment_id: params.paymentId,
      merchant_callback_url: params.callbackUrl,
      merchant_success_callback_url: params.successUrl,
      merchant_decline_callback_url: params.declineUrl,
      ...(params.redirectUrl && { redirect_url: params.redirectUrl })
    },
    payment: {
      method: params.method || "card-p2p",
      amount: amountMinor,
      currency: params.currency,
      ...(params.lifetime && { lifetime: Math.min(900, Math.max(300, params.lifetime)) })
    },
    sender: {},
    customer: {
      id: params.customerId,
      ip_address: params.customerIp,
      country: params.customerCountry
    }
  };
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = buildHeaders(payload, timestamp, config);
  const url = `${API_BASE}/api/v1/payment/p2p/payin`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const data = (await res.json()) as PayinResponse & { status_description?: string };
  if (!res.ok) {
    throw new Error(data.status_description || `HighHelp payin error: ${res.status}`);
  }
  return data;
}

export type PayoutParams = {
  paymentId: string;
  amount: number;
  currency: string;
  method: string; // card-p2p, sbp-p2p, mobile-p2p
  pan: string;
  cardHolder: string;
  callbackUrl: string;
  successUrl: string;
  declineUrl: string;
  customerId: string;
  customerIp: string;
  customerCountry: string;
  description?: string;
};

export type PayoutResponse = {
  status: string;
  sub_status?: string;
  request_id?: string;
  payment_id?: string;
  status_description?: string;
};

export async function createPayout(params: PayoutParams): Promise<PayoutResponse> {
  const config = getConfig();
  const amountMinor = toMinorUnits(params.amount, params.currency);
  const payload = {
    general: {
      project_id: config.projectId,
      payment_id: params.paymentId,
      merchant_callback_url: params.callbackUrl,
      merchant_success_callback_url: params.successUrl,
      merchant_decline_callback_url: params.declineUrl
    },
    receiver: {
      pan: params.pan.replace(/\s/g, ""),
      card_holder: params.cardHolder
    },
    payment: {
      method: params.method,
      amount: amountMinor,
      currency: params.currency,
      ...(params.description && { description: params.description })
    },
    customer: {
      id: params.customerId,
      ip_address: params.customerIp,
      country: params.customerCountry
    }
  };
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = buildHeaders(payload, timestamp, config);
  const url = `${API_BASE}/api/v1/payment/p2p/payout`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const data = (await res.json()) as PayoutResponse & { status_description?: string };
  if (!res.ok) {
    throw new Error(data.status_description || `HighHelp payout error: ${res.status}`);
  }
  return data;
}

/** Проверка, настроен ли HighHelp (для условного отображения реальных платежей) */
export function isHighHelpConfigured(): boolean {
  return Boolean(process.env.HIGHHELP_PROJECT_ID && process.env.HIGHHELP_PRIVATE_KEY_PEM);
}
