import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root=process.cwd();
const blueprintPath=path.join(root,'game-app/public/images/v2/data/reference-map-blueprint.json');
const ledgerPath=path.join(root,'game-app/public/images/v2/data/asset-ledger.json');
const blueprint=JSON.parse(fs.readFileSync(blueprintPath,'utf8'));
const ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
const assets=Array.isArray(ledger)?ledger:(ledger.assets||[]);
const shipped=new Set(assets.map(asset=>asset.id));
const missing=blueprint.requiredAssetIds.filter(id=>!shipped.has(id));
const duplicated=[...new Set(blueprint.requiredAssetIds.filter((id,index,list)=>list.indexOf(id)!==index))];
const frameCoverage=blueprint.frames.map(frame=>({
  id:frame.id,
  required:frame.props.length,
  ready:frame.props.filter(id=>shipped.has(id)).length,
  missing:frame.props.filter(id=>!shipped.has(id))
}));

console.log(JSON.stringify({
  blueprint:blueprint.version,
  frames:blueprint.frames.length,
  required:blueprint.requiredAssetIds.length,
  shipped:blueprint.requiredAssetIds.length-missing.length,
  missing,
  duplicated,
  frameCoverage
},null,2));

if (duplicated.length) process.exitCode=1;
