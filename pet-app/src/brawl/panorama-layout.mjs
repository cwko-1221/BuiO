const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export const BATTLE_HEIGHT=720;
export const FLOOR_TOP=345;
// Keep actor sizes and simulation coordinates stable; reveal more world on wider screens.
export function battleViewportWidth(parentWidth,parentHeight){
 return Math.round(clamp(BATTLE_HEIGHT*parentWidth/Math.max(1,parentHeight),960,1920));
}
export function battleCameraScroll(playerX,viewportWidth,worldWidth,lookAhead=0){
 if(viewportWidth>=worldWidth)return (worldWidth-viewportWidth)/2;
 return clamp(playerX-viewportWidth*.453125+lookAhead,0,worldWidth-viewportWidth);
}
// Ease only the directional offset. Critical damping starts a turn gently and
// carries its velocity through repeated reversals without slowing world tracking.
export function smoothCameraLookAhead(offset,velocity,target,delta){
 if(delta<=0)return {offset,velocity};
 const dt=Math.max(0,delta)/1000,omega=2/.42,decay=Math.exp(-omega*dt);
 const distance=offset-target,step=(velocity+omega*distance)*dt;
 const next=target+(distance+step)*decay,bounded=clamp(next,-90,90);
 return {offset:bounded,velocity:bounded===next?(velocity-omega*step)*decay:0};
}
// One uniform scale and one complete image; preserve the full painting height.
export function panoramaPlacement(imageWidth,imageHeight,viewportWidth,scrollX,worldWidth,floorLine=.53){
 // Art spans the full level at natural height. Keep the entire sky and floor;
 // neither simulation width nor an estimated horizon can magnify the scenery.
 const scale=Math.max(viewportWidth/imageWidth,BATTLE_HEIGHT/imageHeight);
 const width=imageWidth*scale,height=imageHeight*scale,travel=Math.max(0,width-viewportWidth),cameraTravel=Math.max(0,worldWidth-viewportWidth);
 // The painted fighting floor is part of the world, so it must move pixel-for-pixel
 // with the camera. Shrinking camera progress to the image's travel caused slow drift.
 const pan=clamp(scrollX,0,Math.min(travel,cameraTravel));
 return {x:-pan,y:0,scale,width,height};
}
