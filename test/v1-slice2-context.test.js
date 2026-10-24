// v1 slice 2: task-specific context builder (`agentos context`).
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const cli = (args, cwd, env = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
const json = (args, cwd, env) => {
  const r = cli([...args, '--json'], cwd, env);
  return { r, bundle: JSON.parse(r.stdout) };
};

const HANDOFF = '# Handoff\n\n## Current objective\n\nShip the token rotation feature.\n\n## Current state\n\nRotation endpoint drafted.\n\n## Next exact action\n\nWire the web settings page.\n\n## Protected files / do not touch\n\n- api/migrations/\n- .env files\n';
const DECISIONS = [
  '# Decisions', '',
  '## 2026-10-01 — Auth tokens: rotate weekly', '', '- Status: accepted', '- Decision: rotate auth tokens every 7 days.', '',
  '## 2026-09-01 — Auth tokens: rotate monthly', '', '- Status: superseded', '- Decision: rotate auth tokens every 30 days.', '',
  '## 2026-08-01 — Logging format', '', '- Status: accepted', '- Decision: JSON lines.', '',
].join('\n');

// Multi-repo fixture (web + api) under one parent so the whole parent can be snapshotted.
async function multi(t, { scope = true } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-v1s2-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  await mkdir(join(base, 'tmp'));
  for (const repo of ['web', 'api']) {
    await mkdir(join(root, repo), { recursive: true });
    await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo, scripts: { build: 'echo b', test: 'echo t' } }));
  }
  await mkdir(join(root, 'api/contracts'));
  await writeFile(join(root, 'api/contracts/openapi.yaml'), 'openapi: 3.0.0\n');
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), HANDOFF);
  await writeFile(join(root, '.agentos/decisions.md'), DECISIONS);
  if (scope) {
    const path = join(root, '.agentos/project.yaml');
    await writeFile(path, `${await readFile(path, 'utf8')}task_scope:\n  read: [api/contracts/openapi.yaml]\n  edit: [web]\n`);
  }
  return { base, root };
}

const ids = (list) => list.map((item) => item.id);
const reasonOf = (bundle, id) => bundle.omitted.find((item) => item.id === id)?.reason;

// --- selection: decision subject match, superseded sibling ----------------------------------------

