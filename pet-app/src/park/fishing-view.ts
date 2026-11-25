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
  private fishPositions=new Map<number,{x:number;y:number}>();
  private lastDraw=0;private lastTime=-1;
  draw(c:CanvasRenderingContext2D,state:GameState|undefined,t:number,pet:HTMLImageElement,selected:number,held:boolean,reduced:boolean,aim?:{x:number;y:number}){
    const l=state?.leisure,phase=l?.phase||'ready',motion=reduced?0:t,idle=['ready','caught','escaped'].includes(phase),spot=FISHING_SPOTS[selected];
    const now=performance.now(),smooth=clamp((now-this.lastDraw)/1000*14,0,1);this.lastDraw=now;if(t<this.lastTime)this.fishPositions.clear();this.lastTime=t;
    const school=l?.school||Array.from({length:9},(_,i)=>({id:i,fish:FISHING_SPOTS[i%3].fish[i%FISHING_SPOTS[i%3].fish.length],x:FISHING_SPOTS[i%3].x+Math.sin(motion*.2+i)*55,y:FISHING_SPOTS[i%3].y+Math.cos(motion*.3+i)*30,angle:Math.sin(motion*.3+i)*.5,speed:0,mode:'roam'}));
    for(const f of school){
      if(f.mode==='diving')continue;
      const advance=state&&!state.paused&&['roam','approach','flee'].includes(f.mode)?clamp(t-state.t,0,.09):0,speed=f.mode==='approach'?65:f.mode==='flee'?135:f.speed;
      const x=f.x+Math.cos(f.angle)*speed*advance,y=f.y+Math.sin(f.angle)*speed*advance,p=this.fishPositions.get(f.id)||{x,y};p.x+=(x-p.x)*smooth;p.y+=(y-p.y)*smooth;this.fishPositions.set(f.id,p);
      const active=f.id===l?.activeFish,width=clamp(31+FISH[f.fish].length[1]*.52,35,66),sway=reduced?0:Math.sin(motion*(f.mode==='flee'||f.mode==='hooked'&&l?.surging?14:5)+f.id)*(f.mode==='hooked'&&l?.surging?.14:.05);
      c.save();c.translate(p.x,p.y);c.rotate(f.angle+sway);c.fillStyle='#123e4540';c.beginPath();c.ellipse(0,5,width*.46,width*.10,0,0,Math.PI*2);c.fill();c.globalAlpha=active?.66:.44;this.image(c,'fish-'+FISH[f.fish].id,0,0,width);c.restore();
      if(active&&f.mode==='approach'){c.save();c.strokeStyle='#e8f8e650';c.lineWidth=1;c.beginPath();c.ellipse(p.x,p.y+7,20,6,0,0,Math.PI*2);c.stroke();c.restore();}
    }
    if(idle&&aim){c.save();c.strokeStyle='#fff4c9';c.lineWidth=2;c.setLineDash([5,5]);c.beginPath();c.ellipse(aim.x,aim.y,22,8,0,0,Math.PI*2);c.stroke();c.setLineDash([]);c.fillStyle='#fff9de';c.font='18px sans-serif';c.textAlign='center';c.fillText('↓',aim.x,aim.y-15);c.restore();}
    const castAge=l?t-l.castAt:0,flight=clamp(castAge/.58,0,1),casting=phase==='casting',reeling=phase==='reeling';
    const recentTap=l?clamp(1-(t-l.lastReelAt)/.2,0,1):0,lean=reeling?-(l?.tension||0)/100*.055-recentTap*.025:casting?-.08*Math.sin(flight*Math.PI):0;
    if(pet.complete&&pet.naturalWidth){c.save();c.translate(145,405);c.rotate(lean);const w=107,h=107*pet.naturalHeight/pet.naturalWidth;c.drawImage(pet,-w/2,-h+(reduced?0:Math.sin(motion*1.8)*1.1),w,h);c.restore();}
    const grip={x:168,y:374},landing={x:l?.castX??aim?.x??spot.x,y:l?.castY??aim?.y??spot.y},rodAngle=Math.atan2(landing.y-grip.y,landing.x-grip.x)+(casting?-.35*Math.sin(flight*Math.PI):0)-(reeling?recentTap*.045:0),rodLength=225;
    const bend=reeling?Math.pow((l?.tension||0)/100,1.5)*32:0,tipX=rodLength*.9,tipY=-12-bend*.81;const tip={x:grip.x+Math.cos(rodAngle)*tipX-Math.sin(rodAngle)*tipY,y:grip.y+Math.sin(rodAngle)*tipX+Math.cos(rodAngle)*tipY};
    const nibble=[...(state?.effects||[])].reverse().find(e=>e.type==='nibble'),nibbleAge=nibble?t-nibble.t:99;
    const dip=phase==='bite'?13+(reduced?0:Math.sin(t*17)*6):phase==='waiting'&&nibbleAge<.45?Math.sin(nibbleAge/.45*Math.PI)*6:Math.sin(motion*2)*1.6;
    let bx=landing.x,by=landing.y+dip;
    if(casting){bx=tip.x+(bx-tip.x)*flight;by=tip.y+(by-tip.y)*flight-Math.sin(flight*Math.PI)*100;}
    if(reeling&&l){bx=l.fightX;by=l.fightY+(reduced?0:Math.sin(t*(l.surging?17:4))*(l.surging?4:1.5));}
    if(!idle){c.strokeStyle=reeling&&l&&l.tension>82?'#f3c0a4':'#fdfbe6cc';c.lineWidth=reeling&&l?.surging?1.7:1.25;c.beginPath();c.moveTo(tip.x,tip.y);c.quadraticCurveTo((tip.x+bx)/2,(tip.y+by)/2+(reeling?Math.max(0,13-(l?.tension||0)*.16):23),bx,by);c.stroke();
      if(!casting){c.save();c.strokeStyle=phase==='bite'?'#fff9cc':'#eaffef';c.lineWidth=phase==='bite'?2:1.2;for(let i=0;i<3;i++){const age=(t*(phase==='bite'?1.8:.65)+i/3)%1;c.globalAlpha=(1-age)*(phase==='bite'?.9:.4);c.beginPath();c.ellipse(bx,landing.y+7,9+age*(phase==='bite'?49:24),3+age*(phase==='bite'?14:6),0,0,Math.PI*2);c.stroke();}c.restore();}
      this.image(c,'bobber',bx,by-6,phase==='bite'?16:18,phase==='bite'?Math.sin(motion*17)*.28:Math.sin(motion*2)*.06);
    }
    const rod=this.images.get('rod');if(rod){c.save();c.translate(grip.x,grip.y);c.rotate(rodAngle);const height=rodLength*rod.height/rod.width,segments=bend>1?10:1;for(let i=0;i<segments;i++){const u=i/segments,x=rodLength*(u-.08),y=-height*.42-bend*u*u;c.save();c.translate(x,y);c.rotate(Math.atan(-2*bend*u/rodLength));c.drawImage(rod,rod.width*u,0,rod.width/segments,rod.height,0,0,rodLength/segments+.6,height);c.restore();}c.restore();}

    if(l){this.splash(c,l.castX,l.castY,t-l.castAt-.58,reduced);for(const e of state!.effects.slice(-16)){if(['bite','hook','catch','plop','shy','surge'].includes(e.type))this.splash(c,l.castX,l.castY,t-e.t,reduced);}
      if(phase==='caught'){const caught=[...state!.effects].reverse().find(e=>e.type==='catch'),age=caught?t-caught.t:2;if(age<.72&&!reduced){const p=clamp(age/.72,0,1);this.image(c,'fish-'+FISH[l.fish].id,l.castX+(460-l.castX)*p,l.castY+(210-l.castY)*p-Math.sin(p*Math.PI)*110,50+p*55,-Math.sin(p*Math.PI)*.4);}}
    }
  }
}
