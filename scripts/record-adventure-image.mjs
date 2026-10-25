// Records output from the built-in image tool. This never invokes an image API.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('.'),dir=path.join(root,'artifacts/adventure-v9/source'),file=path.join(dir,'jobs.json');
const [id,source]=process.argv.slice(2),jobs=JSON.parse(fs.readFileSync(file)),job=jobs.find(j=>j.id===id);
if(!job)throw Error('Unknown image job');
const original=path.resolve(source),allowed=path.resolve('C:/Users/kochu/.codex/generated_images');
if(!original.startsWith(allowed+path.sep)||path.extname(original)!=='.png')throw Error('Unexpected generated image path');
const target=path.join(dir,id+'.png');if(!target.startsWith(root+path.sep))throw Error('Outside project');
fs.copyFileSync(original,target);job.source=path.relative(root,target).replaceAll('\\','/');job.generatedAt=new Date().toISOString();
fs.writeFileSync(file,JSON.stringify(jobs,null,2));console.log(JSON.stringify({id,path:target}));
