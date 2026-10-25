import {FISH,FISHING_SPOTS} from '../../lib/park-leisure.mjs';
import type {GameState} from '../../lib/park-games.mjs';
import art from './fishing-art-assets.json';
import market from './market-art-assets.json';

export const fishingAsset=(id:string)=>Object.hasOwn(art.assets,id)?'/pet/assets/art/park/fishing-v2/'+art.assets[id as keyof typeof art.assets].file:'/pet/assets/art/park/market-v1/'+market.assets[id as keyof typeof market.assets].file;
const fishingIds=[...Object.keys(art.assets),...Object.keys(market.assets).filter(id=>id.startsWith('fish-'))];
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

// Presentation only: input, fish, size, timing and catches come from the server.
export class FishingView{
  readonly images=new Map<string,HTMLImageElement>();
  async load(){await Promise.all(fishingIds.map(async id=>{const image=new Image();image.src=fishingAsset(id);await image.decode();this.images.set(id,image);}));}
  private image(c:CanvasRenderingContext2D,id:string,x:number,y:number,width:number,angle=0){const image=this.images.get(id);if(!image)return;c.save();c.translate(x,y);c.rotate(angle);const h=width*image.height/image.width;c.drawImage(image,-width/2,-h/2,width,h);c.restore();}
  private splash(c:CanvasRenderingContext2D,x:number,y:number,age:number,reduced:boolean){if(age<0||age>.75)return;const p=age/.75;c.save();c.globalAlpha=(1-p)*.85;this.image(c,'splash',x,y,55+(reduced?0:p*60));c.restore();}
  draw(c:CanvasRenderingContext2D,state:GameState|undefined,t:number,pet:HTMLImageElement,selected:number,held:boolean,reduced:boolean){
    const l=state?.leisure,phase=l?.phase||'ready',motion=reduced?0:t,idle=['ready','caught','escaped'].includes(phase),spot=FISHING_SPOTS[selected];
    // Small fish schools remain below the surface; their placement describes the three fishing spots.
    for(let i=0;i<3;i++){const p=FISHING_SPOTS[i];c.save();c.globalAlpha=.16;this.image(c,'fish-'+FISH[p.fish[0]].id,p.x+Math.sin(motion*.55+i)*17,p.y+22+Math.cos(motion*.4+i)*6,42,Math.sin(motion*.5+i)*.14);c.restore();}
    if(idle){for(const p of FISHING_SPOTS){c.save();c.strokeStyle=p===spot?'#fff4cfdd':'#f6ffe76b';c.lineWidth=p===spot?2:1;c.beginPath();c.ellipse(p.x,p.y,26,8,0,0,Math.PI*2);c.stroke();c.restore();}}
    const castAge=l?t-l.castAt:0,flight=clamp(castAge/.58,0,1),casting=phase==='casting',reeling=phase==='reeling';
    const lean=reeling?(held?-.035:.015):casting?-.08*Math.sin(flight*Math.PI):0;
    if(pet.complete&&pet.naturalWidth){c.save();c.translate(145,405);c.rotate(lean);const w=107,h=107*pet.naturalHeight/pet.naturalWidth;c.drawImage(pet,-w/2,-h+(reduced?0:Math.sin(motion*1.8)*1.1),w,h);c.restore();}
    const grip={x:168,y:374},rodAngle=-.59+(casting?-.35*Math.sin(flight*Math.PI):0)+(reeling?Math.sin(motion*6)*.025:0),rodLength=225;
    const tip={x:grip.x+Math.cos(rodAngle)*rodLength*.9,y:grip.y+Math.sin(rodAngle)*rodLength*.9-12};
    const dip=phase==='bite'?12+Math.sin(motion*14)*2:phase==='waiting'&&l&&t<l.biteAt?Math.max(0,1-Math.abs(t-(l.castAt+1.2+Math.max(0,l.nibbles-1)*.7))/.2)*5:0;
    let bx=l?.castX??spot.x,by=(l?.castY??spot.y)+dip;
    if(casting){bx=tip.x+(bx-tip.x)*flight;by=tip.y+(by-tip.y)*flight-Math.sin(flight*Math.PI)*100;}
    if(reeling){bx+=Math.sin(motion*3)*(l?.surging?22:8);by+=Math.cos(motion*4)*5;}
    if(!idle){c.strokeStyle='#fdfbe6cc';c.lineWidth=1.25;c.beginPath();c.moveTo(tip.x,tip.y);c.quadraticCurveTo((tip.x+bx)/2,(tip.y+by)/2+(reeling?5:23),bx,by);c.stroke();
      if(!casting){c.save();c.strokeStyle='#eaffefad';c.lineWidth=1.3;for(let i=0;i<3;i++){const age=(motion*.7+i/3)%1;c.globalAlpha=(1-age)*.55;c.beginPath();c.ellipse(bx,by+7,9+age*24,3+age*6,0,0,Math.PI*2);c.stroke();}c.restore();}
      if(phase!=='escaped')this.image(c,'bobber',bx,by-6,18,phase==='bite'?.2:Math.sin(motion*2)*.06);
    }
    const rod=this.images.get('rod');if(rod){c.save();c.translate(grip.x,grip.y);c.rotate(rodAngle);const height=rodLength*rod.height/rod.width;c.drawImage(rod,-rodLength*.08,-height*.42,rodLength,height);c.restore();}
    if(l){this.splash(c,l.castX,l.castY,t-l.castAt-.58,reduced);for(const e of state!.effects.slice(-12)){if(['bite','hook','catch'].includes(e.type))this.splash(c,l.castX,l.castY,t-e.t,reduced);}
      if(phase==='bite'){c.save();const r=28+(reduced?0:Math.sin(motion*8)*3);c.fillStyle='#fff5cf';c.strokeStyle='#c46c42';c.lineWidth=3;c.beginPath();c.arc(bx,by-57,r,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#aa563b';c.font='bold 35px sans-serif';c.textAlign='center';c.fillText('!',bx,by-45);c.restore();}
      if(phase==='caught'){const caught=[...state!.effects].reverse().find(e=>e.type==='catch'),age=caught?t-caught.t:2;if(age<.72&&!reduced){const p=clamp(age/.72,0,1);this.image(c,'fish-'+FISH[l.fish].id,l.castX+(460-l.castX)*p,l.castY+(210-l.castY)*p-Math.sin(p*Math.PI)*110,50+p*55,-Math.sin(p*Math.PI)*.4);}}
    }
  }
}
