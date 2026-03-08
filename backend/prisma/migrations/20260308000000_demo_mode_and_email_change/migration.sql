-- Add real balance and demo mode toggle
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "balance" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "useDemoMode" BOOLEAN NOT NULL DEFAULT true;
-- Existing users: current demoBalance was production → copy to balance, use real mode
UPDATE "User" SET "balance" = "demoBalance", "useDemoMode" = false;

-- Email change fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingNewEmail" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailChangeCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailChangeExpiresAt" TIMESTAMP(3);

-- Balance audit: which balance was affected
ALTER TABLE "BalanceAuditLog" ADD COLUMN IF NOT EXISTS "refBalanceType" TEXT;

-- Trade: which balance the trade was opened with (for settlement)
ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "balanceType" TEXT NOT NULL DEFAULT 'real';
