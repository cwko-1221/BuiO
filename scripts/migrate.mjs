#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const config = require('../config');
if (config.db.mode !== 'postgres') {
  console.log('Nothing to do — SUPABASE_DB_URL not set.');
  process.exit(0);
}

const bcrypt = require('bcryptjs');
const { getPool, close } = require('../math-app/db/database');
const { ALL_TAGS } = require('../math-app/engine/questionGenerator');

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS Users (
    StudentID VARCHAR(20) PRIMARY KEY,
    Name VARCHAR(100),
    Role VARCHAR(20),
    PasswordHash VARCHAR(255),
    ClassName VARCHAR(20),
    ClassNo INT,
    ChineseGroup VARCHAR(20),
    EnglishGroup VARCHAR(20),
    MathGroup VARCHAR(20),
    Language VARCHAR(20) DEFAULT 'zh-HK'
  );
  ALTER TABLE Users ADD COLUMN IF NOT EXISTS ClassName VARCHAR(20);
  ALTER TABLE Users ADD COLUMN IF NOT EXISTS ClassNo INT;
  ALTER TABLE Users ADD COLUMN IF NOT EXISTS ChineseGroup VARCHAR(20);
  ALTER TABLE Users ADD COLUMN IF NOT EXISTS EnglishGroup VARCHAR(20);
  ALTER TABLE Users ADD COLUMN IF NOT EXISTS MathGroup VARCHAR(20);
  ALTER TABLE Users ADD COLUMN IF NOT EXISTS Language VARCHAR(20) DEFAULT 'zh-HK';

  CREATE TABLE IF NOT EXISTS StudentStats (
    id SERIAL PRIMARY KEY,
    StudentID VARCHAR(20),
    Tag VARCHAR(50),
    TotalAttempted INT DEFAULT 0,
    TotalCorrect INT DEFAULT 0,
    AccuracyRate FLOAT DEFAULT 0,
    UNIQUE(StudentID, Tag)
  );

  CREATE TABLE IF NOT EXISTS QuestionLogs (
    id SERIAL PRIMARY KEY,
    StudentID VARCHAR(20),
    Tag VARCHAR(50),
    Question VARCHAR(255),
    CorrectAnswer VARCHAR(50),
    UserAnswer VARCHAR(50),
    IsCorrect BOOLEAN,
    TimeSpent INT,
    Timestamp TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE QuestionLogs ADD COLUMN IF NOT EXISTS CorrectAnswer VARCHAR(50);
`;

const CONSTRAINTS_SQL = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_studentstats_user') THEN
      ALTER TABLE StudentStats ADD CONSTRAINT fk_studentstats_user
        FOREIGN KEY (StudentID) REFERENCES Users(StudentID) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_questionlogs_user') THEN
      ALTER TABLE QuestionLogs ADD CONSTRAINT fk_questionlogs_user
        FOREIGN KEY (StudentID) REFERENCES Users(StudentID) ON DELETE CASCADE;
    END IF;
  END $$;
`;

const INDICES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_questionlogs_studentid ON QuestionLogs(StudentID);
  CREATE INDEX IF NOT EXISTS idx_questionlogs_tag ON QuestionLogs(Tag);
  CREATE INDEX IF NOT EXISTS idx_questionlogs_timestamp ON QuestionLogs(Timestamp);
  CREATE INDEX IF NOT EXISTS idx_studentstats_studentid ON StudentStats(StudentID);
  CREATE INDEX IF NOT EXISTS idx_users_role ON Users(Role);
`;

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    console.log('🔄 Creating tables...');
    await client.query(SCHEMA_SQL);

    console.log('🧹 Cleaning orphans & legacy tags...');
    await client.query('DELETE FROM StudentStats WHERE StudentID NOT IN (SELECT StudentID FROM Users)');
    await client.query('DELETE FROM QuestionLogs WHERE StudentID NOT IN (SELECT StudentID FROM Users)');
    if (ALL_TAGS.length > 0) {
      await client.query('DELETE FROM StudentStats WHERE Tag <> ALL($1::text[])', [ALL_TAGS]);
      await client.query('DELETE FROM QuestionLogs WHERE Tag <> ALL($1::text[])', [ALL_TAGS]);
    }

    console.log('🔗 Adding FK constraints...');
    await client.query(CONSTRAINTS_SQL);

    console.log('🔎 Creating indices...');
    await client.query(INDICES_SQL);

    const { rows } = await client.query('SELECT COUNT(*)::int AS c FROM Users');
    if (rows[0].c === 0 && process.argv.includes('--seed')) {
      console.log('🌱 Seeding defaults...');
      const hash = bcrypt.hashSync('123456', 10);
      const defaults = [
        ['S001', '王小明', 'student'], ['S002', '李小華', 'student'],
        ['S003', '張小美', 'student'], ['S004', '陳大偉', 'student'],
        ['S005', '林小芬', 'student'], ['T001', '陳老師', 'teacher'],
      ];
      for (const [id, name, role] of defaults) {
        await client.query('INSERT INTO Users (StudentID, Name, Role, PasswordHash) VALUES ($1,$2,$3,$4)',
          [id, name, role, hash]);
      }
      for (const [id, , role] of defaults.filter(d => d[2] === 'student')) {
        for (const tag of ALL_TAGS) {
          await client.query(
            'INSERT INTO StudentStats (StudentID, Tag, TotalAttempted, TotalCorrect, AccuracyRate) VALUES ($1,$2,0,0,0)',
            [id, tag]);
        }
      }
    }
    console.log('✅ Migration complete.');
  } finally {
    client.release();
    await close();
  }
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
