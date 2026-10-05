import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, lstat, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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

async function snapshot(dir) {
  const out = {};
  async function walk(path, key) {
    const info = await lstat(path);
    out[key] = info.isSymbolicLink()
      ? { mode: info.mode, link: await readlink(path) }
      : {
          mode: info.mode,
          ...(info.isDirectory() ? {} : { sha: createHash('sha256').update(await readFile(path)).digest('hex') }),
        };
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await walk(join(path, name), `${key}/${name}`);
    }
  }
  await walk(dir, '.');
  return out;
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
  const installedBin = join(cwd, 'node_modules/.bin/agentos');
  const invoke = args => run(installedBin, args, { cwd });
  assert.equal(invoke(['--version']), '0.8.0', `${manager.name}: packed installed CLI version`);
  invoke(['init', '--new']);
  invoke(['skills', 'add', 'core-pack,frontend-pack,backend-pack,fullstack-pack,github-pack']);
  invoke(['templates', 'copy', 'skill:core/code-review', '--replace']);
  // Packed/installed CLI must drive the ordinary default workflow itself, not only the alias.
  await writeFile(join(cwd, '.agentos/handoff.md'), ['# Handoff', '', '## Scope', '', '- Workspace kind: single-repo', '',
    '## Current objective — 2026-09-15 (latest): packaged check', '', 'Do the work.', '',
    '## Previous objective — 2026-08-01', '', `Old narrative. ${'Older history. '.repeat(100)}`, '',
    '## Known failures', '', '- Do not treat flaky CI as passing.', ''].join('\n'));
  await writeFile(join(cwd, '.agentos/tasks.md'), ['# Tasks', '', '## Now', '', '- [ ] Do the work.', '',
    '## Done', '', `- [x] Old item. ${'Completed detail. '.repeat(100)}`, ''].join('\n'));
  const beforePreview = await snapshot(cwd);
  const defaultPreview = invoke(['compact', '--dry-run']);
  if (!/Would archive: \.agentos\/runs\/compact-rewrite-[a-f0-9]{64}\//.test(defaultPreview)) {
    throw new Error(`${manager.name}: plain default preview did not use structural compaction\n${defaultPreview}`);
  }
  assert.ok(!defaultPreview.includes('Older history. '.repeat(20)), `${manager.name}: concise preview dumped proposed/source bodies`);
  assert.deepEqual(await snapshot(cwd), beforePreview, `${manager.name}: default dry-run wrote to disk`);
  invoke(['compact']);
  const rewritten = await readFile(join(cwd, '.agentos/handoff.md'), 'utf8');
  if (rewritten.includes('Old narrative.')) throw new Error(`${manager.name}: plain default apply left history live`);
  if (!rewritten.includes('Do not treat flaky CI as passing.')) throw new Error(`${manager.name}: live warnings were lost`);
  const bundles = (await readdir(join(cwd, '.agentos/runs'), { withFileTypes: true })).filter(entry => entry.name.startsWith('compact-rewrite-'));
  if (bundles.length !== 1) throw new Error(`${manager.name}: expected one rewrite archive bundle, saw ${bundles.length}`);
  const status = invoke(['status']);
  if (!/Current handoff:/.test(status) || !/packaged check/.test(status) || /missing current objective/i.test(status)) {
    throw new Error(`${manager.name}: status did not recognize the compacted objective\n${status}`);
  }
  invoke(['doctor']);
  const afterApply = await snapshot(cwd);
  const repeat = invoke(['compact']);
  if (!/No safe reduction found; files unchanged\./.test(repeat)) throw new Error(`${manager.name}: repeat default compact was not a no-safe-reduction result\n${repeat}`);
  assert.deepEqual(await snapshot(cwd), afterApply, `${manager.name}: repeat default compact wrote to disk`);

  // Compatibility alias is the same planner, exercised separately after adding fresh history.
  await writeFile(join(cwd, '.agentos/handoff.md'), `${rewritten}\n\n## Previous objective — alias exercise\n\n${'Alias-only history. '.repeat(100)}\n`);
  invoke(['compact', '--rewrite']);
  if ((await readFile(join(cwd, '.agentos/handoff.md'), 'utf8')).includes('Alias-only history.')) {
    throw new Error(`${manager.name}: --rewrite compatibility alias did not compact fresh history`);
  }
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
  invoke(['templates', 'copy', 'agent:planner']);
  invoke(['run', 'handoff', '--reason', 'packaged-smoke']);
  const checkpoint = invoke(['compact', '--checkpoint']);
  if (!/Mode: archival checkpoint/.test(checkpoint)) throw new Error(`${manager.name}: --checkpoint did not select checkpoint mode`);
  invoke(['doctor']);
  const handoff = await readFile(join(cwd, '.agentos/handoff.md'), 'utf8');
  if (!handoff.includes('packaged-smoke')) throw new Error('Packaged handoff did not retain its pause record.');

  // Ambiguity refuses through the plain default command and leaves the whole tree byte-identical.
  await writeFile(join(cwd, '.agentos/handoff.md'), `${handoff}\n\n## Current objective — ambiguous second candidate\n\nDo something else.\n`);
  const beforeAmbiguous = await snapshot(cwd);
  const ambiguous = spawnSync(installedBin, ['compact'], { cwd, encoding: 'utf8' });
  if (ambiguous.status !== 1 || !/current-objective headings/.test(ambiguous.stdout)) {
    throw new Error(`${manager.name}: ambiguous plain compact did not refuse with candidates\n${ambiguous.stdout}\n${ambiguous.stderr}`);
  }
  assert.deepEqual(await snapshot(cwd), beforeAmbiguous, `${manager.name}: ambiguous default compact wrote to disk`);
  console.log(`PASS ${manager.name}: installed 0.8.0 bin; init; default preview/apply/status/doctor/no-op; alias; checkpoint; ambiguity refusal; 15 cards/9 references`);
}
