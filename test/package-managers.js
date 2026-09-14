import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packDir = await mkdtemp(join(tmpdir(), 'agentos-pack-'));

function run(command, args, options = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'npm_config_allow_scripts') delete env[key];
  }
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    env,
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

function has(command) {
  return spawnSync(command, ['--version'], { encoding: 'utf8', stdio: 'pipe' }).status === 0;
}

const packOutput = run('npm', ['pack', '--pack-destination', packDir]);
const tarball = join(packDir, packOutput.split(/\r?\n/).at(-1));
const managers = [
  {
    name: 'npm',
    command: 'npm',
    install: ['install', tarball],
    exec: ['exec', 'agentos', '--', 'init', '--new', '--dry-run'],
  },
  {
    name: 'pnpm',
    command: 'pnpm',
    install: ['add', tarball],
    exec: ['exec', 'agentos', 'init', '--new', '--dry-run'],
  },
  {
    name: 'bun',
    command: 'bun',
    install: ['add', tarball],
    exec: ['run', 'agentos', 'init', '--new', '--dry-run'],
  },
];

console.log(`TARBALL=${tarball}`);

for (const manager of managers) {
  if (!has(manager.command)) {
    throw new Error(`Required package manager missing: ${manager.name}. Install npm, pnpm, and Bun before compatibility verification.`);
  }
  const cwd = await mkdtemp(join(tmpdir(), `agentos-${manager.name}-`));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2));
  run(manager.command, manager.install, { cwd });
  const output = run(manager.command, manager.exec, { cwd });
  if (!/AgentOS dry run/.test(output)) throw new Error(`${manager.name} did not execute agentos dry-run`);
  const installedCli = join(cwd, 'node_modules/agentos-for-projects/dist/cli.js');
  const invoke = args => run(process.execPath, [installedCli, ...args], { cwd });
  invoke(['init', '--new']);
  invoke(['skills', 'add', 'core-pack,frontend-pack,backend-pack,fullstack-pack,github-pack']);
  invoke(['templates', 'copy', 'skill:core/code-review', '--replace']);
  let references = 0, cards = 0;
  const packageRoot = join(cwd, 'node_modules/agentos-for-projects');
  for (const category of ['core', 'frontend', 'backend', 'fullstack', 'github']) {
    const sourceDir = join(packageRoot, 'templates/skills', category);
    for (const file of await readdir(sourceDir)) {
      if (!file.endsWith('.md')) continue;
      const id = file.slice(0, -3);
      const installedDir = join(cwd, '.agentos/skills', category, id);
      const card = await readFile(join(installedDir, 'SKILL.md'), 'utf8');
      assert.equal(card.replace(/^mode: summary$/m, 'mode: full'), await readFile(join(sourceDir, file), 'utf8'));
      cards++;
      const refDir = join(sourceDir, id, 'references');
      for (const name of await readdir(refDir).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
        assert.deepEqual(await readFile(join(installedDir, 'references', name)), await readFile(join(refDir, name)));
        references++;
      }
    }
  }
  assert.equal(cards, 15);
  assert.equal(references, 9);
  invoke(['skills', 'remove', 'code-review']);
  await assert.rejects(() => lstat(join(cwd, '.agentos/skills/core/code-review')), { code: 'ENOENT' });
  invoke(['templates', 'copy', 'agent:data-engineer']);
  invoke(['run', 'handoff', '--reason', 'packaged-smoke']);
  invoke(['compact']);
  invoke(['doctor']);
  const handoff = await readFile(join(cwd, '.agentos/handoff.md'), 'utf8');
  if (!handoff.includes('packaged-smoke')) throw new Error('Packaged handoff did not retain its pause record.');
  console.log(`PASS ${manager.name}: installed bin, init, 15 cards/9 references byte parity, copy, removal, registry role, handoff, checkpoint, doctor`);
}
