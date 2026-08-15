import { defineConfig } from 'vite';

export default defineConfig({
  base: '/pet/',
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
