const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres.hwmpfzqjuvcsoaweqwab:C2YQ3cCzGml6URhy@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    await pool.query(`
        INSERT INTO QuestionLogs (StudentID, Tag, QuestionText, CorrectAnswer, UserAnswer, IsCorrect, TimeTaken)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, ['S001', 'tag1', '1+1', '2', '2', 1, 10]);
    console.log('Success with 1');
  } catch (err) {
    console.log('Error with 1:', err.message);
  }

  try {
    await pool.query(`
        INSERT INTO QuestionLogs (StudentID, Tag, QuestionText, CorrectAnswer, UserAnswer, IsCorrect, TimeTaken)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, ['S001', 'tag1', '1+1', '2', '2', true, 10]);
    console.log('Success with true');
  } catch (err) {
    console.log('Error with true:', err.message);
  }
  pool.end();
}
test();
