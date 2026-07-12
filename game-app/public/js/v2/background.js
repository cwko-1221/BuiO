export const SKY_BANDS = [
  { at:0,    tint:0xffffff, wash:0x8edcff, horizon:0xe9fbff },
  { at:.18,  tint:0xfff2df, wash:0xffc98f, horizon:0xfff0c7 },
  { at:.38,  tint:0xe5ffe8, wash:0x76d9a4, horizon:0xd9ffe4 },
  { at:.58,  tint:0xffedc7, wash:0xf6b85d, horizon:0xffebae },
  { at:.78,  tint:0xe8f8ff, wash:0x9bdcf5, horizon:0xf7fdff },
  { at:1,    tint:0xcbd5ff, wash:0x686fc7, horizon:0xd9e2ff }
];

function mixChannel(a,b,t) { return Math.round(a + (b-a)*t); }
export function mixColor(a,b,t) {
  return (mixChannel((a>>16)&255,(b>>16)&255,t)<<16) |
    (mixChannel((a>>8)&255,(b>>8)&255,t)<<8) |
    mixChannel(a&255,b&255,t);
}

export function sampleSky(heightRatio) {
  const value = Math.max(0,Math.min(1,heightRatio));
  let upper = SKY_BANDS.findIndex(band => band.at >= value);
  if (upper <= 0) return { ...SKY_BANDS[0], ratio:value };
  if (upper < 0) upper = SKY_BANDS.length-1;
  const a=SKY_BANDS[upper-1], b=SKY_BANDS[upper];
  const t=(value-a.at)/(b.at-a.at || 1);
  return { ratio:value, tint:mixColor(a.tint,b.tint,t), wash:mixColor(a.wash,b.wash,t), horizon:mixColor(a.horizon,b.horizon,t) };
}
