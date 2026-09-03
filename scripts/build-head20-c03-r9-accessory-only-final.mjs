import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const S=160,C=4;
const root=path.resolve('artifacts/head20-attempt6-per-cell/c03/revision-9');
const source=path.join(root,'accessory-only-rebuild');
const out=path.join(root,'accessory-only-final');
const basePath=path.resolve('artifacts/head20-attempt6-per-cell/c03/c03-base-original-160x160.png');
const rawPath=path.join(root,'c03-r9-raw-full-dressed-imagegen-source.png');
const normalizedPath=path.join(root,'c03-r9-normalized-rgb-1254x1254.png');
const layerPath=path.join(source,'c03-r9-accessory-only-candidate-layer-160x160.png');
const topologyPath=path.join(source,'c03-r9-accessory-only-candidate-topology-mask-160x160.png');
const erasePath=path.join(source,'c03-r9-accessory-only-candidate-opaque-erase-mask-160x160.png');
const hash=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const read=p=>sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const [base,layer,topology,erase]=await Promise.all([basePath,layerPath,topologyPath,erasePath].map(read));
for(const item of [base,layer,topology,erase])if(item.info.width!==S||item.info.height!==S||item.info.channels!==C)throw new Error('all final inputs must be 160x160 RGBA');
const hardware=Buffer.alloc(S*S*C),tint=Buffer.alloc(S*S*C);
for(let p=0;p<S*S;p++){const i=p*C;if(layer.data[i+3]>=192)layer.data.copy(hardware,i,i,i+C);else if(layer.data[i+3]>0)layer.data.copy(tint,i,i,i+C);}
const over=(dst,src)=>{for(let p=0;p<S*S;p++){const i=p*C,sa=src[i+3]/255;if(sa===0)continue;const da=dst[i+3]/255,oa=sa+da*(1-sa);if(oa===0){dst[i]=dst[i+1]=dst[i+2]=dst[i+3]=0;continue;}dst[i]=Math.round((src[i]*sa+dst[i]*da*(1-sa))/oa);dst[i+1]=Math.round((src[i+1]*sa+dst[i+1]*da*(1-sa))/oa);dst[i+2]=Math.round((src[i+2]*sa+dst[i+2]*da*(1-sa))/oa);dst[i+3]=Math.round(oa*255);}};
const target=Buffer.from(base.data);over(target,tint);over(target,hardware);
const erased=Buffer.from(base.data);for(let p=0;p<S*S;p++){const i=p*C;if(erase.data[i+3]>0)erased[i]=erased[i+1]=erased[i+2]=erased[i+3]=0;}
const composite=Buffer.from(erased);over(composite,tint);over(composite,hardware);
const equal=(a,b,i)=>a[i]===b[i]&&a[i+1]===b[i+1]&&a[i+2]===b[i+2]&&a[i+3]===b[i+3];
let exactMismatch=0,outsideBaseDiff=0,layerTopologyMismatch=0,eraseInvalid=0;
for(let p=0;p<S*S;p++){const i=p*C;if(!equal(target,composite,i))exactMismatch++;if(topology.data[i+3]===0&&!equal(target,base.data,i))outsideBaseDiff++;if((layer.data[i+3]>0)!==(topology.data[i+3]>0))layerTopologyMismatch++;if(erase.data[i+3]>0&&layer.data[i+3]<192)eraseInvalid++;}
const final={wearableLayer:path.join(out,'c03-r9-hardware-tint-layer-160x160.png'),hardwareLayer:path.join(out,'c03-r9-hardware-layer-160x160.png'),visorTintLayer:path.join(out,'c03-r9-visor-tint-layer-160x160.png'),wearableSilhouetteMask:path.join(out,'c03-r9-wearable-silhouette-mask-160x160.png'),opaqueEraseMask:path.join(out,'c03-r9-opaque-erase-mask-160x160.png'),target:path.join(out,'c03-r9-body-preserving-complete-dressed-target-160x160.png'),composite:path.join(out,'c03-r9-zero-transform-composite-160x160.png')};
await fs.mkdir(out,{recursive:true});const write=(data,p)=>sharp(data,{raw:{width:S,height:S,channels:C}}).png({compressionLevel:9}).toFile(p);
await Promise.all([write(layer.data,final.wearableLayer),write(hardware,final.hardwareLayer),write(tint,final.visorTintLayer),write(topology.data,final.wearableSilhouetteMask),write(erase.data,final.opaqueEraseMask),write(target,final.target),write(composite,final.composite)]);
const reports=['c03-r9-accessory-only-anatomy-pregate.json','c03-r9-accessory-only-rightcup-semantic-pregate.json','c03-r9-accessory-only-rightcup-geometry-pregate.json'];
const gates=Object.fromEntries(await Promise.all(reports.map(async name=>[name,{path:path.join(source,name),sha256:await hash(path.join(source,name)),verdict:JSON.parse(await fs.readFile(path.join(source,name),'utf8')).verdict}])));
const lineage={schemaVersion:1,job:'starpatch-cat:1:head-20',attempt:6,cell:'c03',revision:'r9-accessory-only-final',status:'FROZEN_FOR_INDEPENDENT_SOLVER_AND_CRITIC_REVIEW_NOT_APPROVED',generation:{model:'built-in image_gen',prompt:'r9 independent full-dressed creative reference; final target is deliberately body-preserving base plus frozen accessory-only layer.',rawSource:{path:rawPath,sha256:await hash(rawPath)},normalization:{path:normalizedPath,sha256:await hash(normalizedPath),steps:'transparent raw normalized to 1254x1254 before accessory-only extraction'}},originals:{base:{path:basePath,sha256:await hash(basePath)},pet:'art-inbox/pet-starpatch-cat-1.png',accessory:'art-inbox/wearable-head-3.png'},frozenCandidate:{layer:{path:layerPath,sha256:await hash(layerPath)},topologyMask:{path:topologyPath,sha256:await hash(topologyPath)},opaqueEraseMask:{path:erasePath,sha256:await hash(erasePath)}},maskRoles:{wearableSilhouetteMask:'binary alpha union for closed visual silhouette/topology; it includes transparent visor tint',opaqueEraseMask:'binary alpha only where opaque hardware replaces base; face visor tint is excluded'},outputs:Object.fromEntries(await Promise.all(Object.entries(final).map(async([k,p])=>[k,{path:p,sha256:await hash(p)}]))),preGates:gates,exactCompare:{targetVsZeroTransformCompositeRgbaMismatchPixels:exactMismatch,targetOutsideWearableSilhouetteBaseDiffPixels:outsideBaseDiff,layerVsTopologySupportMismatchPixels:layerTopologyMismatch,opaqueEraseMaskOnNonOpaqueLayerPixels:eraseInvalid},forbiddenInputProof:'Final construction read only base plus the frozen r9 accessory-only candidate layer/topology/erase masks; no c01/c02/c03 prior candidate/final target/layer/mask/composite was read.',publishable:false};
await fs.writeFile(path.join(out,'c03-r9-accessory-only-final-lineage.json'),`${JSON.stringify(lineage,null,2)}\n`);
console.log(JSON.stringify({outputs:lineage.outputs,exactCompare:lineage.exactCompare,preGates:gates,status:lineage.status},null,2));
