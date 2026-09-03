import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';

const root=process.cwd();
const sourceDir=path.join(root,'game-app','public','images','v2','masters');
const outputDir=path.join(root,'tmp','imagegen','checkpoint-themes');
const outputFile=path.join(outputDir,'checkpoint-theme-contact-sheet.png');
const names=[
  'cp-start-royal-crate',
  'cp-castle-drawbridge-winch',
  'cp-market-spice-cart',
  'cp-forest-mushroom-log',
  'cp-farm-windmill-gear',
  'cp-snow-ice-sled',
  'cp-factory-gate-console',
  'cp-observatory-astrolabe',
  'cp-vault-lockbox',
  'cp-workshop-toolbench',
  'cp-office-typewriter-desk',
  'cp-summit-beacon-plinth'
];

const tiles=[];
await fs.mkdir(outputDir,{recursive:true});
for (const [index,name] of names.entries()) {
  const sprite=await sharp(path.join(sourceDir,`${name}-master.png`))
    .trim()
    .resize(250,205,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}})
    .png()
    .toBuffer();
  const label=Buffer.from(`<svg width="250" height="35" xmlns="http://www.w3.org/2000/svg">
    <rect width="250" height="35" fill="#f8fafc"/>
    <text x="125" y="23" text-anchor="middle" font-family="Arial" font-size="14" fill="#16213a">${name.replace('cp-','')}</text>
  </svg>`);
  const tile=await sharp({create:{width:250,height:240,channels:4,background:'#e8eef5'}})
    .composite([{input:sprite,left:0,top:0},{input:label,left:0,top:205}])
    .png()
    .toBuffer();
  tiles.push({input:tile,left:(index%4)*250,top:Math.floor(index/4)*240});
}

await sharp({create:{width:1000,height:720,channels:4,background:'#dbe4ee'}})
  .composite(tiles)
  .png()
  .toFile(outputFile);

console.log(outputFile);
