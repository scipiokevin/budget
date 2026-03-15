/* eslint-env node */
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/mydb?schema=public";

async function runCleanup() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const txGroups = await client.query(`
      SELECT COUNT(*)::int AS c
      FROM (
        SELECT "plaidTransactionId"
        FROM "Transaction"
        WHERE "plaidTransactionId" IS NOT NULL
        GROUP BY "plaidTransactionId"
        HAVING COUNT(*) > 1
      ) g
    `);

    const txDelete = await client.query(`
      WITH ranked AS (
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
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    `);

    const rawGroups = await client.query(`
      SELECT COUNT(*)::int AS c
      FROM (
        SELECT "userId", "plaidTransactionId"
        FROM "TransactionRaw"
        WHERE "plaidTransactionId" IS NOT NULL
        GROUP BY "userId", "plaidTransactionId"
        HAVING COUNT(*) > 1
      ) g
    `);

    const rawDelete = await client.query(`
      WITH ranked AS (
        SELECT r.id,
               ROW_NUMBER() OVER (
                 PARTITION BY r."userId", r."plaidTransactionId"
                 ORDER BY r."updatedAt" DESC, r."createdAt" DESC, r.id DESC
               ) AS rn
        FROM "TransactionRaw" r
        WHERE r."plaidTransactionId" IS NOT NULL
      )
      DELETE FROM "TransactionRaw" r
      WHERE r.id IN (SELECT id FROM ranked WHERE rn > 1)
        AND NOT EXISTS (SELECT 1 FROM "Transaction" t WHERE t."transactionRawId" = r.id)
    `);

    await client.query("COMMIT");

    console.log("Cleanup complete");
    console.log(`Transaction duplicate groups: ${txGroups.rows[0].c}`);
    console.log(`Transaction rows removed: ${txDelete.rowCount}`);
    console.log(`TransactionRaw duplicate groups: ${rawGroups.rows[0].c}`);
    console.log(`TransactionRaw rows removed: ${rawDelete.rowCount}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runCleanup().catch((error) => {
  console.error("Cleanup failed:", error);
  process.exit(1);
});