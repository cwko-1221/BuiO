import * as T from 'three';

export function createFountainWater(_x:number,_y:number,_z:number,_width:number,_height:number) {
  const clock={value:0};
  const group=new T.Group();
  const warm=(_renderer:T.WebGLRenderer,_scene:T.Scene)=>{};
  const update=(_renderer:T.WebGLRenderer,_scene:T.Scene,_camera:T.Camera,_force=false)=>{};
  return {group,clock,warm,update,release:()=>{}};
}
