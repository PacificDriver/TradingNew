import crypto from "crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { PrismaClient, TradeStatus, TradeDirection } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import svgCaptcha from "svg-captcha";
import UAParser from "ua-parser-js";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import type { Server } from "http";
import {
  createPayin,
  createPayout,
  isHighHelpConfigured,
  verifyWebhookPayload
} from "./highhelp";
import { notifyBalanceChange } from "./telegram";
import { isEmailConfigured, sendEmailChangeCode, sendPasswordReset } from "./email";

dotenv.config();

const prisma = new PrismaClient();
const app = express();

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "R";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generatePartnerReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "A";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const PORT = Number(process.env.PORT) || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "supersecretjwtkey";
// Локальная разработка и прод: localhost + https://lk.auraretrade.com (при необходимости добавьте ngrok и др. через FRONTEND_ORIGIN в .env)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000,http://localhost:3001,https://lk.auraretrade.com";
// Реферальная программа на отдельном домене (для CORS)
const REFERRAL_ORIGIN = process.env.REFERRAL_FRONTEND_ORIGIN || "";
const CORS_ORIGINS = [
  ...FRONTEND_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean),
  ...REFERRAL_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
].filter(Boolean);
const SESSION_COOKIE_NAME = "bo_session";
const REFERRAL_PARTNER_COOKIE = "rp_session";
const IS_PROD = process.env.NODE_ENV === "production";
const BACKEND_PUBLIC_URL = (process.env.BACKEND_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
// Разрешить любой origin только если явно включено (CORS_ALLOW_ANY=1) или при ngrok
const CORS_ALLOW_ANY = process.env.CORS_ALLOW_ANY === "1" || !!process.env.BACKEND_PUBLIC_URL?.includes("ngrok");

app.use(
  cors({
    origin: CORS_ALLOW_ANY
      ? (origin: string | undefined, cb: (err: Error | null, allow?: boolean | string) => void) =>
          cb(null, origin || "http://localhost:3000")
      : CORS_ORIGINS.length > 1
        ? CORS_ORIGINS
        : CORS_ORIGINS[0] || true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "ngrok-skip-browser-warning"],
    exposedHeaders: ["Content-Type"]
  })
);

// Колбек HighHelp: обрабатываем с raw body для проверки подписи, до express.json()
app.post(
  "/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentsWebhookHandler
);
app.use(express.json());

// Заголовки безопасности
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

// Проверка, что запущен актуальный код (есть маршруты /auth/totp/setup, /sessions)
app.get("/health", (_req, res) => {
  res.json({ ok: true, api: "auth,totp,sessions" });
});

function parseCookieValue(
  cookieHeader: string | undefined,
  name: string
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((c) => c.trim());
  const target = parts.find((p) => p.startsWith(`${name}=`));
  if (!target) return null;
  return decodeURIComponent(target.substring(name.length + 1));
}

function getRequestToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring("Bearer ".length);
  }
  return parseCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
}

function getPartnerToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring("Bearer ".length);
  }
  return parseCookieValue(req.headers.cookie, REFERRAL_PARTNER_COOKIE)
    || parseCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
}

function setAuthCookie(res: express.Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function clearAuthCookie(res: express.Response) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD
  });
}

function setPartnerAuthCookie(res: express.Response, token: string) {
  res.cookie(REFERRAL_PARTNER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function clearPartnerAuthCookie(res: express.Response) {
  res.clearCookie(REFERRAL_PARTNER_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD
  });
}

function partnerAuthMiddleware(
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const token = getPartnerToken(req);
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { referralPartnerId?: number };
    if (payload.referralPartnerId == null) {
      return res.status(401).json({ message: "Invalid token" });
    }
    req.referralPartnerId = payload.referralPartnerId;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

// --- Rate limiting: in-memory по IP и userId (для мультиинстанса — использовать Redis) ---
const rateLimitStore = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;

function rateLimitMiddleware(options: { windowMs: number; max: number }) {
  const { windowMs, max } = options;
  return (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    const ip = getClientIp(req) ?? "unknown";
    const key = req.userId != null ? `user:${req.userId}` : `ip:${ip}`;
    const now = Date.now();
    let timestamps = rateLimitStore.get(key) ?? [];
    timestamps = timestamps.filter((t) => now - t < windowMs);
    if (timestamps.length >= max) {
      return res.status(429).json({ message: "Слишком много запросов. Попробуйте позже." });
    }
    timestamps.push(now);
    rateLimitStore.set(key, timestamps);
    next();
  };
}

// --- Защита от перебора паролей: блокировка по email после N неудачных попыток ---
const LOGIN_MAX_FAILED = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000; // 15 минут
const loginFailedStore = new Map<string, { count: number; lockUntil: number }>();

function isLoginLocked(email: string): boolean {
  const key = email.toLowerCase().trim();
  const entry = loginFailedStore.get(key);
  if (!entry) return false;
  if (Date.now() < entry.lockUntil) return true;
  loginFailedStore.delete(key);
  return false;
}

function recordLoginFailed(email: string): void {
  const key = email.toLowerCase().trim();
  const entry = loginFailedStore.get(key) ?? { count: 0, lockUntil: 0 };
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_FAILED) {
    entry.lockUntil = Date.now() + LOGIN_LOCK_MS;
    entry.count = 0;
  }
  loginFailedStore.set(key, entry);
}

function clearLoginFailed(email: string): void {
  loginFailedStore.delete(email.toLowerCase().trim());
}

// --- Капча: in-memory хранилище (id -> текст), TTL 5 мин ---
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const captchaStore = new Map<string, { text: string; expiresAt: number }>();

function createCaptcha(): { id: string; image: string; text: string } {
  const captcha = svgCaptcha.create({ ignoreChars: "0oO1ilI", noise: 2, color: true });
  const id = crypto.randomBytes(16).toString("hex");
  captchaStore.set(id, { text: (captcha.text ?? "").toLowerCase(), expiresAt: Date.now() + CAPTCHA_TTL_MS });
  return { id, image: captcha.data, text: captcha.text ?? "" };
}

function verifyCaptcha(id: string, answer: string): boolean {
  const entry = captchaStore.get(id);
  if (!entry || Date.now() > entry.expiresAt) return false;
  captchaStore.delete(id);
  return answer.trim().toLowerCase() === entry.text;
}

// --- Аудит баланса: запись в BalanceAuditLog (из транзакции или после) ---
function createBalanceAudit(
  tx: unknown,
  data: {
    userId: number;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    refType?: string;
    refId?: string;
    refBalanceType?: "demo" | "real";
  }
) {
  const client = tx as { balanceAuditLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> } };
  return client.balanceAuditLog.create({
    data: {
      userId: data.userId,
      type: data.type,
      amount: data.amount,
      balanceBefore: data.balanceBefore,
      balanceAfter: data.balanceAfter,
      refType: data.refType ?? null,
      refId: data.refId ?? null,
      refBalanceType: data.refBalanceType ?? null
    }
  });
}

// --- Helpers: IP, User-Agent, Session ---
function getClientIp(req: express.Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0].trim();
  if (Array.isArray(xff) && xff[0]) return String(xff[0]).trim();
  return req.socket?.remoteAddress ?? null;
}

function getOsShortFromUserAgent(ua: string | undefined): string {
  if (!ua) return "Unknown";
  const p = new (UAParser as any)(ua).getResult();
  const os = p.os.name && p.os.version ? `${p.os.name} ${p.os.version}` : p.os.name || "";
  const browser = p.browser.name && p.browser.version ? `${p.browser.name} ${p.browser.version}` : p.browser.name || "";
  return [os, browser].filter(Boolean).join(" · ") || "Unknown";
}

async function createSessionForUser(
  userId: number,
  req: express.Request
): Promise<{ id: number }> {
  const userAgent = req.headers["user-agent"] ?? null;
  const osShort = userAgent ? getOsShortFromUserAgent(userAgent) : null;
  const ip = getClientIp(req);
  const session = await prisma.session.create({
    data: { userId, ip, userAgent, osShort },
    select: { id: true }
  });
  return session;
}

// --- Auth middleware ---
interface AuthRequest extends express.Request {
  userId?: number;
  sessionId?: number;
  referralPartnerId?: number;
}

function authMiddleware(
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const token = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; sessionId?: number };
    req.userId = payload.userId;
    req.sessionId = payload.sessionId;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

async function authMiddlewareWithSession(
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const token = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; sessionId?: number };
    req.userId = payload.userId;
    req.sessionId = payload.sessionId;
    if (payload.sessionId != null) {
      try {
        const session = await prisma.session.findFirst({
          where: { id: payload.sessionId, userId: payload.userId }
        });
        if (!session) {
          return res.status(401).json({ message: "Session invalid or expired" });
        }
        await prisma.session.update({
          where: { id: session.id },
          data: { lastSeenAt: new Date() }
        }).catch(() => {});
      } catch (dbErr) {
        console.error("Session lookup error:", dbErr);
        return res.status(401).json({ message: "Session invalid or expired" });
      }
    }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

async function adminMiddleware(
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { isAdmin: true }
  });
  if (!user?.isAdmin) {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
}

async function getAppSetting(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({
    where: { key },
    select: { value: true }
  });
  return row?.value ?? null;
}

async function getReferralWithdrawConfig(): Promise<{ viaManager: boolean; managerTelegram: string }> {
  const [viaManager, managerTelegram] = await Promise.all([
    getAppSetting("referral_withdraw_via_manager"),
    getAppSetting("referral_manager_telegram")
  ]);
  return {
    viaManager: viaManager === "true" || viaManager === "1",
    managerTelegram: managerTelegram?.trim() || ""
  };
}

async function getTradingConfig(): Promise<{
  winPayoutPercent: number;
  maxActiveTrades: number;
  minStake: number;
  maxStake: number;
}> {
  const rawPayout = await getAppSetting("win_payout_percent");
  const n = Number(rawPayout);
  const rawMax = await getAppSetting("max_active_trades");
  const maxActive = Number(rawMax);
  const rawMinStake = await getAppSetting("min_stake");
  const minStake = Number(rawMinStake);
  const rawMaxStake = await getAppSetting("max_stake");
  const maxStake = Number(rawMaxStake);
  return {
    winPayoutPercent: Number.isFinite(n) && n >= 1 && n <= 200 ? n : 100,
    maxActiveTrades: Number.isFinite(maxActive) && maxActive >= 0 && maxActive <= 100 ? maxActive : 0,
    minStake: Number.isFinite(minStake) && minStake >= 0 ? minStake : 1,
    maxStake: Number.isFinite(maxStake) && maxStake >= 0 ? maxStake : 0
  };
}

/** Запрещает доступ полностью заблокированным пользователям (кроме /me и поддержки) */
async function requireNotBlockedMiddleware(
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { blockedAt: true }
  });
  if (user?.blockedAt) {
    return res.status(403).json({
      code: "ACCOUNT_BLOCKED",
      message: "Аккаунт заблокирован за нарушение правил сайта. Обратитесь в поддержку."
    });
  }
  next();
}

// Категории: crypto | stablecoin (стейблкоины = валюта, быстрые и надёжные из Binance)
const STABLECOIN_SYMBOLS = new Set(["USDCUSDT", "DAIUSDT", "TUSDUSDT", "BUSDUSDT", "USDPUSDT", "FDUSDUSDT"]);

