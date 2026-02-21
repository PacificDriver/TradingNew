# Binary Options MVP (Demo Only)

Minimal MVP of a binary options trading platform.

> **Important:** This project is a **demo**.  
> All balances are demo-only, and **all trading logic is executed on the backend**.  
> The client is a pure UI that displays server state.

## Tech Stack

- **Frontend**: Next.js (App Router, TypeScript, Tailwind, Zustand)
- **Backend**: Node.js + Express + Prisma
- **DB**: PostgreSQL
- **Auth**: JWT (Bearer)
- **Realtime**: WebSocket (`ws`)

## Repository Structure

- `frontend` – Next.js app (UI, auth pages, trading screen, charts)
- `backend` – Express API + Prisma + WebSocket + trade engine
- `docker-compose.yml` – Postgres + backend + frontend

## Backend Overview

- `User` model with **demo balance** (default 1000.00)
- `TradingPair` model with server-side **current price**
- `Trade` model with statuses: `ACTIVE`, `WIN`, `LOSS`
- All monetary and trade calculations are performed **only on the server**.

### Core Endpoints

- `POST /auth/register` – email + password, returns JWT + user (with demo balance)
- `POST /auth/login` – login, returns JWT + user
- `GET /me` – current user & balance (JWT required)
- `GET /trading-pairs` – available pairs + current prices
- `POST /trade/open` – open a trade (balance check, entry price, expiry time, balance deduction)
- `GET /trades/active` – active trades
- `GET /trades/completed` – historical trades (`WIN` / `LOSS`)

### Trading Logic

- On **open**:
  - Server verifies JWT, reads user from DB
  - Checks demo balance
  - Reads current price from server-side price service
  - Deducts stake from demo balance
  - Creates `Trade` with status `ACTIVE`, `entryPrice`, `expiresAt`
- **Background settlement** (interval):
  - Finds expired `ACTIVE` trades
  - Fixes `closePrice` from current server price
  - Computes `WIN` / `LOSS` on server
  - Updates user balance (`WIN` = returns 2× stake; stake already deducted on open)
  - Broadcasts trade update via WebSocket

### Realtime

- Backend runs a mock price feed (simple random walk per trading pair)
- Server holds the authoritative **current price** in memory + DB
- WebSocket broadcasts:
  - `{"type":"price","pairId", "price"}`
  - `{"type":"tradeUpdate","trade":{...}}`

## Frontend Overview

- **Auth pages**: `/login`, `/register`
- **Protected trading screen**: `/trade`
- **State management**: Zustand store:
  - auth (JWT + user)
  - balance
  - trading pairs
  - prices (per pair, time series)
  - active & completed trades
- **Chart**:
  - SVG-based
  - Combined line + minimalist “candles”
  - Real-time updates from WebSocket
- **Trading UI**:
  - Pair selection
  - Current price display
  - Amount input + quick presets
  - Expiry input (seconds)
  - `LONG` / `SHORT` buttons calling backend `/trade/open`
  - Active trades list with countdown timers
  - Completed trades with `WIN` / `LOSS` labels

## Running with Docker (recommended)

Requirements:

- Docker & Docker Compose

```bash
cd path/to/Trading
docker compose up --build
```

Services:

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- Postgres: localhost:5432

> Note: Prisma migrations are not auto-applied in this MVP image.  
> For local development you should run them once (see below).

## Local Development (without Docker)

### 1. Start Postgres

You can still use the `postgres` service in `docker-compose.yml`:

```bash
docker compose up postgres
```

Environment (matches `docker-compose.yml` defaults):

- `POSTGRES_USER=mvp_user`
- `POSTGRES_PASSWORD=mvp_password`
- `POSTGRES_DB=mvp_trading`

### 2. Backend

```bash
cd backend
npm install

# Set DATABASE_URL (if not using Docker defaults)
set DATABASE_URL=postgresql://mvp_user:mvp_password@localhost:5432/mvp_trading?schema=public

npx prisma generate
npx prisma migrate dev --name init

npm run dev
```

Backend will listen on `http://localhost:4000`.

### 3. Frontend

```bash
cd frontend
npm install

set NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
set NEXT_PUBLIC_WS_URL=ws://localhost:4000

npm run dev
```

Frontend will listen on `http://localhost:3000`.

## MVP Checklist (How to Test)

1. **Registration & Balance**
   - Open `http://localhost:3000`
   - Go to **Create demo account**
   - Confirm you receive default demo balance (~1000)
2. **Login**
   - Sign out, then sign in via `/login`
3. **Open Trade**
   - Go to `/trade`
   - Select a pair
   - Choose amount and expiry
   - Click `LONG` or `SHORT`
   - Balance decreases by stake amount
4. **Auto Settlement**
   - Wait until expiry
   - Trade moves from **Active** to **History**
   - Status becomes `WIN` or `LOSS`
   - Balance is updated on server
5. **Realtime UI**
   - Prices on chart and current price label update in real time
   - Active and completed trades update automatically via WebSocket

## Notes & Constraints

- **MVP only**:
  - No deposit/withdrawal
  - No admin panel
  - No real-data price feed (mock only)
- **Security (MVP level)**:
  - JWT stored client-side, sent as `Authorization: Bearer <token>`
  - Passwords hashed with `bcrypt`
  - All sensitive logic (balances, trade outcomes, prices) lives on backend

