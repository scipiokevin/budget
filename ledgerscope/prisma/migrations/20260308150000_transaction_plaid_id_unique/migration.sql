WITH dup_tx AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "plaidTransactionId"
           ORDER BY
             CASE WHEN status = 'REMOVED' THEN 1 ELSE 0 END,
             "updatedAt" DESC,
             "createdAt" DESC,
             id DESC
         ) AS rn
  FROM "Transaction"
  WHERE "plaidTransactionId" IS NOT NULL
)
DELETE FROM "Transaction"
WHERE id IN (SELECT id FROM dup_tx WHERE rn > 1);

ALTER TABLE "Transaction"
DROP CONSTRAINT IF EXISTS "Transaction_userId_plaidTransactionId_key";

ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_plaidTransactionId_key" UNIQUE ("plaidTransactionId");