const url=id=>`/pokemon-rpg/assets/overhaul/world/${id}.webp`;
export const PREMIUM_MATERIALS={
 grass:{src:url('meadow-turf-v4'),logicalPeriodWidth:460},
 earth:{src:url('premium-earth-v1'),logicalPeriodWidth:512},
 water:{src:url('premium-water-v1'),logicalPeriodWidth:512},
 bank:{src:url('premium-bank-v1'),logicalPeriodWidth:256},
};
export const PREMIUM_BRIDGE_ART={width:1536,height:1024,scale:.32,origin:{x:768,y:512},
 base:url('premium-bridge-base-v1'),back:url('premium-bridge-back-v1'),front:url('premium-bridge-front-v1'),
 footings:url('premium-bridge-footings-v1'),
 sourceDeck:[[234,622],[1038,225],[1324,409],[480,798]],
 backGround:[[234,622],[1038,225]],frontGround:[[480,798],[1324,409]],
};
// Existing painted props are inspected reuse candidates, not the rejected cel kit.
export const PREMIUM_PROP_SPECS={
 premium_oak:{src:url('oak-v1'),w:320,h:320*648/768,anchorX:.5,anchorY:.94},
 premium_shrubs:{src:url('woodland-shrubs-v1'),w:105,h:105*512/768,anchorX:.5,anchorY:.9},
};
export const PREMIUM_ASSET_URLS=[...Object.values(PREMIUM_MATERIALS).map(a=>a.src),...['base','back','front','footings'].map(k=>PREMIUM_BRIDGE_ART[k]),...Object.values(PREMIUM_PROP_SPECS).map(a=>a.src)];
