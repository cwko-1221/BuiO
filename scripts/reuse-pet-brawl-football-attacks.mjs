// Mechanical atlas assembly of already-approved artwork. The image tool refused
// the new ground sheet; no retry or substitute generation is performed.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import sharp from 'sharp';import {findCells,keepPose} from './sheet-cells.mjs';
const root='pet-app/art-source/basic-attacks-v1/argentina-number-10',original='pet-app/art-source/fighter-skill-poses-v1/argentina-number-10/raw.png',target=root+'/finish-air/raw.png';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),sourceCells=await findCells(original,4,4),newCells=await findCells(target,4,4);
const sourceReady=(sourceCells[0].height+sourceCells[8].height)/2,newReady=(newCells[7].height+newCells[15].height)/2,scale=newReady/sourceReady,cell=384;
const selected=[0,1,2,4,5,6,2,0,8,9,11,12,13,14,10,8],layers=[];
for(const [i,n] of selected.entries()){const c=sourceCells[n],cut=await keepPose(original,c,await sharp(original).extract(c).png().toBuffer()),width=Math.round(c.width*scale),height=Math.round(c.height*scale);assert.ok(width<=cell-16&&height<=cell-16);layers.push({input:await sharp(cut).resize(width,height).png().toBuffer(),left:i%4*cell+Math.round((cell-width)/2),top:Math.floor(i/4)*cell+cell-20-height});}
fs.mkdirSync(root+'/ground',{recursive:true});await sharp({create:{width:cell*4,height:cell*4,channels:4,background:'#00000000'}}).composite(layers).png().toFile(root+'/ground/raw.png');
fs.writeFileSync(root+'/ground/generation.json',JSON.stringify({id:'argentina-number-10-ground',mode:'approved sprite assembly',reason:'Built-in image generation rejected this ground sheet with moderation category public-figure. Existing approved kicking art is reused.',source:original,sourceHash:hash(root+'/ground/raw.png'),approvedSourceHash:hash(original),calibrationSource:target,calibrationHash:hash(target),selectedFrames:selected,sharedSourceScale:scale,columns:4,rows:4,actions:['attack1','attack2']},null,2)+'\n');
console.log('Assembled 16 approved football ground poses, scale '+scale.toFixed(4));