// 100+ популярных торговых пар (крипто + стейблкоины)
const POPULAR_TRADING_PAIRS: { symbol: string; name: string; currentPrice: number }[] = [
  { symbol: "BTCUSDT", name: "Bitcoin / Tether", currentPrice: 60000 },
  { symbol: "ETHUSDT", name: "Ethereum / Tether", currentPrice: 3000 },
  { symbol: "BNBUSDT", name: "BNB / Tether", currentPrice: 580 },
  { symbol: "SOLUSDT", name: "Solana / Tether", currentPrice: 140 },
  { symbol: "XRPUSDT", name: "XRP / Tether", currentPrice: 0.52 },
  { symbol: "USDCUSDT", name: "USD Coin / Tether", currentPrice: 1 },
  { symbol: "DAIUSDT", name: "Dai / Tether", currentPrice: 1 },
  { symbol: "TUSDUSDT", name: "TrueUSD / Tether", currentPrice: 1 },
  { symbol: "FDUSDUSDT", name: "First Digital USD / Tether", currentPrice: 1 },
  { symbol: "ADAUSDT", name: "Cardano / Tether", currentPrice: 0.45 },
  { symbol: "DOGEUSDT", name: "Dogecoin / Tether", currentPrice: 0.08 },
  { symbol: "AVAXUSDT", name: "Avalanche / Tether", currentPrice: 35 },
  { symbol: "TRXUSDT", name: "TRON / Tether", currentPrice: 0.12 },
  { symbol: "LINKUSDT", name: "Chainlink / Tether", currentPrice: 14 },
  { symbol: "DOTUSDT", name: "Polkadot / Tether", currentPrice: 7 },
  { symbol: "MATICUSDT", name: "Polygon / Tether", currentPrice: 0.85 },
  { symbol: "LTCUSDT", name: "Litecoin / Tether", currentPrice: 68 },
  { symbol: "BCHUSDT", name: "Bitcoin Cash / Tether", currentPrice: 420 },
  { symbol: "UNIUSDT", name: "Uniswap / Tether", currentPrice: 10 },
  { symbol: "ATOMUSDT", name: "Cosmos / Tether", currentPrice: 8 },
  { symbol: "ETCUSDT", name: "Ethereum Classic / Tether", currentPrice: 25 },
  { symbol: "XLMUSDT", name: "Stellar / Tether", currentPrice: 0.11 },
  { symbol: "APTUSDT", name: "Aptos / Tether", currentPrice: 9 },
  { symbol: "ARBUSDT", name: "Arbitrum / Tether", currentPrice: 0.95 },
  { symbol: "OPUSDT", name: "Optimism / Tether", currentPrice: 1.8 },
  { symbol: "INJUSDT", name: "Injective / Tether", currentPrice: 25 },
  { symbol: "FILUSDT", name: "Filecoin / Tether", currentPrice: 5.5 },
  { symbol: "NEARUSDT", name: "NEAR Protocol / Tether", currentPrice: 5 },
  { symbol: "IMXUSDT", name: "Immutable X / Tether", currentPrice: 1.6 },
  { symbol: "SUIUSDT", name: "Sui / Tether", currentPrice: 3.2 },
  { symbol: "STXUSDT", name: "Stacks / Tether", currentPrice: 1.9 },
  { symbol: "HBARUSDT", name: "Hedera / Tether", currentPrice: 0.22 },
  { symbol: "VETUSDT", name: "VeChain / Tether", currentPrice: 0.03 },
  { symbol: "ALGOUSDT", name: "Algorand / Tether", currentPrice: 0.2 },
  { symbol: "ICPUSDT", name: "Internet Computer / Tether", currentPrice: 12 },
  { symbol: "RENDERUSDT", name: "Render / Tether", currentPrice: 7 },
  { symbol: "FETUSDT", name: "Fetch.ai / Tether", currentPrice: 1.4 },
  { symbol: "GRTUSDT", name: "The Graph / Tether", currentPrice: 0.22 },
  { symbol: "AAVEUSDT", name: "Aave / Tether", currentPrice: 340 },
  { symbol: "MKRUSDT", name: "Maker / Tether", currentPrice: 1400 },
  { symbol: "CRVUSDT", name: "Curve DAO / Tether", currentPrice: 0.45 },
  { symbol: "SANDUSDT", name: "The Sandbox / Tether", currentPrice: 0.45 },
  { symbol: "MANAUSDT", name: "Decentraland / Tether", currentPrice: 0.4 },
  { symbol: "AXSUSDT", name: "Axie Infinity / Tether", currentPrice: 7 },
  { symbol: "THETAUSDT", name: "Theta Network / Tether", currentPrice: 2 },
  { symbol: "FTMUSDT", name: "Fantom / Tether", currentPrice: 0.6 },
  { symbol: "EGLDUSDT", name: "MultiversX / Tether", currentPrice: 45 },
  { symbol: "FLOWUSDT", name: "Flow / Tether", currentPrice: 0.9 },
  { symbol: "XTZUSDT", name: "Tezos / Tether", currentPrice: 0.95 },
  { symbol: "EOSUSDT", name: "EOS / Tether", currentPrice: 0.7 },
  { symbol: "KAVAUSDT", name: "Kava / Tether", currentPrice: 0.6 },
  { symbol: "ZECUSDT", name: "Zcash / Tether", currentPrice: 35 },
  { symbol: "DASHUSDT", name: "Dash / Tether", currentPrice: 28 },
  { symbol: "SNXUSDT", name: "Synthetix / Tether", currentPrice: 2.2 },
  { symbol: "COMPUSDT", name: "Compound / Tether", currentPrice: 55 },
  { symbol: "YFIUSDT", name: "yearn.finance / Tether", currentPrice: 6500 },
  { symbol: "1INCHUSDT", name: "1inch / Tether", currentPrice: 0.4 },
  { symbol: "ENSUSDT", name: "Ethereum Name Service / Tether", currentPrice: 18 },
  { symbol: "LDOUSDT", name: "Lido DAO / Tether", currentPrice: 1.8 },
  { symbol: "RPLUSDT", name: "Rocket Pool / Tether", currentPrice: 22 },
  { symbol: "PEPEUSDT", name: "Pepe / Tether", currentPrice: 0.000012 },
  { symbol: "WIFUSDT", name: "dogwifhat / Tether", currentPrice: 2.1 },
  { symbol: "BONKUSDT", name: "Bonk / Tether", currentPrice: 0.000025 },
  { symbol: "FLOKIUSDT", name: "FLOKI / Tether", currentPrice: 0.00018 },
  { symbol: "SHIBUSDT", name: "Shiba Inu / Tether", currentPrice: 0.000022 },
  { symbol: "SEIUSDT", name: "Sei / Tether", currentPrice: 0.35 },
  { symbol: "TIAUSDT", name: "Celestia / Tether", currentPrice: 6 },
  { symbol: "ORDIUSDT", name: "ORDI / Tether", currentPrice: 35 },
  { symbol: "JUPUSDT", name: "Jupiter / Tether", currentPrice: 0.95 },
  { symbol: "PYTHUSDT", name: "Pyth Network / Tether", currentPrice: 0.35 },
  { symbol: "WLDUSDT", name: "Worldcoin / Tether", currentPrice: 2.2 },
  { symbol: "STRKUSDT", name: "Starknet / Tether", currentPrice: 0.95 },
  { symbol: "PENDLEUSDT", name: "Pendle / Tether", currentPrice: 5.5 },
  { symbol: "ENAUSDT", name: "Ethena / Tether", currentPrice: 0.65 },
  { symbol: "ETHBTC", name: "Ethereum / Bitcoin", currentPrice: 0.05 },
  { symbol: "BNBBTC", name: "BNB / Bitcoin", currentPrice: 0.0097 },
  { symbol: "SOLBTC", name: "Solana / Bitcoin", currentPrice: 0.0023 },
  { symbol: "XRPBTC", name: "XRP / Bitcoin", currentPrice: 0.0000087 },
  { symbol: "ADAETH", name: "Cardano / Ethereum", currentPrice: 0.00015 },
  { symbol: "DOGEBTC", name: "Dogecoin / Bitcoin", currentPrice: 0.0000013 },
  { symbol: "LINKETH", name: "Chainlink / Ethereum", currentPrice: 0.0047 },
  { symbol: "DOTBTC", name: "Polkadot / Bitcoin", currentPrice: 0.00012 },
  { symbol: "AVAXETH", name: "Avalanche / Ethereum", currentPrice: 0.012 },
  { symbol: "MATICETH", name: "Polygon / Ethereum", currentPrice: 0.00028 },
  { symbol: "LTCBTC", name: "Litecoin / Bitcoin", currentPrice: 0.0011 },
  { symbol: "UNIETH", name: "Uniswap / Ethereum", currentPrice: 0.0033 },
  { symbol: "ATOMBTC", name: "Cosmos / Bitcoin", currentPrice: 0.00013 },
  { symbol: "NEARETH", name: "NEAR / Ethereum", currentPrice: 0.0017 },
  { symbol: "APTETH", name: "Aptos / Ethereum", currentPrice: 0.003 },
  { symbol: "ARBETH", name: "Arbitrum / Ethereum", currentPrice: 0.00032 },
  { symbol: "OPETH", name: "Optimism / Ethereum", currentPrice: 0.0006 },
  { symbol: "INJBTC", name: "Injective / Bitcoin", currentPrice: 0.00042 },
  { symbol: "SUIETH", name: "Sui / Ethereum", currentPrice: 0.00053 },
  { symbol: "STXBTC", name: "Stacks / Bitcoin", currentPrice: 0.000032 },
  { symbol: "RENDERETH", name: "Render / Ethereum", currentPrice: 0.0023 },
  { symbol: "FETETH", name: "Fetch.ai / Ethereum", currentPrice: 0.00047 },
  { symbol: "AAVEETH", name: "Aave / Ethereum", currentPrice: 0.113 },
  { symbol: "MKRETH", name: "Maker / Ethereum", currentPrice: 0.047 },
  { symbol: "PEPEETH", name: "Pepe / Ethereum", currentPrice: 0.0000000004 },
  { symbol: "WIFBTC", name: "dogwifhat / Bitcoin", currentPrice: 0.000035 },
  { symbol: "TAOUSDT", name: "Bittensor / Tether", currentPrice: 380 },
  { symbol: "ONDOUSDT", name: "Ondo Finance / Tether", currentPrice: 1.1 },
  { symbol: "JASMYUSDT", name: "JasmyCoin / Tether", currentPrice: 0.02 },
  { symbol: "NOTUSDT", name: "Notcoin / Tether", currentPrice: 0.012 },
  { symbol: "ZROUSDT", name: "LayerZero / Tether", currentPrice: 2.5 },
  { symbol: "LISTAUSDT", name: "Lista DAO / Tether", currentPrice: 0.45 }
];

// --- Real prices from Binance (как на TradingView) ---
const BINANCE_TICKER_URL = "https://api.binance.com/api/v3/ticker/price";
const BINANCE_WS_URL = "wss://stream.binance.com:9443/ws/!ticker@arr";
const BINANCE_FETCH_TIMEOUT_MS = 12_000;
const BINANCE_RETRIES = 3;
const BINANCE_RETRY_DELAY_MS = 1000;
/** Логируем ошибку Binance не чаще раза в 5 минут */
let lastBinanceErrorLog = 0;
const BINANCE_ERROR_LOG_INTERVAL_MS = 5 * 60 * 1000;

async function fetchBinancePrices(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= BINANCE_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), BINANCE_FETCH_TIMEOUT_MS);
      const res = await fetch(BINANCE_TICKER_URL, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) return map;
      const data = (await res.json()) as Array<{ symbol: string; price: string }>;
      for (const item of data) {
        const price = parseFloat(item.price);
        if (Number.isFinite(price) && price > 0) map.set(item.symbol, price);
      }
      return map;
    } catch (err) {
      lastErr = err;
      if (attempt < BINANCE_RETRIES) {
        await new Promise((r) => setTimeout(r, BINANCE_RETRY_DELAY_MS));
      }
    }
  }
  const now = Date.now();
  if (now - lastBinanceErrorLog >= BINANCE_ERROR_LOG_INTERVAL_MS) {
    lastBinanceErrorLog = now;
    // eslint-disable-next-line no-console
    console.error("Binance fetch failed after retries (prices from DB/cache):", lastErr);
  }
  return map;
}

// --- Simple in-memory price store & real price feed ---
type PriceSubscribers = Set<(pairId: number, price: number) => void>;

// --- OHLC candles in memory ---
type Timeframe =
  | "1s"
  | "30s"
  | "1m"
  | "5m"
  | "10m"
  | "15m"
  | "1h"
  | "2h"
  | "5h";

/** Глубина истории: 30 дней */
const MAX_CHART_HOURS = 720;

/** Лимит свечей в памяти и в ответе API — чтобы не лагало при мелких ТФ */
const MAX_CANDLES_PER_TIMEFRAME = 3000;

function timeframeToSeconds(tf: Timeframe): number {
  switch (tf) {
    case "1s":
      return 1;
    case "30s":
      return 30;
    case "1m":
      return 60;
    case "5m":
      return 300;
    case "10m":
      return 600;
    case "15m":
      return 900;
    case "1h":
      return 3600;
    case "2h":
      return 7200;
    case "5h":
      return 18000;
    default:
      return 60;
  }
}

/** Максимум свечей: 30 дней по ТФ, но не больше MAX_CANDLES_PER_TIMEFRAME */
function maxCandlesForChart(tf: Timeframe): number {
  const sec = timeframeToSeconds(tf);
  const for30Days = Math.ceil((MAX_CHART_HOURS * 3600) / sec);
  return Math.min(for30Days, MAX_CANDLES_PER_TIMEFRAME);
}

type Candle = {
  startTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
};

type OnCandleClosed = (
  pairId: number,
  timeframe: Timeframe,
  candle: Candle
) => void | Promise<void>;

class CandleService {
  private candles = new Map<string, Candle[]>();
  private onCandleClosed: OnCandleClosed | null = null;

  setOnCandleClosed(cb: OnCandleClosed | null) {
    this.onCandleClosed = cb;
  }

  private key(pairId: number, timeframe: Timeframe): string {
    return `${pairId}-${timeframe}`;
  }

  /** Загрузить историю из БД (после рестарта) */
  hydrate(pairId: number, timeframe: Timeframe, candles: Candle[]) {
    if (!candles.length) return;
    const key = this.key(pairId, timeframe);
    const existing = this.candles.get(key) ?? [];
    const merged = [...existing];
    for (const c of candles) {
      const t = c.startTime.getTime();
      if (!merged.some((x) => x.startTime.getTime() === t)) {
        merged.push({
          startTime: new Date(c.startTime),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close)
        });
      }
    }
    merged.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const maxCandles = maxCandlesForChart(timeframe);
    const cutoffMs = Date.now() - MAX_CHART_HOURS * 3600 * 1000;
    const trimmed = merged.filter((c) => c.startTime.getTime() >= cutoffMs);
    this.candles.set(key, trimmed.slice(-maxCandles));
  }

  update(pairId: number, price: number, ts: Date) {
    const timeframes: Timeframe[] = [
      "1s",
      "30s",
      "1m",
      "5m",
      "10m",
      "15m",
      "1h",
      "2h",
      "5h"
    ];
    for (const tf of timeframes) {
      this.updateForTimeframe(pairId, price, ts, tf);
    }
  }

  private updateForTimeframe(
    pairId: number,
    price: number,
    ts: Date,
    timeframe: Timeframe
  ) {
    const sec = timeframeToSeconds(timeframe);
    const bucketStartMs = Math.floor(ts.getTime() / 1000 / sec) * sec * 1000;
    const key = this.key(pairId, timeframe);
    const list = this.candles.get(key) ?? [];
    const last = list[list.length - 1];

    if (!last || last.startTime.getTime() !== bucketStartMs) {
      if (last && this.onCandleClosed) {
        try {
          this.onCandleClosed(pairId, timeframe, last);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("onCandleClosed error", err);
        }
      }
      const candle: Candle = {
        startTime: new Date(bucketStartMs),
        open: price,
        high: price,
        low: price,
        close: price
      };
      list.push(candle);
      const maxCandles = maxCandlesForChart(timeframe);
      const cutoffMs = ts.getTime() - MAX_CHART_HOURS * 3600 * 1000;
      const trimmed = list.filter((c) => c.startTime.getTime() >= cutoffMs);
      if (trimmed.length < list.length) {
        list.length = 0;
        list.push(...trimmed);
      } else if (list.length > maxCandles) {
        list.splice(0, list.length - maxCandles);
      }
      this.candles.set(key, list);
    } else {
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.close = price;
    }
  }

  getCandles(
    pairId: number,
    timeframe: Timeframe,
    limit: number
  ): Candle[] {
    const key = this.key(pairId, timeframe);
    const list = this.candles.get(key) ?? [];
    const cutoffMs = Date.now() - MAX_CHART_HOURS * 3600 * 1000;
    const inRange = list.filter((c) => c.startTime.getTime() >= cutoffMs);
    if (!limit || limit <= 0) return inRange;
    return inRange.slice(-limit);
  }
}

class PriceService {
  private prices = new Map<number, number>();
  private subscribers: PriceSubscribers = new Set();
  /** symbol (BTCUSDT) → pairId */
  private symbolToPairId = new Map<string, number>();
  private binanceWs: InstanceType<typeof WebSocket> | null = null;
  private binanceWsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  async init() {
    const allowedSymbols = new Set(
      POPULAR_TRADING_PAIRS.map((row) => row.symbol)
    );
    const existing = await prisma.tradingPair.findMany({
      select: { id: true, symbol: true, currentPrice: true }
    });

    // Удаляем пары, которых нет в списке Binance (форекс, старые и т.д.)
    const toRemove = existing.filter((p) => !allowedSymbols.has(p.symbol));
    for (const pair of toRemove) {
      await prisma.trade.deleteMany({ where: { tradingPairId: pair.id } });
      await prisma.tradingPair.delete({ where: { id: pair.id } });
    }
    if (toRemove.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`Removed ${toRemove.length} old/forex pairs (kept only Binance list).`);
    }

    const existingAfter = await prisma.tradingPair.findMany({
      select: { symbol: true }
    });
    const existingSymbols = new Set(existingAfter.map((p) => p.symbol));
    const toCreate = POPULAR_TRADING_PAIRS.filter(
      (row) => !existingSymbols.has(row.symbol)
    ).map((row) => ({
      symbol: row.symbol,
      name: row.name,
      currentPrice: row.currentPrice,
      category: STABLECOIN_SYMBOLS.has(row.symbol) ? "stablecoin" : "crypto"
    }));
    if (toCreate.length > 0) {
      await prisma.tradingPair.createMany({ data: toCreate });
    }
    for (const symbol of STABLECOIN_SYMBOLS) {
      await prisma.tradingPair.updateMany({ where: { symbol }, data: { category: "stablecoin" } });
    }

    const allPairs = await prisma.tradingPair.findMany({
      orderBy: { id: "asc" }
    });
    for (const p of allPairs) this.symbolToPairId.set(p.symbol, p.id);
    const binancePrices = await fetchBinancePrices();
    for (const p of allPairs) {
      const realPrice = binancePrices.get(p.symbol);
      const price =
        realPrice != null && Number.isFinite(realPrice)
          ? realPrice
          : Number(p.currentPrice);
      this.prices.set(p.id, price);
      if (realPrice != null) {
        await prisma.tradingPair.update({
          where: { id: p.id },
          data: { currentPrice: price }
        });
      }
    }
  }

  subscribe(cb: (pairId: number, price: number) => void) {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  private notify(pairId: number, price: number) {
    for (const cb of this.subscribers) {
      cb(pairId, price);
    }
  }

  getPrice(pairId: number) {
    return this.prices.get(pairId);
  }

  /** Применить тикер из Binance WebSocket (realtime) */
  applyBinanceTicker(
    symbol: string,
    price: number,
    candleService: CandleService,
    ts: Date
  ) {
    const pairId = this.symbolToPairId.get(symbol);
    if (pairId == null || !Number.isFinite(price) || price <= 0) return;
    this.prices.set(pairId, price);
    candleService.update(pairId, price, ts);
    this.notify(pairId, price);
  }

  /** Binance WebSocket — real-time tickers (как TradingView) */
  private startBinanceWebSocket(candleService: CandleService) {
    const connect = () => {
      try {
        const ws = new WebSocket(BINANCE_WS_URL);
        this.binanceWs = ws;
        ws.on("open", () => {
          // eslint-disable-next-line no-console
          console.log("[Binance WS] Connected — real-time prices");
        });
        ws.on("message", (data: Buffer) => {
          try {
            const arr = JSON.parse(data.toString()) as Array<{ s?: string; c?: string }>;
            if (!Array.isArray(arr)) return;
            const ts = new Date();
            for (const t of arr) {
              const symbol = t.s;
              const price = parseFloat(t.c ?? "0");
              if (symbol && Number.isFinite(price)) {
                this.applyBinanceTicker(symbol, price, candleService, ts);
              }
            }
          } catch {
            // ignore parse errors
          }
        });
        ws.on("close", () => {
          this.binanceWs = null;
          // reconnect after 5s
          this.binanceWsReconnectTimer = setTimeout(connect, 5000);
        });
        ws.on("error", () => {
          ws.terminate();
        });
      } catch (err) {
        const now = Date.now();
        if (now - lastBinanceErrorLog >= BINANCE_ERROR_LOG_INTERVAL_MS) {
          lastBinanceErrorLog = now;
          // eslint-disable-next-line no-console
          console.error("[Binance WS] Connect error:", err);
        }
        this.binanceWsReconnectTimer = setTimeout(connect, 5000);
      }
    };
    connect();
  }

  private async runPriceFeedRound(candleService: CandleService) {
    const pairs = await prisma.tradingPair.findMany();
    for (const p of pairs) this.symbolToPairId.set(p.symbol, p.id);
    const binancePrices = await fetchBinancePrices();
    const ts = new Date();
    for (const pair of pairs) {
      const realPrice = binancePrices.get(pair.symbol);
      let next: number;
      if (realPrice != null && Number.isFinite(realPrice) && realPrice > 0) {
        next = realPrice;
      } else {
        const current = this.prices.get(pair.id) ?? Number(pair.currentPrice);
        next = current;
      }
      this.prices.set(pair.id, next);
      await prisma.tradingPair.update({
        where: { id: pair.id },
        data: { currentPrice: next }
      });
      candleService.update(pair.id, next, ts);
      this.notify(pair.id, next);
    }
  }

  startRealPriceFeed(candleService: CandleService) {
    this.runPriceFeedRound(candleService).catch((err) =>
      // eslint-disable-next-line no-console
      console.error("Error in initial price feed", err)
    );
    this.startBinanceWebSocket(candleService);
    const REST_FALLBACK_MS = 60_000;
    setInterval(() => {
      this.runPriceFeedRound(candleService).catch((err) =>
        // eslint-disable-next-line no-console
        console.error("Error in price feed fallback", err)
      );
    }, REST_FALLBACK_MS);
  }
}

