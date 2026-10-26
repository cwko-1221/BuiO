import assert from 'node:assert/strict';
import sharp from 'sharp';

// Track limb identity through the stride instead of counting different pictures.
export async function checkGundamGait(frames) {
  const frontContacts=[];
  for(const index of [0,4]){
    const data=await sharp(frames[index]).ensureAlpha().raw().toBuffer();
    const gloves=[0,0],soles=[0,0];
    for(let y=0;y<512;y++)for(let x=0;x<512;x++){
      const p=(y*512+x)*4,r=data[p],g=data[p+1],b=data[p+2];
      if(data[p+3]<=128)continue;
      if(y>=230&&y<315&&r<100&&g<110&&b<130){
        if(x<200)gloves[0]++;if(x>330)gloves[1]++;
      }
      if(y>400&&r<90&&g<90&&b<110)soles[x<264?0:1]++;
    }
    assert(Math.sign(gloves[0]-gloves[1])===-Math.sign(soles[0]-soles[1]),
      'Front contact swings the same-side glove and leading boot');
    frontContacts.push({index,gloves,soles});
  }
  const profile=[];
  for(const input of frames.slice(8,16)){
    const {data}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let near=0,nx=0,far=0,fx=0,arm=0,ax=0;
    for(let y=0;y<512;y++)for(let x=0;x<512;x++){
      const p=(y*512+x)*4,r=data[p],g=data[p+1],b=data[p+2];
      if(data[p+3]<128)continue;
      if(y>350&&r>110&&r>g*1.65&&r>b*1.3){
        if(r>200){near++;nx+=x;}else{far++;fx+=x;}
      }
      if(y>=230&&y<295&&r>218&&g>210&&b>200){arm++;ax+=x;}
    }
    assert(near>1500&&far>1500&&arm>1000,'Missing profile leg/forearm');
    profile.push({nearX:nx/near,farX:fx/far,armX:ax/arm});
  }
  assert(profile[0].nearX-profile[0].farX>100,'First contact lacks near-leg lead');
  assert(profile[4].farX-profile[4].nearX>100,'Opposite contact repeats first leg');
  assert(profile[0].nearX-profile[4].nearX>130,'Near leg does not travel through its stride');
  assert(profile[4].armX-profile[0].armX>45,'Near arm repeats instead of counter-swinging');
  const sensors=[];
  for(const input of frames.slice(24,32)){
    const {data}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let green=0;
    for(let y=60;y<210;y++)for(let x=130;x<390;x++){
      const p=(y*512+x)*4,r=data[p],g=data[p+1],b=data[p+2];
      if(data[p+3]>128&&g>90&&g>r*1.7&&g>b*1.3)green++;
    }
    sensors.push(green);
  }
  assert(sensors[0]>100&&sensors[4]<sensors[0]*.12,'Sensor blink missing');
  assert(sensors[6]>sensors[0]*.7,'Sensors do not wake after blink');
  return {frontContacts,profile,sensors};
}
