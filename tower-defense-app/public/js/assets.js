export const MAP_ART=Object.freeze({
  starport:'/tower-defense/assets/maps/starport.webp',
  moonwood:'/tower-defense/assets/maps/moonwood.webp',
  embercore:'/tower-defense/assets/maps/embercore.webp',
});

export const TOWER_ART=Object.freeze({
  key:'td-towers',src:'/tower-defense/assets/sprites/towers.webp',frameWidth:256,frameHeight:256,columns:3,rows:2,
  frames:Object.freeze({bolt:0,cannon:1,frost:2,storm:3,prism:4,beacon:5}),
});

export const ENEMY_ART=Object.freeze({
  key:'td-enemies',src:'/tower-defense/assets/sprites/enemies.webp',frameWidth:256,frameHeight:256,columns:3,rows:3,
  frames:Object.freeze({drone:0,runner:1,guard:2,wisp:3,medic:4,shielder:5,splitter:6,phantom:7,shard:8}),
});

export const BOSS_ART=Object.freeze({
  key:'td-bosses',src:'/tower-defense/assets/sprites/bosses.webp',frameWidth:384,frameHeight:384,columns:3,rows:1,
  frames:Object.freeze({leviathan:0,ancient:1,colossus:2}),
});

export function atlasPosition(frame,columns,rows){
  return {x:(frame%(columns||1))*100/Math.max(1,(columns||1)-1),y:Math.floor(frame/(columns||1))*100/Math.max(1,(rows||1)-1)};
}
