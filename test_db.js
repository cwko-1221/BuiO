const db = require('./db');
const { ALL_TAGS } = require('./math-app/engine/questionGenerator');

async function run() {
  const sql = `
            SELECT 
                COALESCE(SUM(TotalAttempted), 0) as totalquestions,
                COALESCE(SUM(TotalCorrect), 0) as totalcorrect,
                CASE 
                    WHEN SUM(TotalAttempted) > 0 
                    THEN ROUND(CAST(SUM(TotalCorrect) AS NUMERIC) / SUM(TotalAttempted) * 100, 1)
                    ELSE 0 
                END as overallaccuracy
            FROM StudentStats
            WHERE StudentID = $1 AND Tag = ANY($2::text[])
        `;
  const res = await db.query(sql, ['S123', ALL_TAGS]);
  console.log('Result for S123 overview:', res);
  
  const tagsSql = `
            SELECT 
                Tag as tag,
                TotalAttempted as totalattempted,
                TotalCorrect as totalcorrect,
                AccuracyRate as accuracyrate
            FROM StudentStats
            WHERE StudentID = $1 AND Tag = ANY($2::text[])
            ORDER BY Tag
        `;
  const res2 = await db.query(tagsSql, ['S123', ALL_TAGS]);
  console.log('Result for tags:', res2);
}
run().catch(console.error);
