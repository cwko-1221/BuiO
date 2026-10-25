import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { GARDEN_ROADS, GARDEN_ROAD_WIDTH, GARDEN_TRAILS, GARDEN_COURTS, CREEK, CREEK_WIDTH, GARDEN_BRIDGES } from '../pet-app/lib/park-landscape.mjs';
import { OBJECTS } from '../pet-app/lib/park-world.mjs';
const dir = path.resolve('artifacts/park-art/storybook-v3'); await fs.mkdir(dir, { recursive: true });
// The initial ImageGen composition guide is retained as layout.png/layout.svg.
// Once final art is surveyed, this script exports the current geometry separately.
const line = points => points.map(p => `${p.x},${p.y}`).join(' ');
const route = (points, width, color) => `<polyline points="${line(points)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const paths = [...GARDEN_ROADS.map(p => [p, GARDEN_ROAD_WIDTH]), ...GARDEN_TRAILS.map(p => [p, 152])];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2240" height="1568" viewBox="0 0 5120 3584"><rect width="5120" height="3584" fill="#aebc94"/><path d="M0 0H2460L2450 1900Q1600 2000 0 1800Z" fill="#819b88"/><path d="M2680 0H5120V1960Q3930 1820 2680 1790Z" fill="#b6c4a2"/><path d="M0 2010Q900 1900 2330 2110L2350 3584H0Z" fill="#c3c5a0"/>
${route(CREEK, CREEK_WIDTH + 60, '#7e9f8f')}${route(CREEK, CREEK_WIDTH, '#7cb5b2')}
${paths.map(([p, w]) => route(p, w + 34, '#9cae8d') + route(p, w, '#e2d6b9')).join('')}
${GARDEN_COURTS.map(c => `<ellipse cx="${c.x}" cy="${c.y}" rx="${c.rx}" ry="${c.ry}" fill="#e5d8ba"/>`).join('')}
${GARDEN_BRIDGES.map(b => route([b.a, b.b], b.halfWidth * 2, b.id === 'wood' ? '#aa8f6a' : '#c6b49a')).join('')}
${OBJECTS.filter(o => o.footprint).map(o => `<ellipse cx="${o.x}" cy="${o.y + (o.footprint.dy || 0)}" rx="${o.footprint.rx}" ry="${o.footprint.ry}" fill="${o.kind === 'pond' ? '#83b4b0' : o.kind === 'flowers' ? '#9ab28e' : '#c9bd9c'}"/>`).join('')}
</svg>`;
await fs.writeFile(path.join(dir, 'surveyed-layout.svg'), svg);
await sharp(Buffer.from(svg)).png().toFile(path.join(dir, 'surveyed-layout.png'));
console.log(path.join(dir, 'surveyed-layout.png'));
