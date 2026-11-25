import * as T from 'three';
import { WIDTH, DEPTH, CHUNK, terrain, trails, type Surface } from './island';

const colors: Record<Surface,[number,number,number]> = {
  grass:[110,156,62], soil:[200,148,99], sand:[233,197,142], stone:[197,165,145], wood:[161,111,64], rock:[145,141,143],
};
const palette = Object.keys(colors) as Surface[];
const TILE=128;
export type ArtMaterials=Partial<Record<Surface|'water',T.Texture>>;
const hash=(x:number,y:number)=> { const a=Math.sin(x*127.1+y*311.7)*43758.5453;return a-Math.floor(a); };
export function surfacePixels(surface:Surface) {
  const values=new Uint8Array(TILE*TILE*4), rgb=colors[surface];
  for(let y=0;y<TILE;y++) for(let x=0;x<TILE;x++) {
    const u=x/TILE, v=y/TILE;
    const fine=hash(x,y)-.5, mottled=Math.sin(u*2*Math.PI)*Math.sin(v*4*Math.PI+.5)
      +.35*Math.cos((u*3+v*2)*2*Math.PI);
    let delta = mottled*6+fine*12;
    if(surface==='stone') {
      const row=y>>5, sx=(x+(row%2)*32)%64, sy=y%32;
      const rounded = Math.hypot(Math.max(0,3-Math.min(sx,63-sx)),Math.max(0,3-Math.min(sy,31-sy)));
      delta += Math.min(sx,63-sx,sy,31-sy)<1 || rounded>3.25 ? -29 : (sy===1 || sx===1 ? 19 : 10*hash(Math.floor((x+(row%2)*32)/64)%2,row)-5);
    }
    if(surface==='wood') delta += (y%32<2?-38:0)+7*Math.sin((v*19+.08*Math.sin(u*Math.PI*2))*Math.PI*2);
    if(surface==='grass') delta += 8*Math.sin((u*19+v*30)*Math.PI*2)*Math.sin((u*7-v*13)*Math.PI*2);
    if(surface==='rock') delta += 6*Math.cos((u*3+v*7+.19*Math.sin(u*6.28))*6.28);
    const i=(y*TILE+x)*4;
    for(let c=0;c<3;c++) values[i+c]=Math.round(Math.min(255,Math.max(0,rgb[c]+delta)));
    values[i+3]=255;
  }
  return { data:values,width:TILE,height:TILE };
}
function surfaceTexture(key:Surface) {
  const {data,width,height}=surfacePixels(key);
  const t=new T.DataTexture(data,width,height);
  t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;
  t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;
  return t;
}
export function groundMaterials(art:ArtMaterials={}) {
  const textures=Object.fromEntries(palette.map(k=>[k,art[k]??surfaceTexture(k)])) as Record<Surface,T.Texture>;
  const terrainMaterial=new T.MeshStandardMaterial({ roughness:.93, map:textures.grass });
  terrainMaterial.onBeforeCompile = shader => {
    for (const k of ['grass','soil','sand','stone','rock'] as const) shader.uniforms[k+'Detail']={value:textures[k]};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 blend; attribute float altitude; varying vec4 vBlend; varying vec2 metres; varying float tideHeight;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvBlend=blend; metres=position.xz; tideHeight=altitude;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec4 vBlend; varying vec2 metres; varying float tideHeight; uniform sampler2D grassDetail, soilDetail, sandDetail, stoneDetail, rockDetail;')
      .replace('#include <map_fragment>',`
        vec3 groundColor=texture2D(grassDetail,metres*${art.grass?'.25':'.73'}).rgb;
        float meadows=.5+.5*sin(metres.x*.176+sin(metres.y*.18+metres.x*.21))*cos(metres.y*.192);
        float grassVariation=.5+.5*cos(metres.y*.66-metres.x*.51+sin(metres.x*.108));
        groundColor=mix(groundColor*vec3(.86,1.09,.69),groundColor*vec3(1.13,1.23,.91),meadows);
        groundColor*=.97+.075*grassVariation;
        vec3 earth=texture2D(soilDetail,metres*${art.soil?'.38':'.52'}).rgb;
        float grains=dot(earth,vec3(.299,.587,.114));
        earth=mix(earth,vec3(.70,.47,.26)*(.78+.48*grains),.78);
        vec3 paving=texture2D(stoneDetail,metres*${art.stone?'.29':'.83'}).rgb;
        float villageRoad=smoothstep(132.0,139.5,metres.y)*smoothstep(71.0,85.0,metres.x);
        float gravel=dot(texture2D(stoneDetail,metres*.92).rgb,vec3(.30,.57,.13));
        vec3 warmTrack=mix(earth*vec3(1.10,.96,.91),vec3(.82,.57,.36),.20)*(.89+.31*gravel);
        groundColor=mix(groundColor,mix(earth,warmTrack,villageRoad),vBlend.x);
        vec2 plaza=metres-vec2(121.0,88.0);float plazaRadius=length(plaza);
        float angle=atan(plaza.y,plaza.x);
        float swept=floor(plazaRadius/.72);
        float joint=abs(fract(angle*(4.+swept)*.95+mod(swept,2.)*.5)-.5);
        float radiusJoint=abs(fract(plazaRadius/.72)-.5);
        vec3 radial=mix(vec3(.66,.45,.32),vec3(.85,.65,.48),.5+.26*sin(angle*(5.+swept*1.13)+swept*6.1));
        radial*=1.-.14*max(smoothstep(.456,.50,joint),smoothstep(.453,.50,radiusJoint));
        float ring=(1.-smoothstep(.12,.24,abs(plazaRadius-17.5)))+.85*(1.-smoothstep(.16,.32,abs(plazaRadius-21.4)));
        float inlay=max(1.-smoothstep(.22,.46,abs(plazaRadius-18.3)),1.-smoothstep(.24,.47,abs(plazaRadius-22.4)));
        radial=mix(radial,radial*vec3(.83,.67,.47),min(.65,ring*.60));
        radial=mix(radial,radial*vec3(1.19,1.15,1.09),inlay*.70);
        paving=mix(paving,radial,1.-smoothstep(22.8,24.3,plazaRadius));
        vec2 market=metres-vec2(66.0,50.6);
        float marketRadius=length(market);
        float marketTiles=1.-smoothstep(19.,29.,length(market*vec2(.77,1.23)));
        vec2 brick=vec2(market.x+.39*mod(floor(market.y/.52),2.),market.y);
        vec2 seam=abs(fract(brick/vec2(.78,.52))-.5);
        float mortar=smoothstep(.455,.50,max(seam.x,seam.y));
        vec3 coral=vec3(.70,.44,.31)*(.93+.15*sin(brick.x*8.+brick.y*5.));
        coral=mix(coral,vec3(.83,.62,.43),mortar*.60);
        float medallion=max(1.-smoothstep(.08,.21,abs(marketRadius-3.18)),1.-smoothstep(.12,.24,abs(marketRadius-2.71)));
        coral=mix(coral,vec3(.91,.72,.49),medallion);
        paving=mix(paving,coral,.86*marketTiles);
        groundColor=mix(groundColor,paving,vBlend.y);
        vec3 sand=texture2D(sandDetail,metres*.47).rgb;
        sand*=mix(vec3(.73,.68,.62),vec3(1.08,1.04,.98),smoothstep(.04,.66,tideHeight));
        groundColor=mix(groundColor,sand,vBlend.z);
        vec3 strataA=texture2D(rockDetail,vec2(metres.x+metres.y*.31,tideHeight*.41)*.62).rgb;
        vec3 strataB=texture2D(rockDetail,vec2(metres.y-metres.x*.43,tideHeight*.76)*.92).rgb;
        float exposure=.5+.5*sin(metres.x*.23+metres.y*.32);
        float bedline=sin(tideHeight*2.82+sin(metres.x*.33+metres.y*.44)*.71);
        vec3 grit=mix(strataA,strataB,.43)*mix(vec3(.89,.90,1.00),vec3(1.16,1.11,1.03),exposure);
        grit*=.94+.11*bedline;
        groundColor=mix(groundColor,grit,vBlend.w);
        float lightPatch=sin(metres.x*.32+sin(metres.y*.13))*sin(metres.y*.23);
        diffuseColor.rgb*=groundColor*(1.04+lightPatch*.085);
        float grainHeight=mix(dot(groundColor,vec3(.31,.52,.17))*.071,dot(grit,vec3(.29,.55,.16))*.24,vBlend.w);
      `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        vec3 axisX=normalize(dFdx(-vViewPosition));
        vec3 axisY=normalize(dFdy(-vViewPosition));
        vec3 crossX=cross(axisY,normal),crossY=cross(normal,axisX);
        float landDeterminant=dot(axisX,crossX);
        vec3 soilGradient=sign(landDeterminant)*(dFdx(grainHeight)*crossX+dFdy(grainHeight)*crossY);
        normal=normalize(max(abs(landDeterminant),.012)*normal-soilGradient);
      `);
  };
  return { terrainMaterial,textures };
}

export function createTerrain(material:T.Material, edgesOut?:Float32Array) {
  const pieces:T.Mesh<T.BufferGeometry,T.Material>[]=[];
  const vertices:(ReturnType<typeof terrain>)[]=[];
  for(let z=0;z<=DEPTH;z++) for(let x=0;x<=WIDTH;x++) {
    const v=terrain(x,z,true);
    vertices.push(v);
    if(edgesOut)edgesOut[z*(WIDTH+1)+x]=v.edge;
  }
  // Normals use the same neighbours on both sides of every chunk boundary.
  const get=(x:number,z:number)=>vertices[Math.min(DEPTH,Math.max(0,z))*(WIDTH+1)+Math.min(WIDTH,Math.max(0,x))];
  for(let z0=0;z0<DEPTH;z0+=CHUNK) for(let x0=0;x0<WIDTH;x0+=CHUNK) {
    const xyz:number[]=[], blend:number[]=[], normals:number[]=[], uv:number[]=[], height:number[]=[], indices:number[]=[];
    for(let j=0;j<=CHUNK;j++) for(let i=0;i<=CHUNK;i++) {
      const x=x0+i,z=z0+j, v=get(x,z);
      xyz.push(x,v.y,z); blend.push(v.soil,v.stone,v.sand,v.rock); uv.push(x,z); height.push(v.y);
      const nx=get(x-1,z).y-get(x+1,z).y,nz=get(x,z-1).y-get(x,z+1).y;
      const len=Math.hypot(nx,2,nz);normals.push(nx/len,2/len,nz/len);
      if(i<CHUNK && j<CHUNK) { const a=j*(CHUNK+1)+i,b=a+CHUNK+1;indices.push(a,b,a+1,a+1,b,b+1); }
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));
    g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
    g.setAttribute('blend',new T.Float32BufferAttribute(blend,4));
    g.setAttribute('altitude',new T.Float32BufferAttribute(height,1));
    g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);
    const mesh=new T.Mesh(g,material);
    mesh.name='terrain-'+(x0/CHUNK)+'-'+(z0/CHUNK);mesh.receiveShadow=true;
    pieces.push(mesh);
  }
  return pieces;
}

const escarpments=[
  {ridge:[[104,180],[96,178],[88,174],[77,170],[71,164]], depth:2.9, basin:false},
  {ridge:[[183.5,177.2],[174,178.9],[165,177.8],[157,178.7],[150,180]], depth:3.3, basin:false},
  {ridge:[[207,42],[203.5,47.6],[199,51.7],[193.5,54.5],[187.5,55.6],[181.5,53.6]], depth:3.1, basin:true},
  {ridge:[[209.3,53],[205,57.3],[200.6,60.1],[195.3,62],[189.0,62.8],[183.8,61.6]], depth:2.8, basin:true},
];
export function createScarps(grain:T.Texture) {
  const material=new T.MeshStandardMaterial({color:0xa9a5ac,vertexColors:true,roughness:.94,side:T.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.uniforms.scarpGrain={value:grain};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 scarpUv;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nscarpUv=uv;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 scarpUv; uniform sampler2D scarpGrain;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        float mineral=texture2D(scarpGrain,scarpUv).r;
        diffuseColor.rgb*=.91+.25*mineral;`);
  };
  return escarpments.map(({ridge,depth,basin})=>{
    const points:number[]=[],uv:number[]=[],color:number[]=[],indices:number[]=[];
    const rows=[0,.16,.38,.70,.92,1];
    const horizontal=[0,.08,.17,.39,.80,1];
    const total=ridge.slice(1).reduce((sum,[x,z],i)=>sum+Math.hypot(x-ridge[i][0],z-ridge[i][1]),0);
    let column=0,distance=0;
    for(let i=1;i<ridge.length;i++){
      const [x,z]=ridge[i-1],[u,v]=ridge[i],dx=u-x,dz=v-z,length=Math.hypot(dx,dz);
      const nx=-dz/length,nz=dx/length,count=Math.ceil(length/1.1);
      for(let j=i===1?0:1;j<=count;j++){
        const t=j/count,s=distance+t*length,baseX=x+dx*t,baseZ=z+dz*t;
        const variation=Math.sin(s*.87)+.34*Math.sin(s*2.44);
        const base=terrain(baseX-nx*.18,baseZ-nz*.18).y;
        const width=depth+.26*variation;
        const returnToGrade=1-Math.min(1,Math.min(s,total-s)/3.5);
        const cap=terrain(baseX+nx*width,baseZ+nz*width).y;
        const bottom=basin?Math.min(base-.28,cap-.42):Math.min(.04,base)-.23;
        const height=Math.max(.24,cap+.04-bottom);
        for(let row=0;row<rows.length;row++){
          const bulge=row===0?-.32:row===rows.length-1?0:(.32+Math.sin(s*1.44+row*.93)*.16)*(row%2===0?1:-.5);
          const offset=width*horizontal[row]+bulge+returnToGrade*1.67*(1-horizontal[row]);
          const y=bottom+height*rows[row];
          points.push(baseX+nx*offset,y,baseZ+nz*offset);
          uv.push(s*.35,y*.58);
          const shade=.69+.21*rows[row]+.08*Math.sin(s*1.19)+.033*Math.sin(s*3.1+row);
          color.push(shade*1.03,shade*.99,shade*.98);
          if(column===0||row===rows.length-1)continue;
          const k=column*rows.length+row,p=k-rows.length;
          indices.push(p,k,p+1,p+1,k,k+1);
        }
        column++;
      }
      distance+=length;
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geometry.setAttribute('color',new T.Float32BufferAttribute(color,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    const scarp=new T.Mesh(geometry,material);
    scarp.receiveShadow=true;scarp.castShadow=true;
    return scarp;
  });
}

export function createWater(detail:T.Texture|undefined, reefs:readonly (readonly [x:number,z:number,r:number])[], cachedEdges?:Float32Array) {
  const material=new T.ShaderMaterial({
    uniforms:{ clock:{value:0}, foam:{value:null as T.DataTexture|null}, caustics:{value:detail??null} },
    vertexShader:`varying vec3 world; void main(){ world=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0); }`,
    fragmentShader:`
      uniform float clock;uniform sampler2D foam;uniform sampler2D caustics; varying vec3 world;
      void main(){
        vec2 p=world.xz;
        vec2 uv=(p+vec2(.5))/vec2(${WIDTH+1}.0,${DEPTH+1}.0);
        vec2 coast=texture2D(foam,uv).rg;
        float depth=(coast.r-.5)*20.0;
        float cove=max(1.-smoothstep(8.,30.,length(p-vec2(60.,132.))),.67*(1.-smoothstep(7.,27.,length(p-vec2(163.,120.)))));
        float shallows=smoothstep(-.2,13.,depth)*(1.-.81*cove);
        vec3 c=mix(vec3(.018,.51,.46),vec3(.009,.23,.53),shallows);
        float warp=sin(p.x*.19-p.y*.17+clock*.18)+sin(p.y*.09+p.x*.08+clock*.29);
        float rip=sin(p.x*.87+p.y*1.6+warp*2.1+clock*1.25)
          *sin(p.y*.76-p.x*.92+.77*warp-clock*.68);
        float ripple=pow(max(0.,rip),5.)*(.48+.52*sin(p.y*.84+warp*2.));
        float fine=(sin(p.x*5.43+p.y*.74+warp*.88-clock*.74)*sin(p.y*3.34+p.x*.70+warp*.91+clock*.39));
        float line=abs(depth-.30-.25*sin(clock*1.35+p.x*.85+p.y*.58));
        float surge=sin(p.x*.76+p.y*.67+sin(p.y*1.53-p.x*.42)+clock*.55);
        float front=1.-smoothstep(.09,.40,line);
        float wash=1.-smoothstep(.10,.36,abs(depth-1.18-.33*surge));
        float crest=front*(.34+.66*smoothstep(-.73,.68,surge))+.24*wash*smoothstep(.15,.9,surge);
        crest=max(crest,coast.g*(.37+.29*sin(clock*2.1+warp*2.3)));
        c+=vec3(.029,.138,.176)*ripple+vec3(.041,.057,.052)*pow(max(0.,fine),9.)+vec3(.58,.70,.62)*crest;
        ${detail?'vec3 pattern=texture2D(caustics,p*.104+vec2(clock*.009,clock*.006)+warp*.037).rgb; c+=vec3(.18,.36,.33)*(dot(pattern,vec3(.14,.66,.20))-.40)*(.30+.70*(1.-shallows));':''}
        gl_FragColor=vec4(c,1.); 
        #include <colorspace_fragment>
      }`,
  });
  const w=WIDTH+1,h=DEPTH+1,d=new Uint8Array(w*h*4);
  for(let z=0;z<h;z++) for(let x=0;x<w;x++) {
    const idx=z*w+x, i=idx*4;
    const edge=cachedEdges?cachedEdges[idx]:terrain(x,z).edge;
    d[i]=Math.round(255*Math.max(0,Math.min(1,.5-edge/20)));d[i+3]=255;
  }
  for(const [cx,cz,r] of reefs)for(let z=Math.max(0,Math.floor(cz-r-1));z<Math.min(h,cz+r+1);z++){
    for(let x=Math.max(0,Math.floor(cx-r-1));x<Math.min(w,cx+r+1);x++){
      const i=(z*w+x)*4;
      const distance=Math.abs(Math.hypot(x-cx,z-cz)-r);
      const weight=Math.max(0,1-distance/.82);
      d[i+1]=Math.max(d[i+1],Math.round(187*weight));
    }
  }
  const foam=new T.DataTexture(d,w,h);
  foam.minFilter=foam.magFilter=T.LinearFilter;foam.needsUpdate=true;material.uniforms.foam.value=foam;
  const surface=new T.Mesh(new T.PlaneGeometry(1800,1800).rotateX(-Math.PI/2),material);
  surface.position.set(WIDTH/2,.018,DEPTH/2);
  return surface;
}

export function deckMiter(trail:typeof trails[number], extra=0) {
  const a=trail.a.at,b=trail.b.at,dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz);
  const w=trail.width/2+extra, nx=-dz/d,nz=dx/d;
  function edge(node:typeof trail.a,start:boolean): readonly [number,number] {
    const other=trails.find(t=>t.deck && t!==trail && t.surface===trail.surface && (t.a===node||t.b===node));
    if(!other)return [nx*w,nz*w];
    const p=(other.a===node?other.b:other.a).at, direction=start?-1:1;
    const ox=(p[0]-node.at[0])*direction,oz=(p[1]-node.at[1])*direction;
    const length=Math.hypot(ox,oz), sx=nx-oz/length,sz=nz+ox/length;
    const dot=sx*nx+sz*nz, scale=w/Math.max(.7,dot);
    return [sx*scale,sz*scale];
  }
  return { d, w, tx:dx/d, tz:dz/d, nx, nz, aEdge:edge(trail.a,true), bEdge:edge(trail.b,false) };
}

export function deckGeometry(trail:typeof trails[number], extra=0) {
  const a=trail.a.at,b=trail.b.at;
  const {d,w,aEdge:[ax,az],bEdge:[bx,bz]}=deckMiter(trail,extra);
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute([
    a[0]+ax,trail.a.y,a[1]+az,a[0]-ax,trail.a.y,a[1]-az,b[0]+bx,trail.b.y,b[1]+bz,b[0]-bx,trail.b.y,b[1]-bz],3));
  const tile=trail.surface==='wood'?.38:.5;
  geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,w*tile,0,0,d*tile,w*tile,d*tile],2));
  geometry.setIndex([0,2,1,1,2,3]);geometry.computeVertexNormals();
  return geometry;
}
export function dockEdge(deck:T.BufferGeometry) {
  const top=deck.getAttribute('position'),coords:number[]=[],uv:number[]=[],indices:number[]=[];
  for(const [a,b] of [[0,2],[3,1],[1,0],[2,3]]) {
    const offset=coords.length/3;
    const dx=top.getX(b)-top.getX(a),dz=top.getZ(b)-top.getZ(a),u=Math.hypot(dx,dz)*.38;
    for(const side of [a,b]) {
      coords.push(top.getX(side),top.getY(side),top.getZ(side),top.getX(side),top.getY(side)-.32,top.getZ(side));
    }
    uv.push(0,0,0,.30,u,0,u,.30);
    indices.push(offset,offset+1,offset+2,offset+1,offset+3,offset+2);
  }
  const result=new T.BufferGeometry();
  result.setAttribute('position',new T.Float32BufferAttribute(coords,3));
  result.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  result.setIndex(indices);result.computeVertexNormals();
  return result;
}
