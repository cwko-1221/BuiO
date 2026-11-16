import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const at=(path)=>fileURLToPath(new URL(path,import.meta.url));

export default defineConfig({
  root: 'public',
  base: '/science-lab/',
  publicDir: false,
  plugins:[{name:'native-material-changes-page',transformIndexHtml:{order:'pre',handler(html,context){
    if(!context.filename.replaceAll('\\','/').endsWith('/public/material-changes/index.html'))return html;
    return readFileSync(at('./material-changes/index.html'),'utf8')
      .replace('</head>','<script src="/shared/i18n.js?v=20260910-1"></script></head>')
      .replace('<script type="module" src="./app.js"></script>','<script type="module" src="/js/material-changes-entry.js"></script>');
  }}}],
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
      input:{index:at('./public/index.html'),'material-changes':at('./public/material-changes/index.html')},
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