test('a task naming a decision subject selects it; the superseded sibling is omitted as superseded', async (t) => {
  const { root } = await multi(t);
  // "decision" must not match every decision via its `decision:` id prefix (found while dogfooding).
  const { r, bundle } = json(['context', 'claude', '--task', 'Implement the auth tokens rotation decision in the web settings'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(ids(bundle.included).includes('decision:2026-10-01-auth-tokens-rotate-weekly'), ids(bundle.included).join(','));
  assert.equal(reasonOf(bundle, 'decision:2026-09-01-auth-tokens-rotate-monthly'), 'superseded');
  assert.equal(reasonOf(bundle, 'decision:2026-08-01-logging-format'), 'no-match');
  assert.deepEqual(bundle.conflicts, [], 'a superseded record never conflicts');
});

test('--include-superseded shows the superseded record labelled', async (t) => {
  const { root } = await multi(t);
  const { r, bundle } = json(['context', 'claude', '--task', 'auth tokens', '--include-superseded'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const item = bundle.included.find((entry) => entry.id === 'decision:2026-09-01-auth-tokens-rotate-monthly');
  assert.ok(item, 'included');
  assert.match(item.reason, /superseded/);
  assert.match(bundle.text, /\[superseded\]/);
});

// --- scope: filter before rank ---------------------------------------------------------------------

test('records outside read scope are omitted out-of-scope; the backend contract in read is included; edit stays web', async (t) => {
  const { root } = await multi(t);
  const { r, bundle } = json(['context', 'claude', '--task', 'settings page'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(bundle.scope.edit, ['web']);
  assert.deepEqual(bundle.scope.read, ['web', 'api/contracts/openapi.yaml']);
  assert.ok(ids(bundle.included).includes('read:api/contracts/openapi.yaml'));
  assert.ok(ids(bundle.included).includes('repo:web'));
  assert.ok(ids(bundle.included).includes('verify:web'));
  assert.equal(reasonOf(bundle, 'repo:api'), 'out-of-scope');
  assert.equal(reasonOf(bundle, 'verify:api'), 'out-of-scope');
  assert.match(bundle.text, /^Edit scope: web\. Do not edit anything outside it\.$/m);
});

test('--scope narrows the project scope and never widens edit', async (t) => {
  const { root } = await multi(t);
  const { r, bundle } = json(['context', 'claude', '--scope', 'api/contracts/openapi.yaml'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(bundle.scope.read, ['api/contracts/openapi.yaml']);
  assert.deepEqual(bundle.scope.edit, [], 'web is no longer in scope, so it cannot stay editable');
  assert.equal(reasonOf(bundle, 'repo:web'), 'out-of-scope');
  const bad = cli(['context', 'claude', '--scope', '../outside'], root);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /workspace-relative/);
});

test('a scope path that does not exist is reported under missing as a warning', async (t) => {
  const { root } = await multi(t);
  const { r, bundle } = json(['context', 'claude', '--scope', 'web,api/contracts/nope.yaml'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(bundle.missing.some((entry) => /api\/contracts\/nope\.yaml/.test(entry)), bundle.missing.join('|'));
});

// --- gaps and conflicts ----------------------------------------------------------------------------

test('a missing agent card is listed under missing; an unknown role is an error', async (t) => {
  const { root } = await multi(t);
  await unlink(join(root, '.agentos/agents/tester.md'));
  const { r, bundle } = json(['context', 'claude', '--role', 'tester'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(bundle.role, 'tester');
  assert.ok(bundle.missing.some((entry) => /\.agentos\/agents\/tester\.md/.test(entry)), bundle.missing.join('|'));
  const unknown = cli(['context', 'claude', '--role', 'astronaut'], root);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /astronaut.*not an enabled agent/);
});

test('a missing objective is fatal: ok:false, listed under missing, exit 1', async (t) => {
  const { root } = await multi(t);
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Scope\n\nweb\n');
  const { r, bundle } = json(['context', 'claude'], root);
  assert.equal(r.status, 1);
  assert.equal(bundle.ok, false);
  assert.ok(bundle.missing.some((entry) => /Current objective/.test(entry)));
});

test('two current decisions on the same subject are listed under conflicts', async (t) => {
  const { root } = await multi(t);
  await writeFile(join(root, '.agentos/decisions.md'), '# Decisions\n\n## 2026-10-02 — Package manager: npm\n\n- Status: accepted\n\n### 2026-10-09 — Package manager: bun\n\n- Status: accepted\n');
  const { r, bundle } = json(['context', 'claude', '--task', 'switch the package manager'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(bundle.conflicts.length, 1, JSON.stringify(bundle.conflicts));
  assert.deepEqual(bundle.conflicts[0].ids.sort(), ['decision:2026-10-02-package-manager-npm', 'decision:2026-10-09-package-manager-bun']);
  assert.match(bundle.text, /^## Conflicts$/m);
});

// --- budget ----------------------------------------------------------------------------------------

test('mandatory content over budget: ok:false with overflow, exit 1, nothing rendered or truncated', async (t) => {
  const { root } = await multi(t);
  const long = 'Rotate tokens safely. '.repeat(400);
  await writeFile(join(root, '.agentos/handoff.md'), HANDOFF.replace('Ship the token rotation feature.', long));
  const { r, bundle } = json(['context', 'claude', '--budget', '1000'], root);
  assert.equal(r.status, 1);
  assert.equal(bundle.ok, false);
  assert.equal(bundle.overflow.budget, 1000);
  assert.ok(bundle.overflow.needed > 1000);
  assert.deepEqual(bundle.overflow.mandatory.map((item) => item.kind).sort(), ['constraints', 'objective', 'role', 'scope']);
  assert.ok(bundle.overflow.mandatory.find((item) => item.kind === 'objective').tokens >= Math.ceil(long.trim().length / 4));
  assert.doesNotMatch(bundle.text, /Rotate tokens safely/, 'no partial objective');
  assert.deepEqual(bundle.included, []);
  const human = cli(['context', 'claude', '--budget', '1000'], root);
  assert.equal(human.status, 1);
  assert.match(human.stdout, /OVERFLOW/);
});

test('optional items past the budget boundary are omitted with reason budget; estimate stays within budget', async (t) => {
  const { root } = await multi(t, { scope: false });
  const full = json(['context', 'claude', '--task', 'auth tokens settings'], root).bundle;
  assert.equal(full.ok, true);
  const optional = full.included.filter((item) => item.reason !== 'mandatory');
  assert.ok(optional.length >= 2, 'fixture has optional items');
  const last = optional.at(-1);
  const { r, bundle } = json(['context', 'claude', '--task', 'auth tokens settings', '--budget', String(full.budget.estimate - 1)], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(reasonOf(bundle, last.id), 'budget');
  assert.ok(bundle.budget.estimate <= bundle.budget.limit, `${bundle.budget.estimate} <= ${bundle.budget.limit}`);
  for (const item of full.included.filter((entry) => entry.reason === 'mandatory')) assert.ok(ids(bundle.included).includes(item.id), item.id);
});

test('token figures carry the estimate (chars/4) label', async (t) => {
  const { root } = await multi(t);
  const { bundle } = json(['context', 'codex'], root);
  assert.equal(bundle.budget.label, 'estimate (chars/4)');
  assert.equal(bundle.budget.limit, 24000);
  assert.ok(Number.isInteger(bundle.budget.overhead) && bundle.budget.overhead > 0);
  assert.equal(bundle.budget.estimate, bundle.budget.overhead + Math.ceil(bundle.text.length / 4));
  for (const item of bundle.included) assert.ok(Number.isInteger(item.tokens) && item.tokens > 0, item.id);
  const human = cli(['context', 'codex'], root);
  assert.match(human.stdout, /estimate \(chars\/4\)/);
});

// --- output ----------------------------------------------------------------------------------------

test('--json prints parseable JSON only, with the documented bundle keys', async (t) => {
  const { root } = await multi(t);
  const r = cli(['context', 'hermes', '--task', 'auth tokens', '--json'], root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim()[0], '{');
  const bundle = JSON.parse(r.stdout);
  for (const key of ['engine', 'task', 'role', 'scope', 'budget', 'included', 'omitted', 'conflicts', 'missing', 'text']) assert.ok(key in bundle, key);
  assert.equal(bundle.engine, 'hermes');
  assert.deepEqual(Object.keys(bundle.scope).sort(), ['edit', 'read', 'repos']);
  for (const item of bundle.included) assert.deepEqual(Object.keys(item).sort(), ['id', 'kind', 'reason', 'source', 'tokens']);
});

test('default output renders sections in inclusion order with Source lines and an Omitted list', async (t) => {
  const { root } = await multi(t);
  const r = cli(['context', 'claude', '--task', 'auth tokens'], root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Follow AgentOS for Projects\.$/m);
  assert.match(r.stdout, /^Source: \.agentos\/handoff\.md#Current objective$/m);
  assert.match(r.stdout, /^Source: \.agentos\/decisions\.md#2026-10-01 — Auth tokens: rotate weekly$/m);
  assert.match(r.stdout, /^## Omitted \(\d+\)$/m);
  assert.ok(r.stdout.indexOf('## Objective') < r.stdout.indexOf('## Constraints'));
});

test('assertContextBundle rejects malformed bundles', async () => {
  const { assertContextBundle } = await import('../dist/context-builder.js');
  assert.throws(() => assertContextBundle(null), /ContextBundle/);
  assert.throws(() => assertContextBundle({ ok: true, engine: 'x' }), /ContextBundle\./);
});

// --- no mutation -----------------------------------------------------------------------------------

async function snapshot(dir) {
  const result = {};
  async function walk(path, rel = '') {
    for (const name of (await readdir(path)).sort()) {
      const abs = join(path, name), key = join(rel, name), info = await lstat(abs);
      if (info.isSymbolicLink()) result[key] = ['link', await readlink(abs)];
      else if (info.isDirectory()) { result[key] = ['dir', info.mode]; await walk(abs, key); }
      else result[key] = ['file', info.mode, (await readFile(abs)).toString('base64')];
    }
  }
  await walk(dir);
  return result;
}

test('context creates, changes or locks nothing in any mode (whole parent tree, private TMPDIR)', async (t) => {
  const { base, root } = await multi(t);
  const env = { TMPDIR: join(base, 'tmp'), TMP: join(base, 'tmp'), TEMP: join(base, 'tmp') };
  const modes = [
    ['context', 'claude'],
    ['context', 'claude', '--json'],
    ['context', 'codex', '--task', 'auth tokens', '--include-superseded'],
    ['context', 'opencode', '--role', 'reviewer', '--scope', 'web'],
    ['context', 'claude', '--budget', '10'],
    ['context', 'claude', '--budget', '10', '--json'],
    ['context', 'claude', '--role', 'astronaut'],
    ['context', 'claude', '--scope', '../x'],
  ];
  const before = await snapshot(base);
  const results = modes.map((args) => cli(args, root, env));
  assert.equal(results[0].status, 0, `context really ran: ${results[0].stderr}`);
  assert.equal(JSON.parse(results[1].stdout).ok, true);
  assert.equal(JSON.parse(results[5].stdout).ok, false, 'overflow mode really ran');
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n');
  const broken = await snapshot(base);
  cli(['context', 'claude', '--json'], root, env);
  assert.deepEqual(await snapshot(base), broken, 'missing-objective mode');
  delete broken['ws/.agentos/handoff.md'];
  const expected = { ...before };
  delete expected['ws/.agentos/handoff.md'];
  assert.deepEqual(broken, expected, 'all other modes');
});

// --- prompt stays byte-identical -------------------------------------------------------------------

test('prompt output on the slice-1 fixtures is byte-identical to slice 1 (78638c0)', async (t) => {
  const golden = JSON.parse(await readFile('test/fixtures/prompt-golden-v1-slice1.json', 'utf8'));
  const TASKS = '# Tasks\n\n## Now\n\n- [ ] Ship the objective parser.\n';
  const make = {
    single: async (root) => {
      await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
      await writeFile(join(root, '.agentos/tasks.md'), TASKS);
      await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective — 2026-09-15 (latest): ship the parser\n\nMerge the AUM work.\n\n## Next exact action\n\nRun the gates.\n');
    },
    multi: async (root, scope) => {
      for (const repo of ['web', 'api']) {
        await mkdir(join(root, repo));
        await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo, scripts: { build: 'echo b', test: 'echo t' } }));
      }
      await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
      if (scope) { const p = join(root, '.agentos/project.yaml'); await writeFile(p, `${await readFile(p, 'utf8')}task_scope:\n  read: [api/contracts/openapi.yaml]\n  edit: [web]\n`); }
    },
  };
  for (const [name, setup] of [['single', make.single], ['multi-scope', (root) => make.multi(root, true)], ['multi', (root) => make.multi(root, false)]]) {
    const root = await mkdtemp(join(tmpdir(), 'agentos-gold-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await setup(root);
    for (const engine of ['claude', 'codex', 'opencode', 'hermes', 'generic']) {
      const r = cli(['prompt', engine], root);
      const stdout = r.stdout.split(root).join('<ROOT>').replace(/^Project: [^;]+;/m, 'Project: <NAME>;');
      assert.deepEqual({ status: r.status, stdout }, golden[`${name}/${engine}`], `${name}/${engine}`);
    }
  }
});
