import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient, TradeStatus, TradeDirection } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import UAParser from "ua-parser-js";
import { WebSocketServer } from "ws";
import type { Server } from "http";
import {
  createPayin,
  createPayout,
  isHighHelpConfigured
} from "./highhelp";

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

const PORT = Number(process.env.PORT) || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "supersecretjwtkey";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000,http://localhost:3001";
const CORS_ORIGINS = FRONTEND_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
const SESSION_COOKIE_NAME = "bo_session";
const IS_PROD = process.env.NODE_ENV === "production";
const BACKEND_PUBLIC_URL = (process.env.BACKEND_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");

app.use(
  cors({
    origin: CORS_ORIGINS.length > 1 ? CORS_ORIGINS : CORS_ORIGINS[0] || true,
    credentials: true
  })
);
app.use(express.json());

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

// --- Helpers: IP, User-Agent, Session ---
function getClientIp(req: express.Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0].trim();
  if (Array.isArray(xff) && xff[0]) return String(xff[0]).trim();
  return req.socket?.remoteAddress ?? null;
}

function getOsShortFromUserAgent(ua: string | undefined): string {
  if (!ua) return "Unknown";
  const p = new UAParser(ua).getResult();
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

// 100 популярных торговых пар (крипто + форекс)
const POPULAR_TRADING_PAIRS: { symbol: string; name: string; currentPrice: number }[] = [
  { symbol: "BTCUSDT", name: "Bitcoin / Tether", currentPrice: 60000 },
  { symbol: "ETHUSDT", name: "Ethereum / Tether", currentPrice: 3000 },
  { symbol: "BNBUSDT", name: "BNB / Tether", currentPrice: 580 },
  { symbol: "SOLUSDT", name: "Solana / Tether", currentPrice: 140 },
  { symbol: "XRPUSDT", name: "XRP / Tether", currentPrice: 0.52 },
  { symbol: "USDCUSDT", name: "USD Coin / Tether", currentPrice: 1 },
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

async function fetchBinancePrices(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const res = await fetch(BINANCE_TICKER_URL);
    if (!res.ok) return map;
    const data = (await res.json()) as Array<{ symbol: string; price: string }>;
    for (const item of data) {
      const price = parseFloat(item.price);
      if (Number.isFinite(price) && price > 0) map.set(item.symbol, price);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Binance fetch error", err);
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

const MAX_CHART_HOURS = 5;

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

/** Максимум свечей для хранения 5 часов истории по таймфрейму */
function maxCandlesFor5h(tf: Timeframe): number {
  const sec = timeframeToSeconds(tf);
  return Math.ceil((MAX_CHART_HOURS * 3600) / sec);
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
    const maxCandles = maxCandlesFor5h(timeframe);
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
      const maxCandles = maxCandlesFor5h(timeframe);
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
    );
    if (toCreate.length > 0) {
      await prisma.tradingPair.createMany({ data: toCreate });
    }

    const allPairs = await prisma.tradingPair.findMany({
      orderBy: { id: "asc" }
    });
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

  private async runPriceFeedRound(candleService: CandleService) {
    const pairs = await prisma.tradingPair.findMany();
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
    const PRICE_POLL_MS = 2000;
    this.runPriceFeedRound(candleService).catch((err) =>
      // eslint-disable-next-line no-console
      console.error("Error in initial price feed", err)
    );
    setInterval(() => {
      this.runPriceFeedRound(candleService).catch((err) =>
        // eslint-disable-next-line no-console
        console.error("Error in price feed", err)
      );
    }, PRICE_POLL_MS);
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

// --- WebSocket server for price & trade updates ---
type WsClient = {
  socket: WebSocket;
};

let wss: WebSocketServer | null = null;

function setupWebSocket(server: Server) {
  wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    const client: WsClient = { socket: ws as unknown as WebSocket };

    ws.on("message", (raw) => {
      // For MVP we accept a simple "ping" or ignore messages
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        }
      } catch {
        // ignore malformed
      }
    });

    ws.on("close", () => {
      // nothing special for now
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

// Helper to broadcast trade updates
function broadcastTradeUpdate(tradeId: number) {
  if (!wss) return;
  setImmediate(async () => {
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        tradingPair: true,
        user: { select: { id: true, demoBalance: true } }
      }
    });
    if (!trade) return;
    const payload = JSON.stringify({
      type: "tradeUpdate",
      trade: {
        ...trade,
        user: trade.user ? { id: trade.user.id, demoBalance: Number(trade.user.demoBalance) } : null
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
app.post("/auth/register", async (req, res) => {
  const { email, password, referralCode } = req.body as {
    email?: string;
    password?: string;
    referralCode?: string;
  };

  if (!email || !password || password.length < 6) {
    return res
      .status(400)
      .json({ message: "Email and password (min 6 chars) are required" });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(400).json({ message: "Email already registered" });
  }

  let referrerId: number | undefined;
  if (referralCode && typeof referralCode === "string" && referralCode.trim()) {
    const referrer = await prisma.user.findUnique({
      where: { referralCode: referralCode.trim() }
    });
    if (referrer) referrerId = referrer.id;
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      password: hash,
      ...(referrerId != null && { referrerId })
    }
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
      isAdmin: user.isAdmin
    }
  });
});

app.post("/auth/login", async (req, res) => {
  const { email, password, totpCode } = req.body as {
    email?: string;
    password?: string;
    totpCode?: string;
  };
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(400).json({ message: "Invalid credentials" });
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(400).json({ message: "Invalid credentials" });
  }
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
      isAdmin: user.isAdmin
    }
  });
});

app.post("/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

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
        data: { userId: req.userId },
        include: {
          messages: { orderBy: { createdAt: "asc" } }
        }
      });
    }
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
    let thread = await prisma.supportThread.findUnique({ where: { userId: req.userId } });
    if (!thread) {
      thread = await prisma.supportThread.create({ data: { userId: req.userId } });
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
    return res.json({ message: toSupportMessageRow(message) });
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
      isAdmin: true,
      createdAt: true,
      referralCode: true,
      referralBalance: true,
      totpEnabled: true,
      blockedAt: true,
      withdrawBlockedAt: true,
      blockReason: true
    }
  });
  if (!user) return res.status(401).json({ message: "User not found" });
  return res.json({
    user: {
      ...user,
      blockedAt: user.blockedAt?.toISOString() ?? null,
      withdrawBlockedAt: user.withdrawBlockedAt?.toISOString() ?? null
    }
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

// --- Public: count click on referral link (no auth) ---
app.get("/ref/click", async (req, res) => {
  const code = (req.query.code as string)?.trim();
  if (!code) {
    return res.status(400).json({ message: "Missing code" });
  }
  const updated = await prisma.user.updateMany({
    where: { referralCode: code },
    data: { referralClicks: { increment: 1 } }
  });
  if (updated.count === 0) {
    return res.status(404).json({ message: "Invalid referral code" });
  }
  return res.json({ ok: true });
});

// --- Withdraw referral balance to demo balance ---
app.post("/referral/withdraw", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId }
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
  const refBalance = Number(user.referralBalance);
  if (refBalance <= 0) {
    return res.status(400).json({ message: "Nothing to withdraw" });
  }
  const result = await prisma.$transaction([
    prisma.user.update({
      where: { id: req.userId },
      data: {
        referralBalance: 0,
        demoBalance: { increment: refBalance }
      }
    })
  ]);
  const updated = result[0];
  return res.json({
    demoBalance: Number(updated.demoBalance),
    referralBalance: 0,
    withdrawn: refBalance
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

app.post("/payments/deposit", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
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

app.post("/payments/withdraw", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
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
  const balance = Number(user.demoBalance);
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

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { demoBalance: { decrement: num } }
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
    });

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
      data: { demoBalance: { increment: num } }
    }).catch(() => {});
    const msg = err instanceof Error ? err.message : "Ошибка создания вывода";
    console.error("Payout create error:", err);
    return res.status(500).json({ message: msg });
  }
});