const candleService = new CandleService();
const priceService = new PriceService();

async function persistCandle(
  pairId: number,
  timeframe: Timeframe,
  candle: { startTime: Date; open: number; high: number; low: number; close: number }
) {
  await prisma.ohlcCandle.upsert({
    where: {
      tradingPairId_timeframe_startTime: {
        tradingPairId: pairId,
        timeframe,
        startTime: candle.startTime
      }
    },
    create: {
      tradingPairId: pairId,
      timeframe,
      startTime: candle.startTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    },
    update: {
      high: candle.high,
      low: candle.low,
      close: candle.close
    }
  });
}

async function loadCandlesFromDb(): Promise<void> {
  const cutoff = new Date(Date.now() - MAX_CHART_HOURS * 3600 * 1000);
  const rows = await prisma.ohlcCandle.findMany({
    where: { startTime: { gte: cutoff } },
    orderBy: [{ tradingPairId: "asc" }, { timeframe: "asc" }, { startTime: "asc" }]
  });
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.tradingPairId}-${r.timeframe}`;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }
  for (const [key, list] of byKey) {
    const dashIdx = key.indexOf("-");
    const pairIdStr = key.slice(0, dashIdx);
    const timeframe = key.slice(dashIdx + 1);
    const pairId = parseInt(pairIdStr, 10);
    if (!Number.isFinite(pairId) || !timeframe) continue;
    const candles: Candle[] = list.map((r) => ({
      startTime: r.startTime,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close)
    }));
    candleService.hydrate(pairId, timeframe as Timeframe, candles);
  }
  if (rows.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`Loaded ${rows.length} candles from DB (last ${MAX_CHART_HOURS}h).`);
  }
}

// --- WebSocket server for price & trade updates + presence (online users) ---
type WsClient = {
  socket: WebSocket;
};

/** Онлайн-присутствие: userId -> { lastSeen, wsCount } */
const presenceMap = new Map<number, { lastSeen: number; wsCount: number }>();
/** ws -> userId для отписки при закрытии соединения */
const wsToUserId = new Map<WebSocket, number>();

const PRESENCE_STALE_MS = 90_000; // 90 сек без heartbeat = офлайн
const PRESENCE_CLEANUP_INTERVAL_MS = 60_000; // проверка каждые 60 сек

function updatePresence(userId: number) {
  const now = Date.now();
  const cur = presenceMap.get(userId);
  if (cur) {
    cur.lastSeen = now;
  } else {
    presenceMap.set(userId, { lastSeen: now, wsCount: 0 });
  }
}

function getOnlineUserIds(): number[] {
  const now = Date.now();
  const ids: number[] = [];
  for (const [userId, data] of presenceMap) {
    if (now - data.lastSeen < PRESENCE_STALE_MS && data.wsCount > 0) {
      ids.push(userId);
    }
  }
  return ids.sort((a, b) => a - b);
}

let wss: WebSocketServer | null = null;

function setupWebSocket(server: Server) {
  wss = new WebSocketServer({ server });

  // Периодическая очистка устаревших записей (на случай зависших ws без close)
  setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of presenceMap) {
      if (now - data.lastSeen >= PRESENCE_STALE_MS) {
        presenceMap.delete(userId);
      }
    }
  }, PRESENCE_CLEANUP_INTERVAL_MS);

  wss.on("connection", (ws) => {
    const socket = ws as unknown as WebSocket;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; token?: string };
        const t = msg?.type;

        if (t === "auth" && typeof msg.token === "string") {
          try {
            const payload = jwt.verify(msg.token, JWT_SECRET) as { userId: number };
            const userId = payload.userId;
            const cur = presenceMap.get(userId);
            if (cur) {
              cur.lastSeen = Date.now();
              cur.wsCount += 1;
            } else {
              presenceMap.set(userId, { lastSeen: Date.now(), wsCount: 1 });
            }
            wsToUserId.set(socket, userId);
            ws.send(JSON.stringify({ type: "authOk", userId }));
          } catch {
            ws.send(JSON.stringify({ type: "authErr", message: "Invalid token" }));
          }
          return;
        }

        if (t === "heartbeat" || t === "ping") {
          const userId = wsToUserId.get(socket);
          if (userId != null) {
            updatePresence(userId);
          }
          if (t === "ping") {
            ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
          }
          return;
        }
      } catch {
        // ignore malformed
      }
    });

    ws.on("close", () => {
      const userId = wsToUserId.get(socket);
      wsToUserId.delete(socket);
      if (userId != null) {
        const cur = presenceMap.get(userId);
        if (cur) {
          cur.wsCount -= 1;
          if (cur.wsCount <= 0) {
            presenceMap.delete(userId);
          }
        }
      }
    });
  });

  // Broadcast price updates
  priceService.subscribe((pairId, price) => {
    if (!wss) return;
    const payload = JSON.stringify({
      type: "price",
      pairId,
      price
    });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(payload);
      }
    });
  });
}

// Helper: отправить сообщение поддержки конкретному пользователю (для уведомлений в реальном времени)
function broadcastSupportMessageToUser(
  targetUserId: number,
  message: { id: number; role: string; body: string; createdAt: string }
) {
  if (!wss) return;
  const payload = JSON.stringify({ type: "supportMessage", message });
  wss.clients.forEach((client) => {
    const ws = client as unknown as WebSocket;
    if (ws.readyState === 1 && wsToUserId.get(ws) === targetUserId) {
      try {
        ws.send(payload);
      } catch {
        // ignore
      }
    }
  });
}

// Helper to broadcast trade updates
function broadcastTradeUpdate(tradeId: number) {
  if (!wss) return;
  setImmediate(async () => {
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        tradingPair: true,
        user: { select: { id: true, demoBalance: true, balance: true, useDemoMode: true } }
      }
    });
    if (!trade) return;
    let pnl: number | undefined;
    if (trade.status === TradeStatus.WIN) {
      const { winPayoutPercent } = await getTradingConfig();
      const baseAmount = Number(trade.amount);
      pnl = baseAmount * (winPayoutPercent / 100);
    } else if (trade.status === TradeStatus.LOSS) {
      const baseAmount = Number(trade.amount);
      pnl = -baseAmount;
    }
    const u = trade.user;
    const effectiveBalance = u?.useDemoMode ? Number(u.demoBalance) : Number(u?.balance ?? 0);
    const payload = JSON.stringify({
      type: "tradeUpdate",
      trade: {
        ...trade,
        ...(typeof pnl === "number" ? { pnl } : {}),
        user: u ? { id: u.id, demoBalance: Number(u.demoBalance), balance: Number(u.balance), useDemoMode: u.useDemoMode, effectiveBalance } : null
      }
    });
    wss!.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(payload);
      }
    });
  });
}

// --- Auth routes ---

// Капча: получить изображение (для регистрации)
app.get(
  "/auth/captcha",
  rateLimitMiddleware({ windowMs: 60 * 1000, max: 20 }),
  (_req, res) => {
    const { id, image } = createCaptcha();
    res.json({ id, image });
  }
);

app.post(
  "/auth/register",
  rateLimitMiddleware({ windowMs: 60 * 1000, max: 5 }),
  async (req, res) => {
  const { email, password, referralCode, captchaId, captchaAnswer } = req.body as {
    email?: string;
    password?: string;
    referralCode?: string;
    captchaId?: string;
    captchaAnswer?: string;
  };

  if (!email || !password || password.length < 6) {
    return res
      .status(400)
      .json({ message: "Email and password (min 6 chars) are required" });
  }

  if (!captchaId || !captchaAnswer) {
    return res.status(400).json({ message: "Введите символы с картинки (капча)" });
  }
  if (!verifyCaptcha(captchaId, captchaAnswer)) {
    return res.status(400).json({ message: "Неверная капча. Обновите картинку и попробуйте снова." });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(400).json({ message: "Email already registered" });
  }

  let referrerId: number | undefined;
  let referralPartnerId: number | undefined;
  if (referralCode && typeof referralCode === "string" && referralCode.trim()) {
    const code = referralCode.trim();
    const partner = await prisma.referralPartner.findUnique({ where: { referralCode: code } });
    if (partner) {
      referralPartnerId = partner.id;
    } else {
      const referrer = await prisma.user.findUnique({ where: { referralCode: code } });
      if (referrer) referrerId = referrer.id;
    }
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      password: hash,
      useDemoMode: true,
      ...(referrerId != null && { referrerId }),
      ...(referralPartnerId != null && { referralPartnerId })
    },
    select: { id: true, email: true, demoBalance: true, balance: true, useDemoMode: true, isAdmin: true }
  });

  const session = await createSessionForUser(user.id, req);
  const token = jwt.sign({ userId: user.id, sessionId: session.id }, JWT_SECRET, {
    expiresIn: "7d"
  });
  setAuthCookie(res, token);

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      demoBalance: user.demoBalance,
      balance: user.balance,
      useDemoMode: user.useDemoMode,
      isAdmin: user.isAdmin
    }
  });
});

// Вход: жёсткий лимит по IP + блокировка по email после 5 неудачных попыток
app.post(
  "/auth/login",
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 20 }),
  async (req, res) => {
  const { email, password, totpCode } = req.body as {
    email?: string;
    password?: string;
    totpCode?: string;
  };
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  const emailNorm = email.toLowerCase().trim();
  if (isLoginLocked(emailNorm)) {
    return res.status(429).json({ message: "Слишком много неудачных попыток. Попробуйте через 15 минут." });
  }
  const user = await prisma.user.findUnique({ where: { email: emailNorm } });
  if (!user) {
    recordLoginFailed(emailNorm);
    return res.status(400).json({ message: "Invalid credentials" });
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    recordLoginFailed(emailNorm);
    return res.status(400).json({ message: "Invalid credentials" });
  }
  clearLoginFailed(emailNorm);
  if (user.totpEnabled && user.totpSecret) {
    const code = (totpCode ?? "").toString().replace(/\s/g, "");
    if (!code) {
      return res.status(400).json({ message: "TOTP code required", requiresTotp: true });
    }
    const valid = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: "base32",
      token: code,
      window: 1
    });
    if (!valid) {
      return res.status(400).json({ message: "Invalid TOTP code", requiresTotp: true });
    }
  }
  const session = await createSessionForUser(user.id, req);
  const token = jwt.sign({ userId: user.id, sessionId: session.id }, JWT_SECRET, {
    expiresIn: "7d"
  });
  setAuthCookie(res, token);
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      demoBalance: user.demoBalance,
      balance: user.balance,
      useDemoMode: user.useDemoMode,
      isAdmin: user.isAdmin
    }
  });
});

app.post("/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

// --- Восстановление пароля (запрещено для админов) ---
const RESET_PASSWORD_EXPIRY_MS = 60 * 60 * 1000; // 1 час

app.post(
  "/auth/forgot-password",
  rateLimitMiddleware({ windowMs: 60 * 1000, max: 3 }),
  async (req, res) => {
    if (!isEmailConfigured()) {
      return res.status(503).json({ message: "Восстановление пароля временно недоступно" });
    }
    const body = req.body as { email?: string; locale?: string };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) {
      return res.status(400).json({ message: "Укажите email" });
    }
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isAdmin: true }
    });
    if (!user) {
      return res.json({ ok: true, message: "Если аккаунт существует, на почту отправлена ссылка для сброса пароля." });
    }
    if (user.isAdmin) {
      return res.json({ ok: true, message: "Если аккаунт существует, на почту отправлена ссылка для сброса пароля." });
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_PASSWORD_EXPIRY_MS);
    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken: token, resetPasswordExpiresAt: expiresAt }
    });
    const locale = (body.locale === "en" || body.locale === "es" ? body.locale : "ru") as "en" | "ru" | "es";
    const baseUrl = (FRONTEND_ORIGIN.split(",")[0] || "http://localhost:3000").trim().replace(/\/$/, "");
    const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await sendPasswordReset({ to: email, resetLink, locale });
    } catch (err) {
      console.error("Send password reset email error:", err);
      return res.status(500).json({ message: "Не удалось отправить письмо. Попробуйте позже." });
    }
    return res.json({ ok: true, message: "Если аккаунт существует, на почту отправлена ссылка для сброса пароля." });
  }
);

app.post(
  "/auth/reset-password",
  rateLimitMiddleware({ windowMs: 60 * 1000, max: 10 }),
  async (req, res) => {
    const body = req.body as { token?: string; newPassword?: string };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (!token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "Укажите токен и новый пароль (мин. 6 символов)" });
    }
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpiresAt: { gt: new Date() }
      },
      select: { id: true, isAdmin: true }
    });
    if (!user) {
      return res.status(400).json({ message: "Ссылка недействительна или истекла. Запросите сброс пароля снова." });
    }
    if (user.isAdmin) {
      return res.status(400).json({ message: "Восстановление пароля для этого аккаунта недоступно." });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hash, resetPasswordToken: null, resetPasswordExpiresAt: null }
    });
    return res.json({ ok: true, message: "Пароль успешно изменён. Войдите с новым паролем." });
  }
);

// --- Change password ---
app.post("/auth/change-password", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: "Current password and new password (min 6 chars) are required" });
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ message: "Unauthorized" });
  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) return res.status(400).json({ message: "Current password is incorrect" });
  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: req.userId },
    data: { password: hash }
  });
  return res.json({ ok: true });
});

// --- Change email: request code (sent to new email), confirm with code ---
const EMAIL_CHANGE_CODE_EXPIRY_MINUTES = 15;

function generateEmailChangeCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

app.post(
  "/auth/request-email-change",
  authMiddleware,
  rateLimitMiddleware({ windowMs: 60 * 1000, max: 3 }),
  async (req: AuthRequest, res) => {
    if (!isEmailConfigured()) {
      return res.status(503).json({ message: "Смена email временно недоступна" });
    }
    const body = req.body as { newEmail?: string; locale?: string };
    const newEmail = typeof body.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!newEmail || !emailRegex.test(newEmail)) {
      return res.status(400).json({ message: "Укажите корректный новый email" });
    }
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true }
    });
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (newEmail === user.email) {
      return res.status(400).json({ message: "Новый email совпадает с текущим" });
    }
    const existing = await prisma.user.findUnique({ where: { email: newEmail } });
    if (existing) {
      return res.status(400).json({ message: "Этот email уже занят" });
    }
    const code = generateEmailChangeCode();
    const expiresAt = new Date(Date.now() + EMAIL_CHANGE_CODE_EXPIRY_MINUTES * 60 * 1000);
    await prisma.user.update({
      where: { id: req.userId },
      data: { pendingNewEmail: newEmail, emailChangeCode: code, emailChangeExpiresAt: expiresAt }
    });
    const locale = (body.locale === "en" || body.locale === "es" ? body.locale : "ru") as "en" | "ru" | "es";
    try {
      await sendEmailChangeCode({ to: newEmail, code, locale });
    } catch (err) {
      console.error("Send email change code error:", err);
      return res.status(500).json({ message: "Не удалось отправить письмо. Попробуйте позже." });
    }
    return res.json({ ok: true, message: "Код отправлен на новый email" });
  }
);

app.post(
  "/auth/confirm-email-change",
  authMiddleware,
  rateLimitMiddleware({ windowMs: 60 * 1000, max: 10 }),
  async (req: AuthRequest, res) => {
    const body = req.body as { newEmail?: string; code?: string };
    const newEmail = typeof body.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
    if (!newEmail || !code) {
      return res.status(400).json({ message: "Укажите новый email и код из письма" });
    }
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, pendingNewEmail: true, emailChangeCode: true, emailChangeExpiresAt: true }
    });
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.pendingNewEmail !== newEmail || user.emailChangeCode !== code) {
      return res.status(400).json({ message: "Неверный email или код" });
    }
    if (!user.emailChangeExpiresAt || new Date() > user.emailChangeExpiresAt) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { pendingNewEmail: null, emailChangeCode: null, emailChangeExpiresAt: null }
      });
      return res.status(400).json({ message: "Код истёк. Запросите новый." });
    }
    await prisma.user.update({
      where: { id: req.userId },
      data: { email: newEmail, pendingNewEmail: null, emailChangeCode: null, emailChangeExpiresAt: null }
    });
    return res.json({ ok: true, email: newEmail });
  }
);

// --- TOTP setup (get secret + QR), enable, disable ---
const APP_NAME = process.env.TOTP_APP_NAME || "Binary Options";

app.get("/auth/totp/setup", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true, totpEnabled: true }
    });
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.totpEnabled) {
      return res.status(400).json({ message: "TOTP already enabled" });
    }
    const secret = speakeasy.generateSecret({
      name: `${APP_NAME} (${user.email})`,
      length: 20
    });
    const otpauth =
      (secret as { otpauth_url?: string }).otpauth_url ||
      speakeasy.otpauthURL({
        secret: (secret as { ascii?: string }).ascii ?? secret.base32,
        label: user.email,
        issuer: APP_NAME,
        encoding: (secret as { ascii?: string }).ascii ? "ascii" : "base32"
      });
    let qrDataUrl: string;
    try {
      qrDataUrl = await QRCode.toDataURL(otpauth, { width: 200, margin: 2 });
    } catch {
      return res.status(500).json({ message: "Failed to generate QR code" });
    }
    return res.json({
      secret: secret.base32,
      qrDataUrl
    });
  } catch (err) {
    console.error("TOTP setup error:", err);
    return res.status(500).json({ message: "Ошибка настройки 2FA" });
  }
});

app.post("/auth/totp/enable", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
  const { secret, code } = req.body as { secret?: string; code?: string };
  if (!secret || !code) {
    return res.status(400).json({ message: "secret and code are required" });
  }
  const token = (code as string).toString().replace(/\s/g, "");
  const valid = speakeasy.totp.verify({
    secret: (secret as string).trim(),
    encoding: "base32",
    token,
    window: 1
  });
  if (!valid) {
    return res.status(400).json({ message: "Invalid code" });
  }
  await prisma.user.update({
    where: { id: req.userId },
    data: { totpSecret: (secret as string).trim(), totpEnabled: true }
  });
  return res.json({ ok: true });
});

app.post("/auth/totp/disable", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
  const { code } = req.body as { code?: string };
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { totpSecret: true, totpEnabled: true }
  });
  if (!user || !user.totpEnabled) {
    return res.status(400).json({ message: "TOTP is not enabled" });
  }
  const token = (code ?? "").toString().replace(/\s/g, "");
  const valid = speakeasy.totp.verify({
    secret: user.totpSecret!,
    encoding: "base32",
    token,
    window: 1
  });
  if (!valid) {
    return res.status(400).json({ message: "Invalid code" });
  }
  await prisma.user.update({
    where: { id: req.userId },
    data: { totpSecret: null, totpEnabled: false }
  });
  return res.json({ ok: true });
});

// --- Sessions list and revoke ---
app.get("/sessions", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { userId: req.userId },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        osShort: true,
        firstSeenAt: true,
        lastSeenAt: true
      }
    });
    const currentSessionId = req.sessionId ?? null;
    return res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        ip: s.ip ?? "—",
        userAgentShort: s.osShort ?? "—",
        osShort: s.osShort ?? null,
        firstSeenAt: s.firstSeenAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        isCurrent: currentSessionId !== null && s.id === currentSessionId
      })),
      currentSessionId
    });
  } catch (err) {
    console.error("Sessions list error:", err);
    return res.status(500).json({ message: "Ошибка загрузки сессий" });
  }
});

app.delete("/sessions/:id", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: "Invalid session id" });
  }
  const deleted = await prisma.session.deleteMany({
    where: { id, userId: req.userId }
  });
  if (deleted.count === 0) {
    return res.status(404).json({ message: "Session not found" });
  }
  return res.json({ ok: true });
});

// --- Support chat (one thread per user) ---
function toSupportMessageRow(m: { id: number; role: string; body: string; createdAt: Date }) {
  return {
    id: m.id,
    role: m.role,
    body: m.body,
    createdAt: (m.createdAt as Date).toISOString()
  };
}

app.get("/support/thread", authMiddleware, async (req: AuthRequest, res) => {
  try {
    let thread = await prisma.supportThread.findUnique({
      where: { userId: req.userId },
      include: {
        messages: { orderBy: { createdAt: "asc" } }
      }
    });
    if (!thread) {
      thread = await prisma.supportThread.create({
        data: { userId: req.userId! },
        include: {
          messages: { orderBy: { createdAt: "asc" } }
        }
      });
    }
    if (!thread) return res.status(500).json({ message: "Ошибка загрузки чата" });
    return res.json({
      thread: { id: thread.id },
      messages: thread.messages.map(toSupportMessageRow)
    });
  } catch (err) {
    console.error("Support thread error:", err);
    return res.status(500).json({ message: "Ошибка загрузки чата" });
  }
});

app.post("/support/message", authMiddleware, async (req: AuthRequest, res) => {
  const text = (req.body?.text ?? "").toString().trim();
  if (!text || text.length > 4000) {
    return res.status(400).json({ message: "Сообщение от 1 до 4000 символов" });
  }
  try {
    let thread = await prisma.supportThread.findUnique({ where: { userId: req.userId! } });
    if (!thread) {
      thread = await prisma.supportThread.create({ data: { userId: req.userId! } });
    }
    const message = await prisma.supportMessage.create({
      data: { threadId: thread.id, role: "user", authorId: req.userId, body: text }
    });
    return res.json({ message: toSupportMessageRow(message) });
  } catch (err) {
    console.error("Support message error:", err);
    return res.status(500).json({ message: "Ошибка отправки" });
  }
});

app.get("/support/threads", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const threads = await prisma.supportThread.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { id: true, email: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });
    return res.json({
      threads: threads.map((t) => ({
        id: t.id,
        userId: t.userId,
        userEmail: t.user.email,
        lastMessage: t.messages[0]
          ? { body: t.messages[0].body, createdAt: (t.messages[0].createdAt as Date).toISOString(), role: t.messages[0].role }
          : null,
        updatedAt: (t.updatedAt as Date).toISOString()
      }))
    });
  } catch (err) {
    console.error("Support threads list error:", err);
    return res.status(500).json({ message: "Ошибка загрузки" });
  }
});

app.get("/support/threads/:id", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
  try {
    const thread = await prisma.supportThread.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true } },
        messages: { orderBy: { createdAt: "asc" } }
      }
    });
    if (!thread) return res.status(404).json({ message: "Тред не найден" });
    return res.json({
      thread: { id: thread.id, userEmail: thread.user.email, userId: thread.userId },
      messages: thread.messages.map(toSupportMessageRow)
    });
  } catch (err) {
    console.error("Support thread get error:", err);
    return res.status(500).json({ message: "Ошибка загрузки" });
  }
});

app.post("/support/threads/:id/reply", authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const text = (req.body?.text ?? "").toString().trim();
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
  if (!text || text.length > 4000) return res.status(400).json({ message: "Сообщение от 1 до 4000 символов" });
  try {
    const thread = await prisma.supportThread.findUnique({ where: { id } });
    if (!thread) return res.status(404).json({ message: "Тред не найден" });
    const message = await prisma.supportMessage.create({
      data: { threadId: thread.id, role: "admin", authorId: req.userId, body: text }
    });
    const row = toSupportMessageRow(message);
    broadcastSupportMessageToUser(thread.userId, row);
    return res.json({ message: row });
  } catch (err) {
    console.error("Support reply error:", err);
    return res.status(500).json({ message: "Ошибка отправки" });
  }
});

// --- User info / balance ---
app.get("/me", authMiddlewareWithSession, async (req: AuthRequest, res) => {
  const userId = Number(req.userId);
  if (!Number.isInteger(userId)) {
    return res.status(401).json({ message: "Invalid session" });
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      demoBalance: true,
      balance: true,
      useDemoMode: true,
      isAdmin: true,
      createdAt: true,
      referralCode: true,
      referralBalance: true,
      totpEnabled: true,
      blockedAt: true,
      withdrawBlockedAt: true,
      blockReason: true,
      socialClickInstagram: true,
      socialClickTelegram: true,
      socialBonusClaimedAt: true
    }
  });
  if (!user) return res.status(401).json({ message: "User not found" });
  const socialBonus = {
    instagramClicked: user.socialClickInstagram,
    telegramClicked: user.socialClickTelegram,
    bonusClaimed: user.socialBonusClaimedAt != null
  };
  return res.json({
    user: {
      id: user.id,
      email: user.email,
      demoBalance: user.demoBalance,
      balance: user.balance,
      useDemoMode: user.useDemoMode,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      referralCode: user.referralCode,
      referralBalance: user.referralBalance,
      totpEnabled: user.totpEnabled,
      blockedAt: user.blockedAt?.toISOString() ?? null,
      withdrawBlockedAt: user.withdrawBlockedAt?.toISOString() ?? null,
      blockReason: user.blockReason,
      socialBonus
    }
  });
});

// Переключение демо / реальный режим
app.patch("/me", authMiddlewareWithSession, async (req: AuthRequest, res) => {
  const userId = Number(req.userId);
  if (!Number.isInteger(userId)) return res.status(401).json({ message: "Invalid session" });
  const body = req.body as { useDemoMode?: boolean };
  const useDemoMode = typeof body.useDemoMode === "boolean" ? body.useDemoMode : undefined;
  if (useDemoMode === undefined) return res.status(400).json({ message: "useDemoMode required" });
  const user = await prisma.user.update({
    where: { id: userId },
    data: { useDemoMode },
    select: { id: true, demoBalance: true, balance: true, useDemoMode: true }
  });
  return res.json({ useDemoMode: user.useDemoMode, demoBalance: user.demoBalance, balance: user.balance });
});

// Начисление средств на демо-баланс (только в демо-режиме)
app.post(
  "/demo/add-funds",
  authMiddleware,
  rateLimitMiddleware({ windowMs: 60 * 1000, max: 10 }),
  async (req: AuthRequest, res) => {
    const userId = Number(req.userId);
    const body = req.body as { amount?: number };
    const amount = typeof body.amount === "number" ? body.amount : parseFloat(String(body.amount ?? ""));
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000) {
      return res.status(400).json({ message: "Amount must be between 1 and 100000" });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, useDemoMode: true, demoBalance: true }
    });
    if (!user) return res.status(401).json({ message: "User not found" });
    if (!user.useDemoMode) {
      return res.status(400).json({ message: "Add funds only available in demo mode" });
    }
    const balanceBefore = Number(user.demoBalance);
    const balanceAfter = balanceBefore + amount;
    await prisma.$transaction(async (tx) => {
      await (tx as PrismaClient).user.update({
        where: { id: userId },
        data: { demoBalance: { increment: amount } }
      });
      await createBalanceAudit(tx, {
        userId,
        type: "demo_add",
        amount,
        balanceBefore,
        balanceAfter,
        refType: "demo",
        refId: undefined,
        refBalanceType: "demo"
      });
    });
    const updated = await prisma.user.findUnique({
      where: { id: userId },
      select: { demoBalance: true }
    });
    return res.json({ demoBalance: Number(updated?.demoBalance ?? balanceAfter) });
  }
);

const SOCIAL_BONUS_AMOUNT = 100;

// --- Бонус за клики по соцсетям: начисление ровно 1 раз после клика по всем ---
app.post("/bonus/social-click", authMiddleware, async (req: AuthRequest, res) => {
  const body = req.body as { platform?: string };
  const platform = typeof body.platform === "string" ? body.platform.toLowerCase() : "";
  if (platform !== "instagram" && platform !== "telegram") {
    return res.status(400).json({ message: "platform must be 'instagram' or 'telegram'" });
  }
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      demoBalance: true,
      blockedAt: true,
      socialClickInstagram: true,
      socialClickTelegram: true,
      socialBonusClaimedAt: true
    }
  });
  if (!user) return res.status(401).json({ message: "User not found" });

  const updates: { socialClickInstagram?: boolean; socialClickTelegram?: boolean; socialBonusClaimedAt?: Date } = {};
  if (platform === "instagram" && !user.socialClickInstagram) updates.socialClickInstagram = true;
  if (platform === "telegram" && !user.socialClickTelegram) updates.socialClickTelegram = true;

  let credited = false;
  let newBalance = Number(user.demoBalance);

  if (Object.keys(updates).length > 0) {
    const bothClicked = (user.socialClickInstagram || updates.socialClickInstagram) && (user.socialClickTelegram || updates.socialClickTelegram);
    const canClaim = bothClicked && !user.socialBonusClaimedAt && !user.blockedAt;

    if (canClaim) {
      updates.socialBonusClaimedAt = new Date();
      const result = await prisma.$transaction(async (tx) => {
        const updated = await (tx as PrismaClient).user.update({
          where: { id: user.id },
          data: {
            ...updates,
            demoBalance: { increment: SOCIAL_BONUS_AMOUNT }
          },
          select: { demoBalance: true }
        });
        const balanceBefore = Number(user.demoBalance);
        const balanceAfter = Number(updated.demoBalance);
        await createBalanceAudit(tx, {
          userId: user.id,
          type: "social_bonus",
          amount: SOCIAL_BONUS_AMOUNT,
          balanceBefore,
          balanceAfter,
          refType: "bonus",
          refId: "social"
        });
        return { demoBalance: updated.demoBalance };
      });
      newBalance = Number(result.demoBalance);
      credited = true;
      notifyBalanceChange(prisma, {
        userId: user.id,
        type: "social_bonus",
        amount: SOCIAL_BONUS_AMOUNT,
        balanceBefore: Number(user.demoBalance),
        balanceAfter: newBalance,
        refType: "bonus",
        refId: "social"
      }).catch(() => {});
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: updates
      });
    }
  } else {
    newBalance = Number(user.demoBalance);
  }

  const updatedUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { socialClickInstagram: true, socialClickTelegram: true, socialBonusClaimedAt: true }
  });
  return res.json({
    instagramClicked: updatedUser?.socialClickInstagram ?? user.socialClickInstagram,
    telegramClicked: updatedUser?.socialClickTelegram ?? user.socialClickTelegram,
    bonusClaimed: (updatedUser?.socialBonusClaimedAt ?? user.socialBonusClaimedAt) != null,
    credited,
    demoBalance: newBalance
  });
});

// --- Referral: ensure code exists and return stats ---
app.get("/referral", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
  let user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      referralCode: true,
      referralBalance: true,
      referralClicks: true
    }
  });
  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }
  let code = user.referralCode;
  if (!code) {
    for (let attempt = 0; attempt < 5; attempt++) {
      code = generateReferralCode();
      try {
        await prisma.user.update({
          where: { id: req.userId },
          data: { referralCode: code }
        });
        break;
      } catch (e) {
        // unique constraint violation, try again
        code = "";
      }
    }
    if (!code) {
      return res.status(500).json({ message: "Failed to generate referral code" });
    }
  }
  const referredCount = await prisma.user.count({
    where: { referrerId: req.userId }
  });
  const referredUserIds = await prisma.user.findMany({
    where: { referrerId: req.userId },
    select: { id: true }
  });
  const referredIds = referredUserIds.map((u) => u.id);
  const [totalBetsByReferred, totalLossesByReferred] =
    referredIds.length > 0
      ? await Promise.all([
          prisma.trade.count({
            where: {
              userId: { in: referredIds },
              status: { in: [TradeStatus.WIN, TradeStatus.LOSS] }
            }
          }),
          prisma.trade.aggregate({
            where: {
              userId: { in: referredIds },
              status: TradeStatus.LOSS
            },
            _sum: { amount: true }
          })
        ])
      : [0, { _sum: { amount: null } }];

  const userAfter = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { referralBalance: true, referralClicks: true }
  });

  const baseUrl = (req.get("origin") || process.env.FRONTEND_ORIGIN?.split(",")[0] || "http://localhost:3000").replace(/\/$/, "");
  const referralLink = `${baseUrl}/register?ref=${code}`;
  const refBalance = Number(userAfter?.referralBalance ?? 0);

  return res.json({
    referralCode: code,
    referralLink,
    referralBalance: refBalance,
    referralClicks: userAfter?.referralClicks ?? 0,
    referredCount,
    totalBetsByReferred: totalBetsByReferred ?? 0,
    totalLossesAmount: Number(totalLossesByReferred?._sum?.amount ?? 0),
    totalEarnedFromLosses: refBalance
  });
});

// --- Public: count click on referral link (no auth) — проверяет и User, и ReferralPartner ---
function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

app.get("/ref/click", async (req, res) => {
  const code = (req.query.code as string)?.trim();
  if (!code) {
    return res.status(400).json({ message: "Missing code" });
  }
  const partner = await prisma.referralPartner.findUnique({ where: { referralCode: code } });
  if (partner) {
    const ip = getClientIp(req);
    const ipHash = hashIp(ip);
    await prisma.$transaction([
      prisma.referralPartner.update({
        where: { id: partner.id },
        data: { referralClicks: { increment: 1 } }
      }),
      prisma.referralClickEvent.create({
        data: { partnerId: partner.id, ipHash }
      })
    ]);
    return res.json({ ok: true });
  }
  const userUpdated = await prisma.user.updateMany({
    where: { referralCode: code },
    data: { referralClicks: { increment: 1 } }
  });
  if (userUpdated.count === 0) {
    return res.status(404).json({ message: "Invalid referral code" });
  }
  return res.json({ ok: true });
});

// --- Withdraw referral balance to user's effective balance (demo or real) ---
app.post(
  "/referral/withdraw",
  authMiddleware,
  rateLimitMiddleware({ windowMs: RATE_WINDOW_MS, max: 10 }),
  requireNotBlockedMiddleware,
  async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, useDemoMode: true, demoBalance: true, balance: true, referralBalance: true, blockedAt: true, withdrawBlockedAt: true }
    });
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (user.blockedAt) {
      return res.status(403).json({
        code: "ACCOUNT_BLOCKED",
        message: "Аккаунт заблокирован. Вывод недоступен."
      });
    }
    if (user.withdrawBlockedAt) {
      return res.status(403).json({
        code: "WITHDRAW_BLOCKED",
        message: "Вывод средств временно заблокирован. Обратитесь в поддержку."
      });
    }
    const withdrawn = Number(user.referralBalance);
    if (withdrawn <= 0) return res.status(400).json({ message: "Nothing to withdraw" });
    const balanceType = user.useDemoMode ? "demo" : "real";
    const result = await prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE "User" SET "referralBalance" = 0 WHERE id = ${req.userId} AND "referralBalance" > 0
      `;
      if (affected === 0) return null;
      if (balanceType === "demo") {
        await (tx as PrismaClient).user.update({
          where: { id: req.userId! },
          data: { demoBalance: { increment: withdrawn } }
        });
      } else {
        await (tx as PrismaClient).user.update({
          where: { id: req.userId! },
          data: { balance: { increment: withdrawn } }
        });
      }
      const updated = await tx.user.findUnique({
        where: { id: req.userId },
        select: { demoBalance: true, balance: true }
      });
      if (!updated) return null;
      const balanceBefore = balanceType === "demo" ? Number(user.demoBalance) : Number(user.balance);
      const balanceAfter = balanceType === "demo" ? Number(updated.demoBalance) : Number(updated.balance);
      await createBalanceAudit(tx, {
        userId: req.userId!,
        type: "referral_transfer",
        amount: withdrawn,
        balanceBefore,
        balanceAfter,
        refType: "referral",
        refBalanceType: balanceType
      });
      return { balanceAfter, balanceType };
    });
    if (!result) return res.status(400).json({ message: "Nothing to withdraw" });
    notifyBalanceChange(prisma, {
      userId: req.userId!,
      type: "referral_transfer",
      amount: withdrawn,
      balanceBefore: result.balanceAfter - withdrawn,
      balanceAfter: result.balanceAfter,
      refType: "referral"
    }).catch(() => {});
    return res.json({
      demoBalance: result.balanceType === "demo" ? result.balanceAfter : Number(user.demoBalance),
      balance: result.balanceType === "real" ? result.balanceAfter : Number(user.balance),
      referralBalance: 0,
      withdrawn
    });
  }
);

