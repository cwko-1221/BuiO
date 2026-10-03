import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const root=path.resolve('.'),privateSource=path.join(root,'artifacts/adventure-v9/source'),archive='pet-app/art-source/adventure-v9';
const jobs=JSON.parse(fs.readFileSync(path.join(privateSource,'jobs.json')));
if(jobs.some(j=>!j.source))throw Error('Finish and approve every source image before archiving');
fs.mkdirSync(archive,{recursive:true});const saved=[];
for(const job of jobs){
 const original=fs.readFileSync(path.resolve(job.source)),buffer=await sharp(original).webp({lossless:true,effort:6}).toBuffer();
 const source=archive+'/'+job.id+'.webp';fs.writeFileSync(source,buffer);
 const {refs,...record}=job;
 if(refs){record.references=[];for(const [n,ref] of refs.entries()){
  const name=n===0?'ref-'+job.enemy:'seed-'+job.enemy,file=archive+'/'+name+'.webp';
  if(!fs.existsSync(file))fs.writeFileSync(file,await sharp(ref).webp({lossless:true,effort:6}).toBuffer());
  record.references.push(file);
 }}
 saved.push({...record,source,sourcePngSha256:crypto.createHash('sha256').update(original).digest('hex'),archiveSha256:crypto.createHash('sha256').update(buffer).digest('hex')});
}
fs.writeFileSync(path.join(archive,'jobs.json'),JSON.stringify(saved,null,2)+'\n');
fs.writeFileSync(path.join(archive,'README.md'),`# Lost Starlight adventure artwork\n\nApproved image-generation sources for the twenty-chapter adventure: seventeen new four-area background sheets, twenty-nine enemy designs and complete eight-frame animation sheets, and three companion portraits. The first three chapters retain their published background sources.\n\nAll source pixels are preserved in lossless WebP. jobs.json records each prompt, relative reference paths and source checksums. Original PNGs remain in the local generation archive. Each animation was produced as one complete edit from its approved character seed, then checked for coherent poses and complete silhouettes.\n\nRun \`node scripts/build-pet-brawl-adventure-assets.mjs\` at the repository root to reproduce shipping textures with the installed Sharp dependency. The builder extracts whole connected silhouettes, normalizes all eight poses with one shared scale and bottom-centre anchor, and writes frame previews plus measurements to artifacts/pet-playtest/adventure-v9/art. A merged or missing pose blocks the build. Rebuilding requires neither a generation API call nor the local image-generation plugin.\n`);
console.log(JSON.stringify({images:saved.length,bytes:fs.readdirSync(archive).reduce((n,f)=>n+fs.statSync(path.join(archive,f)).size,0)}));
