const { Pool } = require('pg');

const urls = [
  // Session mode (5432)
  'postgresql://postgres.hwmpfzqjuvcsoaweqwab:C2YQ3cCzGml6URhy@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  // Transaction mode (6543)
  'postgresql://postgres.hwmpfzqjuvcsoaweqwab:C2YQ3cCzGml6URhy@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres',
  // Supavisor direct
  'postgresql://postgres:C2YQ3cCzGml6URhy@aws-0-ap-northeast-1.pooler.supabase.com:5432/hwmpfzqjuvcsoaweqwab',
  'postgresql://postgres:C2YQ3cCzGml6URhy@aws-0-ap-northeast-1.pooler.supabase.com:6543/hwmpfzqjuvcsoaweqwab'
];

async function testUrl(url) {
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    const res = await pool.query('SELECT 1');
    console.log('SUCCESS:', url);
  } catch (err) {
    console.log('FAIL:', err.message);
  } finally {
    pool.end();
  }
}

async function run() {
  for (const u of urls) await testUrl(u);
}
run();
