# Trading — обзор системы (для AI / разработки)

Краткий справочник по проекту **Binary Options MVP (демо)**. Используй этот файл, чтобы быстро понять архитектуру и где что искать.

---

## Что это за система

- **Демо-платформа бинарных опционов**: пользователь ставит на рост (LONG) или падение (SHORT) цены за фиксированное время.
- Вся логика (баланс, цены, расчёт WIN/LOSS) выполняется **только на бэкенде**. Фронт — чистый UI.
- Балансы **демо** (по умолчанию 1000), без реальных денег и депозитов.

---

## Стек

| Часть      | Технологии |
|-----------|------------|
| Frontend  | Next.js (App Router), TypeScript, Tailwind, Zustand |
| Backend   | Node.js, Express, Prisma |
| БД        | PostgreSQL |
| Аутентификация | JWT (Bearer + опционально cookie `bo_session`) |
| Realtime  | WebSocket (`ws`) на том же порту, что и API |

---

## Структура репозитория

```
Trading/
├── frontend/          # Next.js приложение
│   ├── app/           # App Router: page.tsx, layout.tsx, login, register, trade, profile, admin
│   ├── components/    # AuthGuard, WebSocketBridge, PriceChart, AppHeader, PairSearch, ...
│   ├── store/         # useTradingStore.ts (Zustand + persist)
│   └── lib/           # api.ts (apiFetch, authHeaders)
├── backend/
│   ├── prisma/        # schema.prisma
│   └── src/           # index.ts — весь API, WebSocket, mock-цены, settlement
├── docker-compose.yml # postgres, backend, frontend
└── README.md
```

---

## База данных (Prisma)

- **User**: `id`, `email`, `password`, `demoBalance` (default 1000), `isAdmin`.
- **TradingPair**: `id`, `symbol`, `name`, `currentPrice` (обновляется бэкендом).
- **Trade**: `userId`, `tradingPairId`, `amount`, `direction` (LONG/SHORT), `entryPrice`, `closePrice?`, `status` (ACTIVE / WIN / LOSS), `expiresAt`.

Стартовые пары при первом запуске: BTCUSDT, ETHUSDT, EURUSD.

---

## Backend API (Express)

Все в `backend/src/index.ts`.

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| POST | `/auth/register` | — | email, password (min 6); возвращает JWT + user; ставит cookie |
| POST | `/auth/login` | — | JWT + user; cookie |
| POST | `/auth/logout` | — | очистка cookie |
| GET | `/me` | JWT | текущий user и balance |
| GET | `/trading-pairs` | JWT | список пар с текущими ценами |
| GET | `/candles` | JWT | OHLC: query `pairId`, `timeframe` (1s,30s,1m,5m,10m,15m,1h,2h,5h), `limit` |
| POST | `/trade/open` | JWT | body: `tradingPairId`, `amount`, `direction` (LONG/SHORT), `durationSeconds` (min 5) |
| GET | `/trades/active` | JWT | активные сделки |
| GET | `/trades/completed` | JWT | завершённые (WIN/LOSS) |
| POST | `/admin/trading-pairs` | JWT + Admin | добавить пару: `symbol`, `name`, `currentPrice` |

- Токен: заголовок `Authorization: Bearer <token>` или cookie `bo_session`.
- Цены и свечи: in-memory на бэкенде + mock-обновление раз в секунду (random walk). Settlement истёкших сделок — каждые 3 с.

---

## WebSocket (тот же хост:4000)

- Сообщения от сервера:
  - `{ type: "price", pairId, price }`
  - `{ type: "tradeUpdate", trade }`
- Клиент может слать `{ type: "ping" }`, сервер отвечает `{ type: "pong", ts }`.

---

## Frontend: ключевые файлы

