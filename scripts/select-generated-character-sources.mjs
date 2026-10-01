// Select whole-sheet generated sources without destroying earlier/rejected variants.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const ids=new Set(['dragon-ball-frieza','one-piece-luffy','spy-family-anya','one-punch-saitama','naruto-uzumaki']);
const groups=new Set(['front-walk','right-walk','back-walk','front-idle','specials']);
assert(process.argv[2], 'Pass a local source-selection JSON array');
const selections=JSON.parse(await fs.readFile(path.resolve(process.argv[2]),'utf8'));
for(const {id,group,path:input,prompt,references=[]} of selections) {
 assert(ids.has(id)&&groups.has(group)&&typeof prompt==='string'&&prompt.length>100);
 const dir=path.join(root,'pet-app/art-source/imagegen/baked-wearables',id+'-perfect-v2');
 const target=path.join(dir,'raw',group+'-raw.png');
 const previous=await fs.readFile(target);
 const sha=crypto.createHash('sha256').update(previous).digest('hex').slice(0,16);
 await fs.writeFile(path.join(dir,'raw',group+'-retained-'+sha+'.png'),previous);
 const next=await fs.readFile(input); assert(next.length>1000,'Empty selected source');
 await fs.writeFile(target,next);
 const file=path.join(dir,'generation-prompts.json');
 const provenance=JSON.parse(await fs.readFile(file,'utf8'));
 provenance.history??=[];
 provenance.history.push({group,...provenance.groups[group],retainedFile:'raw/'+group+'-retained-'+sha+'.png'});
 const retainedReferences=[];
 for(const reference of references) {
  const destination=path.resolve(dir,reference.file);
  assert(destination.startsWith(path.resolve(dir)+path.sep),'Reference must stay within this character source directory');
  await fs.mkdir(path.dirname(destination),{recursive:true});
  const bytes=await fs.readFile(reference.path);
  await fs.writeFile(destination,bytes);
  retainedReferences.push({file:reference.file,role:reference.role,prompt:reference.prompt,
   hash:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 provenance.groups[group]={prompt,file:'raw/'+group+'-raw.png',tool:'built-in image_gen',references:retainedReferences};
 await fs.writeFile(file,JSON.stringify(provenance,null,2)+'\n');
 console.log('Selected '+id+' '+group+'; previous sheet retained '+sha);
}