// Колбек HighHelp (без auth). Идемпотентность по project_id:payment_id:status:sub_status
app.post("/payments/webhook", async (req, res) => {
  const body = req.body as {
    project_id?: string;
    general?: { request_id?: string; payment_id?: string };
    status?: { status?: string; sub_status?: string; status_description?: string };
    payment_info?: { amount?: number; currency?: string; type?: string };
  };
  const projectId = body.project_id ?? "";
  const paymentId = body.general?.payment_id ?? "";
  const statusVal = body.status?.status ?? "";
  const subStatus = body.status?.sub_status ?? null;
  const idempotencyKey = `${projectId}:${paymentId}:${statusVal}:${subStatus ?? ""}`;

  try {
    await prisma.processedCallback.create({ data: { idempotencyKey } });
  } catch (e) {
    return res.status(200).send("OK");
  }

  const tx = await prisma.paymentTransaction.findUnique({
    where: { paymentId },
    include: { user: true }
  });
  if (!tx) {
    return res.status(200).send("OK");
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
    await prisma.user.update({
      where: { id: tx.userId },
      data: { demoBalance: { increment: amount } }
    });
  }
  if (tx.type === "payout" && (statusVal === "decline" || statusVal === "error")) {
    const amount = Number(tx.amount);
    await prisma.user.update({
      where: { id: tx.userId },
      data: { demoBalance: { increment: amount } }
    });
  }

  return res.status(200).send("OK");
});

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
        createdAt: true,
        blockedAt: true,
        withdrawBlockedAt: true,
        blockReason: true
      }
    });
    return res.json({
      users: users.map((u) => ({
        ...u,
        blockedAt: u.blockedAt?.toISOString() ?? null,
        withdrawBlockedAt: u.withdrawBlockedAt?.toISOString() ?? null
      }))
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

  const parsedLimit = Number.parseInt(limit ?? "200", 10);

  const candles = candleService.getCandles(parsedPairId, tf, parsedLimit || 200);

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

// --- Trade opening ---
app.post("/trade/open", authMiddleware, requireNotBlockedMiddleware, async (req: AuthRequest, res) => {
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
      where: { id: req.userId }
    });
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (Number(user.demoBalance) < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const pair = await prisma.tradingPair.findUnique({
      where: { id: tradingPairId }
    });
    if (!pair) {
      return res.status(400).json({ message: "Trading pair not found" });
    }

    const currentPrice =
      priceService.getPrice(pair.id) ?? Number(pair.currentPrice);

    const expiresAt = new Date(Date.now() + durationSeconds * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          demoBalance: Number(user.demoBalance) - amount
        }
      });

      const trade = await tx.trade.create({
        data: {
          userId: user.id,
          tradingPairId: pair.id,
          amount,
          direction: direction as TradeDirection,
          entryPrice: currentPrice,
          expiresAt
        }
      });

      return { updatedUser, trade };
    });

    broadcastTradeUpdate(result.trade.id);

    return res.json({
      trade: result.trade,
      balance: Number(result.updatedUser.demoBalance)
    });
  } catch (err) {
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
  return res.json({ trades });
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

    // For MVP: WIN returns 2x stake (stake was already deducted on open)
    // LOSS: referrer gets 50% of the lost amount
    const tradeUser = await prisma.user.findUnique({
      where: { id: trade.userId },
      select: { referrerId: true }
    });

    await prisma.$transaction(async (tx) => {
      await tx.trade.update({
        where: { id: trade.id },
        data: {
          status,
          closePrice: currentPrice
        }
      });

      if (status === TradeStatus.WIN) {
        const payout = Number(trade.amount) * 2;
        await tx.user.update({
          where: { id: trade.userId },
          data: {
            demoBalance: {
              increment: payout
            }
          }
        });
      } else if (status === TradeStatus.LOSS && tradeUser?.referrerId) {
        const referrerShare = Number(trade.amount) * 0.5;
        await tx.user.update({
          where: { id: tradeUser.referrerId },
          data: {
            referralBalance: { increment: referrerShare }
          }
        });
      }
    });

    broadcastTradeUpdate(trade.id);
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

