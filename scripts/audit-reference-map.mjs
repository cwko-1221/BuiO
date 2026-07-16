import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { FIXED_MAP } from '../game-app/public/js/v2/fixed-map.js';

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
const annotationAssets=new Set(FIXED_MAP.annotations.map(annotation=>annotation.assetId).filter(Boolean));
// The summit flag is placed directly by GameScene at the final landmark so it
// intentionally is not represented as a physical map object.
const runtimeSpecial=new Set(['ref-summit-flag']);
const mapFrameCoverage=blueprint.frames.map((frame,index)=>{
  const tag=`reference-frame-${String(index+1).padStart(2,'0')}`;
  const used=new Set(FIXED_MAP.objects
    .filter(object=>object.tags?.includes(tag))
    .map(object=>object.assetId));
  const missingFromMap=frame.props.filter(id=>
    !used.has(id) && !annotationAssets.has(id) && !runtimeSpecial.has(id)
  );
  return {id:frame.id,tag,required:frame.props.length,used:[...used].sort(),missing:missingFromMap};
});
const mapMissing=mapFrameCoverage.filter(frame=>frame.missing.length);

console.log(JSON.stringify({
  blueprint:blueprint.version,
  frames:blueprint.frames.length,
  required:blueprint.requiredAssetIds.length,
  shipped:blueprint.requiredAssetIds.length-missing.length,
  missing,
  duplicated,
  frameCoverage,
  mapFrameCoverage,
  mapMissing
},null,2));

if (missing.length || duplicated.length || mapMissing.length) process.exitCode=1;
