const art=name=>`/pokemon-rpg/assets/overhaul/world/${name}.webp`;
import {THEME_ATLAS} from './themeAtlas.mjs';
import {LANDMARK_ATLAS} from './landmarkAtlas.mjs';
import {NPCS} from './trainers.mjs';
import {WORLD_SCENES,getScenePropMetric,isLandmarkVariant,unwrapLandmarkVariant} from './worldSceneDesign.mjs';
export function getActiveWorldNpc(npc,save){return npc.relocatedBy&&save?.storyFlags?.[npc.relocatedBy.flag]?{...npc,x:npc.relocatedBy.x,z:npc.relocatedBy.z,dialogueZh:npc.dialogueZhAfter||npc.dialogueZh}:npc;}
export const THEME_HEIGHTS=[108,58,142,216,118,56,48,84,172,118,98,92,86,195,94,88,92,52,66,46,205,112,96,176,42];
const distanceToRoad=(map,x,z)=>Math.min(...(map.roads||[]).flatMap(r=>r.points.slice(1).map((b,i)=>{const a=r.points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)-r.width/2;})));
const PROCEDURAL_FLORA=new Set(['tree_oak','tree_pine','tree_palm','premium_oak','woodland_shrubs','premium_shrubs','rock_canyon','crystal_twilight']);

function clearSceneCourts(map,scenes){
  map.props=(map.props||[]).filter(p=>{
    if(!PROCEDURAL_FLORA.has(p.kind))return true;
    if((map.fieldObjects||[]).some(f=>Math.hypot(p.x-f.x,p.z-f.z)<3.4))return false;
    return !scenes.some(s=>((p.x-s.x)/(s.rx+1.35))**2+((p.z-s.z)/(s.rz+1.35))**2<1);
  });
}

function keepClearOfTargets(x,z,targets,minDist=1.4){
  let px=x,pz=z;
  for(let pass=0;pass<2;pass++){
    for(const t of targets){
      const req=Math.max(minDist,t.r||minDist);
      const dx=px-t.x,dz=pz-t.z,d=Math.hypot(dx,dz);
      if(d<req){
        const ang=d>0.01?Math.atan2(dz,dx):0.65;
        px=t.x+Math.cos(ang)*req;
        pz=t.z+Math.sin(ang)*req;
      }
    }
  }
  return {x:px,z:pz};
}

function nudgeOffRoad(map,x,z,minClear=0.85){
  let px=x,pz=z;
  for(const r of map.roads||[]){
    for(let i=0;i<r.points.length-1;i++){
      const a=r.points[i],b=r.points[i+1],dx=b.x-a.x,dz=b.z-a.z;
      const lenSq=dx*dx+dz*dz||1;
      const t=Math.max(0,Math.min(1,((px-a.x)*dx+(pz-a.z)*dz)/lenSq));
      const cx=a.x+t*dx,cz=a.z+t*dz;
      const vx=px-cx,vz=pz-cz,dist=Math.hypot(vx,vz);
      const need=r.width*0.5+minClear;
      if(dist<need){
        const nx=dist>0.01?vx/dist:-dz/Math.sqrt(lenSq);
        const nz=dist>0.01?vz/dist:dx/Math.sqrt(lenSq);
        px=cx+nx*need;
        pz=cz+nz*need;
      }
    }
  }
  return {x:px,z:pz};
}

