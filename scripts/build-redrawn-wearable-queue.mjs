/** Build the additive production queue for every animated pet form and physical wearable. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { catalog } = require('../pet-app/lib/catalog.js');
const workspace = process.cwd();
const manifestPath = path.join(workspace, 'pet-app', 'public', 'assets', 'art', 'outfit-atlases', 'manifest.json');
const outputPath = path.join(workspace, 'pet-app', 'art-source', 'imagegen', 'redrawn-wearable-production-queue.json');
const importedPath = path.join(workspace, 'pet-app', 'public', 'assets', 'art', 'sprites', 'imported.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const imported = JSON.parse(await fs.readFile(importedPath, 'utf8'));
const ready = manifest.modular ?? {};
const physical = catalog.wearables.filter((item) => item.slot !== 'aura');
const pets = catalog.pets.filter((pet) => imported[pet.id]);
const allStages = process.argv.includes('--all-stages');
const activeStages = allStages ? [1, 2, 3, 4] : [1];

const strategy = {
  head: {
    registration: 'silhouette',
    layers: ['erase', 'patch'],
    rule: 'Replace the complete enclosed head region; helmets include the redrawn face and hide original ears.',
  },
  face: {
    registration: 'silhouette',
    layers: ['erase', 'patch'],
    rule: 'Use a tight local replacement; hide or reject the item when a helmet visor makes it physically incompatible.',
  },
  neck: {
    registration: 'silhouette',
    layers: ['erase', 'patch'],
    rule: 'Include contact shadow and compressed fur; the rear-facing row is empty unless the source redraw visibly wraps behind.',
  },
  back: {
    registration: 'fur-translate',
    layers: ['rear', 'erase', 'front'],
    rule: 'Split rear wings from visible straps; profile wings lie flat on the back and rear-facing wings render in front.',
  },
};

const directionBatches = [
  { id: 'front', cells: [1, 2, 3, 4, 5], source: 'front-strip.png' },
  { id: 'side-right', cells: [6, 7, 8, 9, 10], source: 'side-right-strip.png' },
  { id: 'back', cells: [11, 12, 13, 14, 15], source: 'back-strip.png' },
  { id: 'special', cells: [16, 17, 18, 19, 20], source: 'special-strip.png' },
];

const slotContract = {
  head: {
    anchorSpec: ['headContactArc', 'tailSafeBoundary'],
    occlusionSpec: {
      layerOrder: ['rear', 'erase', 'patch', 'front'],
      back: 'crown-or-band-only; tail remains complete foreground',
      protected: ['nearEye', 'tail'],
    },
    semanticComponents: ['headwear', 'head-contact', 'optional-ties'],
    emptyByDefault: [],
  },
  face: {
    anchorSpec: ['eyeLine', 'muzzleClearance'],
    occlusionSpec: {
      layerOrder: ['rear', 'erase', 'patch', 'front'],
      back: 'empty; face accessories are not visible from the rear',
      protected: ['nearEye', 'muzzle', 'tail'],
    },
    semanticComponents: ['facewear', 'eye-contact'],
    emptyByDefault: ['back'],
  },
  neck: {
    anchorSpec: ['neckContactArc', 'pendantDrop'],
    occlusionSpec: {
      layerOrder: ['rear', 'erase', 'patch', 'front'],
      back: 'empty unless a frozen spec explicitly exposes a clasp',
      protected: ['head', 'tail'],
    },
    semanticComponents: ['collar', 'pendant', 'contact-shadow'],
    emptyByDefault: ['back'],
  },
  back: {
    anchorSpec: ['backSpine', 'tailSafeBoundary'],
    occlusionSpec: {
      layerOrder: ['rear', 'erase', 'patch', 'front'],
      back: 'rear pack/wing behind body; tail stays foreground',
      protected: ['nearEye', 'tail'],
    },
    semanticComponents: ['rear', 'strap-or-edge', 'front-occluder'],
    emptyByDefault: [],
  },
};
const jobs = [];
for (const pet of pets) {
  for (const stage of activeStages) {
    const baseAtlasUrl = pet.atlas[stage - 1].split('?')[0];
    const baseAtlas = path.join('pet-app', 'public', baseAtlasUrl.replace(/^\/pet\//, '')).replaceAll('\\', '/');
    for (const item of physical) {
      const key = `${pet.id}:${stage}:${item.id}`;
      const sourceFolder = path.join('pet-app', 'art-source', 'imagegen', 'baked-wearables', `${pet.id}-${stage}`).replaceAll('\\', '/');
      const contract = slotContract[item.slot];
      jobs.push({
        contractVersion: 'direction-aware-v1',
        key,
        petId: pet.id,
        stage,
        wearableId: item.id,
        slot: item.slot,
        status: ready[key] ? 'ready' : 'pending-redraw',
        baseAtlas,
        sourceFolder,
        expectedFullRedraw: `${sourceFolder}/${item.id}-dressed-atlas-v1.png`,
        directionBatch: directionBatches.map((batch) => ({
          ...batch,
          source: `${sourceFolder}/${item.id}-${batch.source}`,
          transform: { resize: false, rotate: false, mirror: false, translate: false },
        })),
        anchorSpec: contract.anchorSpec,
        occlusionSpec: contract.occlusionSpec,
        semanticComponents: contract.semanticComponents,
        emptyByDefault: contract.emptyByDefault,
        strategy: strategy[item.slot],
        published: ready[key] ?? null,
      });
    }
  }
}
const readyJobs = jobs.filter((job) => job.status === 'ready').length;
const document = {
  version: 1,
  generatedAt: new Date().toISOString(),
  scope: {
    pets: pets.map((pet) => pet.id),
    activeStages,
    deferredStages: allStages ? [] : [2, 3, 4],
    deferredJobs: allStages ? 0 : pets.length * 3 * physical.length,
    physicalWearablesPerForm: physical.length,
    aurasExcludedAsSharedEffects: catalog.wearables.filter((item) => item.slot === 'aura').length,
    totalJobs: jobs.length,
    readyJobs,
    pendingJobs: jobs.length - readyJobs,
  },
  qualityGates: [
    'The source is a complete pet + one wearable redraw, never standalone accessory art.',
    'All 20 atlas cells preserve pet identity, action, facing, shared scale and bottom-centre anchor.',
    'The replacement patch contains only sampled pixels from the complete redraw.',
    'Erase masks remove every shipped body pixel that the redraw encloses or replaces.',
    'Front/rear layer order matches anatomy for front, profile, back and special poses.',
    'The modular result is reviewed as a contact sheet and in-game in all four player facings.',
    'No animated pet ever falls back to legacy free-positioned wearable artwork.',
    'Generate front, side-right, back and special strips independently, then pack raw rows without transforms.',
    'Side-left is runtime exact-flip of side-right; it is never independently generated or registered.',
    'Face and neck rear cells are empty by default; any exception requires a frozen item spec and critic evidence.',
    'Every accepted layer reports its anchor, occlusion order, source hashes and transform flags.',
  ],
  jobs,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
console.log(JSON.stringify(document.scope, null, 2));
console.log(outputPath);
