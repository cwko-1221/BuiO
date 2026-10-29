import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  throw new Error('iOS compilation requires macOS and Xcode. No iOS binary was created on this host.');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync('xcodebuild', [
  '-project', 'ios/App/App.xcodeproj', '-scheme', 'App',
  '-configuration', 'Debug', '-sdk', 'iphonesimulator',
  '-destination', 'generic/platform=iOS Simulator',
  '-derivedDataPath', 'releases/ios-simulator',
  'CODE_SIGNING_ALLOWED=NO', 'build'
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);

