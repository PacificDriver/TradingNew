-- AlterTable
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT,
ADD COLUMN "referrerId" INTEGER,
ADD COLUMN "referralBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "referralClicks" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
