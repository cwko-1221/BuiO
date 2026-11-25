import * as T from 'three';
import { disposeGroup } from '../coast/scenery';
import { ground, terrain } from './island';
import { ASSETS, type AssetId } from './assets';
import { createIslandModelLoader, type Appearance } from './world';
import { TRIAL_MODELS, type TrialModelId, type TrialPlacement } from './trial-placements';

export interface TrialModel {
  id: TrialModelId;
  placement: TrialPlacement;
  object: T.Group;
  size: T.Vector3;
}

export async function loadTrialModels():Promise<TrialModel[]> {
  const files=import.meta.glob<string>('./trial-assets/*.glb',{eager:true,query:'?url',import:'default'});
  const loader=createIslandModelLoader();
  const entries=Object.entries(TRIAL_MODELS) as [TrialModelId,TrialPlacement][];
  const results=await Promise.allSettled(entries.map(async ([id,placement])=>{
    const file=files['./trial-assets/'+id+'.glb'];
    if(!file)throw Error('Trial model missing from the preview: '+id);
    const {scene}=await loader.loadAsync(file);
    const box=new T.Box3().setFromObject(scene,true);
    const size=box.getSize(new T.Vector3()), centre=box.getCenter(new T.Vector3());
    const unit=placement.measure==='width'?size.x:size.y;
    if(!Number.isFinite(unit)||unit<=0){disposeGroup(scene);throw Error('Invalid dimensions for '+id);}
    const scale=placement.metres/unit;
    scene.position.x-=centre.x;
    scene.position.y-=box.min.y;
    scene.position.z-=centre.z;
    const object=new T.Group();
    object.name='moonbay-trial-'+id;object.add(scene);
    object.scale.setScalar(scale);
    object.rotateY(placement.yaw);
    object.traverse(child=>{
      if(child instanceof T.Mesh){child.castShadow=true;child.receiveShadow=true;}
    });
    return {id,placement,object,size:size.multiplyScalar(scale)};
  }));
  const models=results.flatMap(item=>item.status==='fulfilled'?[item.value]:[]);
  const problem=results.find(item=>item.status==='rejected');
  if(problem){models.forEach(model=>disposeGroup(model.object));throw problem.reason;}
  for(const model of models) {
    const {x,z,above,ground:surface}=model.placement;
    const base=above?models.find(item=>item.id===above):undefined;
    const land=surface==='deck'?ground(x,z):terrain(x,z).y;
    let floor=land;
    if(base){
      base.object.updateMatrixWorld(true);
      const ray=new T.Raycaster(new T.Vector3(x,base.object.position.y+base.size.y+1,z),new T.Vector3(0,-1,0));
      floor=ray.intersectObject(base.object,true)[0]?.point.y??base.object.position.y;
    }
    model.object.position.set(x,floor,z);
  }
  return models;
}

export async function loadSculptedModels(skipGeneratedIds?:ReadonlySet<AssetId>) {
  const generated=import.meta.glob<string>('./generated-models/*.glb',{eager:true,query:'?url',import:'default'});
  const previews=import.meta.glob<string>('./preview-models/*.glb',{eager:true,query:'?url',import:'default'});
  const files=new Map<string,{url:string;preview:boolean}>();
  for(const [file,url] of Object.entries(generated)){
    const id=file.slice('./generated-models/'.length,-4) as AssetId;
    if(!skipGeneratedIds?.has(id))files.set(id,{url,preview:false});
  }
  for(const [file,url] of Object.entries(previews))files.set(file.slice('./preview-models/'.length,-4),{url,preview:true});
  const loader=createIslandModelLoader();
  const results=await Promise.allSettled(Array.from(files,async ([name,{url,preview}])=>{
    const id=name as AssetId;
    if(!Object.hasOwn(ASSETS,id))throw Error('Unknown sculpted model: '+id);
    const {scene}=await loader.loadAsync(url);
    const bbox=new T.Box3().setFromObject(scene);
    const size=bbox.getSize(new T.Vector3()),[w,d,h]=ASSETS[id].size;
    if(Math.abs(size.x-w)>.03||Math.abs(size.z-d)>.03||Math.abs(size.y-h)>.03||Math.abs(bbox.min.y)>.02){
      disposeGroup(scene);throw Error('Sculpted model has the wrong footprint or scale: '+id);
    }
    return [id,{model:scene,official:false,preview}] as [AssetId,Appearance];
  }));
  const models=new Map(results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]));
  const failed=results.find(result=>result.status==='rejected');
  if(failed){models.forEach(item=>disposeGroup(item.model));throw failed.reason;}
  return models;
}
export async function loadArtMaterials() {
  const files=import.meta.glob<string>('./trial-assets/*.webp',{eager:true,query:'?url',import:'default'});
  const loader=new T.TextureLoader();
  const result=await Promise.all((['grass','soil','stone','water'] as const).map(async key=>{
    const file=files['./trial-assets/'+key+'.webp'];
    if(!file)throw Error('Missing authored terrain material: '+key);
    const texture=await loader.loadAsync(file);
    texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;
    return [key,texture] as const;
  }));
  return Object.fromEntries(result);
}
