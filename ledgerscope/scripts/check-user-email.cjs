const { Pool } = require('pg');

async function run() {
  const email = process.argv[2];
  const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/mydb?schema=public' });
  const res = await pool.query('select id, email from "User" where email = $1', [email]);
  console.log('DB_MATCHES=' + res.rowCount);
  if (res.rowCount > 0) {
    console.log(JSON.stringify(res.rows[0]));
  }
  await pool.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
