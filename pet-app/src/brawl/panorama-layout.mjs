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
// One uniform scale, one image. Align the painted floor and crop only outer scenery.
export function panoramaPlacement(imageWidth,imageHeight,viewportWidth,scrollX,worldWidth,floorLine=.53){
 const floor=clamp(floorLine,.35,.7);
 const scale=Math.max(viewportWidth/imageWidth,FLOOR_TOP/(imageHeight*floor),(BATTLE_HEIGHT-FLOOR_TOP)/(imageHeight*(1-floor)));
 const width=imageWidth*scale,height=imageHeight*scale,travel=Math.max(0,width-viewportWidth),cameraTravel=Math.max(0,worldWidth-viewportWidth);
 const progress=cameraTravel?clamp(scrollX/cameraTravel,0,1):0;
 // A short practice/PvP arena uses the opening scenery without sweeping an entire chapter.
 const pan=worldWidth>1280?travel:Math.min(travel,cameraTravel*.35);
 return {x:-pan*progress,y:FLOOR_TOP-height*floor,scale,width,height};
}
