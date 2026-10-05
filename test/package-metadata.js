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
  assert.equal(pkg.version, '0.9.0');
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

// Generated runtime is not committed. 42 tracked files (710 KB) rode along in every PR (5-32% of each diff),
// the CI "committed runtime matches source" gate only policed that duplication, and nothing in CI or the
// published package needs the committed copy: every job builds first, and `prepack` builds for npm/bun pack.
// `prepare` rebuilds after `bun install` / `npm ci` / `pnpm install` in a checkout, so a checkout that is
// installed from (the README's "From a local checkout") never lacks dist/.
test('dist/ is generated, not committed: ignored, rebuilt on install, and not policed by CI', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const ignore = (await readFile(join(root, '.gitignore'), 'utf8')).split(/\r?\n/).map((line) => line.trim());
  assert.ok(ignore.includes('dist/') || ignore.includes('/dist') || ignore.includes('/dist/'), '.gitignore must ignore dist/');

  const tracked = run('git', ['ls-files', 'dist']);
  assert.equal(tracked, '', `dist/ must not be tracked, found:\n${tracked.split('\n').slice(0, 5).join('\n')}`);

  assert.equal(pkg.scripts?.prepare, pkg.scripts?.build, '`prepare` must run the same build as `build`, so installing in a checkout produces dist/');
  assert.match(pkg.scripts?.prepack ?? '', /tsc -p tsconfig\.json/, '`prepack` must still build for pack/publish');
  assert.ok(pkg.files.includes('dist'), 'the published package still ships dist/');

  const ci = await readFile(join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.doesNotMatch(ci, /git diff --exit-code -- dist/, 'CI must not require dist/ to be committed');
});