// --- Referral Partners: отдельная регистрация/авторизация, личный кабинет ---
app.post("/referral-partners/register", async (req, res) => {
  const { email, password, name } = req.body as { email?: string; password?: string; name?: string };
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ message: "Email и пароль (мин. 6 символов) обязательны" });
  }
  const existing = await prisma.referralPartner.findUnique({ where: { email } });
  if (existing) {
    return res.status(400).json({ message: "Email уже зарегистрирован" });
  }
  let code = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generatePartnerReferralCode();
    const existingCode = await prisma.referralPartner.findUnique({ where: { referralCode: code } })
      || await prisma.user.findUnique({ where: { referralCode: code } });
    if (!existingCode) break;
  }
  if (!code) {
    return res.status(500).json({ message: "Не удалось сгенерировать реферальный код" });
  }
  const hash = await bcrypt.hash(password, 10);
  const defaultCpa = process.env.REFERRAL_DEFAULT_CPA ? Number(process.env.REFERRAL_DEFAULT_CPA) : null;
  const partner = await prisma.referralPartner.create({
    data: {
      email,
      password: hash,
      name: name?.trim() || null,
      referralCode: code,
      ...(defaultCpa != null && defaultCpa > 0 && { cpaAmount: defaultCpa })
    }
  });
  const token = jwt.sign({ referralPartnerId: partner.id }, JWT_SECRET, { expiresIn: "7d" });
  setPartnerAuthCookie(res, token);
  return res.json({
    token,
    partner: {
      id: partner.id,
      email: partner.email,
      name: partner.name,
      referralCode: partner.referralCode
    }
  });
});

