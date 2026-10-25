// AgentOS 1.1 slice 1: `agents sync` writes a sync record (.agentos/synced/<engine>.json) and one shared freshness
// check reports OK / STALE / MISSING / INVALID / UNSUPPORTED to both `context --require-synced-config` and `doctor`.
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, unlink, writeFile } from 'node:fs/promises';
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
const edit = async (root, rel, fn) => writeFile(join(root, rel), fn(await read(root, rel)));

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

async function workspace(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-fresh-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  for (const dir of ['web/src', 'web/tests', 'api/contracts']) await mkdir(join(root, dir), { recursive: true });
  for (const repo of ['web', 'api']) await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo }));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nShip the greeting feature.\n');
  await edit(root, '.agentos/project.yaml', (text) => `${text}task_scope:\n  read: [web, api]\n  edit: [web/src]\n`);
  ok(cli(['agents', 'add', 'developer'], root));
  return root;
}

const strict = (root, engine = 'claude-code', ...flags) => cli(['context', engine, '--task', 'greeting', '--require-synced-config', ...flags], root);
const syncedLine = (r) => r.stdout.split('\n').find((line) => line.startsWith('Synced config:'));
const doctor = (root) => cli(['doctor'], root);
const doctorJson = (root) => { const r = cli(['doctor', '--json'], root); return { status: r.status, out: JSON.parse(r.stdout) }; };
const entry = (root, engine = 'claude-code') => doctorJson(root).out.synced_config?.find((item) => item.engine === engine);
const syncedWarnings = (out) => out.warnings.filter((w) => w.startsWith('Synced config:'));

/** Doctor's exit status must not depend on synced config: same status as before anything was synced. */
function assertDoctorUnchanged(root, baseline) {
  const { status, out } = doctorJson(root);
  assert.equal(status, baseline, 'doctor exit status changed');
  assert.ok(!out.problems.some((p) => /synced/i.test(p)), out.problems.join('\n'));
}

