const { Pool } = require('pg');

async function run() {
  const email = process.argv[2];
  if (!email) throw new Error('Email required');

  const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/mydb?schema=public' });

  const user = await pool.query('select id from "User" where email=$1', [email]);
  const userId = user.rows[0]?.id;
  if (!userId) {
    console.log('USER_FOUND=0');
    await pool.end();
    return;
  }

  const connCount = await pool.query('select count(*)::int as c from "BankConnection" where "userId"=$1', [userId]);
  const acctCount = await pool.query('select count(*)::int as c from "BankAccount" where "userId"=$1', [userId]);
  const txCount = await pool.query("select count(*)::int as c from \"Transaction\" where \"userId\"=$1 and status <> 'REMOVED'", [userId]);

  console.log('USER_FOUND=1');
  console.log('DB_CONN_COUNT=' + connCount.rows[0].c);
  console.log('DB_ACCOUNT_COUNT=' + acctCount.rows[0].c);
  console.log('DB_TX_COUNT=' + txCount.rows[0].c);

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
