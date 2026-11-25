// Native input helpers for fishing playtests; no simulation state is modified.
export async function castFishingSwipe(page,to={x:485,y:255},from={x:490,y:280}){
  const r=await page.locator('.park-leisure-stage canvas').boundingBox(),screen=p=>({x:r.x+p.x/800*r.width,y:r.y+p.y/600*r.height}),a=screen(from),b=screen(to),touch=await page.context().newCDPSession(page);
  try{
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:7}]});
    for(let i=1;i<=5;i++){await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/5,y:a.y+(b.y-a.y)*i/5,id:7}]});await page.waitForTimeout(20);}
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }finally{await touch.detach();}
  await page.waitForFunction(()=>['casting','waiting'].includes(window.__petPark.miniGame.state.leisure.phase));
}
export async function catchFishingTouch(page,{to,onBite,onFight}={}){
 const deadline=Date.now()+150000;let lastTap=0,fightShot=false;
 await castFishingSwipe(page,to||{x:445,y:250},{x:580,y:340});
 while(Date.now()<deadline){
   const state=await page.evaluate(()=>window.__petPark.miniGame.state),l=state.leisure;
   if(l.phase==='caught'){await page.locator('.fishing-catch-screen:not([hidden])').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-leisure="catch-next"]').disabled);return state;}
   if(state.status==='ended')throw Error('Fishing round ended before a catch; the pond is intentionally random.');
   if(l.phase==='escaped'){await castFishingSwipe(page,to||{x:445,y:250},{x:580,y:340});continue;}
   if(l.phase==='bite'){if(onBite&&l.phaseUntil-state.t>1)await onBite(page);await page.locator('[data-leisure="reel"]').tap();}
   else if(l.phase==='reeling'){
     if(!fightShot&&onFight){fightShot=true;await onFight(page);}
     if(!l.surging&&l.tension<62&&Date.now()-lastTap>250){lastTap=Date.now();await page.locator('[data-leisure="reel"]').tap();}
   }
   await page.waitForTimeout(65);
 }
 throw Error('Fishing touch playtest exceeded its time budget.');
}
