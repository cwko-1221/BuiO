const { Client } = require('pg');

const regions = [
  'aws-0-ap-southeast-1',
  'aws-0-ap-northeast-1',
  'aws-0-ap-northeast-2',
  'aws-0-ap-east-1',
  'aws-0-us-east-1',
  'aws-0-us-east-2',
  'aws-0-us-west-1',
  'aws-0-us-west-2',
  'aws-0-eu-central-1',
  'aws-0-eu-west-1',
  'aws-0-eu-west-2'
];

async function run() {
  for (const region of regions) {
    const connStr = `postgresql://postgres.hwmpfzqjuvcsoaweqwab:C2YQ3cCzGml6URhy@${region}.pooler.supabase.com:6543/postgres`;
    const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 3000 });
    
    try {
      console.log(`Trying ${region}...`);
      await client.connect();
      console.log('SUCCESS with:', connStr);
      
      // Create tables
      await client.query(`
        CREATE TABLE IF NOT EXISTS Users (
          StudentID VARCHAR(20) PRIMARY KEY,
          Name VARCHAR(100),
          Role VARCHAR(20),
          PasswordHash VARCHAR(255)
        );
        CREATE TABLE IF NOT EXISTS StudentStats (
          id SERIAL PRIMARY KEY,
          StudentID VARCHAR(20),
          Tag VARCHAR(50),
          TotalAttempted INT DEFAULT 0,
          TotalCorrect INT DEFAULT 0,
          AccuracyRate FLOAT DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS QuestionLogs (
          id SERIAL PRIMARY KEY,
          StudentID VARCHAR(20),
          Tag VARCHAR(50),
          Question VARCHAR(255),
          UserAnswer VARCHAR(50),
          IsCorrect BOOLEAN,
          TimeSpent INT,
          Timestamp TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      console.log('Tables created!');
      process.exit(0);
    } catch (err) {
      console.log(`Failed ${region}: ${err.message}`);
    }
  }
  console.log('Could not connect to any region.');
  process.exit(1);
}

run();
