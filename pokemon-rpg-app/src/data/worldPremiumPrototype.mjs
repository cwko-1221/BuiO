import {PREMIUM_BRIDGE_ART as ART} from './worldPremiumArt.mjs';
export const PREMIUM_CROSSING_PROFILE='premium-crossing-v1';
export const PREMIUM_CROSSING_SPAWN={zone:'mosswood',x:-3.6,z:7.25,facing:'up'};
const anchor={x:1,z:4.5};
export const premiumSourceToWorld=([x,y])=>({x:anchor.x+(x-ART.origin.x)*ART.scale/58,z:anchor.z+(y-ART.origin.y)*ART.scale/48});
const deck=ART.sourceDeck.map(premiumSourceToWorld);
const midpoint=(a,b)=>({x:(a.x+b.x)/2,z:(a.z+b.z)/2});
const west=midpoint(deck[0],deck[3]),east=midpoint(deck[1],deck[2]);
export const PREMIUM_BRIDGE={id:'premium-brook-bridge',x:anchor.x,z:anchor.z,outline:deck,
 centerline:[west,east],farEdge:[deck[0],deck[1]],nearEdge:[deck[3],deck[2]],sourceScale:ART.scale};
// Continue well beyond the playable bounds and the camera's overscan. Closing
// the river at z=18 exposed a rectangular end cap while walking south.
const left=[[-1.1,-80],[-1.1,-15],[-.7,-11],[-.1,-7],[-.6,-3],[-.25,0],[-.3,2.5],[.15,6.9],[.8,10],[.25,15],[.2,18],[.2,80]];
const right=left.map(([x,z])=>[x+3.1,z]);
const point=([x,z])=>({x,z}),road=(points,width=2.5)=>({material:'dirt',width,points:points.map(p=>Array.isArray(p)?point(p):p)});
const tree=(id,x,z,scale=1)=>({id,kind:'premium_oak',x,z,scale,colliders:[{dx:0,dz:0,rx:.5,rz:.34}]});
const stream={id:'premium-brook',material:'premium_water',blocked:true,outline:[...left,...right.toReversed()].map(point),holes:[deck],banks:{left,right}};
export const PREMIUM_CROSSING_MAP={
 id:'mosswood',nameZh:'苔影森林・木橋林徑',nameEn:'Mosswood — Painted Brook Crossing',subtitleZh:'立體手繪場景試作',levelRange:'場景試作',music:'field',battleBackdrop:'meadow',
 skyColor:'#a2b5a3',fogColor:'#a2b5a3',ambientColor:'#f2e7c8',bounds:{minX:-18,maxX:18,minZ:-14,maxZ:17},arrival:PREMIUM_CROSSING_SPAWN,
 renderProfile:PREMIUM_CROSSING_PROFILE,terrainBase:'premium_grass',authoredFloor:true,
 bridges:[PREMIUM_BRIDGE],terrainRegions:[stream],groundPaintings:[],
 roads:[road([[-4,40],[-4,17],[-3.8,12],[-3.6,8],west,east,[6,1.2],[9,-3],[12,-10],[25,-30]],2.4),road([[-3.6,8],[-6.5,5.7],[-9,2],[-11,-3],[-14,-9],[-28,-28]],2.3)],
 buildings:[],portals:[],encounters:[],tallGrass:[],districts:[{nameZh:'清溪木橋',x:1,z:4.5},{nameZh:'林心岔路',x:-3.6,z:8}],
 props:[tree('premium-west-canopy-a',-8.7,4.2,1.12),tree('premium-west-canopy-b',-12.1,1.9,.95),tree('premium-north-canopy',-7,-3,1.1),tree('premium-southwest-canopy',-10.5,12,1.1),tree('premium-east-canopy-a',8.4,1,1.15),tree('premium-east-canopy-b',11.3,5.3,1.02),tree('premium-southeast-canopy',8.9,13.1,1.13),
 // Keep the fork's walked centre clear. Smaller attached bank clusters break
 // the long channel edge without turning ordinary ground flora into landmarks.
 ...[[-7.4,7.5,.8],[-9.5,7.4,.78],[-5.9,-.5,.85],[5.8,6.5,.78],[6.5,-.5,.8],[5.8,10.7,.78],[-1.15,10.6,.42],[4.25,9.2,.48],[-1.2,.5,.4],[3.9,-2.1,.43],[-1.55,-4.4,.44],[4.3,13,.48]].map(([x,z,scale],i)=>({id:'premium-understorey-'+i,kind:'premium_shrubs',x,z,scale})),
 // Rail footprints share the image-derived deck edges. Long thin rectangles
 // prevent walking sideways through timber while retaining open thresholds.
 ...[PREMIUM_BRIDGE.farEdge,PREMIUM_BRIDGE.nearEdge].map(([a,b],i)=>{const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),nx=-dz/len*.09,nz=dx/len*.09;return{id:'premium-rail-collision-'+i,kind:'premium_rail_collider',x:0,z:0,footprint:{outline:[{x:a.x+nx,z:a.z+nz},{x:b.x+nx,z:b.z+nz},{x:b.x-nx,z:b.z-nz},{x:a.x-nx,z:a.z-nz}]}};})],
 incompleteArt:['Native review required for revised rock/soil banks, threshold aprons and bank vegetation; functional geometry is not visual acceptance.','Existing painted oak/understorey are reuse candidates awaiting native style comparison.'],
};
export function applyPremiumCrossingPrototype(maps,location=globalThis.location){
 if(!location||!['127.0.0.1','localhost'].includes(location.hostname)||!location.pathname.endsWith('/preview')||new URLSearchParams(location.search).get('world-trial')!==PREMIUM_CROSSING_PROFILE)return null;
 // Kept as a bookmarked camera entry point. The forest is now installed for
 // every environment; this URL no longer swaps in an isolated empty scene.
 return{id:PREMIUM_CROSSING_PROFILE,zone:'mosswood',spawn:PREMIUM_CROSSING_SPAWN,map:maps.mosswood};
}
