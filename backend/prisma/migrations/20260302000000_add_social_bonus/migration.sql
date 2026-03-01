-- AlterTable
ALTER TABLE "User" ADD COLUMN     "socialBonusClaimedAt" TIMESTAMP(3),
ADD COLUMN     "socialClickInstagram" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "socialClickTelegram" BOOLEAN NOT NULL DEFAULT false;