app.post("/referral-partners/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ message: "Email и пароль обязательны" });
  }
  const partner = await prisma.referralPartner.findUnique({ where: { email } });
  if (!partner || !(await bcrypt.compare(password, partner.password))) {
    return res.status(400).json({ message: "Неверные учетные данные" });
  }
  const token = jwt.sign({ referralPartnerId: partner.id }, JWT_SECRET, { expiresIn: "7d" });
  setPartnerAuthCookie(res, token);
  return res.json({
    token,
    partner: {
      id: partner.id,
      email: partner.email,
      name: partner.name,
      referralCode: partner.referralCode
    }
  });
});

app.post("/referral-partners/logout", (_req, res) => {
  clearPartnerAuthCookie(res);
  return res.json({ ok: true });
});

// --- Вывод накопленных средств партнёра на баланс (User с тем же email) ---
app.post(
  "/referral-partners/withdraw",
  partnerAuthMiddleware,
  rateLimitMiddleware({ windowMs: RATE_WINDOW_MS, max: 10 }),
  async (req: AuthRequest, res) => {
    const withdrawConfig = await getReferralWithdrawConfig();
    if (withdrawConfig.viaManager) {
      return res.status(403).json({
        code: "WITHDRAW_VIA_MANAGER",
        message: "Вывод средств выполняется через менеджера в Telegram",
        managerTelegram: withdrawConfig.managerTelegram
      });
    }
    const partner = await prisma.referralPartner.findUnique({
      where: { id: req.referralPartnerId },
      select: { email: true, referralBalance: true }
    });
    if (!partner) return res.status(401).json({ message: "Partner not found" });
    const balance = Number(partner.referralBalance ?? 0);
    if (balance <= 0) {
      return res.status(400).json({ message: "Нечего выводить" });
    }
    const user = await prisma.user.findUnique({
      where: { email: partner.email },
      select: { id: true, balance: true, blockedAt: true, withdrawBlockedAt: true }
    });
    if (!user) {
      return res.status(400).json({
        message: "Создайте торговый аккаунт с тем же email для вывода средств"
      });
    }
    if (user.blockedAt) {
      return res.status(403).json({ message: "Торговый аккаунт заблокирован" });
    }
    if (user.withdrawBlockedAt) {
      return res.status(403).json({ message: "Вывод временно заблокирован. Обратитесь в поддержку." });
    }
    const balanceBefore = Number(user.balance);
    const result = await prisma.$transaction(async (tx) => {
      const affected = await tx.referralPartner.updateMany({
        where: { id: req.referralPartnerId, referralBalance: { gt: 0 } },
        data: { referralBalance: 0 }
      });
      if (affected.count === 0) return null;
      await tx.user.update({
        where: { id: user.id },
        data: { balance: { increment: balance } }
      });
      await createBalanceAudit(tx, {
        userId: user.id,
        type: "referral_transfer",
        amount: balance,
        balanceBefore,
        balanceAfter: balanceBefore + balance,
        refType: "referral",
        refBalanceType: "real"
      });
      return { balance: balanceBefore + balance };
    });
    if (!result) return res.status(400).json({ message: "Нечего выводить" });
    notifyBalanceChange(prisma, {
      userId: user.id,
      type: "referral_transfer",
      amount: balance,
      balanceBefore,
      balanceAfter: result.balance,
      refType: "referral"
    }).catch(() => {});
    return res.json({
      referralBalance: 0,
      withdrawn: balance,
      balance: result.balance
    });
  }
);

app.get("/referral-partners/withdraw-config", partnerAuthMiddleware, async (_req: AuthRequest, res) => {
  const config = await getReferralWithdrawConfig();
  return res.json(config);
});

app.get("/referral-partners/withdrawals", partnerAuthMiddleware, async (req: AuthRequest, res) => {
  const partner = await prisma.referralPartner.findUnique({
    where: { id: req.referralPartnerId },
    select: { email: true }
  });
  if (!partner) return res.status(401).json({ message: "Partner not found" });
  const user = await prisma.user.findUnique({
    where: { email: partner.email },
    select: { id: true }
  });
  if (!user) {
    return res.json({ withdrawals: [], totalWithdrawn: 0 });
  }
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const where: { userId: number; type: string; createdAt?: { gte?: Date; lte?: Date } } = {
    userId: user.id,
    type: "referral_transfer"
  };
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      where.createdAt.lte = to;
    }
  }
  const [logs, agg] = await Promise.all([
    prisma.balanceAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, amount: true, createdAt: true }
    }),
    prisma.balanceAuditLog.aggregate({
      where,
      _sum: { amount: true },
      _count: true
    })
  ]);
  const totalWithdrawn = Number(agg._sum.amount ?? 0);
  return res.json({
    withdrawals: logs.map((l) => ({
      id: l.id,
      amount: Number(l.amount),
      createdAt: l.createdAt.toISOString()
    })),
    totalWithdrawn
  });
});

app.get("/referral-partners/me", partnerAuthMiddleware, async (req: AuthRequest, res) => {
  const partner = await prisma.referralPartner.findUnique({
    where: { id: req.referralPartnerId },
    select: { id: true, email: true, name: true, referralCode: true, referralClicks: true }
  });
  if (!partner) return res.status(401).json({ message: "Partner not found" });
  return res.json(partner);
});

app.get("/referral-partners/stats", partnerAuthMiddleware, async (req: AuthRequest, res) => {
  const referredIds = (await prisma.user.findMany({
    where: { referralPartnerId: req.referralPartnerId },
    select: { id: true }
  })).map((u) => u.id);

  const [referredCount, totalBets, totalLosses, totalWins] = referredIds.length > 0
    ? await Promise.all([
        prisma.user.count({ where: { referralPartnerId: req.referralPartnerId } }),
        prisma.trade.count({
          where: { userId: { in: referredIds }, status: { in: [TradeStatus.WIN, TradeStatus.LOSS] } }
        }),
        prisma.trade.aggregate({
          where: { userId: { in: referredIds }, status: TradeStatus.LOSS },
          _sum: { amount: true }
        }),
        prisma.trade.aggregate({
          where: { userId: { in: referredIds }, status: TradeStatus.WIN },
          _sum: { amount: true }
        })
      ])
    : [0, 0, { _sum: { amount: null } } as { _sum: { amount: number | null } }, { _sum: { amount: null } } as { _sum: { amount: number | null } }];

  const partner = await prisma.referralPartner.findUnique({
    where: { id: req.referralPartnerId },
    select: { referralCode: true, referralClicks: true, referralBalance: true }
  });
  // Реферальная ссылка — всегда на основной платформу (lk.auraretrade.com), не на tbofin.com
  const mainSite = (process.env.MAIN_SITE_URL || "https://lk.auraretrade.com").replace(/\/$/, "");
  const referralLink = `${mainSite}/register?ref=${partner?.referralCode ?? ""}`;
  const totalLossesAmount = Number(totalLosses?._sum?.amount ?? 0);
  const totalEarnings = Number(partner?.referralBalance ?? 0);

  return res.json({
    referredCount,
    totalBets,
    totalLossesAmount,
    totalWinsAmount: Number(totalWins?._sum?.amount ?? 0),
    referralClicks: partner?.referralClicks ?? 0,
    referralLink,
    referralBalance: totalEarnings,
    totalEarnings
  });
});

app.get("/referral-partners/analytics/losses", partnerAuthMiddleware, async (req: AuthRequest, res) => {
  const referredIds = (await prisma.user.findMany({
    where: { referralPartnerId: req.referralPartnerId },
    select: { id: true }
  })).map((u) => u.id);

  if (referredIds.length === 0) {
    return res.json({ referrals: [], totalEarnings: 0 });
  }

  const losses = await prisma.trade.findMany({
    where: { userId: { in: referredIds }, status: TradeStatus.LOSS },
    include: {
      user: { select: { id: true, email: true, createdAt: true } },
      tradingPair: { select: { symbol: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  const byUser = new Map<number, { email: string; joinedAt: string; losses: number; earnings: number; trades: number }>();
  for (const t of losses) {
    const uid = t.userId;
    const amt = Number(t.amount);
    const earnings = amt * 0.5;
    if (!byUser.has(uid)) {
      byUser.set(uid, {
        email: t.user.email,
        joinedAt: t.user.createdAt.toISOString(),
        losses: 0,
        earnings: 0,
        trades: 0
      });
    }
    const r = byUser.get(uid)!;
    r.losses += amt;
    r.earnings += earnings;
    r.trades += 1;
  }

  const referrals = Array.from(byUser.entries()).map(([userId, data]) => ({
    userId,
    ...data
  })).sort((a, b) => b.earnings - a.earnings);

  const totalEarnings = referrals.reduce((s, r) => s + r.earnings, 0);

  return res.json({
    referrals,
    totalEarnings,
    recentEarnings: losses.slice(0, 50).map((t) => {
      const amt = Number(t.amount);
      return {
        id: t.id,
        userId: t.userId,
        userEmail: t.user.email,
        amount: amt,
        earnings: amt * 0.5,
        pair: t.tradingPair.symbol,
        direction: t.direction,
        createdAt: t.createdAt.toISOString()
      };
    })
  });
});

app.get("/referral-partners/referrals", partnerAuthMiddleware, async (req: AuthRequest, res) => {
  const users = await prisma.user.findMany({
    where: { referralPartnerId: req.referralPartnerId },
    select: {
      id: true,
      email: true,
      createdAt: true,
      demoBalance: true
    }
  });

  const userIds = users.map((u) => u.id);
  const [lossAgg, winAgg] = userIds.length > 0
    ? await Promise.all([
        prisma.trade.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds }, status: TradeStatus.LOSS },
          _sum: { amount: true },
          _count: true
        }),
        prisma.trade.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds }, status: TradeStatus.WIN },
          _sum: { amount: true },
          _count: true
        })
      ])
    : [[], []];

  const lossMap = new Map<number, { sum: number; count: number }>();
  for (const r of lossAgg as { userId: number; _sum: { amount: number | null }; _count: number }[]) {
    lossMap.set(r.userId, { sum: Number(r._sum.amount ?? 0), count: r._count });
  }
  const winMap = new Map<number, { sum: number; count: number }>();
  for (const r of winAgg as { userId: number; _sum: { amount: number | null }; _count: number }[]) {
    winMap.set(r.userId, { sum: Number(r._sum.amount ?? 0), count: r._count });
  }

  const list = users.map((u) => {
    const loss = lossMap.get(u.id) ?? { sum: 0, count: 0 };
    const win = winMap.get(u.id) ?? { sum: 0, count: 0 };
    return {
      id: u.id,
      email: u.email,
      joinedAt: u.createdAt.toISOString(),
      demoBalance: Number(u.demoBalance),
      totalLosses: loss.sum,
      lossCount: loss.count,
      totalWins: win.sum,
      winCount: win.count
    };
  });

  return res.json({ referrals: list });
});

