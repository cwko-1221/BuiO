import Phaser from 'phaser';
import {SCENE_PROJECTS} from '../../lib/park-projects.mjs';
import type {GardenState} from '../../lib/park-garden.mjs';
import {communityKey} from './terrain';
export class SharedSceneArt{
  private views=new Map<string,{images:Phaser.GameObjects.Image[];label:Phaser.GameObjects.Text;wire?:Phaser.GameObjects.Graphics}>();
  readonly labels:Phaser.GameObjects.Text[]=[];
  constructor(scene:Phaser.Scene,english:boolean,onActivate:(id:string)=>void){
    for(const spec of SCENE_PROJECTS){
      const images=Array.from({length:9},(_,i)=>{
        let x=0,y=0,width=0,depth=0,originY=0;
        if(spec.kind==='garland'){const front=i<5;x=front?2270+i*125:2330+(i-5)*125;y=front?1171:958;width=118;depth=front?1244:1032;}
        else if(spec.kind==='lily'){const points=[[-115,-34],[-35,-48],[65,-32],[120,8],[36,43],[-91,26],[102,47],[-5,0],[-140,4]];x=4510+points[i][0];y=600+points[i][1];width=66;depth=-2.5;originY=.5;}
        else{x=4354+i*29;y=2558+Math.sin(i/8*Math.PI)*28;width=28;depth=2790;}
        const image=scene.add.image(x,y,communityKey(spec.kind)).setOrigin(.5,originY).setVisible(false).setDepth(depth).setData('sceneProject',spec.id).setData('slot',i);image.setScale(width/image.width);return image;
      });
      const label=scene.add.text(spec.marker.x,spec.marker.y,(english?spec.name['en-US']:spec.name['zh-HK'])+' · 0/9',{fontFamily:'"Microsoft JhengHei",sans-serif',fontSize:'12px',color:'#426a54',backgroundColor:'#fff9e8ed',padding:{x:9,y:6}}).setResolution(2).setOrigin(.5).setDepth(spec.marker.y+350).setInteractive({useHandCursor:true}).setData('projectMarker',spec.id);
      label.on('pointerup',(p:Phaser.Input.Pointer)=>{if(p.getDistance()<18)onActivate(spec.id);});this.labels.push(label);
      let wire:Phaser.GameObjects.Graphics|undefined;if(spec.kind==='lantern'){wire=scene.add.graphics().setDepth(2789).setVisible(false);wire.lineStyle(1.6,0x766644,.8).strokePoints(Array.from({length:33},(_,i)=>new Phaser.Math.Vector2(4340+i*8.5,2553+Math.sin(i/32*Math.PI)*30)),false);}
      this.views.set(spec.id,{images,label,wire});
    }
  }
  update(state:GardenState,english:boolean){for(const spec of SCENE_PROJECTS){const view=this.views.get(spec.id)!,data=state.projects?.[spec.id],items=data?.contributions||[];view.label.setText((english?spec.name['en-US']:spec.name['zh-HK'])+' · '+items.length+'/9');view.wire?.setVisible(items.length>0);for(const [i,image]of view.images.entries()){const item=items[i];image.setVisible(!!item);if(item)image.setTint(spec.choices.find(c=>c.id===item.choice)?.tint||0xffffff);}}}
}
