// v1 slice 7: trial defects (D1 Claude deny rules, D2 nested child directories in one work tree, D3 bare `.`)
// and the trial-verified capability matrix. CLI usage and doc links: test/v1-slice7-docs.test.js.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV, AGENTOS_ENGINE: '' } });
const json = (args, cwd) => {
  const r = cli([...args, '--json'], cwd);
  try { return { r, out: JSON.parse(r.stdout) }; } catch { throw new Error(`not JSON (exit ${r.status}): ${r.stdout}\n${r.stderr}`); }
};
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const fails = (r) => assert.equal(r.status, 1, r.stdout + r.stderr);
const read = (root, rel) => readFile(join(root, rel), 'utf8');
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const HANDOFF = '# Handoff\n\n## Current objective\n\nShip the greeting feature.\n';
const TASK = 'greeting';

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

/** web + api child dirs; `gitRoot` makes the workspace root one git work tree (the trial layout), else no git. */
async function workspace(t, { gitRoot = false, scope = 'task_scope:\n  read: [api/contracts/openapi.yaml]\n  edit: [web]\n' } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-v1s7-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  for (const repo of ['web', 'api']) {
    await mkdir(join(root, repo), { recursive: true });
    await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo, scripts: { test: 'echo t' } }));
  }
  await mkdir(join(root, 'api/contracts'));
  await writeFile(join(root, 'api/contracts/openapi.yaml'), 'openapi: 3.0.0\n');
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), HANDOFF);
  if (scope) await writeFile(join(root, '.agentos/project.yaml'), `${await read(root, '.agentos/project.yaml')}${scope}`);
  if (gitRoot) {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'init');
  }
  return { base, root };
}

// --- D1: agents sync claude-code restricts with deny rules -------------------------------------------

const TRUST = /Claude Code ignores `\.claude\/settings\.local\.json` until the workspace is trusted; run `claude` interactively once or set `projects\[<root>\]\.hasTrustDialogAccepted`/;
const rules = (path, tools = ['Edit']) => tools.map((tool) => `${tool}(/${path})`);
/** Root entries every sibling-enumerated deny list carries for this fixture (closure fix; see v1-claude-deny-siblings.test.js). */
const ROOT_DENY = [...rules('.agentos/agents/**'), ...rules('.agentos/project.yaml'), ...rules('.claude/**'), ...rules('.claude/settings.json'), ...rules('.claude/settings.local.json'), ...rules('.hermes.md'), ...rules('AGENTS.md'), ...rules('CLAUDE.md')];
const DENY_API = [...ROOT_DENY, ...rules('api/**'), ...rules('api/contracts/openapi.yaml')];

test('D1: sync claude-code denies every repo and read path outside the edit scope, keeps the allow entry, prints the trust note; a read-only role denies everything', async (t) => {
  const { root } = await workspace(t);
  ok(cli(['agents', 'add', 'developer'], root));
  const before = await snapshot(root);
  const dry = cli(['agents', 'sync', 'claude-code', '--dry-run'], root);
  ok(dry);
  assert.match(dry.stdout, TRUST);
  assert.match(dry.stdout, /^  \+ permissions\.deny: Edit\(\/api\/\*\*\)$/m);
  assert.deepEqual(await snapshot(root), before, 'dry run writes nothing');

  const r = cli(['agents', 'sync', 'claude-code'], root);
  ok(r);
  assert.match(r.stdout, TRUST);
  assert.deepEqual(JSON.parse(await read(root, '.claude/settings.local.json')), { permissions: { allow: ['Edit(/web/**)'], deny: DENY_API } });

  await rm(join(root, '.claude'), { recursive: true });
  ok(cli(['agents', 'add', 'reviewer', '--replace'], root));
  ok(cli(['agents', 'sync', 'claude-code', '--role', 'reviewer'], root));
  assert.deepEqual(JSON.parse(await read(root, '.claude/settings.local.json')), { permissions: { deny: ['Edit(/**)'] } });
});