app.get("/referral-partners/referrals/:userId", partnerAuthMiddleware, async (req: AuthRequest, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ message: "Invalid userId" });
  }
  const user = await prisma.user.findFirst({
    where: { id: userId, referralPartnerId: req.referralPartnerId },
    select: {
      id: true,
      email: true,
      createdAt: true,
      demoBalance: true
    }
  });
  if (!user) {
    return res.status(404).json({ message: "Referral not found" });
  }

  const [lossAgg, winAgg, trades, payins, cpaPayments] = await Promise.all([
    prisma.trade.aggregate({
      where: { userId, status: TradeStatus.LOSS },
      _sum: { amount: true },
      _count: true
    }),
    prisma.trade.aggregate({
      where: { userId, status: TradeStatus.WIN },
      _sum: { amount: true },
      _count: true
    }),
    prisma.trade.findMany({
      where: { userId, status: { in: [TradeStatus.WIN, TradeStatus.LOSS] } },
      include: { tradingPair: { select: { symbol: true } } },
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.paymentTransaction.findMany({
      where: { userId, type: "payin", status: "success" },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: "asc" }
    }),
    prisma.referralCpaPayment.findFirst({
      where: { partnerId: req.referralPartnerId!, userId },
      select: { amount: true, createdAt: true }
    })
  ]);

  const totalLosses = Number(lossAgg._sum.amount ?? 0);
  const totalWins = Number(winAgg._sum.amount ?? 0);
  const revShare = totalLosses * 0.5;
  const cpaAmount = cpaPayments ? Number(cpaPayments.amount) : 0;
  const totalEarnings = revShare + cpaAmount;

  let ftd: { amount: number; date: string } | null = null;
  const redeps: Array<{ amount: number; date: string }> = [];
  if (payins.length > 0) {
    ftd = { amount: Number(payins[0].amount), date: payins[0].createdAt.toISOString() };
    for (let i = 1; i < payins.length; i++) {
      redeps.push({ amount: Number(payins[i].amount), date: payins[i].createdAt.toISOString() });
    }
  }

  return res.json({
    referral: {
      id: user.id,
      email: user.email,
      joinedAt: user.createdAt.toISOString(),
      demoBalance: Number(user.demoBalance)
    },
    stats: {
      totalTrades: lossAgg._count + winAgg._count,
      lossCount: lossAgg._count,
      winCount: winAgg._count,
      totalLosses,
      totalWins,
      ftd,
      redeps,
      cpaAmount,
      revShare,
      totalEarnings
    },
    recentTrades: trades.map((t) => ({
      id: t.id,
      pair: t.tradingPair.symbol,
      direction: t.direction,
      amount: Number(t.amount),
      status: t.status,
      createdAt: t.createdAt.toISOString()
    }))
  });
});

// --- Referral Partners: отчёт с фильтрами (Traffic, CPA, Rev, Performance) ---
type GroupBy = "day" | "week" | "month";

function truncateToGroup(date: Date, groupBy: GroupBy): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  if (groupBy === "day") return `${y}-${m}-${d}`;
  if (groupBy === "week") {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay());
    return truncateToGroup(start, "day");
  }
  return `${y}-${m}`;
}

app.get("/referral-partners/report", partnerAuthMiddleware, async (req: AuthRequest, res) => {
  const partnerId = req.referralPartnerId!;
  const dateFrom = req.query.dateFrom as string;
  const dateTo = req.query.dateTo as string;
  const groupBy = (req.query.groupBy as GroupBy) || "day";

  const from = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = dateTo ? new Date(dateTo) : new Date();
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const referredIds = (await prisma.user.findMany({
    where: { referralPartnerId: partnerId },
    select: { id: true, createdAt: true }
  })).map((u) => u.id);

  // Clicks by date
  const clickEvents = await prisma.referralClickEvent.findMany({
    where: { partnerId, createdAt: { gte: from, lte: to } },
    select: { createdAt: true, ipHash: true }
  });

  const clickByDate = new Map<string, { total: number; unique: number }>();
  const uniqueIpsByDate = new Map<string, Set<string>>();
  for (const e of clickEvents) {
    const key = truncateToGroup(e.createdAt, groupBy);
    if (!clickByDate.has(key)) {
      clickByDate.set(key, { total: 0, unique: 0 });
      uniqueIpsByDate.set(key, new Set());
    }
    const r = clickByDate.get(key)!;
    r.total += 1;
    if (e.ipHash) {
      if (!uniqueIpsByDate.get(key)!.has(e.ipHash)) {
        uniqueIpsByDate.get(key)!.add(e.ipHash);
        r.unique += 1;
      }
    } else {
      r.unique += 1;
    }
  }

  // Registrations by date
  const regByDate = new Map<string, number>();
  for (const u of await prisma.user.findMany({
    where: { referralPartnerId: partnerId, createdAt: { gte: from, lte: to } },
    select: { createdAt: true }
  })) {
    const key = truncateToGroup(u.createdAt, groupBy);
    regByDate.set(key, (regByDate.get(key) ?? 0) + 1);
  }

  // FTD: first payin per user
  const payins = await prisma.paymentTransaction.findMany({
    where: {
      userId: { in: referredIds },
      type: "payin",
      status: "success",
      createdAt: { gte: from, lte: to }
    },
    select: { userId: true, amount: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });
  const firstPayinByUser = new Map<number, { amount: number; createdAt: Date }>();
  for (const p of payins) {
    if (!firstPayinByUser.has(p.userId)) {
      firstPayinByUser.set(p.userId, { amount: Number(p.amount), createdAt: p.createdAt });
    }
  }
  const ftdByDate = new Map<string, { count: number; amount: number }>();
  for (const [, v] of firstPayinByUser) {
    if (v.createdAt >= from && v.createdAt <= to) {
      const key = truncateToGroup(v.createdAt, groupBy);
      const r = ftdByDate.get(key) ?? { count: 0, amount: 0 };
      r.count += 1;
      r.amount += v.amount;
      ftdByDate.set(key, r);
    }
  }

  // ReDeps: subsequent payins
  const redepsByDate = new Map<string, { count: number; amount: number }>();
  for (const p of payins) {
    if (firstPayinByUser.has(p.userId) && firstPayinByUser.get(p.userId)!.createdAt.getTime() !== p.createdAt.getTime()) {
      const key = truncateToGroup(p.createdAt, groupBy);
      const r = redepsByDate.get(key) ?? { count: 0, amount: 0 };
      r.count += 1;
      r.amount += Number(p.amount);
      redepsByDate.set(key, r);
    }
  }

  // CPA
  const cpaPayments = await prisma.referralCpaPayment.findMany({
    where: { partnerId, createdAt: { gte: from, lte: to } },
    select: { amount: true, createdAt: true }
  });
  const cpaByDate = new Map<string, number>();
  for (const c of cpaPayments) {
    const key = truncateToGroup(c.createdAt, groupBy);
    cpaByDate.set(key, (cpaByDate.get(key) ?? 0) + Number(c.amount));
  }

  // Rev Share: 50% of losses from referred users
  const losses = await prisma.trade.findMany({
    where: {
      userId: { in: referredIds },
      status: TradeStatus.LOSS,
      createdAt: { gte: from, lte: to }
    },
    select: { amount: true, createdAt: true }
  });
  const revByDate = new Map<string, number>();
  for (const t of losses) {
    const key = truncateToGroup(t.createdAt, groupBy);
    revByDate.set(key, (revByDate.get(key) ?? 0) + Number(t.amount) * 0.5);
  }

  // Purchases (trades) and value
  const trades = await prisma.trade.findMany({
    where: {
      userId: { in: referredIds },
      status: { in: [TradeStatus.WIN, TradeStatus.LOSS] },
      createdAt: { gte: from, lte: to }
    },
    select: { amount: true, createdAt: true }
  });
  const purchByDate = new Map<string, { count: number; value: number }>();
  for (const t of trades) {
    const key = truncateToGroup(t.createdAt, groupBy);
    const r = purchByDate.get(key) ?? { count: 0, value: 0 };
    r.count += 1;
    r.value += Number(t.amount);
    purchByDate.set(key, r);
  }

  // Withdrawals
  const payouts = await prisma.paymentTransaction.findMany({
    where: {
      userId: { in: referredIds },
      type: "payout",
      status: "success",
      createdAt: { gte: from, lte: to }
    },
    select: { amount: true, createdAt: true }
  });
  const withdrawByDate = new Map<string, number>();
  for (const p of payouts) {
    const key = truncateToGroup(p.createdAt, groupBy);
    withdrawByDate.set(key, (withdrawByDate.get(key) ?? 0) + Number(p.amount));
  }

  // All dates in range
  const allKeys = new Set<string>();
  for (const m of [clickByDate, regByDate, ftdByDate, redepsByDate, cpaByDate, revByDate, purchByDate, withdrawByDate]) {
    for (const k of m.keys()) allKeys.add(k);
  }
  const sortedKeys = Array.from(allKeys).sort();

  const rows = sortedKeys.map((key) => {
    const clicks = clickByDate.get(key) ?? { total: 0, unique: 0 };
    const reg = regByDate.get(key) ?? 0;
    const ftd = ftdByDate.get(key) ?? { count: 0, amount: 0 };
    const redeps = redepsByDate.get(key) ?? { count: 0, amount: 0 };
    const cpa = cpaByDate.get(key) ?? 0;
    const rev = revByDate.get(key) ?? 0;
    const purch = purchByDate.get(key) ?? { count: 0, value: 0 };
    const withdraw = withdrawByDate.get(key) ?? 0;
    const depAmount = (ftd.amount + redeps.amount);
    const depWithdraw = depAmount - withdraw;
    const clickToFtd = clicks.total > 0 && ftd.count > 0 ? (ftd.count / clicks.total) * 100 : 0;
    const totalEarnings = cpa + rev;
    const epc = clicks.total > 0 ? totalEarnings / clicks.total : 0;

    return {
      date: key,
      totalClicks: clicks.total,
      uniqueClicks: clicks.unique,
      registration: reg,
      ftd: ftd.count,
      ftdAmount: ftd.amount,
      redeps: redeps.count,
      redepsAmount: redeps.amount,
      rewardCpaConfirm: cpa,
      rewardCpaHold: 0,
      incomeRevConfirm: rev,
      incomeRevHold: 0,
      clickToFtd: Math.round(clickToFtd * 100) / 100,
      epc: Math.round(epc * 100) / 100,
      purchases: purch.count,
      purchValue: purch.value,
      withdrawal: withdraw,
      depWithdrawal: depWithdraw
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      totalClicks: acc.totalClicks + r.totalClicks,
      uniqueClicks: acc.uniqueClicks + r.uniqueClicks,
      registration: acc.registration + r.registration,
      ftd: acc.ftd + r.ftd,
      ftdAmount: acc.ftdAmount + r.ftdAmount,
      redeps: acc.redeps + r.redeps,
      redepsAmount: acc.redepsAmount + r.redepsAmount,
      rewardCpaConfirm: acc.rewardCpaConfirm + r.rewardCpaConfirm,
      incomeRevConfirm: acc.incomeRevConfirm + r.incomeRevConfirm,
      purchases: acc.purchases + r.purchases,
      purchValue: acc.purchValue + r.purchValue,
      withdrawal: acc.withdrawal + r.withdrawal,
      depWithdrawal: acc.depWithdrawal + r.depWithdrawal
    }),
    {
      totalClicks: 0,
      uniqueClicks: 0,
      registration: 0,
      ftd: 0,
      ftdAmount: 0,
      redeps: 0,
      redepsAmount: 0,
      rewardCpaConfirm: 0,
      incomeRevConfirm: 0,
      purchases: 0,
      purchValue: 0,
      withdrawal: 0,
      depWithdrawal: 0
    }
  );
  const totalClicks = totals.totalClicks;
  const clickToFtd = totalClicks > 0 && totals.ftd > 0 ? Math.round((totals.ftd / totalClicks) * 10000) / 100 : 0;
  const epc = totalClicks > 0 ? Math.round(((totals.rewardCpaConfirm + totals.incomeRevConfirm) / totalClicks) * 100) / 100 : 0;

  return res.json({
    rows,
    totals: { ...totals, clickToFtd, epc },
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
    groupBy
  });
});

// --- HighHelp: пополнение и вывод ---
function generatePaymentId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${ts}-${rnd}`;
}

app.get("/payments/config", authMiddleware, (_req, res) => {
  return res.json({ highHelpEnabled: isHighHelpConfigured() });
});

app.post(
  "/payments/deposit",
  authMiddleware,
  rateLimitMiddleware({ windowMs: RATE_WINDOW_MS, max: 10 }),
  requireNotBlockedMiddleware,
  async (req: AuthRequest, res) => {
  if (!isHighHelpConfigured()) {
    return res.status(503).json({ message: "Платежи временно недоступны" });
  }
  const { amount, currency = "RUB" } = req.body as { amount?: number; currency?: string };
  const num = Number(amount);
  if (!Number.isFinite(num) || num < 1 || num > 500000) {
    return res.status(400).json({ message: "Сумма от 1 до 500 000" });
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ message: "Unauthorized" });

  const paymentId = generatePaymentId("payin");
  const base = BACKEND_PUBLIC_URL;
  const callbackUrl = `${base}/payments/webhook`;
  const successUrl = `${base}/payments/webhook`;
  const declineUrl = `${base}/payments/webhook`;

  try {
    const tx = await prisma.paymentTransaction.create({
      data: {
        userId: user.id,
        type: "payin",
        amount: num,
        currency: currency.slice(0, 3).toUpperCase(),
        paymentId,
        status: "pending",
        method: "card-p2p"
      }
    });

    const result = await createPayin({
      paymentId,
      amount: num,
      currency: tx.currency,
      callbackUrl,
      successUrl,
      declineUrl,
      redirectUrl: `${process.env.FRONTEND_ORIGIN?.split(",")[0] || "http://localhost:3000"}/deposit?done=1`,
      customerId: String(user.id),
      customerIp: getClientIp(req) || "127.0.0.1",
      customerCountry: "RU",
      method: "card-p2p",
      lifetime: 600
    });

    const formUrl = result.integration?.form_url || null;
    await prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: {
        requestId: result.request_id ?? null,
        status: result.status,
        subStatus: result.sub_status ?? null,
        formUrl,
        rawPayload: JSON.stringify(result)
      }
    });

    return res.json({
      paymentId: tx.paymentId,
      status: result.status,
      formUrl,
      message: formUrl ? "Перейдите по ссылке для оплаты" : "Заявка создана"
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка создания заявки";
    console.error("Payin create error:", err);
    return res.status(500).json({ message: msg });
  }
});

app.post(
  "/payments/withdraw",
  authMiddleware,
  rateLimitMiddleware({ windowMs: RATE_WINDOW_MS, max: 10 }),
  requireNotBlockedMiddleware,
  async (req: AuthRequest, res) => {
  if (!isHighHelpConfigured()) {
    return res.status(503).json({ message: "Платежи временно недоступны" });
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ message: "Unauthorized" });
  if (user.withdrawBlockedAt) {
    return res.status(403).json({
      code: "WITHDRAW_BLOCKED",
      message: "Вывод средств временно заблокирован"
    });
  }

  const { amount, pan, cardHolder, currency = "RUB" } = req.body as {
    amount?: number;
    pan?: string;
    cardHolder?: string;
    currency?: string;
  };
  const num = Number(amount);
  const balance = Number(user.balance);
  if (!Number.isFinite(num) || num < 1 || num > balance) {
    return res.status(400).json({ message: "Неверная сумма или недостаточно средств" });
  }
  const panClean = String(pan ?? "").replace(/\s/g, "");
  const holder = String(cardHolder ?? "").trim();
  if (panClean.length < 16 || holder.length < 2) {
    return res.status(400).json({ message: "Укажите номер карты и имя держателя" });
  }

  const paymentId = generatePaymentId("payout");
  const base = BACKEND_PUBLIC_URL;
  const callbackUrl = `${base}/payments/webhook`;
  const successUrl = `${base}/payments/webhook`;
  const declineUrl = `${base}/payments/webhook`;

  const balanceBefore = Number(user.balance);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { balance: { decrement: num } }
      });
      await tx.paymentTransaction.create({
        data: {
          userId: user.id,
          type: "payout",
          amount: num,
          currency: currency.slice(0, 3).toUpperCase(),
          paymentId,
          status: "pending",
          method: "card-p2p"
        }
      });
      await createBalanceAudit(tx, {
        userId: user.id,
        type: "withdraw",
        amount: -num,
        balanceBefore,
        balanceAfter: balanceBefore - num,
        refType: "payment",
        refId: paymentId,
        refBalanceType: "real"
      });
    });

    notifyBalanceChange(prisma, {
      userId: user.id,
      type: "withdraw",
      amount: -num,
      balanceBefore,
      balanceAfter: balanceBefore - num,
      refType: "payment",
      refId: paymentId
    }).catch(() => {});

    const result = await createPayout({
      paymentId,
      amount: num,
      currency: currency.slice(0, 3).toUpperCase(),
      method: "card-p2p",
      pan: panClean,
      cardHolder: holder,
      callbackUrl,
      successUrl,
      declineUrl,
      customerId: String(user.id),
      customerIp: getClientIp(req) || "127.0.0.1",
      customerCountry: "RU",
      description: `Вывод #${paymentId}`
    });

    const tx = await prisma.paymentTransaction.findUnique({
      where: { paymentId }
    });
    if (tx) {
      await prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: {
          requestId: result.request_id ?? null,
          status: result.status,
          subStatus: result.sub_status ?? null,
          rawPayload: JSON.stringify(result)
        }
      });
    }

    return res.json({
      paymentId,
      status: result.status,
      message: "Заявка на вывод принята"
    });
  } catch (err) {
    await prisma.user.update({
      where: { id: user.id },
      data: { balance: { increment: num } }
    }).catch(() => {});
    const msg = err instanceof Error ? err.message : "Ошибка создания вывода";
    console.error("Payout create error:", err);
    return res.status(500).json({ message: msg });
  }
});

