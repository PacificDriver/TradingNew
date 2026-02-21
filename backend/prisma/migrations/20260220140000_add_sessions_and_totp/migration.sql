-- AlterTable
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT,
ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "osShort" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
