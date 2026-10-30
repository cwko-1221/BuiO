import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { configuration, validateBackend } from '../scripts/config.mjs';

test('pilot stays on one explicit HTTPS backend and does not enable HTTP interception', async () => {
  const { capacitor } = await configuration();
  assert.equal(capacitor.server.url, 'https://buiosch.onrender.com');
  assert.deepEqual(capacitor.server.allowNavigation, ['buiosch.onrender.com']);
  assert.equal(capacitor.server.cleartext, false);
  assert.equal(capacitor.android.allowMixedContent, false);
  assert.equal(capacitor.ios.webContentsDebuggingEnabled, false);
  assert.equal(capacitor.ios.contentInset, 'never');
  assert.equal(capacitor.plugins?.CapacitorHttp, undefined);
  assert.deepEqual(capacitor.includePlugins, ['@capacitor/app']);
});

test('unsafe backend URLs are rejected and development HTTP is loopback-only', () => {
  for (const url of ['http://example.com', 'javascript:alert(1)', 'file:///etc/passwd',
    'https://name:password@example.com', 'https://example.com/path',
    'https://example.com?token=secret', 'https://example.com/#fragment']) {
    assert.throws(() => validateBackend(url), /HTTPS|origin/);
  }
  assert.throws(() => validateBackend('http://127.0.0.1:3000'));
  assert.equal(validateBackend('http://127.0.0.1:3000', { development: true }), 'http://127.0.0.1:3000');
  assert.throws(() => validateBackend('http://example.com', { development: true }));
});

test('all current hub modules remain accounted for, including teacher flows', async t => {
  const modules = JSON.parse(await readFile(new URL('../modules.json', import.meta.url)));
  const ids = new Set(modules.map(module => module.id));
  assert.equal(ids.size, 16);
  for (const module of modules) {
    assert.match(module.path, /^\/[a-z-]+(?:\.html)?$/);
    assert.ok(module.roles.length);
  }
  let source;
  try { source = await readFile(new URL('../../src/config.js', import.meta.url), 'utf8'); }
  catch { t.diagnostic('Hub-source coverage check is available in the full BuiO repository.'); return; }
  for (const [, id] of source.matchAll(/id:\s*'([^']+)'/g)) assert.ok(ids.has(id), `Missing hub module: ${id}`);
});

test('iOS permissions, persistent website data and native runtime are wired into the actual storyboard', async () => {
  const plist = await readFile(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8');
  for (const key of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription']) assert.ok(plist.includes(key));
  assert.ok(!plist.includes('NSAllowsArbitraryLoads'));
  const storyboard = await readFile(new URL('../ios/App/App/Base.lproj/Main.storyboard', import.meta.url), 'utf8');
  assert.ok(storyboard.includes('customClass="BuiOViewController" customModule="App"'));
  const swift = await readFile(new URL('../ios/App/App/AppDelegate.swift', import.meta.url), 'utf8');
  assert.ok(swift.includes('configuration.websiteDataStore = .default()'));
  assert.ok(swift.includes('injectionTime: .atDocumentStart'));
  assert.ok(swift.includes('override func capacitorDidLoad()'));
  assert.ok(swift.includes('webView.configuration.userContentController.addUserScript'));
});

test('prepared local fallback contains no account data and is explicit about online-only modules', async () => {
  const manifest = JSON.parse(await readFile(new URL('../www/pilot-manifest.json', import.meta.url)));
  assert.equal(manifest.mode, 'online-compatibility-pilot');
  assert.equal(manifest.modules.length, 16);
  for (const file of manifest.bundledAssets) {
    await access(new URL('../www/' + file, import.meta.url));
    const source = await readFile(new URL('../www/' + file, import.meta.url), 'utf8');
    assert.ok(!/SUPABASE_SERVICE_ROLE_KEY|SESSION_SECRET|passwordhash/.test(source));
  }
});

