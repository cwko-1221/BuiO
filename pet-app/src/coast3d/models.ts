import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ASSETS, type AssetId } from './assets';

const materials=new Map<number,T.MeshStandardMaterial>();
export function paint(color:number) {
  let material=materials.get(color);
  if(!material) { material=new T.MeshStandardMaterial({color,roughness:.86}); materials.set(color,material); }
  return material;
}
const cream=0xffdfac, wood=0x83523c, dark=0x335b53, glass=0x4d898d, stone=0xe7c3a0;
const shaped=(value:number,f:number)=>new T.Color(value).multiplyScalar(f).getHex();
function mesh(g:T.Group,geom:T.BufferGeometry,color:number,x=0,y=0,z=0) {
  const m=new T.Mesh(geom,paint(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
}
export function box(g:T.Group,w:number,d:number,h:number,color:number,x=0,y=h/2,z=0,r=.04) {
  return mesh(g,new RoundedBoxGeometry(w,h,d,1,Math.min(r,w/4,d/4,h/4)),color,x,y,z);
}
export function ball(g:T.Group,w:number,d:number,h:number,color:number,x:number,y:number,z:number,detail=1) {
  const m=mesh(g,new T.IcosahedronGeometry(1,detail),color,x,y,z);m.scale.set(w/2,h/2,d/2);return m;
}
export function column(g:T.Group,a:number,b:number,h:number,color:number,x=0,y=h/2,z=0,n=12) {
  return mesh(g,new T.CylinderGeometry(a,b,h,n),color,x,y,z);
}
export function tube(g:T.Group,points:T.Vector3[],radius:number,color:number,count=18) {
  return mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(points),count,radius,6,false),color);
}
function torus(g:T.Group,r:number,t:number,color:number,x:number,y:number,z:number,horizontal=false) {
  const m=mesh(g,new T.TorusGeometry(r,t,8,40),color,x,y,z);if(horizontal)m.rotation.x=Math.PI/2;return m;
}
function extrude(g:T.Group,outline:T.Shape,d:number,color:number,x:number,y:number,z:number) {
  return mesh(g,new T.ExtrudeGeometry(outline,{depth:d,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:2,steps:1,curveSegments:18}),color,x,y,z-d/2);
}
function arch(w:number,h:number) {
  const s=new T.Shape();s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(w/2,h-w/2);
  s.absarc(0,h-w/2,w/2,0,Math.PI);s.closePath();return s;
}
function flower(g:T.Group,x:number,y:number,z:number,r:number,color:number) {
  if(y>r) column(g,r*.16,r*.16,y,0x6b973c,x,y*.49,z,5);
  for(let i=0;i<5;i++) {
    const a=i*Math.PI*2/5;
    ball(g,r,r,r*.56,color,x+Math.sin(a)*r*.56,y,z+Math.cos(a)*r*.56,0);
  }
  ball(g,r*.81,r*.8,r*.64,0xf8cc70,x,y+r*.11,z,0);
}
function leafy(g:T.Group,w:number,d:number,h:number,color:number) {
  column(g,.12,.31,h*.62,wood,0,h*.31,0,9);
  const canopy=new T.Group();canopy.name='canopy';g.add(canopy);
  for(let i=0;i<11;i++) {
    const a=i*2.4, f=i===0?0:(.14+i%3*.043);
    const x=Math.cos(a)*w*f,z=Math.sin(a)*d*f,y=h*(.67+(i%4)*.065);
    if(i%3===0)tube(g,[new T.Vector3(0,h*.31,0),new T.Vector3(x*.65,y*.82,z*.65),new T.Vector3(x,y,z)],.085,wood,8);
    ball(canopy,w*(.44+i%3*.04),d*.52,h*.31,shaped(color,.83+(i%5)*.095),x,y,z,2);
  }
  for(let i=0;i<24;i++) {
    const a=i*2.4, f=.29+.07*Math.sin(i*1.5),y=h*(.65+.25*((i*13)%23)/23);
    ball(canopy,w*.112,d*.11,h*.092,shaped(color,.74+(i%6)*.12),Math.cos(a)*w*f,y,Math.sin(a)*d*f,1);
  }
}
function gable(g:T.Group,w:number,d:number,h:number,color:number) {
  const s=new T.Shape();s.moveTo(-w/2,h*.59);s.quadraticCurveTo(-w*.28,h*.71,0,h);
  s.quadraticCurveTo(w*.27,h*.72,w/2,h*.59);s.lineTo(w/2,h*.54);s.lineTo(-w/2,h*.54);s.closePath();
  extrude(g,s,d,color,0,0,0);
  for(const side of [-1,1]) {
    for(let row=0;row<5;row++) {
      const t=(row+.56)/5, x=side*t*w*.48, y=h*(1-.41*t**.76);
      for(let j=0;j<Math.ceil(d/.64);j++) {
        const z=((j+.5)/Math.ceil(d/.64)-.5)*d;
        const tile=box(g,w*.108,.64,.11,shaped(color,.9+((j*5+row*3)%7)*.03),x,y+.035,z,.038);
        tile.rotation.z=-side*Math.atan2(.41*h*.76*t**(-.24),w*.5);
      }
    }
  }
  tube(g,[new T.Vector3(0,h+.045,-d*.51),new T.Vector3(0,h+.045,0),new T.Vector3(0,h+.045,d*.51)],.079,shaped(color,1.11));
}
function cottage(g:T.Group,w:number,d:number,h:number,color:number,id:AssetId) {
  const f=d*.42, side=w*.40;
  const wall=id.startsWith('market')?shaped(color,1.22):id==='boathouse'?0xb4d4d7:0xf4d5a7;
  box(g,w*.86,d*.86,h*.61,wall,0,h*.32,0,.37);
  box(g,w*.9,d*.91,.25,stone,0,.125,0,.12);
  gable(g,w,d,h,color);
  for(const x of [-side,side]) for(const z of [-f,f]) box(g,.20,.20,h*.58,wood,x,h*.34,z,.04);
  const dh=Math.min(1.7,h*.41);
  extrude(g,arch(1.22,dh+.15),.15,cream,0,.14,f+.098);
  extrude(g,arch(1.02,dh),.18,id==='cottage-teal'?0x438e80:0xa86b42,0,.15,f+.18);
  for(let i=-1;i<=1;i++) box(g,.028,.026,dh*.73,shaped(wood,1.13),i*.22,dh*.45,f+.29,.005);
  ball(g,.105,.1,.105,0xf1bd62,.32,.83,f+.30);
  box(g,1.48,.55,.13,cream,0,.09,f+.35,.06);
  column(g,.34,.34,.10,cream,0,h*.73,f+.16).rotation.x=Math.PI/2;
  column(g,.26,.26,.12,glass,0,h*.73,f+.22).rotation.x=Math.PI/2;
  for(const side of [-1,1]) {
    const x=side*w*.26;
    for(const z of [-f-.16,f+.16]) {
      extrude(g,arch(.85,1.05),.16,cream,x,h*.27,z);
      extrude(g,arch(.66,.86),.18,glass,x,h*.28,z+Math.sign(z)*.06);
      box(g,.065,.035,.78,cream,x,h*.28+.38,z+Math.sign(z)*.18,.007);
      box(g,.63,.035,.055,cream,x,h*.28+.34,z+Math.sign(z)*.18,.007);
      box(g,1.01,.38,.125,color,x,h*.26,z,.035);
    }
    box(g,.11,1.18,1.12,cream,side*(w*.435),h*.29,-.34,.03);
    box(g,.12,.91,.90,glass,side*(w*.44),h*.29,-.34,.035);
    box(g,.04,.058,.95,cream,side*w*.45,h*.29,-.34,.008);
  }
  box(g,w*.65,.16,.23,wood,0,h*.52,-f-.13,.035);
  box(g,.82,.8,h*.37,stone,w*.22,h*.75,-d*.27,.09);
  box(g,1.02,.98,.20,cream,w*.22,h*.93,-d*.27,.055);
  if(id==='boathouse') {
    for(let i=0;i<9;i++) box(g,.32,1.31,.085,i%2===0?0x5fa8d9:cream,w*.18+(i-4)*.30,h*.40,f+.73).rotation.x=-.18;
  }
}
function dome(g:T.Group,r:number,h:number,y:number,color:number) {
  const shell=mesh(g,new T.SphereGeometry(r,40,17,0,Math.PI*2,0,Math.PI/2),color,0,y,0);shell.scale.y=h/r;
  torus(g,r,.073,0xddab58,0,y,0,true);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    tube(g,Array.from({length:8},(_,j)=>{const t=j*Math.PI/14;return new T.Vector3(r*Math.cos(t)*Math.cos(a),y+h*Math.sin(t),r*Math.cos(t)*Math.sin(a));}),.043,0xf2bf65);
  }
  ball(g,.28,.28,.38,0xf5c868,0,y+h+.1,0);
}
function bridge(g:T.Group,w:number,d:number,h:number,color:number) {
  const profile=new T.Shape();profile.moveTo(-d/2,h*.54);
  profile.quadraticCurveTo(0,h*1.44,d/2,h*.54);profile.lineTo(d/2,0);profile.lineTo(d*.35,0);
  profile.bezierCurveTo(d*.22,h*1.09,-d*.22,h*1.09,-d*.35,0);profile.lineTo(-d/2,0);profile.closePath();
  const m=extrude(g,profile,w,color,0,0,0);m.rotation.y=-Math.PI/2;
  for(let i=0;i<Math.ceil(d/.63);i++){
    const z=(i/Math.ceil(d/.63)-.5)*d,y=h-.46*h*(z/(d/2))**2;
    const t=box(g,w,.57,.085,shaped(color,.89+(i%4)*.055),0,y,z);t.rotation.x=Math.atan(.92*h*z/(d/2)**2);
  }
}

