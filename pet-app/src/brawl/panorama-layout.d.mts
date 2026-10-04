export const BATTLE_HEIGHT:number;
export const FLOOR_TOP:number;
export function battleViewportWidth(parentWidth:number,parentHeight:number):number;
export function battleCameraScroll(playerX:number,viewportWidth:number,worldWidth:number,lookAhead?:number):number;
export function panoramaPlacement(imageWidth:number,imageHeight:number,viewportWidth:number,scrollX:number,worldWidth:number,floorLine?:number):{x:number;y:number;scale:number;width:number;height:number};
