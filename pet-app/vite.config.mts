import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';

function precompressRapierWasm(): Plugin {
  return {
    name: 'pet-rapier-wasm-brotli',
    apply: 'build',
    writeBundle(outputOptions, bundle) {
      if (!outputOptions.dir) return;
      for (const output of Object.values(bundle)) {
        if (output.type !== 'asset' || !/rapier_wasm3d_bg.*\.wasm$/i.test(output.fileName)) continue;
        // Pay the compression cost once at build time instead of on every student's cold load.
        const source = Buffer.from(output.source);
        const compressed = brotliCompressSync(source, {
          params: {
            [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_GENERIC,
            [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
          },
        });
        writeFileSync(join(resolve(outputOptions.dir), `${output.fileName}.br`), compressed);
      }
    },
  };
}

export default defineConfig({
  base: '/pet/',
  plugins: [precompressRapierWasm()],
  // Rapier's standard ESM build imports a WASM module. Keep it out of dependency
  // prebundling so dev mode uses one shared WebAssembly instance for its glue code.
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) { return id.includes('node_modules/phaser') ? 'phaser' : undefined; },
      },
    },
  },
});