- **Роуты**: `/` (лендинг), `/login`, `/register`, `/trade` (основной экран), `/profile`, `/admin` (админка).
- **Store** (`store/useTradingStore.ts`): `token`, `user`, `pairs`, `favoritePairIds`, `prices`, `activeTrades`, `completedTrades`, `tradeHistory` (persist), `wsConnected`, `authChecked`. Действия: `setAuth`, `clearAuth`, `setPairs`, `toggleFavoritePair`, `upsertPrice`, `setActiveTrades`, `setCompletedTrades`, `applyTradeUpdate`, …
- **API**: `lib/api.ts` — `apiFetch(path, options)`, `authHeaders(token)`, `isAuthError()`; base URL из `NEXT_PUBLIC_API_BASE_URL`.
- **WebSocket**: `components/WebSocketBridge.tsx` — один сокет, обновляет store по `price` и `tradeUpdate`.
- **График**: `components/PriceChart.tsx` — данные из store + запрос `/candles` по выбранному таймфрейму.

---

## Запуск

### Вариант 1: Всё в Docker

```powershell
cd c:\Users\Kyle\Documents\Trading
docker compose up --build
```

- Frontend: http://localhost:3000  
- Backend API: http://localhost:4000  
- Postgres: localhost:**55432**

Миграции в образе не применяются автоматически; при первом локальном запуске выполните их в backend (см. ниже).

### Вариант 2: Запуск без Docker (backend и frontend локально)

Можно не использовать Docker для приложения и поднять только backend и frontend через Node.

**PostgreSQL** — один из двух вариантов:

- **Только БД в Docker** (удобно): в одном терминале запустите  
  `docker compose up postgres`  
  Подключение: `postgresql://mvp_user:mvp_password@localhost:55432/mvp_trading?schema=public`
- **Полностью без Docker**: установите [PostgreSQL](https://www.postgresql.org/download/windows/), создайте БД и пользователя, задайте `DATABASE_URL` (порт обычно 5432).

**Один скрипт (рекомендуется):**

```powershell
cd c:\Users\Kyle\Documents\Trading
.\start-local.ps1
```

Скрипт по умолчанию поднимет контейнер Postgres (если установлен Docker), затем откроет два окна: backend и frontend. Если Postgres уже запущен локально, задайте переменную перед запуском:

```powershell
$env:DATABASE_URL = "postgresql://user:password@localhost:5432/mvp_trading?schema=public"
.\start-local.ps1
```

Чтобы не трогать Postgres в Docker: `$env:SKIP_POSTGRES_DOCKER = "1"; .\start-local.ps1`

**Первый раз (миграции и зависимости):**

```powershell
cd backend
npm install
$env:DATABASE_URL = "postgresql://mvp_user:mvp_password@localhost:55432/mvp_trading?schema=public"   # или ваш URL
npx prisma generate
npx prisma migrate dev --name init
```

```powershell
cd frontend
npm install
```

**Ручной запуск в двух терминалах:**

1. Терминал 1 — backend:
   ```powershell
   cd backend
   $env:DATABASE_URL = "postgresql://mvp_user:mvp_password@localhost:55432/mvp_trading?schema=public"
   npm run dev
   ```
2. Терминал 2 — frontend:
   ```powershell
   cd frontend
   $env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:4000"
   $env:NEXT_PUBLIC_WS_URL = "ws://localhost:4000"
   npm run dev
   ```

- Frontend: http://localhost:3000  
- Backend: http://localhost:4000  
- БД (при Docker): localhost:**55432**

---

## Переменные окружения

**Backend:** `PORT` (default 4000), `JWT_SECRET`, `DATABASE_URL`, `FRONTEND_ORIGIN`, `NODE_ENV`.  
**Frontend:** `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_WS_URL`.

---

## Торговая логика (на сервере)

- **Открытие**: проверка баланса → списание ставки → создание Trade (ACTIVE) с `entryPrice`, `expiresAt`.
- **Settlement** (каждые 3 с): истёкшие ACTIVE → берётся текущая цена → LONG: closePrice > entryPrice = WIN, SHORT: closePrice < entryPrice = WIN; иначе LOSS. При WIN: возврат 2× ставки на баланс. Рассылка `tradeUpdate` по WebSocket.

Этот файл можно показывать AI при следующих задачах по проекту.
