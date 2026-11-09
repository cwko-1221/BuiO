const boundsCache=new WeakMap();
export function getActorSourceBounds(image){
  if(boundsCache.has(image))return boundsCache.get(image);
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);
  const {data}=c.getImageData(0,0,canvas.width,canvas.height);
  let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>24){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const bounds=right<left?{x:0,y:0,w:canvas.width,h:canvas.height}:{x:left,y:top,w:right-left+1,h:bottom-top+1};
  boundsCache.set(image,bounds);return bounds;
}
export function getNpcDrawGeometry(npc,image,height=110){
  const source=getActorSourceBounds(image),h=npc.overworldHeight||height;
  return{source,w:source.w/source.h*h,h};
}
