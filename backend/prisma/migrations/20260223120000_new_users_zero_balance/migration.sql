-- AlterTable: новые пользователи получают баланс 0 вместо 1000
ALTER TABLE "User" ALTER COLUMN "demoBalance" SET DEFAULT 0;