async function staleCase(t, mutate, file, reason) {
  const root = await workspace(t);
  const baseline = doctorJson(root).status;
  ok(cli(['agents', 'sync', 'claude-code'], root));
  ok(strict(root));
  await mutate(root);
  const r = strict(root);
  fails(r);
  const line = syncedLine(r);
  assert.ok(line?.startsWith('Synced config: STALE — re-run agentos agents sync claude-code --role developer'), r.stdout);
  assert.ok(line.includes(`${file}: ${reason}`), line);
  assert.doesNotMatch(r.stdout, /## Objective/);
  const e = entry(root);
  assert.equal(e.status, 'stale');
  assert.equal(e.role, 'developer');
  assert.ok(e.reason.includes(`${file}: ${reason}`), e.reason);
  const human = doctor(root).stdout.split('\n');
  assert.ok(human.includes(`- ${line}`), `doctor names the same line:\n${human.join('\n')}`);
  assertDoctorUnchanged(root, baseline);
}

test('OK after sync: record written, context renders, doctor silent (no warning) and reports status ok in --json', async (t) => {
  const root = await workspace(t);
  const baseline = doctorJson(root).status;
  const before = doctor(root).stdout;
  ok(cli(['agents', 'sync', 'claude-code'], root));
  const record = JSON.parse(await read(root, '.agentos/synced/claude-code.json'));
  assert.equal(record.engine, 'claude-code');
  assert.equal(record.role, 'developer');
  assert.deepEqual(record.files.map((f) => f.path), ['.claude/agents/developer.md', '.claude/settings.local.json']);
  for (const file of record.files) assert.match(file.sha256, /^[0-9a-f]{64}$/);
  const r = strict(root);
  ok(r);
  assert.match(r.stdout, /## Objective/);
  assert.match(syncedLine(r), /^Synced config: OK \(claude-code, role developer, sha256 [0-9a-f]{8}\)$/);
  const e = entry(root);
  assert.deepEqual({ status: e.status, role: e.role, files: e.files }, { status: 'ok', role: 'developer', files: ['.claude/agents/developer.md', '.claude/settings.local.json'] });
  assert.equal(syncedWarnings(doctorJson(root).out).length, 0);
  assert.equal(doctor(root).stdout, before, 'an OK sync adds nothing to human doctor output');
  assertDoctorUnchanged(root, baseline);
});

test('STALE after mkdir newdir (tree changed) — defect 1: doctor warns', (t) => staleCase(t, (root) => mkdir(join(root, 'newdir')), '.claude/settings.local.json', 'tree changed'));

test('STALE after a task_scope edit (scope changed)', (t) => staleCase(t, (root) => edit(root, '.agentos/project.yaml', (text) => text.replace('edit: [web/src]', 'edit: [web]')), '.claude/settings.local.json', 'scope changed'));

test('STALE after a manifest tools_requested edit (manifest changed)', (t) => staleCase(t, (root) => edit(root, '.agentos/agents/developer.md', (text) => text.replace('tools_requested: []', 'tools_requested: [read, edit]')), '.claude/agents/developer.md', 'manifest changed'));

test('STALE after hand-editing a generated deny entry (generated entry edited) — defect 2', (t) => staleCase(t, (root) => edit(root, '.claude/settings.local.json', (text) => text.replace('Edit(/api/**)', 'Edit(/apx/**)')), '.claude/settings.local.json', 'generated entry edited'));

test('STALE after editing .claude/agents/<id>.md (generated entry edited) — defect 2', (t) => staleCase(t, (root) => edit(root, '.claude/agents/developer.md', (text) => `${text}\nHand edit.\n`), '.claude/agents/developer.md', 'generated entry edited'));

test('codex: MISSING before sync, OK after sync, STALE after editing the role block — defect 2', async (t) => {
  const root = await workspace(t);
  const baseline = doctorJson(root).status;
  let r = strict(root, 'codex');
  fails(r);
  assert.equal(syncedLine(r), 'Synced config: MISSING — run agentos agents sync codex');
  ok(cli(['agents', 'sync', 'codex'], root));
  r = strict(root, 'codex');
  ok(r);
  assert.match(syncedLine(r), /^Synced config: OK \(codex, role developer, sha256 [0-9a-f]{8}\)$/);
  await edit(root, 'web/AGENTS.md', (text) => text.replace('Purpose: ', 'Purpose: (edited) '));
  r = strict(root, 'codex');
  fails(r);
  assert.ok(syncedLine(r).startsWith('Synced config: STALE — re-run agentos agents sync codex --role developer'), r.stdout);
  assert.ok(syncedLine(r).includes('web/AGENTS.md: generated entry edited'), r.stdout);
  assert.equal(entry(root, 'codex').status, 'stale');
  assertDoctorUnchanged(root, baseline);
  for (const engine of ['opencode', 'hermes', 'generic']) assert.match(syncedLine(strict(root, engine)), /^Synced config: UNSUPPORTED/);
});

test('OK with an owner-added extra deny rule (user entries are not drift) — defect 4', async (t) => {
  const root = await workspace(t);
  ok(cli(['agents', 'sync', 'claude-code'], root));
  await edit(root, '.claude/settings.local.json', (text) => { const json = JSON.parse(text); json.permissions.deny.push('Bash(rm:*)'); return JSON.stringify(json, null, 2); });
  const r = strict(root);
  ok(r);
  assert.match(syncedLine(r), /^Synced config: OK \(claude-code, role developer, sha256 [0-9a-f]{8}; user entries: 1\)$/);
  const e = entry(root);
  assert.equal(e.status, 'ok');
  assert.equal(e.user_entries, 1);
});

test('context for a different role than the synced one is still OK (recorded baseline) — defect 3', async (t) => {
  const root = await workspace(t);
  ok(cli(['agents', 'sync', 'claude-code'], root));
  for (const role of ['tester', 'reviewer']) {
    const r = strict(root, 'claude-code', '--role', role);
    ok(r);
    assert.match(syncedLine(r), /^Synced config: OK \(claude-code, role developer, /);
  }
  ok(strict(root, 'claude-code', '--scope', 'api'));
});

test('MISSING when never synced: context exits 1, doctor silent with status missing in --json', async (t) => {
  const root = await workspace(t);
  const r = strict(root);
  fails(r);
  assert.equal(syncedLine(r), 'Synced config: MISSING — run agentos agents sync claude-code');
  const { out } = doctorJson(root);
  assert.equal(syncedWarnings(out).length, 0);
  assert.deepEqual(out.synced_config.map((e) => [e.engine, e.status]), [['claude-code', 'missing'], ['codex', 'missing']]);
});

test('INVALID for bad JSON in the synced settings (reason shown, not MISSING) — defect 5', async (t) => {
  const root = await workspace(t);
  const baseline = doctorJson(root).status;
  ok(cli(['agents', 'sync', 'claude-code'], root));
  await writeFile(join(root, '.claude/settings.local.json'), '{ "permissions": ');
  const r = strict(root);
  fails(r);
  assert.match(syncedLine(r), /^Synced config: INVALID — \.claude\/settings\.local\.json: invalid JSON \(.+\); fix it, then re-run agentos agents sync claude-code --role developer$/);
  assert.equal(entry(root).status, 'invalid');
  assert.ok(doctor(root).stdout.split('\n').includes(`- ${syncedLine(r)}`));
  assertDoctorUnchanged(root, baseline);
});

test('INVALID for a missing manifest (reason shown, not MISSING) — defect 5', async (t) => {
  const root = await workspace(t);
  ok(cli(['agents', 'sync', 'claude-code'], root));
  await edit(root, '.agentos/agents/developer.md', (text) => text.replace(/^---\n[\s\S]*?\n---\n/, ''));
  const r = strict(root);
  fails(r);
  assert.match(syncedLine(r), /^Synced config: INVALID — \.agentos\/agents\/developer\.md has no manifest; .*re-run agentos agents sync claude-code --role developer$/);
  assert.match(entry(root).reason, /has no manifest/);
});

test('INVALID for a broken sync record', async (t) => {
  const root = await workspace(t);
  ok(cli(['agents', 'sync', 'claude-code'], root));
  const good = await read(root, '.agentos/synced/claude-code.json');
  await writeFile(join(root, '.agentos/synced/claude-code.json'), good.replace('".claude/settings.local.json"', '"../outside.json"'));
  assert.equal(syncedLine(strict(root)), 'Synced config: INVALID — .agentos/synced/claude-code.json: not a valid sync record for claude-code; fix it, then re-run agentos agents sync claude-code');
  await writeFile(join(root, '.agentos/synced/claude-code.json'), good);
  const project = await read(root, '.agentos/project.yaml');
  await writeFile(join(root, '.agentos/project.yaml'), 'name: [unclosed\n');
  assert.match(syncedLine(strict(root)), /^Synced config: INVALID — \.agentos\/project\.yaml is malformed/);
  await writeFile(join(root, '.agentos/project.yaml'), project);
  await writeFile(join(root, '.agentos/synced/claude-code.json'), 'not json');
  const r = strict(root);
  fails(r);
  assert.match(syncedLine(r), /^Synced config: INVALID — \.agentos\/synced\/claude-code\.json: invalid JSON/);
});

test('legacy 1.0.0 sync (generated files, no record) -> STALE with the record message; doctor never rewrites anything', async (t) => {
  const root = await workspace(t);
  const baseline = doctorJson(root).status;
  ok(cli(['agents', 'sync', 'claude-code'], root));
  ok(cli(['agents', 'sync', 'codex'], root));
  await unlink(join(root, '.agentos/synced/claude-code.json'));
  await unlink(join(root, '.agentos/synced/codex.json'));
  for (const engine of ['claude-code', 'codex']) {
    const r = strict(root, engine);
    fails(r);
    assert.equal(syncedLine(r), `Synced config: STALE — synced by 1.0.0 without a record; re-run agentos agents sync ${engine} --replace`);
  }
  const before = await snapshot(root);
  const human = doctor(root).stdout.split('\n');
  assert.ok(human.includes('- Synced config: STALE — synced by 1.0.0 without a record; re-run agentos agents sync claude-code --replace'), human.join('\n'));
  assert.ok(human.includes('- Synced config: STALE — synced by 1.0.0 without a record; re-run agentos agents sync codex --replace'), human.join('\n'));
  assert.deepEqual(await snapshot(root), before, 'doctor wrote nothing');
  assertDoctorUnchanged(root, baseline);
  // Re-running the sync with nothing drifted writes only the record; then OK.
  ok(cli(['agents', 'sync', 'claude-code'], root));
  const after = await snapshot(root);
  assert.deepEqual(Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])), [join('.agentos', 'synced', 'claude-code.json')]);
  ok(strict(root));
});

