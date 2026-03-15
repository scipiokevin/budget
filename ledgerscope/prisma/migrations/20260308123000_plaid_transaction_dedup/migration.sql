WITH dup_tx AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "userId", "plaidTransactionId" ORDER BY "updatedAt" DESC, "createdAt" DESC, id DESC) AS rn
  FROM "Transaction"
  WHERE "plaidTransactionId" IS NOT NULL
)
DELETE FROM "Transaction"
WHERE id IN (SELECT id FROM dup_tx WHERE rn > 1);

WITH dup_raw AS (
  SELECT r.id,
         ROW_NUMBER() OVER (PARTITION BY r."userId", r."plaidTransactionId" ORDER BY r."updatedAt" DESC, r."createdAt" DESC, r.id DESC) AS rn
  FROM "TransactionRaw" r
  WHERE r."plaidTransactionId" IS NOT NULL
)
DELETE FROM "TransactionRaw" r
WHERE r.id IN (SELECT id FROM dup_raw WHERE rn > 1)
  AND NOT EXISTS (SELECT 1 FROM "Transaction" t WHERE t."transactionRawId" = r.id);

