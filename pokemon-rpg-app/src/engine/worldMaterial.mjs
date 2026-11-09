// Periodic, feathered paint patches. Wrapping every patch at the texture edge
// makes the final material continuous even when its generated source is not.
const surfaces=new WeakMap();
export function getWorldMaterialPattern(c,image,period=768) {
  let tile=surfaces.get(image);
  if(!tile){
    const size=1024;tile=document.createElement('canvas');tile.width=tile.height=size;
    const t=tile.getContext('2d');
    const sample=document.createElement('canvas');sample.width=sample.height=1;
    const s=sample.getContext('2d');s.drawImage(image,0,0,1,1);
    const [r,g,b]=s.getImageData(0,0,1,1).data;t.fillStyle=`rgb(${r},${g},${b})`;t.fillRect(0,0,size,size);
    const patch=document.createElement('canvas');patch.width=patch.height=768;
    const p=patch.getContext('2d');p.drawImage(image,0,0,768,768);
    p.globalCompositeOperation='destination-in';
    const fade=p.createRadialGradient(384,384,140,384,384,384);
    fade.addColorStop(0,'#fff');fade.addColorStop(.5,'#ffffffed');fade.addColorStop(1,'#ffffff00');
    p.fillStyle=fade;p.fillRect(0,0,768,768);
    for(const [x,y,a] of [[80,70,0],[575,30,Math.PI/2],[50,560,Math.PI],[570,580,-Math.PI/2]]){
      for(const dx of [-size,0,size])for(const dy of [-size,0,size]){
        t.save();t.translate(x+dx,y+dy);t.rotate(a);t.drawImage(patch,-384,-384);t.restore();
      }
    }
    surfaces.set(image,tile);
  }
  const pattern=c.createPattern(tile,'repeat');
  pattern?.setTransform(new DOMMatrix().scale(period/tile.width));
  return pattern;
}