export function makeModel(id:AssetId) {
  const spec=ASSETS[id], [w,d,h]=spec.size, c=spec.color, g=new T.Group();
  g.name=id;
  switch(spec.shape) {
    case 'cottage': cottage(g,w,d,h,c,id); break;
    case 'leaf': leafy(g,w,d,h,c); break;
    case 'pine': {
      column(g,.11,.24,h*.84,wood);
      const foliage=new T.Group();foliage.name='canopy';g.add(foliage);
      for(let i=0;i<4;i++) {
        const r=w*(.5-i*.084),y=h*(.33+i*.14);column(foliage,0,r,h*.4,shaped(c,.75+i*.135),0,y,0,13);
        for(let j=0;j<9;j++) {
          const a=j*Math.PI*2/9+i*.45;ball(foliage,r*.95,r*.96,h*.146,shaped(c,.74+j%4*.08),r*.60*Math.cos(a),y-h*.10,r*.60*Math.sin(a));
        }
      }
      break;
    }
    case 'palm': {
      tube(g,[new T.Vector3(0,0,0),new T.Vector3(-.12,h*.43,.17),new T.Vector3(.34,h*.88,.18)],.18,wood);
      const foliage=new T.Group();foliage.name='canopy';g.add(foliage);
      for(let i=0;i<9;i++) {
        const a=i*2.4, dx=Math.sin(a)*w*.45,dz=Math.cos(a)*d*.45;
        for(let j=1;j<=5;j++){const t=j/5;ball(foliage,w*.17,d*.16,h*.10,shaped(c,.72+j*.095),.34+dx*t,h*(.88+.13*Math.sin(t*Math.PI)-t*.24),.18+dz*t);}
      }
      break;
    }
    case 'flowers':
      for(let i=0;i<7;i++) {
        const a=i*2.4,x=Math.sin(a)*w*.38,z=Math.cos(a)*d*.34;
        ball(g,w*.36,d*.32,h*.32,shaped(0x78a649,1+i%3*.1),x,h*.16,z,1);
        flower(g,x,h*(.54+i%4*.13),z,.115,shaped(c,.83+i%4*.11));
      }break;
    case 'shrub':
      for(let i=0;i<7;i++){const a=i*2.4;ball(g,w*.60,d*.59,h*.77,shaped(c,.76+(i%5)*.11),w*.24*Math.sin(a),h*(.36+i%3*.1),d*.24*Math.cos(a),2);}break;
    case 'rock':
      for(let i=0;i<4;i++){const a=i*2.4,m=ball(g,w*(i?.55:.83),d*.81,h*(1-i*.15),shaped(c,.9+i*.09),w*.25*Math.sin(a),h*(.40-i*.035),d*.18*Math.cos(a));m.rotation.set(.24+i*.28,i*.66,.36-i*.15);}break;
    case 'moon': {
      const r=w*.47,s=new T.Shape();
      s.moveTo(.39*r,-r*.94);s.bezierCurveTo(-1.32*r,-r*1.13,-1.24*r,r*.83,.50*r,r);
      s.bezierCurveTo(-.37*r,.62*r,-.58*r,-.36*r,.39*r,-r*.94);s.closePath();
      extrude(g,s,d*.52,c,0,h*.56,0);
      column(g,w*.26,w*.33,h*.16,cream);
      for(const side of [-1,1])tube(g,[new T.Vector3(.23*r,h*.12,side*d*.29),new T.Vector3(-.78*r,h*.37,side*d*.29),new T.Vector3(-.71*r,h*.70,side*d*.29),new T.Vector3(.24*r,h*.94,side*d*.29)],.036,0xffeba8);
      break;
    }
    case 'basin':
      column(g,w*.487,w*.487,h*.29,c,0,h*.145,0,64);
      torus(g,w*.475,.125,cream,0,h*.48,0,true);
      column(g,w*.103,w*.127,h*.61,stone,0,h*.575,0,48);
      column(g,w*.133,w*.129,h*.18,cream,0,h*.91,0,48);
      break;
    case 'steps':
      for(let i=0;i<5;i++) box(g,w,d/5+.012,h*(i+1)/5,shaped(c,.89+i*.049),0,h*(i+1)/10,d*(.4-i*.2),.035);
      break;
    case 'rail':
      for(const side of [-1,1]) {
        box(g,.17,d,h*.96,cream,side*w*.45,h*.48,0,.035);
        ball(g,.23,.23,.22,cream,side*w*.45,h*.94,0);
      }
      for(let i=1;i<6;i++) column(g,.045,.062,h*.67,c,w*(i/6-.5),h*.49,0,8);
      for(const y of [.19,.76])box(g,w,d*.82,h*.15,c,0,h*y,0,.039);
      break;
    case 'bench':
      for(const side of [-1,1]) {
        box(g,.09,d*.65,h*.10,dark,side*w*.36,h*.12,0);
        box(g,.085,.09,h*.84,dark,side*w*.36,h*.45,-d*.29);
        tube(g,[new T.Vector3(side*w*.42,h*.51,d*.40),new T.Vector3(side*w*.42,h*.65,d*.19),new T.Vector3(side*w*.42,h*.67,-d*.29)],.043,dark,10);
      }
      for(let i=0;i<4;i++) box(g,w,d*.17,.052,c,0,h*.47,d*(i/4-.36));
      for(let i=0;i<3;i++) box(g,w,.06,h*.13,c,0,h*(.63+i*.13),-d*.27);
      break;
    case 'lamp':
      column(g,w*.43,w*.50,h*.14,dark);
      column(g,.052,.085,h*.74,dark,0,h*.45,0,10);
      column(g,.14,.105,h*.07,0xcda264,0,h*.81,0,12);
      ball(g,w*.91,d*.91,h*.19,c,0,h*.91,0,2).material=new T.MeshStandardMaterial({color:c,emissive:0xd99531,emissiveIntensity:.2});
      break;
    case 'bed':
    case 'pot':
      if(spec.shape==='bed') {
        box(g,w,d,h*.37,c,0,h*.185,0,.11);
        box(g,w*.95,d*.87,.075,0x674b36,0,h*.37,0,.05);
        for(let j=0;j<12;j++){
          const x=(j%6/5-.5)*w*.78,z=(j<6?-.18:.17)*d;
          ball(g,.31,.35,h*.59,shaped(0x82a54a,.82+j%5*.084),x,h*(.50+j%3*.03),z,1);
        }
      }
      else {column(g,w*.5,w*.32,h*.48,c);torus(g,w*.44,.047,shaped(c,1.15),0,h*.48,0,true);}
      for(let i=0;i<12;i++) flower(g,w*(i%6/5-.5)*.84,h*(.64+i%4*.11),d*(i<6?.23:-.22),
        .08+i%3*.019,[0xffdc76,0xf5acc2,0x989de3,0xffeed1][i%4]);
      break;
    case 'arch': {
      const path=Array.from({length:11},(_,i)=>{const a=i*Math.PI/10;return new T.Vector3(Math.cos(a)*w*.43,h*.60+Math.sin(a)*h*.34,0);});
      tube(g,[new T.Vector3(w*.43,0,0),...path,new T.Vector3(-w*.43,0,0)],.115,wood);
      for(let i=0;i<path.length;i++) {const p=path[i];ball(g,.35,.39,.42,0x80aa4d,p.x,p.y,p.z);flower(g,p.x,.16,0,.003,c);
        ball(g,.24,.12,.22,c,p.x,p.y,.125,1);ball(g,.11,.11,.10,0x8f6335,p.x,p.y,.18);}
      break;}
    case 'gazebo':
    case 'observatory': {
      const full=spec.shape==='observatory',r=Math.min(w,d)*.43;
      const platform=full?g:new T.Group(), pillars=full?g:new T.Group();
      if(!full){platform.name='gazebo-platform';pillars.name='gazebo-columns';g.add(platform,pillars);}
      const step=h*.022;
      if(full)column(platform,r*1.08,r*1.08,h*.1,cream,0,h*.05,0,30);
      else for(let i=0;i<4;i++)column(platform,w*.5-i*.14-.04,w*.5-i*.14,step,cream,0,(i+.5)*step,0,48);
      if(full)column(g,r*.91,r*.91,h*.49,0xeaceaa,0,h*.29,0,36);
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4,x=Math.sin(a)*r*.89,z=Math.cos(a)*r*.89;
        column(pillars,r*.049,r*.073,h*.45,cream,x,h*.31,z);
        column(pillars,r*.09,r*.09,.15,stone,x,h*.12,z);
        if(full){const window=extrude(g,arch(r*.37,h*.21),.13,glass,Math.sin(a+.31)*r*.92,h*.22,Math.cos(a+.31)*r*.92);window.rotation.y=a+.31;}
      }
      column(g,r,r,h*.068,cream,0,h*.56,0,38);
      dome(g,r*.96,h*.35,h*.60,c);
      if(full){extrude(g,arch(1.55,2.22),.14,cream,0,.44,r*.9);extrude(g,arch(1.21,1.91),.16,wood,0,.46,r*.935);}
      break;}
    case 'orrery':
      column(g,w*.33,w*.38,h*.15,stone);
      column(g,.13,.24,h*.70,c,0,h*.41,0);
      for(let i=0;i<3;i++){
        const a=i*2.3,r=w*(.27+i*.10),y=h*(.64+.055*i);
        torus(g,r,.035,c,0,y,0,true).rotation.z=.19*(i-1);
        ball(g,.50,.50,.50,i===1?0x91c7d5:c,Math.cos(a)*r,y+.18,Math.sin(a)*r,2);
      }ball(g,.77,.77,.77,0xffda76,0,h*.87,0,2);break;
    case 'bridge': bridge(g,w,d,h,c);break;
    case 'post':
      if(id==='dock-post'){column(g,w*.47,w*.47,h*.91,c);column(g,w*.50,w*.50,.12,cream,0,h*.94);}
      else {box(g,w,d,h*.75,c);box(g,w*1.12,d*1.12,.09,cream,0,h*.76);ball(g,w*.85,d*.85,h*.28,cream,0,h*.89,0,2);}break;
    case 'jetty':
      for(let i=0;i<9;i++)box(g,w,d/9-.024,h,shaped(c,.88+(i%5)*.065),0,h/2,(i/8-.5)*(d-d/9),.024);break;
    case 'rope':
      tube(g,[new T.Vector3(-w/2,h,0),new T.Vector3(0,h*.36,.05),new T.Vector3(w/2,h,0)],.037,c);break;
    case 'boat': {
      ball(g,w,d,h*.22,0xc09259,0,h*.14,0,2);
      ball(g,w*.93,d*.96,h*.14,0xe6c08e,0,h*.22,0,2);
      column(g,.045,.065,h*.87,wood,0,h*.54,0);
      const s=new T.Shape();s.moveTo(0,h*.28);s.quadraticCurveTo(w*.28,h*.36,w*.52,h*.35);s.lineTo(0,h*.95);s.closePath();
      extrude(g,s,.085,c,0,0,0);
      for(const x of [-1,1])tube(g,[new T.Vector3(0,h*.91,0),new T.Vector3(x*w*.43,h*.24,d*.27)],.016,cream,4);
      break;}
    case 'parasol':
      column(g,.042,.065,h*.9,wood);column(g,w*.15,w*.16,.14,stone);
      for(let i=0;i<10;i++){const geo=new T.SphereGeometry(w*.5,5,5,i*Math.PI/5,Math.PI/5,0,Math.PI/3.6);
        mesh(g,geo,i%2?c:cream,0,h*.74,0).scale.y=.37;}
      ball(g,.12,.12,.23,wood,0,h*.98,0,1);break;
    case 'stall':
    case 'cart':
    case 'awning': {
      const canopy=spec.shape==='awning', cart=spec.shape==='cart';
      for(const x of [-1,1])for(const z of [-1,1])column(g,.05,.06,h*.93,wood,w*.46*x,h*.465,d*.43*z,8);
      for(let i=0;i<9;i++){
        const m=box(g,w/9+.023,d,h*.064,i%2===0?c:cream,((i+.5)/9-.5)*w,h*.91,0,.025);m.rotation.x=-.13;
      }
      if(!canopy){box(g,w*.91,d*.83,h*.31,wood,0,h*.36);box(g,w,d,h*.078,c,0,h*.56);
        for(let i=0;i<9;i++)ball(g,.22,.24,.23,[0xe6a943,0xe78862,0x9bb44e][i%3],w*((i%5)/5-.4),h*.64,d*(i<5?.13:-.19));
      }
      if(cart)for(const side of [-1,1])for(const z of [-d*.29,d*.30]){
        torus(g,h*.15,.047,wood,side*w*.45,h*.17,z).rotation.y=Math.PI/2;
        ball(g,.14,.15,.15,cream,side*w*.45,h*.17,z);
      }
      break;}
    case 'sign':
      for(const x of [-w*.26,w*.26])box(g,.059,.16,h*.74,wood,x,h*.37,0);
      box(g,w,d*.31,h*.54,c,0,h*.69);
      box(g,w*.85,d*.14,h*.40,cream,0,h*.69,d*.18);
      for(let i=0;i<3;i++)box(g,w*(.56-i*.06),.02,.028,wood,0,h*(.78-i*.08),d*.255);
      break;
    case 'cascade':
      for(let i=0;i<3;i++){
        const y=h*(i+1)*.19,z=d*(1-i)*.29;
        box(g,w*(.89-i*.13),d*.43,h*.45,0x8e9388,0,y*.60,z,.27);
        box(g,w*.62,d*.34,.08,c,0,y+.62,z,.04);
        for(let j=0;j<5;j++)tube(g,[new T.Vector3((j-2)*w*.103,y+.64,z+d*.13),new T.Vector3((j-2)*w*.103,y+.53,z+d*.21),new T.Vector3((j-2)*w*.107,y-h*.04,z+d*.29)],.052,0xb9eff0,10);
      }break;
  }
  const bounds=new T.Box3().setFromObject(g);
  const actual=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  const inner=new T.Group();inner.add(g);
  g.position.set(-center.x,-bounds.min.y,-center.z);
  inner.scale.set(w/actual.x,h/actual.y,d/actual.z);
  const result=new T.Group();result.name=id;result.add(inner);return result;
}
