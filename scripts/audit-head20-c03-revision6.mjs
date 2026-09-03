import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const S=160,C=4,out=path.resolve('artifacts/head20-attempt6-per-cell/c03/revision-6');
const basePath=path.resolve('artifacts/head20-attempt6-per-cell/c03/c03-base-original-160x160.png');
const tailPath=path.join(out,'c03-tail-visible-pixels-mask.png');
const targetPath=path.join(out,'c03-r6-target-coordinate-locked-160x160.png');
const layerPath=path.join(out,'c03-r6-helmet-layer-same-coordinate-160x160.png');
const maskPath=path.join(out,'c03-r6-helmet-mask-same-coordinate-160x160.png');
const read=p=>sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const hash=async p=>sha(await fs.readFile(p));
const [base,tail,target,layer,mask]=await Promise.all([basePath,tailPath,targetPath,layerPath,maskPath].map(read));
const equal=(a,b,i)=>a[i]===b[i]&&a[i+1]===b[i+1]&&a[i+2]===b[i+2]&&a[i+3]===b[i+3];
const allowed=(x,y)=>x>=24&&x<132&&y>=5&&y<127;
const binary=new Uint8Array(S*S),composite=Buffer.from(base.data);
let pixels=0,outside=0,support=0,tailHit=0,bodyHit=0,exact=0;
for(let p=0;p<S*S;p++){const x=p%S,y=Math.floor(p/S),i=p*C,on=mask.data[i+3]>0;binary[p]=on;if(on){pixels++;composite[i]=layer.data[i];composite[i+1]=layer.data[i+1];composite[i+2]=layer.data[i+2];composite[i+3]=layer.data[i+3];}if(!allowed(x,y)&&!equal(target.data,base.data,i))outside++;if((layer.data[i+3]>0)!==on)support++;if(on&&tail.data[i+3]>=128)tailHit++;if(on&&y>=101)bodyHit++;if(!equal(composite,target.data,i))exact++;}
const dirs=[[1,0],[-1,0],[0,1],[0,-1]],seen=new Uint8Array(S*S);let components=0;
for(let s=0;s<S*S;s++)if(binary[s]&&!seen[s]){components++;const q=[s];seen[s]=1;for(let n=0;n<q.length;n++){const p=q[n],x=p%S,y=Math.floor(p/S);for(const[dX,dY]of dirs){const X=x+dX,Y=y+dY,z=Y*S+X;if(X>=0&&Y>=0&&X<S&&Y<S&&binary[z]&&!seen[z]){seen[z]=1;q.push(z);}}}}
const exterior=new Uint8Array(S*S),q=[];const add=(x,y)=>{const p=y*S+x;if(!binary[p]&&!exterior[p]){exterior[p]=1;q.push(p);}};
for(let x=0;x<S;x++){add(x,0);add(x,S-1);}for(let y=0;y<S;y++){add(0,y);add(S-1,y);}for(let n=0;n<q.length;n++){const p=q[n],x=p%S,y=Math.floor(p/S);for(const[dX,dY]of dirs){const X=x+dX,Y=y+dY;if(X>=0&&Y>=0&&X<S&&Y<S)add(X,Y);}}
let holes=0;for(let p=0;p<S*S;p++)if(!binary[p]&&!exterior[p])holes++;
const pass=components===1&&holes===0&&outside===0&&support===0&&tailHit===0&&bodyHit===0&&exact===0;
const report={schemaVersion:1,independent:true,cell:'c03',revision:'r6',verdict:pass?'PASS_MECHANICAL_PENDING_VISUAL_CRITIC':'REJECT',inputs:{base:{path:basePath,sha256:await hash(basePath)},tailProtection:{path:tailPath,sha256:await hash(tailPath)}},outputs:{target:{path:targetPath,sha256:await hash(targetPath)},layer:{path:layerPath,sha256:await hash(layerPath)},mask:{path:maskPath,sha256:await hash(maskPath)}},metrics:{maskPixels:pixels,components4Connected:components,enclosedHoles:holes,targetOutsideAllowedBaseDiffPixels:outside,layerMaskSupportMismatchPixels:support,tailIntersectionPixels:tailHit,bodyChestLegPawIntersectionPixels:bodyHit,zeroTransformSourceOverExactTargetMismatchPixels:exact},scope:'in-memory zero-transform source-over audit; no composite or runtime asset written',publishable:false};
await fs.writeFile(path.join(out,'c03-r6-mechanical-audit.json'),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report,null,2));
