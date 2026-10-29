import { readdir, appendFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'darwin') throw new Error('Xcode selection must run on a macOS host.');
const versions = (await readdir('/Applications'))
  .map(name => ({ name, parts: /^Xcode_(\d+)(?:\.(\d+))?(?:\.(\d+))?\.app$/.exec(name) }))
  .filter(row => row.parts && Number(row.parts[1]) >= 26)
  .sort((a, b) => {
    for (let i = 1; i <= 3; i++) {
      const difference = Number(b.parts[i] || 0) - Number(a.parts[i] || 0);
      if (difference) return difference;
    }
    return 0;
  });
if (!versions.length) throw new Error('This runner does not have the required Xcode 26+. Choose a newer macOS runner.');
const developer = `/Applications/${versions[0].name}/Contents/Developer`;
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `DEVELOPER_DIR=${developer}\n`);
const result = spawnSync('xcodebuild', ['-version'], {
  env: { ...process.env, DEVELOPER_DIR: developer }, stdio: 'inherit'
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

