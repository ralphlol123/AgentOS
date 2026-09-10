import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const pkgUrl = new URL('../package.json', import.meta.url);

test('CLI --version matches package.json version', async () => {
  const pkg = JSON.parse(await readFile(pkgUrl, 'utf8'));
  const result = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), pkg.version);
});
