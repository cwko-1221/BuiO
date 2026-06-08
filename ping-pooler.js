const net = require('net');

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
  'aws-0-eu-west-2',
  'aws-0-eu-west-3',
  'aws-0-ap-south-1',
  'aws-0-sa-east-1',
  'aws-0-ca-central-1'
];

async function checkPooler(region) {
  return new Promise((resolve) => {
    const host = `${region}.pooler.supabase.com`;
    const socket = new net.Socket();
    socket.setTimeout(2000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(region);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(null);
    });
    
    socket.connect(6543, host);
  });
}

async function run() {
  console.log('Scanning Supabase pooler regions...');
  const promises = regions.map(r => checkPooler(r));
  const results = await Promise.all(promises);
  
  const alive = results.filter(r => r !== null);
  console.log('Alive regions:', alive);
  process.exit(0);
}

run();
