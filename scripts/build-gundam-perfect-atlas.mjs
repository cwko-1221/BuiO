// RX-78-2 only: rebuild 37 transparent poses from retained whole-sheet sources.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
assert(!process.argv.some(arg => arg.startsWith('--pet=')), 'This builder only targets RX-78-2');
const dir=path.resolve(import.meta.dirname,'../pet-app/art-source/imagegen/baked-wearables/gundam-rx-78-2-perfect-v2');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const request=JSON.parse(await fs.readFile(path.join(dir,'generation-request.json'),'utf8'));
const walks=JSON.parse(await fs.readFile(path.join(dir,'walk-prompts.json'),'utf8'));
const ref=async file=>({file,hash:sha(await fs.readFile(path.join(dir,file)))});
const groups={};
for(const name of ['front-walk','right-walk','back-walk','front-idle','specials']){
 const prompt=name==='right-walk'?await fs.readFile(path.join(dir,'right-revision-prompt.txt'),'utf8'):
  name==='front-idle'?await fs.readFile(path.join(dir,'idle-prompt.txt'),'utf8'):
  name==='specials'?await fs.readFile(path.join(dir,'special-prompt.txt'),'utf8'):walks[name];
 const files=name==='right-walk'?['raw/right-walk-rejected-v1.png','model-reference.png']:
  name==='front-idle'?['front-edit-canvas.png','raw/front-walk-raw.png']:
  name==='specials'?['model-reference.png','raw/front-idle-raw.png']:
  [name==='front-walk'?'front-edit-canvas.png':'back-edit-canvas.png','model-reference.png'];
 groups[name]={tool:'built-in image_gen',prompt:prompt.trim(),file:'raw/'+name+'-raw.png',
  hash:sha(await fs.readFile(path.join(dir,'raw',name+'-raw.png'))),references:await Promise.all(files.map(ref))};
}
const record={id:request.id,model:{...request.model,file:'model-reference.png',
 hash:sha(await fs.readFile(path.join(dir,'model-reference.png')))},groups,
 history:[{group:'right-walk',file:'raw/right-walk-rejected-v1.png',
  hash:sha(await fs.readFile(path.join(dir,'raw/right-walk-rejected-v1.png'))),
  prompt:walks['right-walk'],reason:'Repeated near/far leg and arm arrangement; not shipped'}]};
await fs.writeFile(path.join(dir,'generation-prompts.json'),JSON.stringify(record,null,2)+'\n');
process.argv.push('--pet=gundam-rx-78-2');
await import('./build-generated-hidden-character-atlases.mjs');
