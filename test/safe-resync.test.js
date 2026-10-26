// AgentOS 1.1 slice 2: safe agent re-sync. Ownership comes from the slice-1 sync record (.agentos/synced/<engine>.json):
// recorded entries/bytes still installed as generated are replaced; owner content is kept or the sync refuses with zero
// writes until --replace. Dry run writes nothing; files + backups + record land in one mutation transaction.
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { __clearAtomicWriteFaultForTests, __setAtomicWriteFaultForTests, agentsAgentOS, initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTOS_ENGINE: '' } });
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const fails = (r) => assert.equal(r.status, 1, r.stdout + r.stderr);
const read = (root, rel) => readFile(join(root, rel), 'utf8');
const edit = async (root, rel, fn) => writeFile(join(root, rel), fn(await read(root, rel)));
const SETTINGS = '.claude/settings.local.json';
const AGENT = '.claude/agents/developer.md';
const RECORD = '.agentos/synced/claude-code.json';

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
const changed = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();

async function workspace(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-resync-'));
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
const sync = (root, ...flags) => cli(['agents', 'sync', 'claude-code', ...flags], root);
const strict = (root, engine = 'claude-code') => cli(['context', engine, '--task', 'greeting', '--require-synced-config'], root);
const syncedLine = (r) => r.stdout.split('\n').find((line) => line.startsWith('Synced config:'));
const syncedWarnings = (root) => JSON.parse(cli(['doctor', '--json'], root).stdout).warnings.filter((w) => w.startsWith('Synced config:'));
const backups = async (root) => {
  const out = [];
  async function walk(path, rel) { for (const d of await readdir(path, { withFileTypes: true }).catch(() => [])) d.isDirectory() ? await walk(join(path, d.name), `${rel}/${d.name}`) : out.push(`${rel}/${d.name}`); }
  await walk(join(root, '.agentos/runs/replaced-synced'), '');
  return out;
};

test('re-sync after a tree change: OK, doctor silent; owner allow/deny entries stay in place; other keys, indent and missing trailing newline preserved', async (t) => {
  const root = await workspace(t);
  await mkdir(join(root, '.claude'));
  // Owner file before the first sync: 4-space indent, no trailing newline, unrelated keys.
  await writeFile(join(root, SETTINGS), JSON.stringify({ model: 'opus', env: { FOO: '1' }, permissions: { ask: ['Bash'] } }, null, 4));
  ok(sync(root));
  const first = JSON.parse(await read(root, SETTINGS));
  // Owner adds entries before and after the generated ones.
  first.permissions.allow = ['Bash(npm test:*)', ...first.permissions.allow];
  first.permissions.deny = ['Bash(rm:*)', ...first.permissions.deny, 'Read(/secrets/**)'];
  await writeFile(join(root, SETTINGS), JSON.stringify(first, null, 4));
  ok(strict(root));

  await mkdir(join(root, 'newdir'));
  assert.match(syncedWarnings(root)[0], /^Synced config: STALE — re-run agentos agents sync claude-code --role developer \(\.claude\/settings\.local\.json: tree changed\)$/);
  const r = sync(root);
  ok(r);
  assert.match(r.stdout, /^Updated: \.claude\/settings\.local\.json$/m);
  assert.match(r.stdout, /^Unchanged: \.claude\/agents\/developer\.md$/m);
  const text = await read(root, SETTINGS);
  const recorded = JSON.parse(await read(root, RECORD)).files.find((f) => f.path === SETTINGS).entries['permissions.deny'];
  for (const rule of ['Edit(/newdir/**)', 'Write(/newdir/**)', 'NotebookEdit(/newdir/**)']) assert.ok(recorded.includes(rule) && !first.permissions.deny.includes(rule), rule);
  const expected = { model: 'opus', env: { FOO: '1' }, permissions: { ask: ['Bash'], allow: ['Bash(npm test:*)', 'Edit(/web/src/**)'], deny: ['Bash(rm:*)', ...recorded, 'Read(/secrets/**)'] } };
  assert.equal(text, JSON.stringify(expected, null, 4), 'owner entries in place, other keys kept, 4-space indent, no trailing newline');
  ok(strict(root));
  assert.match(syncedLine(strict(root)), /^Synced config: OK \(claude-code, role developer, sha256 [0-9a-f]{8}; user entries: 3\)$/);
  assert.deepEqual(syncedWarnings(root), [], 'doctor silent after re-sync');
  assert.deepEqual(await backups(root), [], 'no --replace, no backup');
});

test('re-sync after a task_scope change updates the settings; after a manifest tools_requested change updates .claude/agents/<id>.md', async (t) => {
  const root = await workspace(t);
  ok(sync(root));
  await edit(root, '.agentos/project.yaml', (text) => text.replace('edit: [web/src]', 'edit: [web/src, api/contracts]'));
  ok(sync(root));
  assert.deepEqual(JSON.parse(await read(root, SETTINGS)).permissions.allow, ['Edit(/web/src/**)', 'Edit(/api/contracts/**)']);
  assert.ok(!JSON.parse(await read(root, SETTINGS)).permissions.deny.includes('Edit(/api/**)'), 'api/ no longer denied wholesale');
  ok(strict(root));

  await edit(root, '.agentos/agents/developer.md', (text) => text.replace('tools_requested: []', 'tools_requested: [read, edit]'));
  fails(strict(root));
  const r = sync(root);
  ok(r);
  assert.match(r.stdout, /^Updated: \.claude\/agents\/developer\.md$/m);
  assert.match(await read(root, AGENT), /^tools: Read, Edit$/m);
  ok(strict(root));
  assert.deepEqual(await backups(root), []);
});

test('hand-edited generated entry: refused with zero writes naming the entries; --replace succeeds and keeps owner entries', async (t) => {
  const root = await workspace(t);
  ok(sync(root));
  await edit(root, SETTINGS, (text) => { const json = JSON.parse(text); json.permissions.deny = json.permissions.deny.filter((r) => r !== 'Write(/api/**)').map((r) => r === 'Edit(/api/**)' ? 'Edit(/apx/**)' : r); json.permissions.deny.push('Bash(rm:*)'); return `${JSON.stringify(json, null, 2)}\n`; });
  const stale = syncedWarnings(root)[0];
  assert.ok(stale.startsWith('Synced config: STALE — re-run agentos agents sync claude-code --role developer --replace (.claude/settings.local.json: generated entry edited)'), stale);

  const before = await snapshot(root);
  const refused = sync(root);
  fails(refused);
  assert.match(refused.stdout, /^- \.claude\/settings\.local\.json: generated entry edited \(permissions\.deny: Edit\(\/api\/\*\*\), permissions\.deny: Write\(\/api\/\*\*\)\)$/m);
  assert.match(refused.stdout, /--replace/);
  assert.match(refused.stdout, /^Nothing was written\.$/m);
  assert.deepEqual(await snapshot(root), before, 'zero writes');

  const r = sync(root, '--replace');
  ok(r);
  const deny = JSON.parse(await read(root, SETTINGS)).permissions.deny;
  for (const rule of ['Edit(/api/**)', 'Write(/api/**)', 'Bash(rm:*)', 'Edit(/apx/**)']) assert.ok(deny.includes(rule), rule);
  assert.equal(deny.at(-1), 'Bash(rm:*)', 'owner entry kept in place');
  assert.equal((await backups(root)).length, 1, 'one backup of the overwritten file');
  ok(strict(root));
});

test('hand-edited .claude/agents/<id>.md: refused with zero writes; --replace replaces it with exactly one backup of the edited bytes', async (t) => {
  const root = await workspace(t);
  ok(sync(root));
  const generated = await read(root, AGENT);
  await writeFile(join(root, AGENT), `${generated}\nMy own note.\n`);
  assert.ok(syncedWarnings(root)[0].includes('--replace (.claude/agents/developer.md: generated entry edited)'));
  const before = await snapshot(root);
  const refused = sync(root);
  fails(refused);
  assert.match(refused.stdout, /^- \.claude\/agents\/developer\.md: generated entry edited \(whole file\)$/m);
  assert.deepEqual(await snapshot(root), before, 'zero writes');

  const r = sync(root, '--replace');
  ok(r);
  assert.match(r.stdout, /^Updated: \.claude\/agents\/developer\.md \(--replace; old file backed up to \.agentos\/runs\/replaced-synced\/[^/]+\/\.claude\/agents\/developer\.md\)$/m);
  assert.equal(await read(root, AGENT), generated);
  const saved = await backups(root);
  assert.equal(saved.length, 1);
  assert.equal(await read(root, `.agentos/runs/replaced-synced${saved[0]}`), `${generated}\nMy own note.\n`);
  ok(strict(root));
  ok(sync(root));
  assert.equal((await backups(root)).length, 1, 'a later plain re-sync makes no further backup');
});

test('no record (1.0.0 settings incl. Edit(/*)): refused naming --replace with zero writes; --replace takes over allow/deny, backs up once, writes the record', async (t) => {
  const root = await workspace(t);
  await mkdir(join(root, '.claude'));
  const legacy = `${JSON.stringify({ model: 'opus', permissions: { allow: ['Edit(/web/src/**)'], deny: ['Edit(/*)', 'Write(/*)', 'Edit(/api/**)'] } }, null, 2)}\n`;
  await writeFile(join(root, SETTINGS), legacy);
  const before = await snapshot(root);
  const refused = sync(root);
  fails(refused);
  assert.match(refused.stdout, /^- \.claude\/settings\.local\.json: no sync record owns permissions\.deny$/m);
  assert.match(refused.stdout, /--replace/);
  assert.deepEqual(await snapshot(root), before, 'zero writes');
  const dry = sync(root, '--replace', '--dry-run');
  ok(dry);
  assert.match(dry.stdout, /^  - permissions\.deny: Edit\(\/\*\)$/m);
  assert.deepEqual(await snapshot(root), before, 'dry run writes nothing');

  ok(sync(root, '--replace'));
  const settings = JSON.parse(await read(root, SETTINGS));
  assert.equal(settings.model, 'opus');
  assert.ok(!settings.permissions.deny.some((rule) => rule.endsWith('(/*)')), 'the over-matching /* rules are gone');
  assert.deepEqual(settings.permissions.allow, ['Edit(/web/src/**)']);
  assert.equal(JSON.parse(await read(root, RECORD)).role, 'developer');
  const saved = await backups(root);
  assert.deepEqual(saved.map((p) => p.replace(/^\/[^/]+/, '')), ['/.claude/settings.local.json']);
  assert.equal(await read(root, `.agentos/runs/replaced-synced${saved[0]}`), legacy);
  ok(strict(root));
  assert.deepEqual(syncedWarnings(root), []);
});

test('codex: re-sync after a manifest change replaces only the role block; bytes before and after it survive', async (t) => {
  const root = await workspace(t);
  const pointer = await read(root, 'web/AGENTS.md');
  ok(cli(['agents', 'sync', 'codex'], root));
  await edit(root, 'web/AGENTS.md', (text) => `${text}\n## Owner notes\n\nKeep me.\n`);
  const prior = await read(root, 'web/AGENTS.md');
  await edit(root, '.agentos/agents/developer.md', (text) => text.replace(/^purpose: .*$/m, 'purpose: Ship the greeting feature only'));
  assert.ok(syncedWarnings(root)[0].startsWith('Synced config: STALE — re-run agentos agents sync codex --role developer (web/AGENTS.md: manifest changed)'));
  ok(cli(['agents', 'sync', 'codex'], root));
  const after = await read(root, 'web/AGENTS.md');
  assert.match(after, /^Purpose: Ship the greeting feature only$/m);
  const start = after.indexOf('<!-- agentos:role:start -->'), end = after.indexOf('\n', after.indexOf('<!-- agentos:role:end -->')) + 1;
  const priorStart = prior.indexOf('<!-- agentos:role:start -->'), priorEnd = prior.indexOf('\n', prior.indexOf('<!-- agentos:role:end -->')) + 1;
  assert.equal(after.slice(0, start), prior.slice(0, priorStart), 'bytes before the block');
  assert.ok(after.startsWith(pointer));
  assert.equal(after.slice(end), prior.slice(priorEnd), 'bytes after the block');
  assert.match(after.slice(end), /Keep me\.\n$/);
  ok(strict(root, 'codex'));
});

test('switching role: the record follows the new role; the previous role\'s subagent file is removed and its settings entries replaced', async (t) => {
  const root = await workspace(t);
  ok(cli(['agents', 'add', 'tester', '--replace'], root));
  ok(sync(root));
  await edit(root, SETTINGS, (text) => { const json = JSON.parse(text); json.permissions.allow.push('Bash(npm test:*)'); return `${JSON.stringify(json, null, 2)}\n`; });
  const r = sync(root, '--role', 'tester', '--scope', 'web');
  ok(r);
  assert.match(r.stdout, /^Removed: \.claude\/agents\/developer\.md$/m);
  assert.match(r.stdout, /^Created: \.claude\/agents\/tester\.md$/m);
  assert.match(r.stdout, /The sync record tracks one role per engine \(now: tester\); it replaced role developer, whose generated files are replaced or removed above\./);
  await assert.rejects(lstat(join(root, AGENT)));
  const record = JSON.parse(await read(root, RECORD));
  assert.equal(record.role, 'tester');
  assert.deepEqual(record.files.map((f) => f.path), ['.claude/agents/tester.md', SETTINGS]);
  assert.deepEqual(JSON.parse(await read(root, SETTINGS)).permissions.allow, ['Edit(/web/src/**)', 'Bash(npm test:*)'], 'recorded allow replaced by the tester\'s (--scope narrows the task scope to web/src), owner entry kept');
  assert.equal(syncedWarnings(root).length, 0);
  // STALE line quotes the recorded --scope.
  await mkdir(join(root, 'newdir'));
  assert.equal(syncedWarnings(root)[0], "Synced config: STALE — re-run agentos agents sync claude-code --role tester --scope 'web' (.claude/settings.local.json: tree changed)");
});

test('STALE line quotes a multi-path --scope and names --replace only when the plain re-sync would refuse', async (t) => {
  const root = await workspace(t);
  ok(sync(root, '--scope', 'web/src,api/contracts'));
  await mkdir(join(root, 'newdir'));
  const r = strict(root);
  fails(r);
  assert.equal(syncedLine(r), "Synced config: STALE — re-run agentos agents sync claude-code --role developer --scope 'web/src,api/contracts' (.claude/settings.local.json: tree changed)");
  await edit(root, AGENT, (text) => `${text}x\n`);
  assert.match(syncedLine(strict(root)), /^Synced config: STALE — re-run agentos agents sync claude-code --role developer --scope 'web\/src,api\/contracts' --replace \(/);
});

test('dry run prints per-file +/- entries or whole-file lines and writes nothing (no lock, record, backup or temp file)', async (t) => {
  const root = await workspace(t);
  ok(sync(root));
  await mkdir(join(root, 'newdir'));
  await edit(root, '.agentos/agents/developer.md', (text) => text.replace('tools_requested: []', 'tools_requested: [read]'));
  await edit(root, AGENT, (text) => `${text}edited\n`);
  const before = await snapshot(root);
  const refused = sync(root, '--dry-run');
  fails(refused);
  assert.deepEqual(await snapshot(root), before);
  const r = sync(root, '--dry-run', '--replace');
  ok(r);
  assert.match(r.stdout, /^Would update: \.claude\/agents\/developer\.md \(--replace; old file would be backed up to \.agentos\/runs\/replaced-synced\/\)\n  whole file replaced$/m);
  assert.match(r.stdout, /^Would update: \.claude\/settings\.local\.json\n  \+ permissions\.deny: Edit\(\/newdir\/\*\*\)$/m);
  assert.match(r.stdout, /^Would update: \.agentos\/synced\/claude-code\.json \(sync record\)$/m);
  assert.deepEqual(await snapshot(root), before, 'dry run writes nothing');
  await rm(join(root, 'newdir'), { recursive: true });
  await edit(root, '.agentos/agents/developer.md', (text) => text.replace('tools_requested: [read]', 'tools_requested: []'));
  await edit(root, AGENT, (text) => text.replace(/edited\n$/, ''));
  const unchanged = sync(root, '--dry-run');
  ok(unchanged);
  assert.match(unchanged.stdout, /^Unchanged: \.claude\/agents\/developer\.md\nUnchanged: \.claude\/settings\.local\.json\nUnchanged: \.agentos\/synced\/claude-code\.json \(sync record\)$/m);
});

test('boundary: a symlinked .agentos/runs (backup) or .agentos/synced (record) is rejected before any write', async (t) => {
  for (const target of ['.agentos/runs', '.agentos/synced']) {
    const root = await workspace(t);
    ok(sync(root));
    await edit(root, AGENT, (text) => `${text}edited\n`);
    const outside = join(root, '..', `outside-${target.split('/')[1]}`);
    await mkdir(outside);
    await rm(join(root, target), { recursive: true, force: true });
    await symlink(outside, join(root, target));
    const before = await snapshot(join(root, '..'));
    const r = sync(root, '--replace');
    assert.notEqual(r.status, 0, r.stdout);
    assert.match(r.stdout + r.stderr, /boundary|symlink/i);
    assert.deepEqual(await snapshot(join(root, '..')), before, `${target}: zero writes inside or outside the workspace`);
  }
});

test('fault injection: a failure while writing the record rolls back every file, the backup and the record', async (t) => {
  const root = await workspace(t);
  ok(sync(root));
  await mkdir(join(root, 'newdir'));
  await edit(root, '.agentos/agents/developer.md', (text) => text.replace('tools_requested: []', 'tools_requested: [read]'));
  await edit(root, AGENT, (text) => `${text}edited\n`);
  const before = await snapshot(root);
  __setAtomicWriteFaultForTests(join(root, RECORD), 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);
  await assert.rejects(agentsAgentOS({ cwd: root, command: 'sync', engine: 'claude-code', replace: true }), /Injected atomic-write test fault/);
  assert.deepEqual(changed(before, await snapshot(root)), [], 'settings, subagent file, backup dir and record all restored; no lock or temp file left');
  // Same sync without the fault applies all of it.
  const result = await agentsAgentOS({ cwd: root, command: 'sync', engine: 'claude-code', replace: true });
  assert.equal(result.ok, true, result.text);
  const after = await snapshot(root);
  assert.deepEqual(changed(before, after).filter((k) => !k.startsWith(join('.agentos', 'runs'))), [AGENT, SETTINGS, RECORD].map((p) => join(p)).sort()); // snapshot keys use the native separator
});