function populateThemeProps(map,findSafe){
  const scenes=WORLD_SCENES[map.id]||[];
  clearSceneCourts(map,scenes);
  map.themeProps=[];
  map.landmarkProps=[];
  const zoneNpcs=NPCS.filter(n=>n.zone===map.id);
  const protectedTargets=[
    ...(map.fieldObjects||[]).map(f=>({x:f.x,z:f.z,r:f.kind==='camp'?2.1:1.6})),
    ...(map.fieldObjects||[]).filter(f=>f.kind==='camp').map(f=>({x:f.x+1,z:f.z+1,r:1.5})),
    ...zoneNpcs.map(n=>({x:n.x,z:n.z,r:2.2})),
    ...zoneNpcs.filter(n=>n.relocatedBy).map(n=>({x:n.relocatedBy.x,z:n.relocatedBy.z,r:2.0})),
    ...(map.portals||[]).map(p=>({x:p.x,z:p.z,r:(p.radius||2)+1.2})),
    ...(map.buildings||[]).map(b=>({x:b.x,z:b.z,r:Math.max(b.w||4,b.d||4)*0.55+1.4})),
  ];
  let seq=0;
  for(const s of scenes){
    for(const [rawVariant,dx,dz,scale=1] of s.props||[]){
      const isLandmark=isLandmarkVariant(rawVariant);
      const variant=isLandmark?unwrapLandmarkVariant(rawVariant):rawVariant;
      const metric=getScenePropMetric(map.id,rawVariant);
      const minTargetDist=metric.solid===false?0.85:isLandmark?2.4:1.75;
      let pos=keepClearOfTargets(s.x+dx,s.z+dz,protectedTargets,minTargetDist);
      if(metric.solid!==false){
        pos=nudgeOffRoad(map,pos.x,pos.z,isLandmark?1.15:0.85);
      }
      const safe=findSafe(pos.x,pos.z,map.id);
      pos=keepClearOfTargets(safe.x,safe.z,protectedTargets,minTargetDist);
      if(metric.solid!==false){
        pos=nudgeOffRoad(map,pos.x,pos.z,isLandmark?1.05:0.75);
      }
      const prop={
        id:`${map.id}_${s.id}_${isLandmark?'L':''}${variant}_${seq++}`,
        sceneId:s.id,
        kind:isLandmark?'landmark_deco':'theme_deco',
        variant,
        x:Number(pos.x.toFixed(2)),
        z:Number(pos.z.toFixed(2)),
        scale,
        solid:metric.solid,
      };
      if(metric.solid!==false&&distanceToRoad(map,prop.x,prop.z)>=0.75){
        const rx=isLandmark?Math.min(0.42,Math.max(0.22,(metric.w||96)/340)):0.22;
        const rz=Math.min(0.24,(metric.depth||0.34)*0.44);
        prop.colliders=[{dx:0,dz:0,rx,rz}];
      }
      if(metric.solid!==false){
        protectedTargets.push({x:prop.x,z:prop.z,r:isLandmark?2.5:1.7});
      }
      if(isLandmark)map.landmarkProps.push(prop);
      else map.themeProps.push(prop);
      map.props.push(prop);
    }
  }
  const present=new Set(map.themeProps.map(p=>p.variant));
  const fallbackScene=scenes[scenes.length-1]||{id:'fallback',x:0,z:0,rx:3,rz:2};
  for(let v=6;v<=24;v++){
    if(!present.has(v)){
      const metric=getScenePropMetric(map.id,v);
      const raw=keepClearOfTargets(fallbackScene.x+fallbackScene.rx+1.6,fallbackScene.z,protectedTargets,1.8);
      const safe=findSafe(raw.x,raw.z,map.id);
      const prop={
        id:`${map.id}_supplement_${v}_${seq++}`,
        sceneId:fallbackScene.id,
        kind:'theme_deco',
        variant:v,
        x:Number(safe.x.toFixed(2)),
        z:Number(safe.z.toFixed(2)),
        scale:0.9,
        solid:metric.solid,
      };
      protectedTargets.push({x:prop.x,z:prop.z,r:1.7});
      map.themeProps.push(prop);
      map.props.push(prop);
    }
  }
}

export const FIELD_ART={
  berry:{src:art('berry-bush-v1'),h:108},herb:{src:art('medicinal-herbs-v1'),h:58},
  board:{src:art('noticeboard-v1'),h:142},camp:{src:art('field-camp-v1'),h:216},
  survey:{src:art('survey-stone-v1'),h:118},satchel:{src:art('field-satchel-v1'),h:56},
};
export const FIELD_MATERIALS={turf:art('meadow-turf-v4'),moss:art('forest-floor-v4'),earth:art('premium-earth-v1'),sand:art('coast-sand-v2'),stone:art('paving-v1')};

