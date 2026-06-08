const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hwmpfzqjuvcsoaweqwab.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3bXBmenFqdXZjc29hd2Vxd2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MTA5NTUsImV4cCI6MjA5NjM4Njk1NX0.Y4CHUheVwHWKEVyhV6e740ZOHIuWqZ3GBas_7D_Dt6o';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('users').select('*').limit(1);
  console.log('Data:', data);
  console.log('Error:', error);
}

test();
