/**
 * Draw a creature wearing a thing, from every side, without opening a browser.
 *
 * Getting an accessory to sit on a four-legged creature is a question of looking at it, and doing
 * that through the game means a build, a server, a login and a screenshot for each attempt. This
 * composites the same pose the room would draw, using the very placement rules the room uses —
 * wearableLayout.ts is transpiled and imported rather than copied, because a preview that has
 * drifted from the game is worse than none.
 *
 *   npm run fit -- starpatch-cat 1 head-01 back-02 aura-01
 *   npm run fit -- starpatch-cat 1 --slot head
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { catalog } = require('../pet-app/lib/catalog.js');
const ts = require(require.resolve('typescript', { paths: [path.resolve('pet-app')] }));

/** The room's own placement rules, compiled on the spot so there is one copy of them. */
async function loadLayout() {
  const source = await fs.readFile('pet-app/src/game/wearableLayout.ts', 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const stripped = outputText.replace(/^import[^\n]*\n/gm, '');
  return import(`data:text/javascript;base64,${Buffer.from(stripped).toString('base64')}`);
}

const ART = 'pet-app/public/assets/art/';
const onDisk = (url) => ART + url.split('/art/')[1].split('?')[0];

const FACINGS = ['front', 'right', 'back', 'left'];

async function main() {
  const [speciesId, stageArg, ...rest] = process.argv.slice(2);
  if (!speciesId) {
    console.error('usage: npm run fit -- <species> <stage> <wearable id…>   |   --slot <slot>');
    process.exit(1);
  }
  const stage = Number(stageArg) || 1;
  const slotAt = rest.indexOf('--slot');
  const wanted = slotAt >= 0
    ? catalog.wearables.filter((item) => item.slot === rest[slotAt + 1])
    : rest.filter((id) => !id.startsWith('--')).map((id) => catalog.wearables.find((item) => item.id === id)).filter(Boolean);
  if (!wanted.length) throw new Error('nothing to preview');

  const pet = catalog.pets.find((entry) => entry.id === speciesId);
  if (!pet?.animated) throw new Error(`${speciesId} has no imported pose sheet`);

  const { placeWearable, UNMEASURED } = await loadLayout();
  const canvasMode = rest.includes('--canvas');
  const layout = catalog.animation;
  const cell = layout.frameWidth;
  const atlas = await sharp(onDisk(pet.atlas[stage - 1])).ensureAlpha().png().toBuffer();

  const tiles = [];
  const label = [];
  for (const [row, item] of wanted.entries()) {
    for (const [column, facing] of FACINGS.entries()) {
      const seen = facing === 'left' ? 'right' : facing;
      const mirrored = facing === 'left';
      const rowIndex = Math.max(0, layout.directions.indexOf(seen));

      // The creature, at rest, in the direction being drawn.
      const pose = await sharp(atlas)
        .extract({ left: 0, top: rowIndex * cell, width: cell, height: cell })
        .flop(mirrored)
        .png().toBuffer();

      const anchors = (seen === 'front' ? pet.anchors?.[stage - 1] : pet.facingAnchors?.[stage - 1]?.[seen])
        ?? pet.anchors?.[stage - 1] ?? UNMEASURED;
      const art = seen === 'front' ? item.art : (item.views?.[seen] ?? item.art);
      const box = (seen === 'front' ? item.content : item.viewContent?.[seen]) ?? item.content
        ?? { x: 0, y: 0, width: 1, height: 1 };
      const frontBox = item.content ?? { x: 0, y: 0, width: 1, height: 1 };
      const place = canvasMode
        ? { x: 0.5, y: 0.82, size: 1, originX: 0.5, originY: 0.82, behind: item.slot === 'back' || item.slot === 'aura' }
        : placeWearable(
          anchors, item.slot, box, 1, seen, item.fit, frontBox, item.profileSizing,
          seen === 'right' ? item.profileOffset : undefined,
        );
      if (!place) continue;

      const size = Math.max(1, Math.round(place.size * cell));
      const piece = await sharp(onDisk(art)).resize(size, size, { fit: 'fill' }).flop(mirrored).png().toBuffer();
      const overlayArt = item.overlays?.[seen];
      const overlay = overlayArt
        ? await sharp(onDisk(overlayArt)).resize(size, size, { fit: 'fill' }).flop(mirrored).png().toBuffer()
        : null;
      const centre = mirrored ? 1 - place.x : place.x;
      const left = Math.round(centre * cell - size * (mirrored ? 1 - place.originX : place.originX));
      const top = Math.round(place.y * cell - size * place.originY);

      // Wings, capes and auras are deliberately wider than one atlas cell. Sharp refuses to
      // composite an input larger than its destination even when the overflow is meant to be
      // cropped, so draw on a padded canvas first and take the cell-sized window afterwards.
      // This is exactly what the Phaser camera does when a display object crosses a sprite cell.
      const margin = Math.max(0, Math.ceil(Math.max(
        cell, size, -left, -top, left + size - cell, top + size - cell,
      )));
      const baseBehind = item.slot === 'back'
        ? seen === 'front' || Boolean(overlay) || (seen === 'right' && item.sideBehind)
        : place.behind;
      const layers = baseBehind
        ? [{ input: piece, left: left + margin, top: top + margin }, { input: pose, left: margin, top: margin }]
        : [{ input: pose, left: margin, top: margin }, { input: piece, left: left + margin, top: top + margin }];
      if (overlay) layers.push({ input: overlay, left: left + margin, top: top + margin });
      const padded = await sharp({ create: {
        width: cell + margin * 2, height: cell + margin * 2, channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      } })
        .composite(layers)
        .png().toBuffer();
      const dressed = await sharp(padded)
        .extract({ left: margin, top: margin, width: cell, height: cell })
        .png().toBuffer();
      tiles.push({ input: dressed, left: column * cell, top: row * cell });
    }
    label.push(item.id);
  }

  // --landmarks draws what was measured over the pose, which is the only way to tell a bad
  // placement rule apart from a bad measurement.
  if (rest.includes('--landmarks')) {
    const marks = [];
    for (const [column, facing] of FACINGS.entries()) {
      const seen = facing === 'left' ? 'right' : facing;
      const mirrored = facing === 'left';
      const rowIndex = Math.max(0, layout.directions.indexOf(seen));
      const pose = await sharp(atlas)
        .extract({ left: 0, top: rowIndex * cell, width: cell, height: cell })
        .flop(mirrored).png().toBuffer();
      const a = (seen === 'front' ? pet.anchors?.[stage - 1] : pet.facingAnchors?.[stage - 1]?.[seen])
        ?? pet.anchors?.[stage - 1] ?? UNMEASURED;
      const line = (y, colour) => `<line x1="0" y1="${y * cell}" x2="${cell}" y2="${y * cell}" stroke="${colour}" stroke-width="1.5"/>`;
      const span = (y, half, colour) => `<line x1="${(0.5 - half / 2) * cell}" y1="${y * cell}" x2="${(0.5 + half / 2) * cell}" y2="${y * cell}" stroke="${colour}" stroke-width="4"/>`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${cell}">${line(a.top, '#ff2d55')}${line(a.eye, '#00a8ff')}${line(a.bottom, '#22c55e')}${span(a.top + 0.02, a.head, '#ff9500')}${span(a.eye + 0.02, a.face, '#a855f7')}<line x1="${a.centre * cell}" y1="0" x2="${a.centre * cell}" y2="${cell}" stroke="#666" stroke-width="1" stroke-dasharray="3 3"/></svg>`;
      marks.push({ input: await sharp(pose).composite([{ input: Buffer.from(svg) }]).png().toBuffer(),
        left: column * cell, top: wanted.length * cell });
    }
    tiles.push(...marks);
  }

  const mode = canvasMode ? '-canvas' : '';
  const slotName = slotAt >= 0 ? `-${rest[slotAt + 1]}` : '';
  const out = path.join('tmp', `fit-${speciesId}-${stage}${slotName}${mode}.png`);
  await fs.mkdir('tmp', { recursive: true });
  await sharp({ create: { width: FACINGS.length * cell, height: (wanted.length + (rest.includes('--landmarks') ? 1 : 0)) * cell, channels: 4, background: { r: 250, g: 245, b: 238, alpha: 1 } } })
    .composite(tiles).png().toFile(out);
  console.log(`${out}   rows: ${label.join(', ')}   columns: ${FACINGS.join(', ')}`);
}

await main();