async function paymentsWebhookHandler(
  req: express.Request,
  res: express.Response
): Promise<void> {
  const rawBody = req.body as Buffer | undefined;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).send("Bad Request");
    return;
  }
  let body: {
    project_id?: string;
    general?: { request_id?: string; payment_id?: string };
    status?: { status?: string; sub_status?: string; status_description?: string };
    payment_info?: { amount?: number; currency?: string; type?: string };
  };
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).send("Bad Request");
    return;
  }
  const projectId = body.project_id ?? "";
  if (!verifyWebhookPayload(projectId, rawBody, req.headers)) {
    res.status(401).send("Unauthorized");
    return;
  }
  const paymentId = body.general?.payment_id ?? "";
  const statusVal = body.status?.status ?? "";
  const subStatus = body.status?.sub_status ?? null;
  const idempotencyKey = `${projectId}:${paymentId}:${statusVal}:${subStatus ?? ""}`;

  try {
    await prisma.processedCallback.create({ data: { idempotencyKey } });
  } catch {
    res.status(200).send("OK");
    return;
  }

  const tx = await prisma.paymentTransaction.findUnique({
    where: { paymentId },
    include: { user: true }
  });
  if (!tx) {
    res.status(200).send("OK");
    return;
  }

  await prisma.paymentTransaction.update({
    where: { id: tx.id },
    data: {
      status: statusVal,
      subStatus: subStatus ?? null,
      rawPayload: JSON.stringify(body)
    }
  });

  if (tx.type === "payin" && statusVal === "success") {
    const amount = Number(tx.amount);
    let balanceBefore = 0;
    await prisma.$transaction(async (t) => {
      const u = await t.user.findUnique({
        where: { id: tx.userId },
        select: { balance: true, referralPartnerId: true }
      });
      if (!u) return;
      balanceBefore = Number(u.balance);
      await t.user.update({
        where: { id: tx.userId },
        data: { balance: { increment: amount } }
      });
      await createBalanceAudit(t, {
        userId: tx.userId,
        type: "deposit",
        amount,
        balanceBefore,
        balanceAfter: balanceBefore + amount,
        refType: "payment",
        refId: tx.paymentId,
        refBalanceType: "real"
      });
      // FTD: first successful payin — начисляем CPA партнёру
      if (u.referralPartnerId) {
        const prevPayins = await t.paymentTransaction.count({
          where: {
            userId: tx.userId,
            type: "payin",
            status: "success",
            id: { not: tx.id }
          }
        });
        if (prevPayins === 0) {
          const partner = await t.referralPartner.findUnique({
            where: { id: u.referralPartnerId },
            select: { cpaAmount: true, referralBalance: true }
          });
          const cpa = partner?.cpaAmount ? Number(partner.cpaAmount) : 0;
          if (cpa > 0) {
            await t.referralCpaPayment.create({
              data: { partnerId: u.referralPartnerId, userId: tx.userId, amount: cpa }
            });
            await t.referralPartner.update({
              where: { id: u.referralPartnerId },
              data: { referralBalance: { increment: cpa } }
            });
          }
        }
      }
    });
    notifyBalanceChange(prisma, {
      userId: tx.userId,
      type: "deposit",
      amount,
      balanceBefore,
      balanceAfter: balanceBefore + amount,
      refType: "payment",
      refId: tx.paymentId
    }).catch(() => {});
  }
  if (tx.type === "payout" && (statusVal === "decline" || statusVal === "error")) {
    const amount = Number(tx.amount);
    let balanceBefore = 0;
    await prisma.$transaction(async (t) => {
      const u = await t.user.findUnique({
        where: { id: tx.userId },
        select: { balance: true }
      });
      if (!u) return;
      balanceBefore = Number(u.balance);
      await t.user.update({
        where: { id: tx.userId },
        data: { balance: { increment: amount } }
      });
      await createBalanceAudit(t, {
        userId: tx.userId,
        type: "withdraw_refund",
        amount,
        balanceBefore,
        balanceAfter: balanceBefore + amount,
        refType: "payment",
        refId: tx.paymentId,
        refBalanceType: "real"
      });
    });
    notifyBalanceChange(prisma, {
      userId: tx.userId,
      type: "withdraw_refund",
      amount,
      balanceBefore,
      balanceAfter: balanceBefore + amount,
      refType: "payment",
      refId: tx.paymentId
    }).catch(() => {});
  }

  res.status(200).send("OK");
}

app.get("/payments/history", authMiddleware, async (req: AuthRequest, res) => {
  const list = await prisma.paymentTransaction.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      amount: true,
      currency: true,
      paymentId: true,
      status: true,
      subStatus: true,
      formUrl: true,
      createdAt: true
    }
  });
  return res.json({
    payments: list.map((p) => ({
      ...p,
      amount: Number(p.amount),
      createdAt: p.createdAt.toISOString()
    }))
  });
});

// --- Admin: добавить торговую пару ---
app.post(
  "/admin/trading-pairs",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    const { symbol, name, currentPrice } = req.body as {
      symbol?: string;
      name?: string;
      currentPrice?: number;
    };
    if (!symbol?.trim() || !name?.trim()) {
      return res
        .status(400)
        .json({ message: "symbol and name are required" });
    }
    const price = Number(currentPrice);
    if (!Number.isFinite(price) || price <= 0) {
      return res
        .status(400)
        .json({ message: "currentPrice must be a positive number" });
    }
    try {
      const pair = await prisma.tradingPair.create({
        data: {
          symbol: symbol.trim().toUpperCase(),
          name: name.trim(),
          currentPrice: price
        }
      });
      return res.json({ pair });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === "P2002") {
        return res
          .status(400)
          .json({ message: "Pair with this symbol already exists" });
      }
      throw err;
    }
  }
);

// --- Admin: настройки реферальной программы (вывод через менеджера) ---
app.get(
  "/admin/settings/referral",
  authMiddleware,
  adminMiddleware,
  async (_req: AuthRequest, res) => {
    const config = await getReferralWithdrawConfig();
    return res.json(config);
  }
);

app.patch(
  "/admin/settings/referral",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    const body = req.body as { withdrawViaManager?: boolean; managerTelegram?: string };
    if (typeof body.withdrawViaManager === "boolean") {
      await prisma.appSetting.upsert({
        where: { key: "referral_withdraw_via_manager" },
        create: { key: "referral_withdraw_via_manager", value: body.withdrawViaManager ? "true" : "false" },
        update: { value: body.withdrawViaManager ? "true" : "false" }
      });
    }
    if (typeof body.managerTelegram === "string") {
      const val = body.managerTelegram.trim();
      await prisma.appSetting.upsert({
        where: { key: "referral_manager_telegram" },
        create: { key: "referral_manager_telegram", value: val },
        update: { value: val }
      });
    }
    const config = await getReferralWithdrawConfig();
    return res.json(config);
  }
);

// --- Admin: настройки торговли (процент выигрыша) ---
app.get(
  "/admin/settings/trading",
  authMiddleware,
  adminMiddleware,
  async (_req: AuthRequest, res) => {
    const config = await getTradingConfig();
    return res.json(config);
  }
);

app.patch(
  "/admin/settings/trading",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    const body = req.body as { winPayoutPercent?: number; maxActiveTrades?: number; minStake?: number; maxStake?: number };
    if (typeof body.winPayoutPercent === "number") {
      const val = Math.min(200, Math.max(1, Math.round(body.winPayoutPercent)));
      await prisma.appSetting.upsert({
        where: { key: "win_payout_percent" },
        create: { key: "win_payout_percent", value: String(val) },
        update: { value: String(val) }
      });
    }
    if (typeof body.maxActiveTrades === "number") {
      const val = Math.min(100, Math.max(0, Math.round(body.maxActiveTrades)));
      await prisma.appSetting.upsert({
        where: { key: "max_active_trades" },
        create: { key: "max_active_trades", value: String(val) },
        update: { value: String(val) }
      });
    }
    if (typeof body.minStake === "number") {
      const val = Math.max(0, Math.round(body.minStake));
      await prisma.appSetting.upsert({
        where: { key: "min_stake" },
        create: { key: "min_stake", value: String(val) },
        update: { value: String(val) }
      });
    }
    if (typeof body.maxStake === "number") {
      const val = Math.max(0, Math.round(body.maxStake));
      await prisma.appSetting.upsert({
        where: { key: "max_stake" },
        create: { key: "max_stake", value: String(val) },
        update: { value: String(val) }
      });
    }
    const config = await getTradingConfig();
    return res.json(config);
  }
);

// --- Admin: аудит баланса ---
app.get(
  "/admin/balance-audit",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    const userId = req.query.userId ? Number(req.query.userId) : undefined;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const where = userId && Number.isFinite(userId) ? { userId } : {};
    const [items, total] = await Promise.all([
      prisma.balanceAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset
      }),
      prisma.balanceAuditLog.count({ where })
    ]);
    const userIds = [...new Set(items.map((r) => r.userId))];
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true }
          })
        : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.email]));
    const rows = items.map((r) => ({
      id: r.id,
      userId: r.userId,
      userEmail: userMap[r.userId] ?? null,
      type: r.type,
      amount: Number(r.amount),
      balanceBefore: Number(r.balanceBefore),
      balanceAfter: Number(r.balanceAfter),
      refType: r.refType,
      refId: r.refId,
      refBalanceType: r.refBalanceType,
      createdAt: r.createdAt.toISOString()
    }));
    return res.json({ items: rows, total });
  }
);

// --- Admin: список сделок (все пользователи) ---
app.get(
  "/admin/trades",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    const userId = req.query.userId ? Number(req.query.userId) : undefined;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const where = userId && Number.isFinite(userId) ? { userId } : {};
    const [items, total] = await Promise.all([
      prisma.trade.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, email: true } },
          tradingPair: { select: { id: true, symbol: true, name: true } }
        }
      }),
      prisma.trade.count({ where })
    ]);
    const rows = items.map((t) => ({
      id: t.id,
      userId: t.userId,
      userEmail: t.user.email,
      tradingPairId: t.tradingPairId,
      symbol: t.tradingPair.symbol,
      pairName: t.tradingPair.name,
      amount: Number(t.amount),
      direction: t.direction,
      status: t.status,
      entryPrice: Number(t.entryPrice),
      closePrice: t.closePrice != null ? Number(t.closePrice) : null,
      balanceType: (t as { balanceType?: string }).balanceType ?? "real",
      expiresAt: t.expiresAt.toISOString(),
      createdAt: t.createdAt.toISOString()
    }));
    return res.json({ items: rows, total });
  }
);

// --- Admin: реферальные партнёры ---
app.get(
  "/admin/referral-partners",
  authMiddleware,
  adminMiddleware,
  async (_req: AuthRequest, res) => {
    const partners = await prisma.referralPartner.findMany({
      orderBy: { id: "asc" },
      include: { _count: { select: { referred: true } } }
    });
    const rows = partners.map((p) => ({
      id: p.id,
      email: p.email,
      name: p.name,
      referralCode: p.referralCode,
      referralClicks: p.referralClicks,
      referralBalance: Number(p.referralBalance),
      cpaAmount: p.cpaAmount != null ? Number(p.cpaAmount) : null,
      referredCount: (p as { _count?: { referred: number } })._count?.referred ?? 0,
      createdAt: p.createdAt.toISOString()
    }));
    return res.json({ partners: rows });
  }
);

// --- Admin: дашборд (сводная статистика) ---
app.get(
  "/admin/stats",
  authMiddleware,
  adminMiddleware,
  async (_req: AuthRequest, res) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const [
      usersTotal,
      usersToday,
      tradesToday,
      tradesWeek,
      payinsSuccess,
      payoutsSuccess
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.trade.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.trade.count({ where: { createdAt: { gte: startOfWeek } } }),
      prisma.paymentTransaction.findMany({
        where: { type: "payin", status: "success" },
        select: { amount: true, createdAt: true }
      }),
      prisma.paymentTransaction.findMany({
        where: { type: "payout", status: "success" },
        select: { amount: true, createdAt: true }
      })
    ]);

    const payinsToday = payinsSuccess.filter((p) => p.createdAt >= startOfToday);
    const payinsWeek = payinsSuccess.filter((p) => p.createdAt >= startOfWeek);
    const payoutsToday = payoutsSuccess.filter((p) => p.createdAt >= startOfToday);
    const payoutsWeek = payoutsSuccess.filter((p) => p.createdAt >= startOfWeek);

    const sum = (arr: { amount: { toNumber?: () => number } | unknown }[]) =>
      arr.reduce((s, p) => s + Number(typeof p.amount === "object" && p.amount != null && "toNumber" in p.amount ? (p.amount as { toNumber: () => number }).toNumber() : p.amount), 0);

    const tradesVolumeToday = await prisma.trade.aggregate({
      where: { createdAt: { gte: startOfToday } },
      _sum: { amount: true }
    });
    const tradesVolumeWeek = await prisma.trade.aggregate({
      where: { createdAt: { gte: startOfWeek } },
      _sum: { amount: true }
    });

    return res.json({
      usersTotal,
      usersToday,
      tradesToday,
      tradesWeek,
      volumeToday: Number(tradesVolumeToday._sum.amount ?? 0),
      volumeWeek: Number(tradesVolumeWeek._sum.amount ?? 0),
      payinsCountToday: payinsToday.length,
      payinsSumToday: sum(payinsToday),
      payinsCountWeek: payinsWeek.length,
      payinsSumWeek: sum(payinsWeek),
      payoutsCountToday: payoutsToday.length,
      payoutsSumToday: sum(payoutsToday),
      payoutsCountWeek: payoutsWeek.length,
      payoutsSumWeek: sum(payoutsWeek)
    });
  }
);

// --- Admin: список онлайн-пользователей (для фильтра в админке) ---
app.get(
  "/admin/users-online",
  authMiddleware,
  adminMiddleware,
  (_req: AuthRequest, res) => {
    return res.json({ onlineUserIds: getOnlineUserIds() });
  }
);

