import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import JSZip from 'jszip';

const root = fileURLToPath(new URL('../', import.meta.url));
const settings = JSON.parse(await readFile(path.join(root, 'mobile.config.json'), 'utf8'));
const file = process.argv[2] || path.join(root, `releases/buio-pilot-${settings.version}-unsigned.ipa`);
const buffer = await readFile(file);
const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
const executable = zip.file('Payload/App.app/App');
if (!executable || !zip.file('Payload/App.app/Info.plist')) throw new Error('IPA is missing the expected app bundle.');
const macho = await executable.async('nodebuffer');
if (macho.readUInt32LE(0) !== 0xfeedfacf || macho.readUInt32LE(4) !== 0x0100000c) {
  throw new Error('Executable is not an ARM64 Mach-O.');
}
const commands = macho.readUInt32LE(16);
let offset = 32, platform;
for (let index = 0; index < commands; index++) {
  if (offset + 8 > macho.length) throw new Error('Truncated Mach-O command.');
  const command = macho.readUInt32LE(offset), size = macho.readUInt32LE(offset + 4);
  if (size < 8 || offset + size > macho.length) throw new Error('Invalid Mach-O command size.');
  if (command === 0x32) {
    if (size < 24) throw new Error('Invalid build-version command.');
    platform = macho.readUInt32LE(offset + 8);
  }
  offset += size;
}
if (platform !== 2) throw new Error(`Expected physical iOS platform 2, got ${platform}; simulator builds cannot be installed on iPhone.`);
const summary = {
  file: path.basename(file), bytes: buffer.length,
  sha256: createHash('sha256').update(buffer).digest('hex'),
  architecture: 'arm64', platform: 'iOS device', zipCRC: 'passed',
  provisioningProfile: Boolean(zip.file('Payload/App.app/embedded.mobileprovision')),
  requiresPersonalSigning: true
};
console.log(JSON.stringify(summary, null, 2));