test('D1: an existing different deny list refuses the sync with zero writes; an identical one is accepted unchanged', async (t) => {
  const { root } = await workspace(t);
  ok(cli(['agents', 'add', 'developer'], root));
  await mkdir(join(root, '.claude'));
  await writeFile(join(root, '.claude/settings.local.json'), JSON.stringify({ permissions: { deny: ['Bash(rm:*)'] } }));
  const before = await snapshot(root);
  const conflict = cli(['agents', 'sync', 'claude-code'], root);
  fails(conflict);
  assert.match(conflict.stdout, /^- \.claude\/settings\.local\.json: no sync record owns permissions\.deny$/m);
  assert.match(conflict.stdout, /--replace/);
  assert.match(conflict.stdout, /Nothing was written/);
  assert.deepEqual(await snapshot(root), before, 'conflict: zero writes');

  const same = JSON.stringify({ permissions: { allow: ['Edit(/web/**)'], deny: DENY_API } }, null, 2) + '\n';
  await writeFile(join(root, '.claude/settings.local.json'), same);
  ok(cli(['agents', 'sync', 'claude-code'], root));
  assert.equal(await read(root, '.claude/settings.local.json'), same);
});

test('D1/codex: sync codex prints that Codex enforces only its launch-time sandbox', async (t) => {
  const { root } = await workspace(t);
  ok(cli(['agents', 'add', 'developer'], root));
  const r = cli(['agents', 'sync', 'codex', '--dry-run'], root);
  ok(r);
  assert.match(r.stdout, /^advisory: Codex enforces only its launch-time sandbox/m);
});