test('never-synced workspace: human doctor output byte-identical with or without an owner .claude/settings.local.json', async (t) => {
  const root = await workspace(t);
  const plain = doctor(root);
  await mkdir(join(root, '.claude'));
  await writeFile(join(root, '.claude/settings.local.json'), JSON.stringify({ permissions: { allow: ['Bash(npm test:*)'], deny: ['Edit(/api/**)'] } }));
  const owner = doctor(root);
  assert.equal(owner.stdout, plain.stdout);
  assert.equal(owner.status, plain.status);
  assert.doesNotMatch(plain.stdout, /Synced config/);
});

test('dry-run sync writes nothing (whole-tree snapshot) for both engines', async (t) => {
  const root = await workspace(t);
  const before = await snapshot(root);
  for (const engine of ['claude-code', 'codex']) ok(cli(['agents', 'sync', engine, '--dry-run'], root));
  assert.deepEqual(await snapshot(root), before);
});

test('re-sync with nothing changed is a byte-for-byte no-op (record has no timestamp)', async (t) => {
  const root = await workspace(t);
  ok(cli(['agents', 'sync', 'claude-code'], root));
  const synced = await snapshot(root);
  ok(cli(['agents', 'sync', 'claude-code'], root));
  assert.deepEqual(await snapshot(root), synced);
});
