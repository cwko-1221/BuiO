export type Point = readonly [x: number, z: number];
export type Surface = 'grass' | 'soil' | 'sand' | 'stone' | 'wood' | 'rock';
export const WIDTH = 240;
export const DEPTH = 192;
export const CHUNK = 16;
export const CELL = 1;
export const GATE = .13;
export const DISTRICTS = [
  { id:'square', zh:'月灣廣場', en:'Crescent Square', at:[121,107], tint:'#f3c973' },
  { id:'market', zh:'橘帆市集', en:'Tangerine Market', at:[67,52], tint:'#ff9976' },
  { id:'garden', zh:'風鈴花圃', en:'Windbell Gardens', at:[43,91], tint:'#aade79' },
  { id:'observatory', zh:'翡翠觀星台', en:'Jade Observatory', at:[181,45], tint:'#67d5bd' },
  { id:'marina', zh:'潮光碼頭', en:'Tideglass Marina', at:[225,92], tint:'#6accec' },
  { id:'village', zh:'松影村', en:'Pineshade Village', at:[142,148], tint:'#e5ae88' },
] as const;

// Metres at the waterline, clockwise. Two tidal coves meet the wooded centre
// from opposite sides. The western cove turns behind the flower-garden spit.
const coastline:Point[]=[
  [12,66],[15,55],[26,46],[31,38],[41,31],[55,27],[70,23],[85,22],[99,25],[112,28],[126,26],
  [141,21],[154,19],[166,14],[177,13],[188,16],[197,17],[208,23],[219,31],[225,41],[226,50],
  [223,58],[217,62],[213,66],[217,72],[222,75],[219,80],[208,81],[197,83],[186,87],[176,93],
  [170,101],[163,103],[157,107],[151,110],[145,115],[144,121],[149,127],[155,128],
  [164,120],[173,115],[184,110],[193,114],[199,121],[205,128],[210,137],[217,143],[220,152],
  [217,159],[210,163],[207,169],[197,174],[186,176],[175,178],[162,177],[150,180],[139,183],
  [126,183],[116,180],[108,181],[96,178],[88,174],[77,170],[70,164],[68,157],[73,150],
  [81,145],[85,141],[91,140],[96,136],[96,132],[92,128],[85,125],[79,124],
  [73,119],[69,108],[64,104],[58,105],[54,112],[54,119],[48,124],[41,130],[42,136],[51.5,142],
  [46.5,148],[38,150],[31,149],[25,144],[20,137],[18,130],[13,123],[10,115],[9,105],[10,96],
  [13,87],[15,79],
];
function softenCoast(corners:readonly Point[]):Point[] {
  // Sample between the surveyed corners so the shoreline keeps its coves and headlands.
  return corners.flatMap((a,i)=>{
    const before=corners[(i+corners.length-1)%corners.length],b=corners[(i+1)%corners.length],after=corners[(i+2)%corners.length];
    return [a,[0,1].map(axis=>.5*(a[axis]+b[axis])+.073*(a[axis]+b[axis]-before[axis]-after[axis])) as [number,number]];
  });
}
export const COASTS: readonly Point[][]=[softenCoast(coastline)];
export const SEA_DEPTH = -4.4;
export const SPAWN: Point = [121,117.1];
type Node = { at: Point; y: number; links: string[] };
type Trail = { a: Node; b: Node; width: number; surface: Surface; deck: boolean };
export const nodes: Record<string, Node> = {};
export const trails: Trail[] = [];
function node(id: string, x: number, z: number, y: number) { nodes[id] = { at:[x,z], y, links:[] }; }
const waypoints: [string,number,number,number][] = [
  ['square',121,107,4.5],['south-plaza',121,116,4.1],['plaza-west',102,110,3.9],['west-road',85,96,3.5],['west-approach',64,93,2.6],
  ['woodland-edge',133,119.9,3.8],['woodland-turn',138,127,3.65],['woodland-path',132.3,135,3.15],
  ['west-north',77,109,2.45],['west-crown',64,114,3.28],['west-south',51.4,118,2.55],['garden',43,91,2.6],['garden-arch',31,96,2.45],['garden-loop',33,102,2.50],['gazebo',45,100,2.6],['garden-east',48,108,2.7],
  ['west-landing',44,120.3,2.55],['garden-bay',42,124,2.35],['garden-sand',36,137,1.65],['garden-upper',44,74,3.4],
  ['west-hill',85,78,3.65],['market-road',77,63,4.5],['market',67,52,5],['market-west',50,53,5],['market-north',71,39,5],['market-back',91,46,4.9],['ridge',109,49,4.6],['ridge-east',132,49,4.6],['waterfall-low',144,63,4.6],
  ['north-plaza',121,69,4.5],['northwest-plaza',106,75,4.5],['west-fountain',102,89,4.5],['southwest-plaza',106,103,4.5],['plaza-east',143,104,4.2],['east-road',153,101,3.5],['marina-turn',166,85,3.05],['east-shore',177,87,2.05],['quay-start',182,91,1.83],['quay-canal',193,86,1.75],['quay-bend',206,83,1.75],['quay-corner',221,85,1.75],['marina',225,92,1.75],['quay-south',227.4,104.8,1.75],['quay-tip',214,110,1.75],
  ['summit-approach',149,77,4.1],['summit-base',157,75,4.1],['stair-a',153,64,5.4],['stair-b',158,57,7.9],['stair-c',171,56,9.5],['stair-d',174,48,11.4],['observatory',181,45,13],['observatory-east',191,43,13],['observatory-north',194,35,13],['observatory-west',174,33,13],
  ['east-north',164,102,2.55],['east-crown',172,109,3.3],['east-south',182,117,2.52],['village-east',187,133,2.75],['village-promenade',194,147,2.6],['village-coast',185,159.2,2.45],['village-south',158,156.8,2.65],['village',142,148,2.8],['village-west',120,158,2.7],['village-cove',91,155,2.35],['village-cottages',136,154.7,2.6],['village-inner',163,145,2.83],
];
for (const [id,x,z,y] of waypoints) node(id,x,z,y);
function path(width: number, surface: Surface, ids: string[], deck = false) {
  for (let i = 1; i < ids.length; i++) {
    const a = nodes[ids[i-1]], b = nodes[ids[i]];
    a.links.push(ids[i]); b.links.push(ids[i-1]);
    trails.push({ a,b,width,surface,deck });
  }
}
function curvedPath(width:number,surface:Surface,ids:string[]) {
  const points:string[]=[];
  for(const [i,id] of ids.entries()) {
    points.push(id);
    if(i===ids.length-1)break;
    const a=nodes[id],b=nodes[ids[i+1]];
    const incoming=nodes[ids[Math.max(0,i-1)]].at,outgoing=nodes[ids[Math.min(ids.length-1,i+2)]].at;
    const segments=Math.ceil(Math.hypot(a.at[0]-b.at[0],a.at[1]-b.at[1])/5.3);
    for(let j=1;j<segments;j++){
      const t=j/segments,t2=t*t,t3=t2*t;
      const coordinate=(axis:0|1)=>{
        const p=incoming[axis],q=a.at[axis],r=b.at[axis],s=outgoing[axis];
        return .5*(2*q+(r-p)*t+(2*p-5*q+4*r-s)*t2+(-p+3*q-3*r+s)*t3);
      };
      const name=id+'-curve-'+j;
      node(name,coordinate(0),coordinate(1),a.y+(b.y-a.y)*t);
      points.push(name);
    }
  }
  path(width,surface,points);
}
path(4,'soil',['garden','garden-east','garden-bay','west-landing','west-south']);
path(3.3,'soil',['garden-east','west-landing']);
path(2.5,'sand',['garden-bay','garden-sand']);
path(3.2,'soil',['market-west','garden-upper','garden']);
path(3.5,'stone',['west-south','west-crown','west-north'],true);
path(4,'soil',['west-north','west-approach','west-road','plaza-west','south-plaza','plaza-east','east-road','east-north']);
path(2.7,'soil',['south-plaza','woodland-edge','woodland-turn','woodland-path']);
path(3.6,'soil',['west-road','west-north']);
path(3.5,'stone',['east-north','east-crown','east-south'],true);
curvedPath(4,'soil',['east-south','village-east','village-promenade','village-coast','village-south','village-cottages','village-west','village-cove']);
path(2.8,'soil',['village-east','village-inner','village','village-cottages']);
path(2.5,'soil',['garden','garden-arch','garden-loop','gazebo','garden-east']);
path(4,'soil',['west-road','west-hill','market-road','market','market-west']);
path(3,'stone',['market','market-north','market-back','ridge']);
path(3.6,'soil',['market-road','market-back','ridge','ridge-east','waterfall-low','summit-approach','summit-base']);
path(4,'soil',['ridge-east','north-plaza','northwest-plaza','west-fountain','southwest-plaza','square','south-plaza']);
path(4,'soil',['east-road','marina-turn','east-shore']);
path(5.7,'wood',['east-shore','quay-start','quay-canal','quay-bend','quay-corner','marina','quay-south','quay-tip'],true);
path(3.5,'soil',['marina-turn','summit-base']);
path(3.1,'stone',['summit-base','stair-a','stair-b','stair-c','stair-d','observatory','observatory-east','observatory-north','observatory-west']);
const climb=['summit-base','stair-a','stair-b','stair-c','stair-d','observatory'];
export const STAIR_LANDING_RADIUS=2.2;
export const staircase=climb.slice(1).map((id,i)=>{
  const a=nodes[climb[i]], b=nodes[id], rise=b.y-a.y;
  const length=Math.hypot(b.at[0]-a.at[0],b.at[1]-a.at[1]), pad=STAIR_LANDING_RADIUS+.08;
  return {a,b,rise,length, pad, modules:Math.ceil(rise/(5*.15)),width:3.1};
});

