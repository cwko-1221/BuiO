const https = require('https');
https.get('https://hwmpfzqjuvcsoaweqwab.supabase.co/rest/v1/', (res) => {
  console.log(res.headers);
});