const layouts={
  dawnleaf:[['board',-4.2,10.2,'晨曦鎮委託欄'],['camp',-22.5,14.5,'南庭休憩站'],['berry',14.0,12.5,'花園樹果'],['herb',-22.0,-14.0,'庭院藥草'],['survey',-16.0,-28.0,'北苑氣候觀測碑'],['satchel',-24.0,24.5,'郵差遺落的包裹'],['survey',4.5,29.0,'南庭水質觀測點']],
  meadow:[['board',-17.0,4.2,'草原旅行者佈告欄'],['camp',10.5,18.5,'南風營地'],['berry',23.0,24.0,'花野樹果'],['herb',15.0,-25.0,'北風藥草'],['survey',21.0,-31.0,'北風生態觀測點'],['satchel',44.5,11.5,'旅行者的失物'],['survey',34.0,22.0,'花野生態觀測點']],
  mosswood:[['board',-29.0,3.5,'巡林員委託欄'],['camp',-15.5,25.0,'蕈光調查營地'],['berry',-22.0,19.5,'林間樹果'],['herb',-20.0,-14.0,'蕨葉藥草'],['survey',24.0,-32.5,'古樹刻痕'],['satchel',-8.5,10.5,'研究員的手帳'],['survey',12.5,7.5,'清溪生態觀測點'],['survey',24.0,29.5,'觀林臺刻痕']],
  coast:[['board',-5.5,-14.0,'海岸救援委託欄'],['camp',-21.5,-15.5,'鹽風補給營地'],['berry',-17.0,-27.5,'耐鹽樹果'],['herb',-32.5,-11.0,'海風藥草'],['survey',10.0,11.0,'燈塔潮汐記錄'],['satchel',-20.0,4.5,'漂來的航海手記'],['survey',-12.0,-33.0,'鹽風生態觀測點']],
  canyon:[['board',18.5,4.2,'峽谷遠征佈告欄'],['camp',-28.5,0.5,'赤岩避風營地'],['berry',-34.0,6.0,'灰燼樹果'],['herb',28.0,7.0,'耐熱藥草'],['survey',-35.0,-12.5,'赤岩地脈刻痕'],['satchel',34.5,-2.5,'勁敵遺落的筆記'],['survey',31.5,1.5,'熔岩溫度觀測點']],
  twilight:[['board',5.2,18.0,'神殿調查佈告欄'],['camp',-9.5,16.0,'星庭休息站'],['herb',-8.5,2.0,'月光藥草'],['berry',9.5,11.5,'星庭樹果'],['survey',-5.0,-19.5,'星輝封印刻痕'],['satchel',6.0,-29.0,'古代調查手記'],['survey',5.0,4.5,'月影迴廊刻痕']],
};

export function installWorldAdventure(maps,findSafe){
  for(const map of Object.values(maps)){
    map.fieldObjects=(layouts[map.id]||[]).map(([kind,x,z,nameZh],i)=>{
      const offRoad=nudgeOffRoad(map,x,z,kind==='camp'?1.35:0.85);
      const safe=findSafe(offRoad.x,offRoad.z,map.id);
      return{id:`${map.id}_${kind}_${i}`,kind,...safe,nameZh,zone:map.id,once:['berry','herb','satchel'].includes(kind)};
    });
    if(THEME_ATLAS[map.id]||LANDMARK_ATLAS[map.id])populateThemeProps(map,findSafe);
    map.surfacePatches=[];
    const woodland=['dawnleaf','meadow','mosswood'].includes(map.id);
    for(const [i,p]of map.props.entries()){
      if((p.kind.includes('oak')||p.kind==='tree_pine')&&i%2===0){
        map.surfacePatches.push({x:p.x,z:p.z-0.9,rx:2.5*(p.scale||1),rz:1.8*(p.scale||1),material:woodland?'moss':'earth',shape:'ellipse',layer:'under',opacity:woodland?0.48:0.24});
      }
    }
    for(const s of WORLD_SCENES[map.id]||[]){
      if(s.id==='town-central-plaza')continue;
      for(const [x1,z1,x2,z2,width=1.8,mat] of s.paths||[]){
        map.surfacePatches.push({
          shape:'path',
          x1,z1,x2,z2,
          width,
          material:mat||s.material||'earth',
          layer:'over',
          opacity:0.75,
        });
      }
      map.surfacePatches.push({
        x:s.x,z:s.z,rx:s.rx,rz:s.rz,
        material:s.material||'earth',
        shape:s.shape||'court',
        layer:'over',
        opacity:s.shape==='plaza'?0.78:s.shape==='camp'?0.76:0.65,
      });
    }
    map.environmentNotes={dawnleaf:'庭園、佈告欄與南庭休憩站',meadow:'風動花野、樹果和旅行者營地',mosswood:'落葉林下、濕潤溪岸與調查刻痕',coast:'沙丘、潮汐記錄與救援補給',canyon:'灰燼岩地、地脈刻痕與避風營地',twilight:'苔石星庭、封印刻痕與月光藥草'}[map.id];
  }
}
