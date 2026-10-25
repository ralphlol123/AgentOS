// v1 slice 1 regressions: prompt objective parity (1), malformed objective state (2),
// task scope separation (3) and engine-preference preservation in doctor --fix (4).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

async function single(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-v1s1-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  return root;
}

async function multi(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-v1s1-multi-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const repo of ['web', 'api']) {
    await mkdir(join(root, repo));
    await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo, scripts: { build: 'echo b', test: 'echo t' } }));
  }
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  return root;
}

const TASKS = '# Tasks\n\n## Now\n\n- [ ] Ship the objective parser.\n';

// --- 1. prompt uses the shared objective resolver -------------------------------------------------

test('prompt prints the objective from a dated "Current objective — <date> (latest): …" heading', async (t) => {
  const root = await single(t);
  await writeFile(join(root, '.agentos/tasks.md'), TASKS);
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective — 2026-09-15 (latest): ship the parser\n\nMerge the AUM work.\n\n## Next exact action\n\nRun the gates.\n');
  const r = cli(['prompt', 'claude'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^Current objective: 2026-09-15 \(latest\): ship the parser Merge the AUM work\.$/m);
  assert.doesNotMatch(r.stdout, /Current objective: \(none\)/);
});

// --- 2. missing / empty / ambiguous objective never yields an OK-looking prompt -------------------

const BROKEN = [
  { name: 'missing', handoff: '# Handoff\n\n## Scope\n\nweb\n', diagnostic: /has no recognized ## Current objective section/ },
  { name: 'empty', handoff: '# Handoff\n\n## Current objective\n\n## Scope\n\nweb\n', diagnostic: /## Current objective is empty/ },
  { name: 'ambiguous', handoff: '# Handoff\n\n## Current objective — a\n\nOne.\n\n## Current objective — b\n\nTwo.\n', diagnostic: /contains 2 current-objective headings \(lines 3, 7\)/ },
];

for (const scenario of BROKEN) {
  test(`${scenario.name} objective: prompt, status and doctor all exit 1 with the same diagnostic`, async (t) => {
    const root = await single(t);
    await writeFile(join(root, '.agentos/tasks.md'), TASKS);
    await writeFile(join(root, '.agentos/handoff.md'), scenario.handoff);
    for (const args of [['prompt', 'claude'], ['status'], ['doctor']]) {
      const r = cli(args, root);
      assert.equal(r.status, 1, `${args[0]}: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, scenario.diagnostic, args[0]);
    }
    const prompt = cli(['prompt', 'claude'], root);
    assert.doesNotMatch(prompt.stdout, /Follow AgentOS for Projects/, 'no paste-ready prompt on broken state');
    assert.equal(await readFile(join(root, '.agentos/handoff.md'), 'utf8'), scenario.handoff, 'read-only');
  });
}

// --- 3. task scope: inventory vs read vs edit ------------------------------------------------------

test('validateTaskScope separates inventory, read and edit scope and rejects malformed input', async () => {
  const { validateTaskScope } = await import('../dist/task-scope.js');
  const repos = [{ name: 'web', path: './web' }, { name: 'api', path: './api' }];
  assert.equal(validateTaskScope(undefined, repos), null, 'absent is allowed (backward compatible)');
  const scope = validateTaskScope({ read: ['api/contracts/openapi.yaml'], edit: ['web'] }, repos);
  assert.deepEqual(scope, {
    repos: ['web=./web', 'api=./api'],
    read: ['web', 'api/contracts/openapi.yaml'],
    edit: ['web'],
  });
  for (const [bad, why] of [
    [[], /mapping/],
    [{ edit: 'web' }, /edit must be a list/],
    [{ read: [''] }, /non-empty string/],
    [{ edit: ['../outside'] }, /workspace-relative/],
    [{ read: ['/etc/passwd'] }, /workspace-relative/],
    [{ edits: ['web'] }, /unknown key "edits"/],
  ]) assert.throws(() => validateTaskScope(bad, repos), why, JSON.stringify(bad));
});

test('prompt lets a frontend task read a backend contract without granting backend edit scope', async (t) => {
  const root = await multi(t);
  const path = join(root, '.agentos/project.yaml');
  await writeFile(path, `${await readFile(path, 'utf8')}task_scope:\n  read: [api/contracts/openapi.yaml]\n  edit: [web]\n`);
  const r = cli(['prompt', 'claude'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^Repos \(inventory, not permission\): .*api=\.\/api/m);
  assert.match(r.stdout, /^Read scope: web, api\/contracts\/openapi\.yaml$/m);
  assert.match(r.stdout, /^Edit scope: web\. Do not edit anything outside it\.$/m);
});

test('an invalid task_scope fails prompt and doctor instead of producing a prompt', async (t) => {
  const root = await multi(t);
  const path = join(root, '.agentos/project.yaml');
  await writeFile(path, `${await readFile(path, 'utf8')}task_scope:\n  edit: [../escape]\n`);
  for (const args of [['prompt', 'claude'], ['doctor']]) {
    const r = cli(args, root);
    assert.equal(r.status, 1, `${args[0]}: ${r.stdout}`);
    assert.match(r.stdout, /task_scope.*workspace-relative/, args[0]);
  }
});

test('a workspace without task_scope gets no scope lines in its prompt', async (t) => {
  const root = await multi(t);
  const r = cli(['prompt', 'claude'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /Read scope:|Edit scope:/);
});

// --- 6. built-in alias pairs are equivalents ------------------------------------------------------

test('agent profiles minimal and detected enable the same team; only the recorded profile label differs', async (t) => {
  const yaml = async (agents) => {
    const root = await mkdtemp(join(tmpdir(), 'agentos-v1s1-prof-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await initAgentOS({ cwd: root, mode: 'new', yes: true, agents });
    return (await readFile(join(root, '.agentos/project.yaml'), 'utf8')).replace(/^name: .*$/m, 'name: x');
  };
  assert.equal((await yaml('minimal')).replace('profile: minimal', 'profile: detected'), await yaml('detected'));
});

// --- 7. docs truth: derived facts are checked against their source --------------------------------

test('docs state the package.json version and the cli.ts command surface', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(await readFile('docs/release-readiness.md', 'utf8'), new RegExp(`^version: ${pkg.version.replace(/\./g, '\\.')}$`, 'm'));
  const commands = [...(await readFile('src/cli.ts', 'utf8')).matchAll(/command === '([a-z][a-z-]*)'/g)].map((m) => m[1]);
  const line = (await readFile('.agentos/memory.md', 'utf8')).match(/^- Current command surface.*$/m)[0];
  assert.deepEqual([...line.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]).filter((c) => c !== 'agentos help').sort(), [...new Set(commands)].sort());
});

// --- 4. doctor --fix preserves engine preferences --------------------------------------------------

test('doctor --fix leaves a user-limited engines.allowed byte-identical', async (t) => {
  const root = await single(t);
  const path = join(root, '.agentos/project.yaml');
  const limited = (await readFile(path, 'utf8')).replace(/engines:\n {2}allowed:\n(?: {4}- .*\n)+/, 'engines:\n  allowed:\n    - claude-code\n');
  assert.match(limited, /allowed:\n {4}- claude-code\n(?! {4}- )/, 'fixture check');
  await writeFile(path, limited);
  const r = cli(['doctor', '--fix'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(await readFile(path, 'utf8'), limited, 'project.yaml unchanged');
});
