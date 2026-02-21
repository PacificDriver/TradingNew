-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('ACTIVE', 'WIN', 'LOSS');

-- CreateEnum
CREATE TYPE "TradeDirection" AS ENUM ('LONG', 'SHORT');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "demoBalance" DECIMAL(65,30) NOT NULL DEFAULT 1000.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingPair" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentPrice" DECIMAL(65,30) NOT NULL DEFAULT 100.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tradingPairId" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "direction" "TradeDirection" NOT NULL,
    "entryPrice" DECIMAL(65,30) NOT NULL,
    "closePrice" DECIMAL(65,30),
    "status" "TradeStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TradingPair_symbol_key" ON "TradingPair"("symbol");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_tradingPairId_fkey" FOREIGN KEY ("tradingPairId") REFERENCES "TradingPair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