test('matrix: claude-code and codex rows match the 2026-10-25 trial; every verified cell carries report evidence', async () => {
  const { out } = json(['doctor', '--engines'], process.cwd());
  const claude = out.matrix['claude-code'], codex = out.matrix.codex;
  const CLOSURE = /docs\/evidence\/2026-10-25-cross-engine\/closure\/REPORT-closure\.md#/;
  assert.equal(claude.permission_enforcement.status, 'verified');
  assert.match(claude.permission_enforcement.evidence, /docs\/evidence\/2026-10-25-cross-engine\/REPORT\.md#T3/);
  assert.match(claude.permission_enforcement.evidence, /Verified in a trusted workspace/);
  assert.match(claude.permission_enforcement.evidence, new RegExp(`${CLOSURE.source}T6c`)); // siblings + Bash redirect to a denied path
  assert.match(claude.permission_enforcement.evidence, new RegExp(`${CLOSURE.source}T6d`)); // read-only deny-all
  assert.match(claude.permission_enforcement.evidence, /Residual, advisory: root files\/dirs created after sync/);
  assert.doesNotMatch(claude.permission_enforcement.evidence, /re-trial pending|\(\/\*\)/);
  assert.equal(claude.tool_restrictions.status, 'verified');
  assert.match(claude.tool_restrictions.evidence, /launch-time --allowedTools; see T1\/T2/);
  assert.match(claude.tool_restrictions.evidence, /tools_requested -> \.claude\/agents\/<id>\.md tools:.*VERIFIED for the Task-invoked subagent.*REPORT-closure\.md#T9/);
  assert.equal(codex.permission_enforcement.status, 'verified');
  assert.match(codex.permission_enforcement.evidence, /launch-time sandbox: --sandbox read-only refuses writes; per-path scope unsupported/);
  assert.match(codex.permission_enforcement.evidence, /REPORT\.md#T4/);
  assert.equal(codex.tool_restrictions.status, 'unsupported');
  assert.equal(claude.native_agent_config.status, 'verified'); // T5 discovery + T8 invocation/instruction-following
  assert.match(claude.native_agent_config.evidence, /REPORT\.md#T5/);
  assert.match(claude.native_agent_config.evidence, new RegExp(`${CLOSURE.source}T8`));
  assert.match(claude.native_agent_config.evidence, /tools: consumption VERIFIED afterwards \(closure T9/);
  assert.equal(codex.native_agent_config.status, 'verified'); // T7: instruction-following, advisory
  assert.match(codex.native_agent_config.evidence, new RegExp(`instruction-following \\(advisory; the user prompt wins\\).*2\\/2.*${CLOSURE.source}T7`));
  for (const [engine, rows] of Object.entries(out.matrix)) {
    for (const [key, value] of Object.entries(rows)) {
      if (value.status === 'verified') assert.match(value.evidence, /docs\/evidence\/2026-10-25-cross-engine\/(REPORT|closure\/REPORT-closure)\.md#T\d/, `${engine}.${key}`);
    }
  }
  assert.ok(existsSync(resolve('docs/evidence/2026-10-25-cross-engine/REPORT.md')), 'evidence copied into the repo');
});

// --- D2: child directories inside one git work tree ----------------------------------------------------

test('D2: web/ and api/ inside one root work tree are available (enclosing-worktree, root HEAD); drift in web/ flags only web', async (t) => {
  const { root } = await workspace(t, { gitRoot: true });
  const head = git(root, 'rev-parse', 'HEAD');
  const { r, out } = json(['checkpoint', '--task', TASK, '--progress', 'p', '--check', 'node -e process.exit(0)'], root);
  ok(r);
  for (const name of ['web', 'api']) {
    const repo = out.record.repos.find((entry) => entry.name === name);
    assert.equal(repo.available, true, JSON.stringify(repo));
    assert.equal(repo.state, 'enclosing-worktree');
    assert.equal(repo.head, head);
    assert.equal(repo.branch, 'main');
    assert.deepEqual(repo.changed_paths, []);
  }
  let res = json(['resume', '--task', TASK], root).out;
  assert.equal(res.reconciliation.status, 'clean', JSON.stringify(res.reconciliation));

  await writeFile(join(root, 'web/added.txt'), 'x');
  res = json(['resume', '--task', TASK], root).out;
  const web = res.reconciliation.repos.find((repo) => repo.name === 'web');
  assert.equal(web.status, 'drifted');
  assert.deepEqual(web.new_changed_paths, ['added.txt']);
  assert.equal(web.fingerprint_changed, true);
  assert.equal(res.reconciliation.repos.find((repo) => repo.name === 'api').status, 'clean');
  assert.equal(res.remaining.receipts.find((receipt) => receipt.command === 'node -e process.exit(0)').stale, true);

  // slice-3 drift on this layout: a commit moves the shared HEAD (both dirs report it), staged-only changes count
  git(root, 'add', 'web/added.txt');
  git(root, 'commit', '-q', '-m', 'feature');
  res = json(['resume', '--task', TASK], root).out;
  assert.deepEqual(res.reconciliation.repos.find((repo) => repo.name === 'web').head_moved, { from: head, to: git(root, 'rev-parse', 'HEAD') });
  ok(cli(['checkpoint', '--task', TASK, '--progress', 'p2'], root));
  await writeFile(join(root, 'api/staged.txt'), 's');
  git(root, 'add', 'api/staged.txt');
  res = json(['resume', '--task', TASK], root).out;
  assert.deepEqual(res.reconciliation.repos.find((repo) => repo.name === 'api').new_changed_paths, ['staged.txt']);
  assert.equal(res.reconciliation.repos.find((repo) => repo.name === 'web').status, 'clean');
  const human = cli(['resume', '--task', TASK], root);
  assert.match(human.stdout, /api: new changed paths: staged\.txt/);
});

test('D2: sensitive paths stay omitted in a nested dir; a dir outside any work tree stays unavailable', async (t) => {
  const { root } = await workspace(t, { gitRoot: true });
  await writeFile(join(root, 'web/.env'), 'SECRET=1');
  const { out } = json(['checkpoint', '--task', TASK, '--progress', 'p'], root);
  const web = out.record.repos.find((repo) => repo.name === 'web');
  assert.deepEqual(web.changed_paths, []);
  assert.equal(web.omitted_paths, 1);

  const plain = await workspace(t);
  const record = json(['checkpoint', '--task', TASK, '--progress', 'p'], plain.root).out.record;
  for (const repo of record.repos) {
    assert.equal(repo.available, false);
    assert.match(repo.reason, /not inside a git work tree/);
  }
});

test('D3: checkpoint ignores a bare `.` positional', async (t) => {
  const { root } = await workspace(t, { gitRoot: true });
  ok(cli(['checkpoint', '--task', TASK, '--progress', 'p', '.'], root));
});

test('nested start: context, checkpoint and resume run from inside a child directory and find the parent workspace', async (t) => {
  const { root } = await workspace(t, { gitRoot: true });
  const web = join(root, 'web');
  const context = cli(['context', 'codex', '--task', TASK], web);
  ok(context);
  assert.match(context.stdout, /^## Objective/m);
  const { out } = json(['checkpoint', '--task', TASK, '--progress', 'from web/'], web);
  assert.equal(await realpath(out.record.project.root), await realpath(root)); // same directory (macOS /private/var, Windows 8.3 short names)
  assert.ok(out.record.repos.every((repo) => repo.available));
  assert.equal(json(['resume', '--task', TASK], web).out.reconciliation.status, 'clean');
});
