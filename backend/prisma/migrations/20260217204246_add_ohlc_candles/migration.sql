-- CreateTable
CREATE TABLE "OhlcCandle" (
    "id" SERIAL NOT NULL,
    "tradingPairId" INTEGER NOT NULL,
    "timeframe" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(65,30) NOT NULL,
    "high" DECIMAL(65,30) NOT NULL,
    "low" DECIMAL(65,30) NOT NULL,
    "close" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "OhlcCandle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OhlcCandle_tradingPairId_timeframe_startTime_idx" ON "OhlcCandle"("tradingPairId", "timeframe", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "OhlcCandle_tradingPairId_timeframe_startTime_key" ON "OhlcCandle"("tradingPairId", "timeframe", "startTime");

-- AddForeignKey
ALTER TABLE "OhlcCandle" ADD CONSTRAINT "OhlcCandle_tradingPairId_fkey" FOREIGN KEY ("tradingPairId") REFERENCES "TradingPair"("id") ON DELETE CASCADE ON UPDATE CASCADE;
