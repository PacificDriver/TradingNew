-- KYC submissions table
CREATE TABLE "KycSubmission" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "documentType" TEXT NOT NULL,
  "documentImage" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "adminNote" TEXT,
  "reviewedById" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KycSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KycSubmission_userId_createdAt_idx" ON "KycSubmission"("userId", "createdAt");
CREATE INDEX "KycSubmission_status_createdAt_idx" ON "KycSubmission"("status", "createdAt");

ALTER TABLE "KycSubmission"
ADD CONSTRAINT "KycSubmission_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
