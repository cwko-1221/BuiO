# Thresholds, diagnosis and the sheets that cannot be separated

## Contents

- [What each knob does](#what-each-knob-does)
- [Starting points](#starting-points)
- [Diagnosing from the numbers](#diagnosing-from-the-numbers)
- [The low-contrast failure](#the-low-contrast-failure)
- [Recognising a sheet worth sending back](#recognising-a-sheet-worth-sending-back)
- [Useful one-off checks](#useful-one-off-checks)

## What each knob does

The mask is grown the way an edge detector grows one — seeded where the two pictures disagree
emphatically, spread into neighbours while they still disagree appreciably, then filtered.

| flag | means | raise it to | lower it to |
| --- | --- | --- | --- |
| `--seed` | how strong a disagreement starts a region | ignore faint additions | catch a faint addition |
| `--spread` | how strong a disagreement the region grows across | keep the fur out | close bites in the accessory |
| `--opening` | radius that severs thin bridges before filtering | cut fur wisps off the accessory | keep fine detail (chains, frames) |
| `--solid` | how wide the middle of a worn thing must be | drop thin strays | keep a delicate item |
| `--fill` | largest enclosed gap that gets closed | fill a bigger fault | protect a smaller lens |
| `--thin` | how thin a piece along the silhouette counts as fur | drop more fur | protect a slender accessory |
| `--edge` | how far either side of the silhouette counts as "along it" | — | — |

`spread` is the one that matters. Reach for it first and leave the rest alone.

## Starting points

| kind of item | spread | solid | opening |
| --- | --- | --- | --- |
| collars, capes, scarves | 45 | 12 | 5 |
| spectacles, masks, face marks | 45 | 10 | 4 |
| crowns, clips, hats | 45 | 10 | 4 |
| thin gold frames | 20 | 7 | 3 |
| anything pale sitting on cream fur | 24–30 | 10 | 4, plus `--thin 40` |

Two worked examples, both from collars that needed moving off the default:

- **A white cape over cream fur** at spread 45 came out with chunks bitten from the ruff, because in
  the places where cape white meets fur cream the two pictures barely disagree. At 24 the cape is
  whole. At 16 it starts taking the fur.
- **A pearl necklace** at spread 45 yielded the gem and the pendant and no strand at all. At 30 the
  strand is whole and fur comes with it, which `--thin 40` then removes most of.

## Diagnosing from the numbers

Twenty poses on a sheet. Read the bake's report against that.

| symptom | what it means | do |
| --- | --- | --- |
| 60–130 regions | mask is growing into the animal | raise `--spread` |
| under 15 regions, small mask % | accessory not being caught | lower `--spread` |
| audit shows outline arcs | fur pieces survived, unattached | raise `--opening`, or `--thin` |
| audit shows a large hole | mask far too mean, or a real opening | check the proof before touching `--fill` |
| proof shows bites in a white edge | spread is above the accessory/fur contrast | lower `--spread` |
| layer looks right, composite looks wrong | wrong sheet, or a misaligned redraw | re-check the overlap |

An item genuinely absent from a pose is not a fault. A collar is not visible from behind, a monocle
is not drawn on the sleeping cat, and `bake-to-atlas.mjs` reporting "17 of 20 frames" is normal. Look
at the proof and decide whether the redraw drew it there at all.

## The low-contrast failure

Some sheets cannot be separated at any threshold, and recognising this early saves an afternoon.

The condition: the accessory differs from the fur it covers by about as much as the generator's own
redrawing of that fur. Pale frost on cream cheeks, white pearls on a cream chest. Grow the mask meanly
enough to leave the fur alone and the accessory is left behind too; grow it enough to catch the
accessory and fur traces come with it — **joined to the accessory**, so no filter that works on whole
regions can take them out.

You then have three options, in order of preference:

1. **Ask for the sheet again with more contrast** — an outline, a shadow, a deeper tint. This is the
   real fix and it has worked: two items that failed outright came back on new sheets and baked clean
   at the default settings.
2. **Accept the traces, if they land on the same pet.** Composited back on the cat they were lifted
   from, fur traces land on the cat's own fur and cannot be seen. This is legitimate — the honest
   alternative was shipping a necklace that was one gem floating on the chest. Record the verdict as
   qualified: the layer will show its traces on any *other* creature.
3. **Ship the item unfitted**, on the old landmark path, until a better sheet exists.

## Recognising a sheet worth sending back

Before baking, three cheap checks:

- Composite over magenta — magenta inside a body means the cut ate the drawing's white.
- Silhouette overlap with the base — under 94% is a misaligned redraw; exactly 100.0% is a sheet whose
  alpha was locked to the base and whose accessory has been clipped to the fur outline.
- Look at it. If the accessory is barely distinguishable from the fur by eye, the difference will not
  distinguish it either.

## Useful one-off checks

Silhouette overlap against the base:

```bash
node -e "
const sharp=require('sharp');
(async()=>{
const a=await sharp(process.argv[1]).ensureAlpha().resize(1024,1024,{fit:'fill'}).raw().toBuffer();
const b=await sharp(process.argv[2]).ensureAlpha().resize(1024,1024,{fit:'fill'}).raw().toBuffer();
let both=0,either=0;
for(let i=0;i<1024*1024;i++){const x=a[i*4+3]>32,y=b[i*4+3]>32;if(x&&y)both++;if(x||y)either++;}
console.log('overlap',(100*both/either).toFixed(1)+'%');})();" <base.png> <redraw-4096.png>
```

A sheet over magenta, to see whether its white survived the cut:

```bash
node -e "
const sharp=require('sharp');const S=700;
(async()=>{await sharp({create:{width:S,height:S,channels:4,background:{r:255,g:0,b:200,alpha:1}}})
 .composite([{input:await sharp(process.argv[1]).resize(S,S,{fit:'fill'}).png().toBuffer()}])
 .png().toFile('tmp/magenta.png');})();" <sheet.png>
```

The item worn, at game size, in the four poses that matter:

```bash
node -e "
const sharp=require('sharp');
const [atlas,patch]=process.argv.slice(1);
const C=160,Z=180,F=[0,6,10,17];
(async()=>{
const base=await sharp(atlas).ensureAlpha().png().toBuffer();
const over=await sharp(patch).ensureAlpha().png().toBuffer();
const strip=[];
for(let k=0;k<F.length;k++){const i=F[k],x=(i%5)*C,y=Math.floor(i/5)*C;
 const b=await sharp(base).extract({left:x,top:y,width:C,height:C}).png().toBuffer();
 const p=await sharp(over).extract({left:x,top:y,width:C,height:C}).png().toBuffer();
 const cell=await sharp({create:{width:C,height:C,channels:4,background:{r:122,g:104,b:92,alpha:1}}})
  .composite([{input:b},{input:p}]).png().toBuffer();
 strip.push({input:await sharp(cell).resize(Z,Z).png().toBuffer(),left:k*Z,top:0});}
await sharp({create:{width:F.length*Z,height:Z,channels:4,background:{r:10,g:10,b:10,alpha:1}}})
 .composite(strip).png().toFile('tmp/worn.png');})();" <atlas.webp> <patch.webp>
```

Note that sharp applies `resize` before `composite` whatever order you call them in, so a cell has to
be composited and then resized in a second `sharp()` call — doing both in one chain fails with
"Image to composite must have same dimensions or smaller".
