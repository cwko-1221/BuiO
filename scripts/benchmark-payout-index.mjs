import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import path from 'node:path';
const db = new PGlite();
const root = path.resolve(import.meta.dirname, '..');
const query = "SELECT COALESCE(SUM(amount),0) FROM payouts WHERE studentid='S1'";
const p95 = rows => [...rows].sort((a,b)=>a-b)[Math.floor(rows.length*.95)];
await db.exec(`CREATE TABLE payouts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),studentid text,eventid text,amount int,response jsonb);
  CREATE UNIQUE INDEX payout_identity ON payouts(studentid,eventid);
  INSERT INTO payouts(studentid,eventid,amount,response)
  SELECT CASE WHEN n<=4141 THEN 'S1' ELSE 'S'||(2+n%180) END,'event-'||n,1,
    jsonb_build_object('id',gen_random_uuid(),'metadata',repeat('fixture-data-',80)) FROM generate_series(1,30000) n;`);
await db.exec('VACUUM ANALYZE payouts');
let event = 30000;
async function sample() {
  const reads=[],writes=[];
  for(let n=0;n<35;n++) {
    const plan=(await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+query)).rows[0]['QUERY PLAN'][0];
    if(n>=5) reads.push(plan['Execution Time']);
    const started=performance.now();
    await db.query(`INSERT INTO payouts(studentid,eventid,amount,response) SELECT 'S2','event-'||n,1,jsonb_build_object('id',gen_random_uuid(),'metadata',repeat('fixture-data-',80)) FROM generate_series($1::int,$2::int) n`,[event+1,event+50]);
    event+=50;if(n>=5) writes.push(performance.now()-started);
  }
  return { readP95Ms:p95(reads),writeBatchP95Ms:p95(writes) };
}
try {
  const before=await sample();
  await db.exec('DROP INDEX payout_identity; CREATE UNIQUE INDEX payout_identity ON payouts(studentid,eventid) INCLUDE(amount); ANALYZE payouts;');
  const after=await sample();
  const readImprovement=1-after.readP95Ms/before.readP95Ms;
  const writeRegression=after.writeBatchP95Ms/before.writeBatchP95Ms-1;
  const result={ environment:'isolated PGlite PostgreSQL engine; synthetic rows; 50-row write batches; not production p95',candidate:'existing unique(studentid,eventid) extended with INCLUDE(amount); no additional steady-state index',rows:30000,before,after,readImprovement,writeRegression,gate:readImprovement>=.2&&writeRegression<=.1 };
  await fs.mkdir(path.join(root,'docs/school-upgrade'),{recursive:true});
  await fs.writeFile(path.join(root,'docs/school-upgrade/payout-index-benchmark.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally { await db.close(); }