const pads: { around: Point; radius: number; y: number; material: Surface; aspect?:number }[] = [
  { around:[121,88],radius:31.5,y:4.5,material:'stone' },
  { around:[65,45],radius:28.5,y:5,material:'stone',aspect:1.22 },
  { around:[43,90],radius:7,y:2.6,material:'soil' },
  { around:[183,36],radius:21.25,y:13,material:'stone',aspect:1.09 },
  { around:[151,148],radius:10,y:2.8,material:'soil' },
  { around:[211,74],radius:9.2,y:1.58,material:'stone' },
];
const bridgeFeet=['west-south','west-north','east-south','east-north'].map(id=>nodes[id]);
const pierWoodTrails=trails.filter(t=>t.deck&&t.surface==='wood');
const beaches:readonly [x:number,z:number,width:number,depth:number][]=[
  [45,132,13,20],[31,142,9,9],[115,178,26,10],[145,181,13,8],
  [195,170,13,8],[214,153,12,12],[220,53,13,13],[25,48,12,8],
];
const headlands:readonly [x:number,z:number,width:number,depth:number][]=[
  [89,169,22,13],[166,177,24,11],[33,146,17,10],[16,104,11,21],[218,45,12,19],
];
const clamp = (n:number,l:number,h:number) => Math.max(l,Math.min(h,n));
export function smooth(lo:number,hi:number,n:number) { const t=clamp((n-lo)/(hi-lo),0,1); return t*t*(3-2*t); }
export function segment(x:number,z:number,a:Point,b:Point) {
  const dx=b[0]-a[0], dz=b[1]-a[1];
  const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz || 1),0,1);
  return { t, distance:Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz) };
}
function polygonDistance(x:number,z:number,polygon: readonly Point[]) {
  let inside=false, distance=Infinity;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[j], b=polygon[i];
    if ((a[1]>z)!==(b[1]>z) && x < (b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    const dx=b[0]-a[0],dz=b[1]-a[1],px=x-a[0],pz=z-a[1];
    const t=clamp((px*dx+pz*dz)/(dx*dx+dz*dz),0,1);
    const ox=px-dx*t,oz=pz-dz*t;
    distance=Math.min(distance,ox*ox+oz*oz);
  }
  return Math.sqrt(distance)*(inside?1:-1);
}
export function shore(x:number,z:number) {
  return polygonDistance(x,z,COASTS[0]) + .61*Math.sin(x*.25+z*.18)+.26*Math.sin(z*.59-x*.34)+.12*Math.sin(x*1.33+z*.97);
}
export function nearestTrail(x:number,z:number, deck?:boolean) {
  let best: { trail:Trail; t:number; distance:number }|undefined;
  for (const trail of trails) {
    if (deck!==undefined && deck!==trail.deck) continue;
    const hit=segment(x,z,trail.a.at,trail.b.at);
    if (!best || hit.distance<best.distance) best={trail,...hit};
  }
  return best!;
}
export function trailHeight(trail: Trail,t:number) {
  const step=staircase.find(item=>item.a===trail.a && item.b===trail.b);
  const rise=step?clamp((t*step.length-step.pad)/(step.length-step.pad*2),0,1):t;
  return trail.a.y+(trail.b.y-trail.a.y)*rise;
}
export function terrain(x:number,z:number, material=false) {
  const edge=shore(x,z);
  let beach=0,headland=0;
  for(const [cx,cz,w,d] of beaches)beach=Math.max(beach,1-smooth(.56,1.05,Math.hypot((x-cx)/w,(z-cz)/d)));
  for(const [cx,cz,w,d] of headlands)headland=Math.max(headland,1-smooth(.42,1.08,Math.hypot((x-cx)/w,(z-cz)/d)));
  const swell=.47*Math.sin(x*.114)*Math.cos(z*.094)+.26*Math.sin(x*.21-z*.12);
  const forest=.92*(1-smooth(4,25,Math.hypot((x-126)*1.07,(z-136)*1.42)));
  const hill=1.12+2.21*smooth(2,19,edge)+swell+forest;
  const warp=1.05*Math.sin(z*.18)+.49*Math.sin(x*.36+z*.3);
  const lower=1-smooth(28.4,31.7,Math.hypot(x-174,(z-42)*1.22)+warp);
  const middle=1-smooth(21.1,24.1,Math.hypot(x-178,(z-39)*1.24)+warp);
  const upper=1-smooth(15.4,18.8,Math.hypot(x-184,(z-36)*1.13)+warp);
  const ridge=2.26*lower+3.02*middle+4.02*upper;
  const sandBank=hill*smooth(-.45,7.9,edge);
  const rim=(1-smooth(4.4,10.4,edge))*smooth(.32,2.5,edge);
  const rockyBank=hill*smooth(.25,3.7+swell,edge)+1.8*headland*rim;
  let y=edge<0 ? Math.max(SEA_DEPTH,edge*(.30-.08*beach)) : beach*sandBank+(1-beach)*rockyBank+ridge*smooth(0,4,edge);
  let stone=0, soil=0;
  if(edge>0) {
    for (const pad of pads) {
      const d=Math.hypot((x-pad.around[0])/(pad.aspect??1),z-pad.around[1]), w=1-smooth(pad.radius-1,pad.radius+3,d);
      if (w===0) continue;
      y+=(pad.y-y)*w;
      if (pad.material==='stone') {
        const cap=pad.y>=13 ? 1-smooth(pad.radius-1.5,pad.radius+.28,d) : w;
        stone=Math.max(stone,cap);
      }
    }
    const hit=nearestTrail(x,z,false);
    const radius=hit.trail.width/2;
    const bed=(1-smooth(radius+.2,radius+3.5,hit.distance))*smooth(0,2.2,edge);
    y+=(trailHeight(hit.trail,hit.t)-y)*bed;
    if (material) {
      const line=1-smooth(radius-.27,radius+.62,hit.distance+.13*Math.sin(x*2+z));
      if (hit.trail.surface==='stone') stone=Math.max(stone,line); else if(hit.trail.surface!=='sand') soil=line;
    }
    // The five stair flights have a rendered tread above the continuous
    // walk surface. Sink the adjacent earth so it cannot bury the masonry.
    const cut=staircase.reduce((depth,stair)=>{
      const s=segment(x,z,stair.a.at,stair.b.at);
      return Math.max(depth,1-smooth(stair.width*.50,stair.width*.72,s.distance));
    },0);
    y-=cut*.26;
    y+=.40*(1-smooth(23.5,26.6,Math.hypot(x-121,z-88)));
    // The upper plaza stair ends at Z=110.86. Bring the stone apron up
    // against the back of the final tread, then feather into the square.
    const plazaLanding=(1-smooth(6.12,7.45,Math.abs(x-121)))*
      smooth(108.4,110.0,z)*(1-smooth(111.0,111.74,z));
    y+=Math.max(0,4.898-y)*plazaLanding;
    const pavilionCourt=1-smooth(6.18,8.9,Math.hypot(x-52,z-82));
    y+=(3.52-y)*pavilionCourt;
  }
  for(const foot of bridgeFeet) {
    const distance=Math.hypot(x-foot.at[0],z-foot.at[1]);
    const support=1-smooth(2.24,4.9,distance);
    y+=(foot.y-y)*support;
  }
  const shoreHead=nodes['east-shore'], shoreNext=nodes['quay-start'];
  const sdx=shoreNext.at[0]-shoreHead.at[0], sdz=shoreNext.at[1]-shoreHead.at[1], sd=Math.hypot(sdx,sdz);
  const lon=((x-shoreHead.at[0])*sdx+(z-shoreHead.at[1])*sdz)/sd;
  const lat=Math.abs((x-shoreHead.at[0])*-sdz+(z-shoreHead.at[1])*sdx)/sd;
  // Feather the east-shore earth apron flush across the full plank entry width,
  // then keep sand below the sloped pier deck so it cannot poke through slats.
  const apron=smooth(-2.8,-.15,lon)*(1-smooth(.04,.55,lon))*(1-smooth(2.9,5.1,lat));
  y+=(shoreHead.y-.008-y)*apron;
  for(const pw of pierWoodTrails) {
    const s=segment(x,z,pw.a.at,pw.b.at);
    const past=pw.a===shoreHead ? smooth(.03,.42,lon) : 1;
    const under=(1-smooth(pw.width*.52,pw.width*.72,s.distance))*past;
    if(under>0){ const deckFloor=trailHeight(pw,s.t)-.18; y+=Math.min(0,deckFloor-y)*under; }
  }
  const sand=(1-smooth(.8+2.3*beach,2.5+5.1*beach,edge))*(1-smooth(.6,2.55,y))*(.34+.66*beach);
  const bankRock=(1-beach)*(1-smooth(2.1,5.35+2.8*headland,edge))*(.68+.22*Math.sin(x*.61-z*.42));
  const face=smooth(.02,.5,Math.max(lower*(1-middle),middle*(1-upper)))*(1-smooth(.82,.975,upper));
  const summitRim=Math.hypot((x-183)/1.09,z-36);
  const greyEscarpment=smooth(19.6,22.6,summitRim)*(1-smooth(25.2,34.9,summitRim))*lower;
  const rock=Math.max(bankRock,face*.89,greyEscarpment)*(1-Math.max(stone,soil));
  return { y, edge, stone, soil, sand, rock, beach };
}
export function ground(x:number,z:number) {
  const h=terrain(x,z).y, hit=nearestTrail(x,z,true);
  if (hit.distance<=hit.trail.width/2+.03) return Math.max(h,trailHeight(hit.trail,hit.t));
  return h;
}
// The collision ramp carries paws through each landing. The render foot is
// registered to the corresponding visible tread during the animation.
function stairHit(x:number,y:number,z:number) {
  if(Math.abs(x-121)<=6.1&&z>=110.75&&z<=115.05){
    const raw=(114.94-z)/4.081, t=clamp(raw,0,1);
    const top=4.14+.762*(t===0?0:Math.min(5,1+Math.floor(t*5)))/5;
    if(Math.abs(top-y)<=.25)return {height:top,onFlight:raw>0&&raw<1};
  }
  let nearest=1.55, hit:{height:number;onFlight:boolean}|undefined;
  for(const stair of staircase) {
    const p=segment(x,z,stair.a.at,stair.b.at);
    if(p.distance>=nearest || p.t<=0 || p.t>=1)continue;
    const count=stair.modules*5;
    const raw=(p.t*stair.length-stair.pad)/(stair.length-stair.pad*2);
    const t=clamp(raw,0,1);
    const top=stair.a.y+stair.rise*(t===0?0:Math.min(count,1+Math.floor(t*count)))/count;
    if(Math.abs(top-y)>.25)continue;
    nearest=p.distance;hit={height:top,onFlight:raw>0&&raw<1};
  }
  return hit;
}
export function visibleFoot(x:number,y:number,z:number) {
  return stairHit(x,y,z)?.height??y;
}
export function onStairTread(x:number,y:number,z:number) {
  return stairHit(x,y,z)?.onFlight??false;
}
export function stairLevels(stair:(typeof staircase)[number]) {
  const {length,pad}=stair;
  return [0,pad/length,1-pad/length,1] as const;
}
export const BRIDGE_CHECKPOINTS={
  west:[60,68,111,118],
  east:[168,176,105,113],
} as const;
export function route(start:Point,end:string): Point[] {
  const ids=Object.keys(nodes);
  const initial=ids.reduce((a,b)=>dist(nodes[a].at,start)<dist(nodes[b].at,start)?a:b);
  const cost = new Map([[initial,0]]), from = new Map<string,string>(), open = new Set([initial]);
  while(open.size) {
    const at=[...open].reduce((a,b)=>cost.get(a)!<cost.get(b)!?a:b);
    if(at===end) break;
    open.delete(at);
    for(const id of nodes[at].links) {
      const next=cost.get(at)!+dist(nodes[at].at,nodes[id].at);
      if(next>=(cost.get(id)??Infinity)) continue;
      cost.set(id,next); from.set(id,at); open.add(id);
    }
  }
  if(!cost.has(end)) return [];
  const steps:Point[]=[];
  for(let id: string|undefined=end;id;id=from.get(id)) steps.unshift(nodes[id].at);
  return steps;
}
export function dist(a:Point,b:Point) { return Math.hypot(a[0]-b[0],a[1]-b[1]); }
export function district(at:Point) { return DISTRICTS.reduce((a,b)=>dist(a.at,at)<dist(b.at,at)?a:b); }
