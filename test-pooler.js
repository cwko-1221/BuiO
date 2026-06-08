const { Pool } = require('pg');

const testUrl = 'postgresql://postgres.hwmpfzqjuvcsoaweqwab:C2YQ3cCzGml6URhy@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres';

const pool = new Pool({
  connectionString: testUrl,
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Connected!', res.rows);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

test();
