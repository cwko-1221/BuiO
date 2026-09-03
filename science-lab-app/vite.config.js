import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public',
  base: '/science-lab/',
  publicDir: false,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
    // Rapier's compatibility build carries its WebAssembly payload in one
    // cacheable local chunk; the application and Three.js remain independently
    // cached and comfortably below this intentional ceiling.
    chunkSizeWarningLimit: 3000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'physics', test: /@dimforge[\\/]rapier3d-compat/ },
            { name: 'three', test: /node_modules[\\/]three/ },
          ],
        },
      },
    },
  },
});