// --- Admin: список пользователей ---
app.get(
  "/admin/users",
  authMiddleware,
  adminMiddleware,
  async (_req: AuthRequest, res) => {
    const users = await prisma.user.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        email: true,
        isAdmin: true,
        demoBalance: true,
        balance: true,
        createdAt: true,
        blockedAt: true,
        withdrawBlockedAt: true,
        blockReason: true,
        _count: { select: { trades: true } }
      }
    });
    return res.json({
      users: users.map((u) => {
        const { _count, ...rest } = u as typeof u & { _count?: { trades: number } };
        return {
          ...rest,
          demoBalance: Number(u.demoBalance),
          balance: Number(u.balance),
          blockedAt: u.blockedAt?.toISOString() ?? null,
          withdrawBlockedAt: u.withdrawBlockedAt?.toISOString() ?? null,
          tradesCount: _count?.trades ?? 0
        };
      })
    });
  }
);

// --- Admin: изменить баланс пользователя ---
app.patch(
  "/admin/users/:id/balance",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, balance: true, demoBalance: true }
    });
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }
    const body = req.body as { balance?: number; demoBalance?: number };
    const newBalance = typeof body.balance === "number" ? body.balance : parseFloat(String(body.balance ?? ""));
    const newDemoBalance = typeof body.demoBalance === "number" ? body.demoBalance : parseFloat(String(body.demoBalance ?? ""));
    const setBalance = Number.isFinite(newBalance) && newBalance >= 0;
    const setDemoBalance = Number.isFinite(newDemoBalance) && newDemoBalance >= 0;
    if (!setBalance && !setDemoBalance) {
      return res.status(400).json({ message: "balance or demoBalance required (non-negative number)" });
    }
    const balanceBefore = Number(target.balance);
    const demoBalanceBefore = Number(target.demoBalance);
    const data: { balance?: number; demoBalance?: number } = {};
    if (setBalance) data.balance = newBalance;
    if (setDemoBalance) data.demoBalance = newDemoBalance;
    await prisma.$transaction(async (tx) => {
      await (tx as PrismaClient).user.update({
        where: { id: targetId },
        data
      });
      if (setBalance) {
        await createBalanceAudit(tx, {
          userId: targetId,
          type: "admin_adjust",
          amount: newBalance - balanceBefore,
          balanceBefore,
          balanceAfter: newBalance,
          refType: "admin",
          refId: String(req.userId),
          refBalanceType: "real"
        });
      }
      if (setDemoBalance) {
        await createBalanceAudit(tx, {
          userId: targetId,
          type: "admin_adjust",
          amount: newDemoBalance - demoBalanceBefore,
          balanceBefore: demoBalanceBefore,
          balanceAfter: newDemoBalance,
          refType: "admin",
          refId: String(req.userId),
          refBalanceType: "demo"
        });
      }
    });
    const updated = await prisma.user.findUnique({
      where: { id: targetId },
      select: { balance: true, demoBalance: true }
    });
    return res.json({
      user: { id: targetId, balance: Number(updated?.balance ?? target.balance), demoBalance: Number(updated?.demoBalance ?? target.demoBalance) }
    });
  }
);

// --- Admin: блокировка пользователя ---
app.patch(
  "/admin/users/:id/block",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, isAdmin: true }
    });
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }
    if (target.isAdmin) {
      return res.status(403).json({ message: "Cannot block admin" });
    }
    const body = req.body as {
      fullBlock?: boolean;
      withdrawBlock?: boolean;
      reason?: string;
    };
    const updates: { blockedAt?: Date | null; withdrawBlockedAt?: Date | null; blockReason?: string | null } = {};
    if (typeof body.fullBlock === "boolean") {
      updates.blockedAt = body.fullBlock ? new Date() : null;
      if (body.fullBlock && body.reason != null) updates.blockReason = body.reason ?? null;
      if (!body.fullBlock) updates.blockReason = null;
    }
    if (typeof body.withdrawBlock === "boolean") {
      updates.withdrawBlockedAt = body.withdrawBlock ? new Date() : null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Provide fullBlock and/or withdrawBlock" });
    }
    const updated = await prisma.user.update({
      where: { id: targetId },
      data: updates,
      select: {
        id: true,
        email: true,
        blockedAt: true,
        withdrawBlockedAt: true,
        blockReason: true
      }
    });
    return res.json({
      user: {
        ...updated,
        blockedAt: updated.blockedAt?.toISOString() ?? null,
        withdrawBlockedAt: updated.withdrawBlockedAt?.toISOString() ?? null
      }
    });
  }
);

// --- Admin: список торговых пар ---
app.get(
  "/admin/trading-pairs",
  authMiddleware,
  adminMiddleware,
  async (_req: AuthRequest, res) => {
    const pairs = await prisma.tradingPair.findMany({
      orderBy: { id: "asc" }
    });
    return res.json({ pairs });
  }
);

// --- Admin: удалить торговую пару ---
app.delete(
  "/admin/trading-pairs/:id",
  authMiddleware,
  adminMiddleware,
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "Invalid pair id" });
    }
    try {
      await prisma.tradingPair.delete({ where: { id } });
      return res.json({ ok: true });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === "P2025") {
        return res.status(404).json({ message: "Pair not found" });
      }
      throw err;
    }
  }
);

// --- Trading pairs & prices ---
app.get("/trading-pairs", authMiddleware, requireNotBlockedMiddleware, async (_req, res) => {
  const pairs = await prisma.tradingPair.findMany({
    orderBy: { id: "asc" }
  });
  return res.json({ pairs });
});

// --- OHLC candles ---
app.get("/candles", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
  const { pairId, timeframe = "30s", limit = "200" } = req.query as {
    pairId?: string;
    timeframe?: string;
    limit?: string;
  };

  if (!pairId) {
    return res.status(400).json({ message: "pairId is required" });
  }

  const parsedPairId = Number.parseInt(pairId, 10);
  if (!Number.isFinite(parsedPairId)) {
    return res.status(400).json({ message: "Invalid pairId" });
  }

  const tf = (timeframe as Timeframe) ?? "30s";
  const tfAllowed: Timeframe[] = [
    "1s",
    "30s",
    "1m",
    "5m",
    "10m",
    "15m",
    "1h",
    "2h",
    "5h"
  ];
  if (!tfAllowed.includes(tf)) {
    return res.status(400).json({ message: "Invalid timeframe" });
  }

  const maxLimit = maxCandlesForChart(tf);
  const parsedLimit = Math.min(maxLimit, Math.max(1, Number.parseInt(limit ?? "200", 10) || 200));

  const candles = candleService.getCandles(parsedPairId, tf, parsedLimit);

  return res.json({
    candles: candles.map((c) => ({
      startTime: c.startTime.toISOString(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }))
  });
});

// Публичная конфигурация торговли (процент выплаты, лимит активных сделок) — для отображения на странице торговли
app.get(
  "/trading/config",
  authMiddleware,
  async (_req: AuthRequest, res) => {
    const config = await getTradingConfig();
    return res.json(config);
  }
);

// --- Trade opening ---
app.post(
  "/trade/open",
  authMiddleware,
  rateLimitMiddleware({ windowMs: RATE_WINDOW_MS, max: 30 }),
  requireNotBlockedMiddleware,
  async (req: AuthRequest, res) => {
  try {
    const body = req.body as {
      tradingPairId?: number | string;
      amount?: number | string;
      direction?: string;
      durationSeconds?: number | string;
    };
    const tradingPairId = typeof body.tradingPairId === "string" ? parseInt(body.tradingPairId, 10) : body.tradingPairId;
    const amount = Number(body.amount);
    const direction = body.direction;
    const durationSeconds = Number(body.durationSeconds);

    if (
      !tradingPairId ||
      Number.isNaN(tradingPairId) ||
      Number.isNaN(amount) ||
      amount < 1 ||
      !direction ||
      !["LONG", "SHORT"].includes(direction) ||
      Number.isNaN(durationSeconds) ||
      durationSeconds < 60
    ) {
      return res.status(400).json({
        message: "Сумма минимум $1, экспирация минимум 60 сек"
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, useDemoMode: true, demoBalance: true, balance: true }
    });
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const balanceType = user.useDemoMode ? "demo" : "real";
    const balanceColumn = balanceType === "demo" ? "demoBalance" : "balance";
    const currentBalance = balanceType === "demo" ? Number(user.demoBalance) : Number(user.balance);
    if (currentBalance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const pair = await prisma.tradingPair.findUnique({
      where: { id: tradingPairId }
    });
    if (!pair) {
      return res.status(400).json({ message: "Trading pair not found" });
    }

    const config = await getTradingConfig();
    if (amount < config.minStake) {
      return res.status(400).json({
        message: `Минимальная ставка $${config.minStake}`
      });
    }
    if (config.maxStake > 0 && amount > config.maxStake) {
      return res.status(400).json({
        message: `Максимальная ставка $${config.maxStake}`
      });
    }
    if (config.maxActiveTrades > 0) {
      const activeCount = await prisma.trade.count({
        where: { userId: req.userId, status: TradeStatus.ACTIVE }
      });
      if (activeCount >= config.maxActiveTrades) {
        return res.status(400).json({
          code: "MAX_ACTIVE_TRADES",
          message: "Достигнут лимит активных сделок"
        });
      }
    }

    const currentPrice =
      priceService.getPrice(pair.id) ?? Number(pair.currentPrice);

    const expiresAt = new Date(Date.now() + durationSeconds * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const raw = tx as PrismaClient;
      const affected =
        balanceType === "demo"
          ? await raw.$executeRaw`UPDATE "User" SET "demoBalance" = "demoBalance" - ${amount} WHERE id = ${user.id} AND "demoBalance" >= ${amount}`
          : await raw.$executeRaw`UPDATE "User" SET "balance" = "balance" - ${amount} WHERE id = ${user.id} AND "balance" >= ${amount}`;
      if (affected === 0) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      const trade = await tx.trade.create({
        data: {
          userId: user.id,
          tradingPairId: pair.id,
          amount,
          direction: direction as TradeDirection,
          entryPrice: currentPrice,
          expiresAt,
          balanceType
        }
      });

      const updatedUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { demoBalance: true, balance: true }
      });
      if (!updatedUser) throw new Error("User not found");

      const balanceAfter = balanceType === "demo" ? Number(updatedUser.demoBalance) : Number(updatedUser.balance);
      await createBalanceAudit(tx, {
        userId: user.id,
        type: "trade_open",
        amount: -amount,
        balanceBefore: balanceAfter + amount,
        balanceAfter,
        refType: "trade",
        refId: String(trade.id),
        refBalanceType: balanceType
      });

      return { updatedUser, trade };
    });

    broadcastTradeUpdate(result.trade.id);

    const balanceAfter = result.trade.balanceType === "demo"
      ? Number(result.updatedUser.demoBalance)
      : Number(result.updatedUser.balance);
    notifyBalanceChange(prisma, {
      userId: user.id,
      type: "trade_open",
      amount: -amount,
      balanceBefore: balanceAfter + amount,
      balanceAfter,
      refType: "trade",
      refId: String(result.trade.id)
    }).catch(() => {});

    return res.json({
      trade: result.trade,
      balance: balanceAfter,
      balanceType
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({ message: "Insufficient balance" });
    }
    console.error("Trade open error:", err);
    return res.status(500).json({ message: "Ошибка открытия сделки" });
  }
});

// --- Trade history ---
app.get("/trades/active", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
  const trades = await prisma.trade.findMany({
    where: { userId: req.userId, status: TradeStatus.ACTIVE },
    orderBy: { createdAt: "desc" },
    include: { tradingPair: true }
  });
  return res.json({ trades });
});

app.get("/trades/completed", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
  const trades = await prisma.trade.findMany({
    where: {
      userId: req.userId,
      status: { in: [TradeStatus.WIN, TradeStatus.LOSS] }
    },
    orderBy: { createdAt: "desc" },
    include: { tradingPair: true }
  });
  const { winPayoutPercent } = await getTradingConfig();
  const tradesWithPnl = trades.map((trade) => {
    const baseAmount = Number(trade.amount);
    let pnl = 0;
    if (trade.status === TradeStatus.WIN) {
      pnl = baseAmount * (winPayoutPercent / 100);
    } else if (trade.status === TradeStatus.LOSS) {
      pnl = -baseAmount;
    }
    return { ...trade, pnl };
  });
  return res.json({ trades: tradesWithPnl });
});

// --- Background settlement of expired trades ---
async function settleExpiredTrades() {
  const now = new Date();
  const expired = await prisma.trade.findMany({
    where: {
      status: TradeStatus.ACTIVE,
      expiresAt: { lte: now }
    }
  });

  for (const trade of expired) {
    const pair = await prisma.tradingPair.findUnique({
      where: { id: trade.tradingPairId }
    });
    if (!pair) continue;

    const currentPrice =
      priceService.getPrice(pair.id) ?? Number(pair.currentPrice);

    // Simple binary logic: if direction matches price movement -> WIN
    let status: TradeStatus = TradeStatus.LOSS;
    if (
      (trade.direction === TradeDirection.LONG &&
        currentPrice > Number(trade.entryPrice)) ||
      (trade.direction === TradeDirection.SHORT &&
        currentPrice < Number(trade.entryPrice))
    ) {
      status = TradeStatus.WIN;
    }

    const tradeUser = await prisma.user.findUnique({
      where: { id: trade.userId },
      select: { referrerId: true, referralPartnerId: true }
    });

    const didUpdate = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.trade.updateMany({
        where: { id: trade.id, status: TradeStatus.ACTIVE },
        data: {
          status,
          closePrice: currentPrice
        }
      });

      if (updateResult.count === 0) return false;

      if (status === TradeStatus.WIN) {
        const winPayoutPercentRaw = await getAppSetting("win_payout_percent");
        const winPayoutPercent = Math.min(
          200,
          Math.max(1, Number(winPayoutPercentRaw) || 100)
        );
        const payout =
          Number(trade.amount) * (1 + winPayoutPercent / 100);
        const balanceType = (trade as { balanceType?: string }).balanceType === "demo" ? "demo" : "real";
        const u = await tx.user.findUnique({
          where: { id: trade.userId },
          select: { demoBalance: true, balance: true }
        });
        if (u) {
          const balanceBefore = balanceType === "demo" ? Number(u.demoBalance) : Number(u.balance);
          const balanceAfter = balanceBefore + payout;
          await tx.user.update({
            where: { id: trade.userId },
            data: balanceType === "demo"
              ? { demoBalance: { increment: payout } }
              : { balance: { increment: payout } }
          });
          await createBalanceAudit(tx, {
            userId: trade.userId,
            type: "trade_win",
            amount: payout,
            balanceBefore,
            balanceAfter,
            refType: "trade",
            refId: String(trade.id),
            refBalanceType: balanceType
          });
          notifyBalanceChange(prisma, {
            userId: trade.userId,
            type: "trade_win",
            amount: payout,
            balanceBefore,
            balanceAfter,
            refType: "trade",
            refId: String(trade.id)
          }).catch(() => {});
        }
      } else if (tradeUser?.referrerId) {
        const referrerShare = Number(trade.amount) * 0.5;
        await tx.user.update({
          where: { id: tradeUser.referrerId },
          data: { referralBalance: { increment: referrerShare } }
        });
      } else if (tradeUser?.referralPartnerId) {
        const partnerShare = Number(trade.amount) * 0.5;
        await tx.referralPartner.update({
          where: { id: tradeUser.referralPartnerId },
          data: { referralBalance: { increment: partnerShare } }
        });
      }
      return true;
    });

    if (didUpdate) broadcastTradeUpdate(trade.id);
  }
}

setInterval(() => {
  // Fire & forget; errors are logged to keep the loop running
  settleExpiredTrades().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Error settling trades", err);
  });
}, 3000);

// --- Start server ---
async function bootstrap() {
  await priceService.init();
  await loadCandlesFromDb();
  candleService.setOnCandleClosed((pairId, timeframe, candle) => {
    persistCandle(pairId, timeframe, candle).catch((err) =>
      // eslint-disable-next-line no-console
      console.error("persistCandle error", err)
    );
  });
  const pairs = await prisma.tradingPair.findMany();
  const now = new Date();
  for (const pair of pairs) {
    const price = priceService.getPrice(pair.id) ?? Number(pair.currentPrice);
    candleService.update(pair.id, price, now);
  }
  priceService.startRealPriceFeed(candleService);

  const server = app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on port ${PORT}`);
  });

  setupWebSocket(server);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start backend", err);
  process.exit(1);
});

