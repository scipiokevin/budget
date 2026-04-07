CREATE TYPE "TransactionSource" AS ENUM ('PLAID', 'STATEMENT_PDF', 'MANUAL');

ALTER TABLE "Transaction"
ADD COLUMN IF NOT EXISTS "source" "TransactionSource" NOT NULL DEFAULT 'PLAID';

CREATE TABLE "StatementImport" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "accountLabel" TEXT,
  "statementPeriodStart" TIMESTAMP(3),
  "statementPeriodEnd" TIMESTAMP(3),
  "parserStatus" TEXT NOT NULL DEFAULT 'parsed',
  "parserMessage" TEXT,
  "parserConfidence" DECIMAL(5,2),
  "detectedTransactionCount" INTEGER NOT NULL DEFAULT 0,
  "importedTransactionCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "importedAt" TIMESTAMP(3),
  CONSTRAINT "StatementImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StatementImportEntry" (
  "id" TEXT NOT NULL,
  "statementImportId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "transactionId" TEXT,
  "date" TIMESTAMP(3),
  "description" TEXT NOT NULL,
  "merchant" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "direction" "TransactionDirection",
  "confidence" DECIMAL(5,2),
  "duplicateTransactionId" TEXT,
  "selectedForImport" BOOLEAN NOT NULL DEFAULT true,
  "rawLine" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StatementImportEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Transaction_source_idx" ON "Transaction"("source");
CREATE INDEX "StatementImport_userId_createdAt_idx" ON "StatementImport"("userId", "createdAt");
CREATE INDEX "StatementImportEntry_statementImportId_idx" ON "StatementImportEntry"("statementImportId");
CREATE INDEX "StatementImportEntry_userId_createdAt_idx" ON "StatementImportEntry"("userId", "createdAt");
CREATE INDEX "StatementImportEntry_duplicateTransactionId_idx" ON "StatementImportEntry"("duplicateTransactionId");

ALTER TABLE "StatementImport"
  ADD CONSTRAINT "StatementImport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StatementImportEntry"
  ADD CONSTRAINT "StatementImportEntry_statementImportId_fkey"
  FOREIGN KEY ("statementImportId") REFERENCES "StatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StatementImportEntry"
  ADD CONSTRAINT "StatementImportEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StatementImportEntry"
  ADD CONSTRAINT "StatementImportEntry_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
