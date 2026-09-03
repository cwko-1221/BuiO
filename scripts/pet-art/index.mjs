// Pet Paradise asset pipeline — orchestrator.
//
// Each art category lives in its own module so that parallel workstreams never edit the same
// file. This file owns the registry, the shared context, and the manifest; art modules own
// their own pixels and nothing else.
//
//   node scripts/pet-art/index.mjs                  regenerate everything
//   node scripts/pet-art/index.mjs --only=creatures regenerate one category (fast iteration)
//   node scripts/pet-art/index.mjs --list           show categories and their owning module
//
// Module contract — every art module must export:
//
//   export const category = 'creatures';
//   export async function generate(context) { ...; return { counts: { pets: 80 } }; }
//
// where `context` is { catalog, indexes, root, resolve, generatedPath, log }.
// A module that throws fails only its own category; the rest of the pipeline still completes,
// so an in-progress workstream never blocks the others.

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { catalog, indexes } = require('../../pet-app/lib/catalog.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve('pet-app/public/assets/art');

// Category → module. Ownership is listed in docs/pet-art-bible.md; keep them in sync.
const REGISTRY = [
  { category: 'creatures', module: './creatures.mjs', owner: 'workstream-1 (creatures)' },
  { category: 'animation', module: './animation.mjs', owner: 'workstream-1 (creatures)' },
  { category: 'rooms', module: './rooms.mjs', owner: 'workstream-2 (habitat)' },
  { category: 'props', module: './props.mjs', owner: 'workstream-2 (habitat)' },
  { category: 'maps', module: './maps.mjs', owner: 'workstream-3 (adventure)' },
  { category: 'enemies', module: './enemies.mjs', owner: 'workstream-3 (adventure)' },
  { category: 'effects', module: './effects.mjs', owner: 'workstream-3 (adventure)' },
  // Measures whatever the art modules produced, so it must run last.
  { category: 'metrics', module: './metrics.mjs', owner: 'pipeline' },
];

/** Content-addressed public path, matching pet-app/lib/catalog.js exactly. */
export const generatedPath = (folder, id) => {
  const hash = createHash('sha256')
    .update(`${catalog.version}:${folder}:${id}`)
    .digest('hex')
    .slice(0, 10);
  return `${folder}/${id}-${hash}.webp`;
};

/** Map a public URL (/pet/assets/art/x.webp) or a relative path to an absolute file path. */
const resolve = (publicPath) => {
  const address = String(publicPath).split('?')[0];   // art addresses carry a content stamp
  const relative = address.includes('/art/')
    ? address.split('/art/')[1]
    : address;
  return path.join(root, relative);
};

const args = process.argv.slice(2);
const only = args.find((arg) => arg.startsWith('--only='))?.split('=')[1]?.split(',');

if (args.includes('--list')) {
  console.log('Pet art categories:\n');
  for (const entry of REGISTRY) console.log(`  ${entry.category.padEnd(12)} ${entry.module.padEnd(18)} ${entry.owner}`);
  process.exit(0);
}

async function main() {
  await fs.mkdir(root, { recursive: true });
  const selected = REGISTRY.filter((entry) => !only || only.includes(entry.category));
  if (!selected.length) {
    console.error(`No categories matched --only=${only?.join(',')}. Try --list.`);
    process.exit(1);
  }

  const results = {};
  const failures = [];

  for (const entry of selected) {
    const label = entry.category;
    const started = Date.now();
    try {
      const module = await import(pathToFileURL(path.join(here, entry.module)).href);
      if (typeof module.generate !== 'function') throw new Error(`${entry.module} does not export generate()`);
      const context = {
        catalog,
        indexes,
        root,
        resolve,
        generatedPath,
        log: (message) => console.log(`    ${message}`),
      };
      const outcome = await module.generate(context);
      results[label] = outcome?.counts ?? {};
      console.log(`  ok   ${label.padEnd(12)} ${JSON.stringify(results[label])}  ${Date.now() - started}ms`);
    } catch (error) {
      const missing = error?.code === 'ERR_MODULE_NOT_FOUND';
      failures.push({ category: label, missing, message: error.message });
      console.log(`  ${missing ? 'todo' : 'FAIL'} ${label.padEnd(12)} ${missing ? `not implemented yet (${entry.owner})` : error.message}`);
    }
  }

  // The manifest is only rewritten on a full run, so partial regeneration during iteration
  // cannot leave it describing a state that never existed on disk.
  if (!only) {
    const manifest = {
      version: catalog.version,
      style: 'procedural soft-shaded flat vector; OKLab palette; 135° key light',
      generatedAt: new Date().toISOString(),
      categories: results,
      audio: {
        musicThemes: 12,
        petVoiceVariants: 20,
        sfxEvents: 15,
        generator: 'WebAudio note events; no third-party audio',
      },
    };
    await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }

  const hardFailures = failures.filter((failure) => !failure.missing);
  if (hardFailures.length) {
    console.error(`\n${hardFailures.length} categor${hardFailures.length === 1 ? 'y' : 'ies'} failed to generate.`);
    process.exit(1);
  }
  const pending = failures.filter((failure) => failure.missing).map((failure) => failure.category);
  if (pending.length) console.log(`\nPending migration: ${pending.join(', ')}`);
}

await main();
