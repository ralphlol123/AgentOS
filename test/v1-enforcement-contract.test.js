// v1 closure 3 (Ralph's review of PR #53): configuration presence is not proof of enforcement.
// `context --require-enforcement` exits 1 UNSUPPORTED for every engine (no partial credit); the synced deny-set
// freshness check is `--require-synced-config`.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTOS_ENGINE: '' } });
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const fails = (r) => assert.equal(r.status, 1, r.stdout + r.stderr);
const lines = (r) => r.stdout.split('\n');

async function workspace(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-v1enf-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  for (const dir of ['web/src', 'web/tests', 'api/contracts']) await mkdir(join(root, dir), { recursive: true });
  for (const repo of ['web', 'api']) await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo }));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nShip the greeting feature.\n');
  const project = await readFile(join(root, '.agentos/project.yaml'), 'utf8');
  await writeFile(join(root, '.agentos/project.yaml'), `${project}task_scope:\n  read: [web, api]\n  edit: [web/src]\n`);
  ok(cli(['agents', 'add', 'developer'], root));
  return root;
}

const CLAUDE_REASONS = [
  'workspace trust is not verifiable from AgentOS',
  'residual writable paths (new root-level files/dirs until re-sync, .agentos/ state, shell writes Claude Code does not recognise as file writes)',
  "deny rules apply only to Claude Code's own tools",
];
const CODEX_REASONS = ['the launch-time sandbox is chosen outside AgentOS', 'no per-path scope'];
const AVAILABLE = '--require-synced-config is the available check (configuration presence, not enforcement).';
const enforcementLine = (engine, reasons) => `Enforcement: UNSUPPORTED — AgentOS cannot establish enforcement for ${engine}: ${reasons.join('; ')}. ${AVAILABLE}`;
const context = (root, engine, ...flags) => cli(['context', engine, '--task', 'greeting', ...flags], root);

test('(a) regression: matching synced config + --require-enforcement exits 1 UNSUPPORTED with the reasons (no partial credit)', async (t) => {
  const root = await workspace(t);
  ok(cli(['agents', 'sync', 'claude-code'], root));
  const r = context(root, 'claude-code', '--require-enforcement'); // the synced config is current (checked below) ...
  fails(r); // ... and that is still not enforcement (exited 0 at d7501a9)
  ok(context(root, 'claude-code', '--require-synced-config'));
  assert.ok(lines(r).includes(enforcementLine('claude-code', CLAUDE_REASONS)), r.stdout);
  assert.doesNotMatch(r.stdout, /## Objective/);
  assert.doesNotMatch(r.stdout, /enforcement configuration present/);
  const codex = context(root, 'codex', '--require-enforcement');
  fails(codex);
  assert.ok(lines(codex).includes(enforcementLine('codex', CODEX_REASONS)), codex.stdout);
  for (const engine of ['opencode', 'hermes', 'generic']) {
    const other = context(root, engine, '--require-enforcement');
    fails(other);
    assert.match(other.stdout, new RegExp(`^Enforcement: UNSUPPORTED — AgentOS cannot establish enforcement for ${engine}: permission_enforcement is unsupported for ${engine}`, 'm'));
  }
});

test('(b) --require-synced-config: MISSING before sync, OK when current (context rendered), STALE after mkdir, codex MISSING until synced (1.1: codex role block is checked)', async (t) => {
  const root = await workspace(t);
  let r = context(root, 'claude-code', '--require-synced-config');
  fails(r);
  assert.ok(lines(r).includes('Synced config: MISSING — run agentos agents sync claude-code'), r.stdout);
  assert.doesNotMatch(r.stdout, /## Objective/);

  ok(cli(['agents', 'sync', 'claude-code'], root));
  r = context(root, 'claude-code', '--require-synced-config');
  ok(r);
  assert.match(r.stdout, /## Objective/);
  assert.match(r.stdout, /^Synced config: OK \(claude-code, role developer, sha256 [0-9a-f]{8}\)$/m);
  assert.doesNotMatch(r.stdout, /^Enforcement:/m);

  await mkdir(join(root, 'newdir'));
  r = context(root, 'claude-code', '--require-synced-config');
  fails(r);
  assert.match(r.stdout, /^Synced config: STALE — re-run agentos agents sync claude-code/m);
  assert.doesNotMatch(r.stdout, /## Objective/);

  r = context(root, 'codex', '--require-synced-config');
  fails(r);
  assert.ok(lines(r).includes('Synced config: MISSING — run agentos agents sync codex'), r.stdout);
});

test('(c) both flags: both lines, exit 1 even when the synced config is OK', async (t) => {
  const root = await workspace(t);
  ok(cli(['agents', 'sync', 'claude-code'], root));
  const r = context(root, 'claude-code', '--require-synced-config', '--require-enforcement');
  fails(r);
  assert.match(r.stdout, /^Synced config: OK \(claude-code, role developer, sha256 [0-9a-f]{8}\)$/m);
  assert.ok(lines(r).includes(enforcementLine('claude-code', CLAUDE_REASONS)), r.stdout);
  assert.doesNotMatch(r.stdout, /## Objective/);
});

test('(d) --json: enforcement {status, reasons} and synced_config {status, sha256?}', async (t) => {
  const root = await workspace(t);
  let r = context(root, 'claude-code', '--json', '--require-synced-config', '--require-enforcement');
  fails(r);
  let out = JSON.parse(r.stdout);
  assert.deepEqual(out.enforcement, { status: 'unsupported', reasons: CLAUDE_REASONS });
  assert.deepEqual(out.synced_config, { status: 'missing' });

  ok(cli(['agents', 'sync', 'claude-code'], root));
  r = context(root, 'claude-code', '--json', '--require-synced-config');
  ok(r);
  out = JSON.parse(r.stdout);
  assert.equal(out.synced_config.status, 'ok');
  assert.match(out.synced_config.sha256, /^[0-9a-f]{8}$/);
  assert.equal(out.enforcement, undefined);
  assert.ok(out.included.length, 'bundle rendered');

  r = context(root, 'codex', '--json', '--require-enforcement');
  fails(r);
  assert.deepEqual(JSON.parse(r.stdout).enforcement, { status: 'unsupported', reasons: CODEX_REASONS });
});

test('(e) plain context: renders with one ADVISORY line naming the residual paths; no enforcement/synced lines', async (t) => {
  const root = await workspace(t);
  ok(cli(['agents', 'sync', 'claude-code'], root));
  const r = context(root, 'claude-code');
  ok(r);
  assert.match(r.stdout, /## Objective/);
  const advisory = lines(r).filter((line) => line.startsWith('ADVISORY:'));
  assert.equal(advisory.length, 1);
  assert.match(advisory[0], /residual writable paths: new root-level files\/dirs until re-sync, \.agentos\/ state, shell writes Claude Code does not recognise as file writes/);
  assert.doesNotMatch(r.stdout, /^(Enforcement|Synced config):/m);
  assert.equal(JSON.parse(context(root, 'claude-code', '--json').stdout).synced_config, undefined);
});
