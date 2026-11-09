import {FIELD_ART,FIELD_MATERIALS} from '../data/worldAdventure.mjs';
import {FIELD_THEME_INDEX,THEME_ATLAS,getThemedFieldArt} from '../data/themeAtlas.mjs';
import {LANDMARK_ATLAS} from '../data/landmarkAtlas.mjs';
import {L,fitSceneProp,getScenePropMetric} from '../data/worldSceneDesign.mjs';
import {getWorldMaterialPattern} from './worldMaterial.mjs';

const patchCache=new Map();

function getSoftTile(material,opacity,entry){
  const key=`soft:${material}:${opacity}`;
  let tile=patchCache.get(key);
  if(!tile){
    tile=document.createElement('canvas');
    tile.width=tile.height=512;
    const t=tile.getContext('2d');
    t.fillStyle=getWorldMaterialPattern(t,entry.img,420);
    t.fillRect(0,0,512,512);
    t.globalCompositeOperation='destination-in';
    const fade=t.createRadialGradient(256,256,80,256,256,256);
    fade.addColorStop(0,'#fff');
    fade.addColorStop(0.55,'#ffffffc8');
    fade.addColorStop(1,'#ffffff00');
    t.fillStyle=fade;
    t.fillRect(0,0,512,512);
    patchCache.set(key,tile);
  }
  return tile;
}

function getCourtTile(material,shape,entry){
  const key=`court:${material}:${shape}`;
  let tile=patchCache.get(key);
  if(!tile){
    tile=document.createElement('canvas');
    tile.width=tile.height=512;
    const t=tile.getContext('2d');
    t.fillStyle=getWorldMaterialPattern(t,entry.img,380);
    t.fillRect(0,0,512,512);
    t.globalCompositeOperation='destination-in';
    const fade=t.createRadialGradient(256,256,115,256,256,252);
    fade.addColorStop(0,'#fff');
    fade.addColorStop(0.62,'#ffffffd8');
    fade.addColorStop(0.86,'#ffffff55');
    fade.addColorStop(1,'#ffffff00');
    t.fillStyle=fade;
    t.fillRect(0,0,512,512);
    patchCache.set(key,tile);
  }
  return tile;
}

export function paintFieldSurfaces(c,{map,chunkX,chunkY,getImage,layer='all'}){
  c.save();
  c.beginPath();
  c.rect(chunkX,chunkY,512,512);
  for(const region of map.terrainRegions||[]){
    for(const outline of [region.outline,...(region.holes||[])]){
      outline.forEach((p,i)=>i?c.lineTo(p.x*58,p.z*48):c.moveTo(p.x*58,p.z*48));
      c.closePath();
    }
  }
  c.clip('evenodd');

  for(const p of map.surfacePatches||[]){
    const pLayer=p.layer||'under';
    if(layer!=='all'&&pLayer!==layer)continue;
    const entry=getImage(FIELD_MATERIALS[p.material]||FIELD_MATERIALS.earth);
    if(!entry?.ready)continue;

    if(p.shape==='path'){
      const x1=p.x1*58,y1=p.z1*48,x2=p.x2*58,y2=p.z2*48;
      const w=(p.width||1.8)*58;
      const minX=Math.min(x1,x2)-w,maxX=Math.max(x1,x2)+w;
      const minY=Math.min(y1,y2)-w,maxY=Math.max(y1,y2)+w;
      if(maxX<chunkX||minX>chunkX+512||maxY<chunkY||minY>chunkY+512)continue;
      c.save();
      c.lineCap='round';
      c.lineJoin='round';
      c.beginPath();
      c.moveTo(x1,y1);
      c.lineTo(x2,y2);
      c.strokeStyle='rgba(54,44,30,0.12)';
      c.lineWidth=w+8;
      c.stroke();
      c.strokeStyle=getWorldMaterialPattern(c,entry.img,360);
      c.globalAlpha=p.opacity||0.78;
      c.lineWidth=w;
      c.stroke();
      c.restore();
      continue;
    }

    const x=p.x*58,y=p.z*48,rx=p.rx*58,ry=p.rz*48;
    if(x+rx+16<chunkX||x-rx-16>chunkX+512||y+ry+16<chunkY||y-ry-16>chunkY+512)continue;

    if(p.shape==='plaza'||p.shape==='court'||p.shape==='camp'||p.shape==='garden'){
      const tile=getCourtTile(p.material,p.shape,entry);
      c.save();
      c.globalAlpha=p.opacity||0.72;
      c.drawImage(tile,x-rx,y-ry,rx*2,ry*2);
      c.restore();
      continue;
    }

    const tile=getSoftTile(p.material,p.opacity,entry);
    c.save();
    c.globalAlpha=p.opacity||0.42;
    c.drawImage(tile,x-rx,y-ry,rx*2,ry*2);
    c.restore();
  }
  c.restore();
}

export function getFieldDrawables(map,{getImage,save,playerPos,bounds}){
  const collected=new Set(save?.adventure?.collected||[]),out=[];
  for(const p of [...(map.fieldObjects||[]),...(map.themeProps||[]),...(map.landmarkProps||[])]){
    if(p.once&&collected.has(p.id))continue;
    const isLandmark=p.kind==='landmark_deco';
    const isTheme=p.kind==='theme_deco';
    const metricVariant=isLandmark?L(p.variant):isTheme?p.variant:FIELD_THEME_INDEX[p.kind];
    const spec=isLandmark
      ? LANDMARK_ATLAS[map.id]?.[p.variant]
      : isTheme
      ? THEME_ATLAS[map.id]?.[p.variant]
      : getThemedFieldArt(map.id,p.kind)||FIELD_ART[p.kind];
    if(!spec)continue;
    const metric=getScenePropMetric(map.id,metricVariant);
    const scale=p.scale||1;
    const fitted=fitSceneProp(map.id,metricVariant,spec);
    const w=fitted.w*scale,h=fitted.h*scale,x=p.x*58,y=p.z*48;
    if(x+w<bounds.left||x-w>bounds.right||y+28<bounds.top||y-h>bounds.bottom)continue;
    const entry=getImage(spec.src);
    if(!entry?.ready)continue;
    const drawW=spec.w?w:h*entry.img.naturalWidth/entry.img.naturalHeight;
    const sortY=metric.solid===false?y-22:p.kind==='camp'||isLandmark?y-6:y;
    out.push({
      sortY,
      draw:c=>{
        c.save();
        if(metric.solid!==false){
          c.fillStyle=isLandmark?'rgba(18,30,22,0.20)':'rgba(20,35,25,0.15)';
          c.beginPath();
          const shadowRx=isLandmark?Math.max(18,drawW*0.32):Math.max(12,drawW*0.25);
          const shadowRy=isLandmark?Math.max(6,Math.min(15,h*0.075)):Math.max(4,Math.min(10,h*0.055));
          c.ellipse(x,y-2,shadowRx,shadowRy,0,0,Math.PI*2);
          c.fill();
        }
        c.drawImage(entry.img,x-drawW/2,y-h,drawW,h);
        if(p.nameZh&&Math.hypot(playerPos.x-p.x,playerPos.z-p.z)<3.4){
          c.font='600 11px "Microsoft JhengHei",sans-serif';
          c.textAlign='center';
          const name=p.nameZh;
          c.lineWidth=4;
          c.strokeStyle='#17362ddd';
          c.strokeText(name,x,y-h-7);
          c.fillStyle='#fff0c5';
          c.fillText(name,x,y-h-7);
        }
        c.restore();
      },
    });
  }
  return out;
}
