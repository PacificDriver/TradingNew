-- AlterTable
ALTER TABLE "ReferralPartner" ADD COLUMN "cpaAmount" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "ReferralCpaPayment" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCpaPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralClickEvent" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralClickEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferralClickEvent_partnerId_createdAt_idx" ON "ReferralClickEvent"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralClickEvent_partnerId_ipHash_createdAt_idx" ON "ReferralClickEvent"("partnerId", "ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_createdAt_idx" ON "PaymentTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_type_status_idx" ON "PaymentTransaction"("type", "status");

-- CreateIndex
CREATE INDEX "ReferralCpaPayment_partnerId_createdAt_idx" ON "ReferralCpaPayment"("partnerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReferralCpaPayment" ADD CONSTRAINT "ReferralCpaPayment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ReferralPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralClickEvent" ADD CONSTRAINT "ReferralClickEvent_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ReferralPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
