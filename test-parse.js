const { parse } = require('pg-connection-string');
try {
  console.log(parse("postgresql://postgres:C2YQ3cCzGml6URhy@db.hwmpfzqjuvcsoaweqwab.supa base.co:5432/postgres"));
} catch (e) { console.error("1", e.message); }

try {
  console.log(parse("postgresql://postgres:C2YQ3cCzGml6URhy@db.hwmpfzqjuvcsoaweqwab.supabase .co:5432/postgres"));
} catch (e) { console.error("2", e.message); }

try {
  console.log(parse("postgresql://postgres:C2YQ3cCzGml6URhy@base"));
} catch (e) { console.error("3", e.message); }
