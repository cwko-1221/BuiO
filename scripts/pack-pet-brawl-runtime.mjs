import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { FIGHTERS } from '../pet-app/lib/brawl/catalog.mjs';
// Repack only the two legacy 256px pages of the three original fighters.
// Their newer attacks replace half the old poses. Ship the used pixels once,
// at their original resolution, without changing animation or combat timing.
// High-quality WebP preserves alpha exactly; check decoded image error too.
const root = path.resolve(import.meta.dirname, '..');
const dist = path.resolve(process.argv[2] || path.join(root, 'pet-app/dist'));
const manifestPath = path.join(dist, 'assets/art/brawl/manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const require = createRequire(import.meta.url);
const assets = require('../pet-app/lib/brawl/assets.cjs').completeAssets(manifest, FIGHTERS);
const local = url => {
    if (!url.startsWith('/pet/assets/'))
        throw new Error('Unexpected atlas path: ' + url);
    const file = path.resolve(dist, url.slice('/pet/'.length));
    if (!file.startsWith(dist + path.sep))
        throw new Error('Atlas outside published build');
    return file;
};
const report = [];
for (const id of ['starpatch-cat', 'cloud-ear-dog', 'pudding-pig']) {
    const fighter = assets.fighters[id];
    if (fighter.runtimePacked)
        continue;
    const used = [new Set(), new Set()];
    for (const clip of Object.values(fighter.clips)) {
        if (clip.page > 1)
            continue;
        if (clip.frames)
            throw new Error('Legacy clips must remain contiguous: ' + id);
        for (let i = 0; i < clip.count; i++)
            used[clip.page].add(clip.start + i);
    }
    const sources = await Promise.all(fighter.pages.slice(0, 2).map(async (url) => {
        const file = local(url), image = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        if (image.info.width !== 2048 || image.info.height !== 2048 || image.info.channels !== 4)
            throw new Error('Unexpected legacy atlas geometry: ' + id);
        return { ...image, bytes: (await fs.stat(file)).size };
    }));
    const cells = used.flatMap((set, page) => [...set].sort((a, b) => a - b).map(frame => ({ page, frame })));
    const columns = 8, width = columns * 256, height = Math.ceil(cells.length / columns) * 256;
    if (width * height >= 2048 * 2048 * 2 * .8)
        continue;
    const raw = Buffer.alloc(width * height * 4), remap = new Map();
    cells.forEach(({ page, frame }, index) => {
        remap.set(page + ':' + frame, index);
        for (let row = 0; row < 256; row++) {
            const from = ((Math.floor(frame / 8) * 256 + row) * 2048 + frame % 8 * 256) * 4;
            const to = ((Math.floor(index / columns) * 256 + row) * width + index % columns * 256) * 4;
            sources[page].data.copy(raw, to, from, from + 256 * 4);
        }
    });
    const image = await sharp(raw, { raw: { width, height, channels: 4 } }).webp({ quality: 98, alphaQuality: 100, effort: 5 }).toBuffer();
    const decoded = await sharp(image).ensureAlpha().raw().toBuffer();
    let error = 0, squared = 0, samples = 0;
    for (let i = 0; i < raw.length; i += 4) {
        if (raw[i + 3] !== decoded[i + 3])
            throw new Error('Atlas encoding changed transparency: ' + id);
        if (raw[i + 3])
            for (let c = 0; c < 3; c++) {
                const delta = raw[i + c] - decoded[i + c];
                error += Math.abs(delta);
                squared += delta * delta;
                samples++;
            }
    }
    const meanError = error / samples, psnr = 10 * Math.log10(255 * 255 / (squared / samples));
    const beforeBytes = sources.reduce((sum, s) => sum + s.bytes, 0);
    if (meanError > 2.5 || psnr < 37 || image.length >= beforeBytes)
        throw new Error('Atlas failed image quality or download budget: ' + id);
    const hash = createHash('sha256').update(image).digest('hex').slice(0, 12);
    const url = `/pet/assets/art/brawl/${id}-runtime-${hash}.webp`;
    await fs.writeFile(local(url), image);
    const packed = structuredClone(fighter);
    packed.runtimePacked = true;
    packed.pages = [url, ...fighter.pages.slice(2)];
    packed.pageLayouts = {};
    for (const [page, layout] of Object.entries(fighter.pageLayouts || {}))
        if (Number(page) > 1)
            packed.pageLayouts[Number(page) - 1] = layout;
    for (const clip of Object.values(packed.clips)) {
        if (clip.page > 1) {
            clip.page--;
            continue;
        }
        const start = remap.get(clip.page + ':' + clip.start);
        for (let i = 0; i < clip.count; i++)
            if (remap.get(clip.page + ':' + (clip.start + i)) !== start + i)
                throw new Error('Clip order changed: ' + id);
        clip.page = 0;
        clip.start = start;
    }
    manifest.fighters[id] = packed;
    delete manifest.fighterSkillAnimations?.[id];
    delete manifest.fighterAttackAnimations?.[id];
    report.push({ id, alphaIdentical: true, meanColorError: meanError, psnr, usedFrames: cells.length,
        beforeBytes, afterBytes: image.length,
        beforeTextureBytes: 2 * 2048 * 2048 * 4, afterTextureBytes: width * height * 4 });
}
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ packedBattleAtlases: report }));
