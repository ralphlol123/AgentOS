// v1 closure: `agents sync claude-code` denies everything outside the edit scope (sibling enumeration), not only
// the listed repo/read paths (gap found in Phynceon's host probe, Claude Code 2.1.310, 2026-10-25), and
// `context claude-code --require-enforcement` checks that the synced deny set is current.
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTOS_ENGINE: '' } });
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const fails = (r) => assert.equal(r.status, 1, r.stdout + r.stderr);
const read = (root, rel) => readFile(join(root, rel), 'utf8');

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

/** The probe fixture: web/src, web/tests, web/package.json, api/contracts, docs/adr, root .env.example, .agentos/, .claude/. */
async function workspace(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-v1deny-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  for (const repo of ['web', 'api']) {
    await mkdir(join(root, repo), { recursive: true });
    await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo }));
  }
  for (const dir of ['web/src', 'web/tests', 'api/contracts', 'docs/adr', '.claude', 'node_modules/x', '.git']) await mkdir(join(root, dir), { recursive: true });
  await writeFile(join(root, 'web/src/a.js'), 'a\n');
  await writeFile(join(root, 'web/tests/t.js'), 't\n');
  await writeFile(join(root, 'api/contracts/openapi.yaml'), 'openapi: 3.0.0\n');
  await writeFile(join(root, 'docs/adr/0001.md'), '# 1\n');
  await writeFile(join(root, '.env.example'), 'X=\n');
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nShip the greeting feature.\n');
  await writeFile(join(root, '.agentos/project.yaml'), `${await read(root, '.agentos/project.yaml')}task_scope:\n  read: [web, api/contracts/openapi.yaml, docs/adr]\n  edit: [web/src]\n`);
  ok(cli(['agents', 'add', 'developer'], root));
  return root;
}

const rules = (path, tools = ['Edit', 'Write', 'NotebookEdit']) => tools.map((tool) => `${tool}(/${path})`);
const EXPECTED_DENY = [
  ...rules('*', ['Edit', 'Write']),
  ...rules('.agentos/agents/**'),
  ...rules('.agentos/project.yaml'),
  ...rules('.claude/**'),
  ...rules('.claude/settings.json', ['Edit', 'Write']),
  ...rules('.claude/settings.local.json', ['Edit', 'Write']),
  ...rules('.env.example'),
  ...rules('.hermes.md'),
  ...rules('AGENTS.md'),
  ...rules('CLAUDE.md'),
  ...rules('api/**'),
  ...rules('api/contracts/openapi.yaml'),
  ...rules('docs/**'),
  ...rules('docs/adr/**'),
  ...rules('web/.gitignore'),
  ...rules('web/AGENTS.md'),
  ...rules('web/CLAUDE.md'),
  ...rules('web/package.json'),
  ...rules('web/tests/**'),
];

test('sibling enumeration: sync claude-code denies every entry outside the edit scope at each ancestor level, exact sorted list', async (t) => {
  const root = await workspace(t);
  const before = await snapshot(root);
  const dry = cli(['agents', 'sync', 'claude-code', '--dry-run'], root);
  ok(dry);
  assert.deepEqual(await snapshot(root), before, 'dry run writes nothing');
  assert.match(dry.stdout, /re-run `agentos agents sync claude-code` after adding top-level directories/);
  assert.match(dry.stdout, /advisory: shell writes/);
  assert.match(dry.stdout, /until the workspace is trusted/);

  ok(cli(['agents', 'sync', 'claude-code'], root));
  const { permissions } = JSON.parse(await read(root, '.claude/settings.local.json'));
  assert.deepEqual(permissions.allow, ['Edit(/web/src/**)']);
  assert.deepEqual(permissions.deny, EXPECTED_DENY);
  for (const rule of permissions.deny) {
    assert.doesNotMatch(rule, /\(\/web\/src|\(\/web\/\*\*|\(\/\*\*\)|\.agentos\/handoff\.md|\.agentos\/\*\*|\.git\/|node_modules/, rule);
  }
  ok(cli(['agents', 'sync', 'claude-code'], root)); // re-sync after its own .claude/agents write is a no-op
});

test('sibling enumeration: read-only role keeps deny-all with no allow', async (t) => {
  const root = await workspace(t);
  ok(cli(['agents', 'add', 'reviewer', '--replace'], root));
  ok(cli(['agents', 'sync', 'claude-code', '--role', 'reviewer'], root));
  assert.deepEqual(JSON.parse(await read(root, '.claude/settings.local.json')), { permissions: { deny: ['Edit(/**)', 'Write(/**)', 'NotebookEdit(/**)'] } });
});

test('sibling enumeration: an existing different deny list refuses with zero writes', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.claude/settings.local.json'), JSON.stringify({ permissions: { deny: ['Edit(/api/**)'] } }));
  const before = await snapshot(root);
  const r = cli(['agents', 'sync', 'claude-code'], root);
  fails(r);
  assert.match(r.stdout, /permissions\.deny: existing/);
  assert.match(r.stdout, /Nothing was written/);
  assert.deepEqual(await snapshot(root), before);
});

test('context claude-code --require-enforcement: UNSUPPORTED without synced rules, ok when current, STALE after a new top-level dir; codex stays UNSUPPORTED', async (t) => {
  const root = await workspace(t);
  const strict = (engine = 'claude-code') => cli(['context', engine, '--task', 'greeting', '--require-enforcement'], root);
  let r = strict();
  fails(r);
  assert.match(r.stdout, /^AgentOS context: UNSUPPORTED/);
  assert.doesNotMatch(r.stdout, /## Objective/);

  ok(cli(['agents', 'sync', 'claude-code'], root));
  r = strict();
  ok(r);
  assert.match(r.stdout, /## Objective/);
  assert.match(r.stdout, /enforcement configuration present: \.claude\/settings\.local\.json deny set matches `agents sync claude-code` \(sha256 [0-9a-f]{12}/);

  await mkdir(join(root, 'scripts'));
  r = strict();
  fails(r);
  assert.match(r.stdout, /^AgentOS context: STALE/);
  assert.match(r.stdout, /re-run `agentos agents sync claude-code`/);
  assert.doesNotMatch(r.stdout, /## Objective/);

  for (const engine of ['codex', 'opencode', 'hermes', 'generic']) {
    r = strict(engine);
    fails(r);
    assert.match(r.stdout, /^AgentOS context: UNSUPPORTED/);
  }
});
