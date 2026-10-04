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
