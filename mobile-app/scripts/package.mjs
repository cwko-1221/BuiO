import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set(['node_modules', '.git', '.gradle', '.idea', 'build', 'Pods', 'DerivedData', 'xcuserdata',
  'test-results', 'releases', 'capacitor-cordova-android-plugins', 'capacitor-cordova-ios-plugins']);
const allowedRoots = new Set(['android', 'ios', 'scripts', 'tests', 'web', 'www', 'artwork', 'ci']);
const allowedFiles = new Set(['package.json', 'package-lock.json', 'mobile.config.json', 'modules.json', 'capacitor.config.json', '.gitignore', 'README.md', 'VALIDATION.md', 'CLOUD-INSTALL.md']);
const zip = new JSZip();
const prefix = 'buio-mobile/';
let count = 0;
async function collect(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (excluded.has(entry.name) || /(?:\.p12|\.mobileprovision|\.jks|\.keystore|\.log|\.xcuserstate)$/.test(entry.name)
      || entry.name.startsWith('.env') || entry.name === 'local.properties') continue;
    if (!relative && !(entry.isDirectory() ? allowedRoots.has(entry.name) : allowedFiles.has(entry.name))) continue;
    const name = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isDirectory()) await collect(path.join(directory, entry.name), name);
    else if (entry.isFile()) {
      zip.file(prefix + name, await readFile(path.join(directory, entry.name)), {
        unixPermissions: entry.name === 'gradlew' ? 0o755 : 0o644
      });
      count++;
    }
  }
}
await collect(root);
const output = path.join(root, 'releases');
await mkdir(output, { recursive: true });
const file = path.join(output, 'buio-mobile-0.1.0-source.zip');
const data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' });
await writeFile(file, data);
console.log(`Packaged ${count} files, ${data.length} bytes: ${file}`);

