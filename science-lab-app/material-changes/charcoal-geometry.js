import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export function charcoalPoint(x,y,z,size,variant=0) {
  const relief=1+.065*Math.sin(x*9+z*6+variant)*Math.cos(y*8-z*4)+.035*Math.sin(z*15-y*7+variant*2);
  const rounded=value=>Math.sign(value)*Math.pow(Math.abs(value),.83);
  return {x:rounded(x)*size*relief*(variant===1?1.05:.95),y:rounded(y)*size*relief*.8,z:rounded(z)*size*relief*.88};
}
export function charcoalGeometry(size,variant=0) {
  const source=new THREE.IcosahedronGeometry(1,3);
  // IcosahedronGeometry duplicates vertices for face normals and UV seams.
  // Weld by position BEFORE sculpting: neighbouring faces must move together.
  source.deleteAttribute('normal');source.deleteAttribute('uv');
  const geometry=mergeVertices(source,1e-6);source.dispose();
  const p=geometry.getAttribute('position'),uv=[];
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const point=charcoalPoint(x,y,z,size,variant);p.setXYZ(i,point.x,point.y,point.z);
    uv.push(Math.atan2(z,x)/(Math.PI*2)+.5,Math.asin(Math.max(-1,Math.min(1,y)))/Math.PI+.5);
  }
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}

// A lopsided low powder mound, with a feathered irregular outline rather than
// a circular wafer. The same height field seats fragments in the fine ash.
export function ashPoint(r,angle) {
  const edge=.35*(1+.13*Math.sin(angle*3)+.09*Math.cos(angle*5)+.035*Math.sin(angle*11));
  const x=Math.cos(angle)*edge*r,z=Math.sin(angle)*edge*r*.86;
  const taper=Math.max(0,1-r);
  const y=.001+.12*Math.pow(taper,1.55)+.035*Math.exp(-((x+.105)**2+(z-.035)**2)/.012)*Math.max(0,1-r*r)+.009*Math.sin(x*43+z*7)*Math.sin(z*31)*taper;
  return {x,y,z};
}

export function ashMoundGeometry() {
  const segments=80,rings=24,positions=[],uv=[],indices=[];
  const add=(x,y,z)=>{positions.push(x,y,z);uv.push(x/.9+.5,z/.9+.5);};
  const centre=ashPoint(0,0);add(centre.x,centre.y,centre.z);
  for(let r=1;r<=rings;r++)for(let i=0;i<segments;i++){
    const point=ashPoint(r/rings,i/segments*Math.PI*2);add(point.x,point.y,point.z);
  }
  for(let i=0;i<segments;i++)indices.push(0,1+(i+1)%segments,1+i);
  for(let r=1;r<rings;r++)for(let i=0;i<segments;i++){
    const a=1+(r-1)*segments+i,b=1+(r-1)*segments+(i+1)%segments,c=a+segments,d=b+segments;
    indices.push(a,b,c,b,d,c);
  }
  const bottom=positions.length/3;add(0,0,0);
  const rim=1+(rings-1)*segments;
  for(let i=0;i<segments;i++)indices.push(bottom,rim+i,rim+(i+1)%segments);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  // Powder feathers into the vessel floor; averaging its top normals with
  // the hidden underside would create an artificial dark wafer-like rim.
  const normals=geometry.getAttribute('normal');for(let i=rim;i<rim+segments;i++)normals.setXYZ(i,0,1,0);
  return geometry;
}
