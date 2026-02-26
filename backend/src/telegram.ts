/**
 * Уведомления в Telegram о каждом изменении баланса и алерты по аномалиям.
 * Настройка: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID в .env.
 * Чат: группа или канал; Chat ID можно получить через @userinfobot или getUpdates после отправки боту сообщения.
 */

import type { PrismaClient } from "@prisma/client";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const TELEGRAM_API = "https://api.telegram.org";

function isConfigured(): boolean {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

/** Отправка текста в чат. Без настроек — no-op. */
export async function sendTelegramMessage(text: string): Promise<void> {
  if (!isConfigured()) return;
  const url = `${TELEGRAM_API}/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true
      })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[Telegram] sendMessage failed:", res.status, err);
    }
  } catch (e) {
    console.error("[Telegram] sendMessage error:", e);
  }
}

export type BalanceChangePayload = {
  userId: number;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  refType?: string;
  refId?: string;
};

/** Проверка на аномалии по данным в БД и текущей операции. Возвращает описание аномалии или null. */
export async function checkBalanceAnomaly(
  prisma: PrismaClient,
  payload: BalanceChangePayload
): Promise<string | null> {
  const { userId, amount, balanceAfter } = payload;
  const reasons: string[] = [];

  // Отрицательный баланс — не должно быть при корректной логике (возможный взлом/баг БД)
  if (balanceAfter < 0) {
    reasons.push(`Отрицательный баланс: ${balanceAfter}`);
  }

  // Крупная сумма за одну операцию (порог в рублях/единицах)
  const LARGE_AMOUNT = Number(process.env.TELEGRAM_ANOMALY_LARGE_AMOUNT) || 100_000;
  if (Math.abs(amount) >= LARGE_AMOUNT) {
    reasons.push(`Крупная операция: ${amount}`);
  }

  // Слишком много операций по пользователю за последние 5 минут
  const since = new Date(Date.now() - 5 * 60 * 1000);
  const audit = (prisma as unknown as { balanceAuditLog: { count: (p: object) => Promise<number>; findMany: (p: object) => Promise<{ amount: unknown }[]> } }).balanceAuditLog;
  const recentCount = await audit.count({
    where: { userId, createdAt: { gte: since } }
  });
  const RAPID_COUNT = Number(process.env.TELEGRAM_ANOMALY_RAPID_COUNT) || 15;
  if (recentCount >= RAPID_COUNT) {
    reasons.push(`Много операций за 5 мин: ${recentCount}`);
  }

  // Резкий рост баланса за короткое время (сумма приходов за 1 мин)
  const oneMinAgo = new Date(Date.now() - 60 * 1000);
  const recentRows = await audit.findMany({
    where: { userId, createdAt: { gte: oneMinAgo }, amount: { gt: 0 } },
    select: { amount: true }
  });
  const sumIncomingLastMin = recentRows.reduce((s: number, r: { amount: unknown }) => s + Number(r.amount), 0);
  const SPIKE_AMOUNT = Number(process.env.TELEGRAM_ANOMALY_SPIKE_AMOUNT) || 50_000;
  if (sumIncomingLastMin >= SPIKE_AMOUNT) {
    reasons.push(`Большой приход за 1 мин: +${sumIncomingLastMin}`);
  }

  if (reasons.length === 0) return null;
  return `user ${userId}: ${reasons.join("; ")}`;
}

/** Отправить в Telegram уведомление об изменении баланса и, при необходимости, алерт об аномалии. */
export async function notifyBalanceChange(
  prisma: PrismaClient,
  payload: BalanceChangePayload
): Promise<void> {
  if (!isConfigured()) return;

  const { userId, type, amount, balanceBefore, balanceAfter, refType, refId } = payload;
  const sign = amount >= 0 ? "+" : "";
  const line = [
    `💰 Баланс`,
    `user: ${userId}`,
    `тип: ${type}`,
    `сумма: ${sign}${amount}`,
    `было: ${balanceBefore} → стало: ${balanceAfter}`,
    refType && refId ? `ref: ${refType} ${refId}` : null
  ]
    .filter(Boolean)
    .join("\n");

  await sendTelegramMessage(line);

  const anomaly = await checkBalanceAnomaly(prisma, payload);
  if (anomaly) {
    await sendTelegramMessage(`⚠️ АНОМАЛИЯ\n${anomaly}`);
  }
}
