import {getMap} from '../data/world.mjs';
import {SURVEY_ART,surveyAsset,REGIONAL_ATLAS_CROPS} from '../data/navigationArt.mjs';
import {getWorldMaterialPattern} from '../engine/worldMaterial.mjs';
import {PREMIUM_BRIDGE_ART} from '../data/worldPremiumArt.mjs';

const images=new Map(),watchers=new Set(),miniCache=new Map();let revision=0;
function art(name,canvas){
  const src=surveyAsset(name);let item=images.get(src);
  if(!item){const img=new Image();item={img,ready:false};images.set(src,item);
    img.onload=()=>{item.ready=true;revision++;const pending=[...watchers];watchers.clear();for(const target of pending)if(target.isConnected)target._redrawSurvey?.();};img.src=src;
  }
  if(canvas&&!item.ready)watchers.add(canvas);
  return item.ready?item.img:null;
}
const themes={dawnleaf:['quiet-grass-v3','#9aa96d'],meadow:['quiet-grass-v3','#9aa96d'],mosswood:['quiet-grass-v3','#83955f'],coast:['coast-sand-v2','#d3bf92'],canyon:['canyon-ground-v1','#ae7f5e'],twilight:['twilight-ground-v1','#87979c'],harbor:['coast-sand-v2','#d3bf92']};
function survey(canvas,map,{compact=false}={}){
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,b=map.bounds,pad=compact?0:52;
  // The compass is a circular viewport: cover it without the atlas's margins
  // or aspect-ratio letterboxing. Markers use this same cropped projection.
  const fit=compact?Math.max:Math.min;
  const scale=fit((w-pad*2)/(b.maxX-b.minX),(h-pad*2)/(b.maxZ-b.minZ));
  const ox=(w-(b.maxX-b.minX)*scale)/2,oy=(h-(b.maxZ-b.minZ)*scale)/2;
  const project=(x,z)=>[ox+(x-b.minX)*scale,oy+(z-b.minZ)*scale];
  const path=points=>{c.beginPath();points.forEach((p,i)=>{const [x,y]=project(p.x,p.z);i?c.lineTo(x,y):c.moveTo(x,y);});};
  c.clearRect(0,0,w,h);c.fillStyle='#e9dcba';c.fillRect(0,0,w,h);
  const [texture,color]=themes[map.id]||themes.meadow,turf=art(texture,compact?null:canvas);
  const crop=map.atlasCrop||(!map.renderProfile&&REGIONAL_ATLAS_CROPS[map.id]);
  const painting=crop?art(map.atlasArt||`atlas-${map.id}-v2`,compact?null:canvas):null;
  c.save();c.beginPath();c.rect(ox,oy,(b.maxX-b.minX)*scale,(b.maxZ-b.minZ)*scale);c.clip();
  if(painting){
    const [x,y,pw,ph]=crop;
    c.drawImage(painting,x*painting.naturalWidth,y*painting.naturalHeight,pw*painting.naturalWidth,ph*painting.naturalHeight,ox,oy,(b.maxX-b.minX)*scale,(b.maxZ-b.minZ)*scale);
    // A discreet survey trace keeps every live route exact; generated art is
    // decorative and never supplies navigation or collision coordinates.
    c.save();c.setLineDash([3,7]);c.strokeStyle='#fff0c199';c.lineWidth=compact?.7:1.3;c.lineJoin='round';c.lineCap='round';
    for(const road of map.roads||[]){path(road.points);c.stroke();}c.restore();
  }else{
  c.fillStyle=color;c.fillRect(0,0,w,h);
  if(turf){c.globalAlpha=.67;c.fillStyle=getWorldMaterialPattern(c,turf,300);c.fillRect(0,0,w,h);c.globalAlpha=1;}
  for(const region of map.terrainRegions||[]){
    path(region.outline);c.closePath();for(const hole of region.holes||[]){hole.forEach((p,i)=>{const [x,y]=project(p.x,p.z);i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();}
    const volcanic=region.material==='terrain_lava',astral=map.id==='twilight';
    c.fillStyle=volcanic?'#ba653c':astral?'#436f83':'#4c969c';c.fill('evenodd');
    c.save();c.clip('evenodd');const water=art(volcanic?'lava-v1':astral?'astral-water-v1':'coast-water-v2',compact?null:canvas);
    if(water){c.globalAlpha=.65;c.fillStyle=getWorldMaterialPattern(c,water,240);c.fillRect(0,0,w,h);}c.restore();
    c.strokeStyle=volcanic?'#e9a363':'#b6d7bf';c.lineWidth=compact?1:3;c.stroke();
  }
  for(const patch of map.tallGrass||[]){
    const [x,y]=project(patch.x,patch.z);c.fillStyle='#315e3b40';c.beginPath();c.ellipse(x,y,patch.rx*scale,patch.rz*scale,0,0,Math.PI*2);c.fill();
    const fern=art(map.id==='twilight'?'moon-reeds-v1':map.id==='canyon'?'ash-grass-v1':'tall-grass-v1',compact?null:canvas);
    if(fern)for(let i=0;i<5;i++){const a=i*2.4,r=Math.sqrt(i/5);const xx=x+Math.cos(a)*r*patch.rx*scale,yy=y+Math.sin(a)*r*patch.rz*scale;c.drawImage(fern,xx-9,yy-10,18,12);}
  }
  c.lineJoin='round';c.lineCap='round';
  for(const road of map.roads||[]){path(road.points);c.strokeStyle='#5c51375c';c.lineWidth=road.width*scale+3;c.stroke();c.strokeStyle=road.material==='stone'?'#e0dbc3':'#e2c08b';c.lineWidth=Math.max(compact?2:3,road.width*scale);c.stroke();}
  const vignette=(kind,x,z,size)=>{const name=SURVEY_ART[kind];if(!name)return;const image=art(name,compact?null:canvas);if(!image)return;const [px,py]=project(x,z),hh=size*image.naturalHeight/image.naturalWidth;c.drawImage(image,px-size/2,py-hh*.82,size,hh);};
  for(const prop of [...(map.props||[])].sort((a,b)=>a.z-b.z)){const tree=prop.kind.includes('tree')||prop.kind==='premium_oak';vignette(prop.kind,prop.x,prop.z,(tree?3.8:prop.kind.includes('cliff')?7:3)*scale*(prop.scale||1));}
  for(const building of map.buildings||[])vignette(building.kind,building.x,building.z,Math.max(4.5,building.w)*scale*1.45);
  for(const bridge of map.bridges||[]){
    const a=PREMIUM_BRIDGE_ART,[px,py]=project(bridge.x,bridge.z);
    for(const name of ['premium-bridge-base-v1','premium-bridge-back-v1','premium-bridge-front-v1']){
      const image=art(name,compact?null:canvas);if(image)c.drawImage(image,px-a.origin.x*a.scale/58*scale,py-a.origin.y*a.scale/48*scale,a.width*a.scale/58*scale,a.height*a.scale/48*scale);
    }
  }
  }
  c.restore();
  if(!compact){
    c.strokeStyle='#ae925c';c.lineWidth=1;c.strokeRect(17,17,w-34,h-34);c.strokeRect(23,23,w-46,h-46);c.textAlign='center';c.textBaseline='middle';
    const labelScale=Math.min(2.6,Math.max(1,w/(canvas.clientWidth||w))),placed=[];
    const label=(text,x,y,size=15)=>{
      const fontSize=size*labelScale;c.font=`600 ${fontSize}px "Microsoft JhengHei",sans-serif`;
      const width=c.measureText(text).width+10,lh=fontSize+8,anchor={x,y};
      x=Math.max(32+width/2,Math.min(w-32-width/2,x));
      const positions=[0,-lh,lh,-lh*2,lh*2].map(d=>({x,y:Math.max(40,Math.min(h-58,y+d))}));
      const spot=positions.find(p=>placed.every(a=>Math.abs(p.x-a.x)>(width+a.w)/2||Math.abs(p.y-a.y)>(lh+a.h)/2))||positions.at(-1);
      placed.push({...spot,w:width,h:lh});
      if(Math.abs(spot.y-anchor.y)>lh*.7){c.beginPath();c.moveTo(anchor.x,anchor.y);c.lineTo(spot.x,spot.y);c.strokeStyle='#4b6a5588';c.lineWidth=1;c.stroke();}
      c.lineWidth=5*labelScale;c.strokeStyle='#f1e6c9';c.strokeText(text,spot.x,spot.y);c.fillStyle='#304d42';c.fillText(text,spot.x,spot.y);
    };
    for(const district of map.districts||[]){const [x,y]=project(district.x,district.z);label(district.nameZh,x,y+14);}
    for(const portal of map.portals||[]){const [x,y]=project(portal.x,portal.z);label('往 '+getMap(portal.targetZone).nameZh,x,y+17,12);}
    c.textAlign='left';c.font='italic 13px Georgia,serif';c.fillStyle='#7b6845';c.fillText(map.nameEn,38,h-30);c.textAlign='right';c.font='12px "Microsoft JhengHei",sans-serif';c.fillText('北 ↑ · 實際地形與路徑',w-38,h-30);
  }
  return{project,scale};
}
function markers(c,map,save,quest,project,compact=false,cssUnit=1){
  const locate=(wx,wz,inset=12)=>{
    const p=project(wx,wz);if(!compact)return p;
    // Keep markers visible along the circular rim when their real position is
    // outside the cropped overview, instead of losing them behind the bezel.
    const dx=p[0]-160,dy=p[1]-160,distance=Math.hypot(dx,dy),radius=160-inset;
    return distance>radius?[160+dx/distance*radius,160+dy/distance*radius]:p;
  };
  for(const portal of map.portals||[]){const [x,y]=locate(portal.x,portal.z);c.save();c.translate(x,y);c.rotate(Math.PI/4);c.fillStyle='#2f6d78';c.strokeStyle='#fff0c5';c.lineWidth=2;c.fillRect(-4,-4,8,8);c.strokeRect(-4,-4,8,8);c.restore();}
  if(quest?.targetZone===map.id){const [x,y]=locate(quest.targetPos.x,quest.targetPos.z);c.textAlign='center';c.textBaseline='middle';c.font=`${compact?16:23}px Georgia`;c.lineWidth=3;c.strokeStyle='#72542f';c.strokeText('★',x,y);c.fillStyle='#ffdc7e';c.fillText('★',x,y);}
  if(save.position.zone===map.id){
    const size=compact?6*cssUnit:9,[x,y]=locate(save.position.x,save.position.z,compact?9*cssUnit:12);
    c.save();c.translate(x,y);
    if(compact){c.beginPath();c.arc(0,0,8*cssUnit,0,Math.PI*2);c.fillStyle='#163b49e8';c.fill();c.strokeStyle='#fff1c6';c.lineWidth=1.1*cssUnit;c.stroke();}
    c.rotate(({up:0,right:Math.PI/2,down:Math.PI,left:-Math.PI/2})[save.position.facing]||0);
    c.fillStyle=compact?'#58dbf1':'#1d667a';c.strokeStyle='#fff8dc';c.lineWidth=compact?1.2*cssUnit:2.5;
    c.beginPath();c.moveTo(0,-size);c.lineTo(size*.67,size*.78);c.lineTo(0,size*.4);c.lineTo(-size*.67,size*.78);c.closePath();c.fill();c.stroke();c.restore();
  }
}
export function drawRegionalAtlasCanvas(canvas,save,quest,selectedZone){
  if(!canvas||!save)return;const map=getMap(selectedZone||save.position.zone);canvas._redrawSurvey=()=>drawRegionalAtlasCanvas(canvas,save,quest,selectedZone);const {project}=survey(canvas,map);markers(canvas.getContext('2d'),map,save,quest,project);
}
export function drawIllustratedMinimap(canvas,save,quest){
  if(!canvas||!save)return;const map=getMap(save.position.zone);let cached=miniCache.get(map.id);
  if(!cached||cached.revision!==revision||cached.map!==map){const surface=document.createElement('canvas');surface.width=surface.height=320;const geometry=survey(surface,map,{compact:true});cached={surface,...geometry,revision,map};miniCache.set(map.id,cached);}
  const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(cached.surface,0,0,canvas.width,canvas.height);c.save();c.scale(canvas.width/320,canvas.height/320);markers(c,map,save,quest,cached.project,true,320/(canvas.clientWidth||106));c.restore();
}
