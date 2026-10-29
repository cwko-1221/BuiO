import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.env.JAVA_HOME || !existsSync(process.env.JAVA_HOME)) {
  throw new Error('Set JAVA_HOME to a JDK 21 installation, then run npm run android:debug again.');
}
const command = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(command, ['assembleDebug', '--no-daemon'], {
  cwd: path.join(root, 'android'), stdio: 'inherit', shell: process.platform === 'win32'
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
mkdirSync(path.join(root, 'releases'), { recursive: true });
copyFileSync(path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'), path.join(root, 'releases/buio-pilot-debug.apk'));
console.log('Created releases/buio-pilot-debug.apk');
