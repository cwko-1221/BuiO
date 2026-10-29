import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

if (process.platform !== 'darwin') throw new Error('The iPhone device build must run on a macOS/Xcode host.');
const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status ?? result.signal}: ${result.stderr || ''}`);
  return result.stdout?.trim();
}
const settings = JSON.parse(await readFile(path.join(root, 'mobile.config.json'), 'utf8'));
run('xcodebuild', [
  '-project', 'ios/App/App.xcodeproj', '-scheme', 'App',
  '-configuration', 'Release', '-sdk', 'iphoneos',
  '-destination', 'generic/platform=iOS', '-derivedDataPath', 'releases/ios-device',
  'ARCHS=arm64', 'ONLY_ACTIVE_ARCH=NO', 'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO',
  'CODE_SIGN_IDENTITY=', 'build'
]);
const app = path.join(root, 'releases/ios-device/Build/Products/Release-iphoneos/App.app');
const info = path.join(app, 'Info.plist');
const plist = key => run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, info], { capture: true });
const platform = plist('CFBundleSupportedPlatforms:0');
if (platform !== 'iPhoneOS') throw new Error(`Refusing to package a simulator app: ${platform}`);
const executable = path.join(app, plist('CFBundleExecutable'));
const macho = run('xcrun', ['vtool', '-show-build', executable], { capture: true });
if (!/platform\s+IOS\b/.test(macho) || /IOSSIMULATOR/.test(macho)) throw new Error('Mach-O is not a real iOS device executable.');
const architecture = run('xcrun', ['lipo', '-archs', executable], { capture: true });
if (architecture !== 'arm64') throw new Error(`Unexpected device architecture: ${architecture}`);
const payload = path.join(root, 'releases/ios-device-package/Payload');
await mkdir(payload, { recursive: true });
run('ditto', [app, path.join(payload, 'App.app')]);
const filename = `buio-pilot-${settings.version}-unsigned.ipa`;
const ipa = path.join(root, 'releases', filename);
run('ditto', ['-c', '-k', '--keepParent', payload, ipa]);
const bytes = await readFile(ipa);
const sha256 = createHash('sha256').update(bytes).digest('hex');
await writeFile(ipa + '.sha256', `${sha256}  ${filename}\n`);
await writeFile(path.join(root, 'releases/device-build.json'), JSON.stringify({
  filename, bytes: (await stat(ipa)).size, sha256, platform, architecture,
  bundleId: plist('CFBundleIdentifier'), version: plist('CFBundleShortVersionString'),
  minimumOS: plist('MinimumOSVersion'), signed: false,
  installation: 'Must be signed with a personal account before installation. Not a TestFlight build.'
}, null, 2) + '\n');
console.log(`Packaged unsigned device IPA: ${filename} (${bytes.length} bytes), SHA-256 ${sha256}`);
