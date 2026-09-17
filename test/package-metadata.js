import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(' ')} failed`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

test('package metadata is ready for public npm publishing', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

  assert.equal(pkg.name, 'agentos-for-projects');
  assert.equal(pkg.version, '0.7.0');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.publishConfig?.access, 'public');
  assert.equal(pkg.bin?.agentos, 'dist/cli.js');
  assert.equal(pkg.repository?.type, 'git');
  assert.equal(pkg.repository?.url, 'git+ssh://git@github.com/ralphlol123/AgentOS.git');
  assert.equal(pkg.bugs?.url, 'https://github.com/ralphlol123/AgentOS/issues');
  assert.equal(pkg.homepage, 'https://github.com/ralphlol123/AgentOS#readme');
  assert.equal(pkg.scripts?.['pack:dry-run'], 'npm pack --dry-run');
  assert.equal(pkg.scripts?.['publish:dry-run'], 'npm publish --dry-run --access public');
  assert.equal(pkg.scripts?.['release:check'], 'bun run check && bun run test && bun run smoke && bun run test:package-managers && npm publish --dry-run --access public');
});

test('packed npm tarball contains only publishable runtime files', async () => {
  const packDir = await mkdtemp(join(tmpdir(), 'agentos-metadata-pack-'));
  const json = run('npm', ['pack', '--json', '--pack-destination', packDir]);
  const [packed] = JSON.parse(json);
  const files = packed.files.map((file) => file.path).sort();

  assert.ok(files.includes('package.json'));
  assert.ok(files.includes('README.md'));
  assert.ok(files.includes('LICENSE'));
  assert.ok(files.includes('dist/cli.js'));
  assert.ok(files.includes('dist/core.js'));
  assert.ok(files.includes('dist/core.d.ts'));
  assert.ok(files.includes('dist/cli.d.ts'));
  assert.ok(files.every((file) => !file.startsWith('src/')));
  assert.ok(files.every((file) => !file.startsWith('test/')));
  assert.ok(files.every((file) => !file.startsWith('.agentos/')));
  assert.ok(files.every((file) => !file.startsWith('node_modules/')));
});
