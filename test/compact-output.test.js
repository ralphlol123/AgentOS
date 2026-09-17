import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');

async function fixture(t, { handoff, tasks } = {}) {
  const parent = await mkdtemp(join(tmpdir(), 'agentos-compact-output-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'workspace');
  await mkdir(root);
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  if (handoff !== undefined) await writeFile(join(root, '.agentos/handoff.md'), handoff);
  if (tasks !== undefined) await writeFile(join(root, '.agentos/tasks.md'), tasks);
  return { parent, root };
}

async function snapshotTree(root) {
  const entries = {};
  async function walk(path, relative) {
    const info = await lstat(path);
    const common = { mode: info.mode, type: info.isSymbolicLink() ? 'link' : info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other' };
    if (info.isSymbolicLink()) entries[relative] = { ...common, target: await readlink(path) };
    else if (info.isFile()) entries[relative] = { ...common, bytes: (await readFile(path)).toString('base64') };
    else entries[relative] = common;
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await walk(join(path, name), relative === '.' ? name : `${relative}/${name}`);
    }
  }
  await walk(root, '.');
  return entries;
}

function cli(root, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
}

const rewriteHandoff = (repeat = 1) => [
  '# Handoff', '',
  '## Current objective', '', 'Keep the concise preview safe.', '',
  '## Previous objective', '', `HANDOFF_SENTINEL_Ω ${'old narrative '.repeat(repeat)}`, '',
  'Never deploy without owner approval.', '',
  '## Scope', '', '- Single repo.', '',
].join('\r\n');

const rewriteTasks = (repeat = 1) => [
  '# Tasks', '',
  '## Now', '', '- [ ] Keep current work.', '',
  '## Done', '', `- [x] TASKS_SENTINEL_雪 ${'completed detail '.repeat(repeat)}`, '',
].join('\r\n');

test('blocked rewrite --diff keeps concise candidates and writes nothing', async (t) => {
  const handoff = [
    '# Handoff', '',
    '## Current objective — first', '', 'BLOCKED_BODY_SENTINEL_A ' + 'private prose '.repeat(2000), '',
    '## Current objective — second', '', 'BLOCKED_BODY_SENTINEL_B ' + 'more prose '.repeat(2000), '',
  ].join('\n');
  const tasks = '# Tasks\n\n## Now\n\n- [ ] Resolve ambiguity.\n';
  const { parent, root } = await fixture(t, { handoff, tasks });
  const before = await snapshotTree(parent);

  const preview = cli(root, ['compact', '--rewrite', '--dry-run', '--diff']);

  assert.equal(preview.status, 1, preview.stdout + preview.stderr);
  assert.match(preview.stdout, /2 current-objective headings/);
  assert.match(preview.stdout, /Objective candidates:/);
  assert.equal((preview.stdout.match(/obj-[a-f0-9]{10}/g) ?? []).length, 2);
  assert.match(preview.stdout, /\(line 3\): Current objective — first/);
  assert.match(preview.stdout, /\(line 7\): Current objective — second/);
  assert.match(preview.stdout, /Detailed diff unavailable: compaction is blocked\./);
  assert.doesNotMatch(preview.stdout, /BLOCKED_BODY_SENTINEL_A|BLOCKED_BODY_SENTINEL_B/);
  assert.doesNotMatch(preview.stdout, /^--- a\//m);
  assert.doesNotMatch(preview.stdout, /--- Proposed/);
  assert.deepEqual(await snapshotTree(parent), before);
});

test('rewrite --diff reports unchanged proposals without empty patch headers or writes', async (t) => {
  const { parent, root } = await fixture(t, { handoff: rewriteHandoff(100), tasks: rewriteTasks(100) });
  const apply = cli(root, ['compact', '--rewrite']);
  assert.equal(apply.status, 0, apply.stdout + apply.stderr);
  const before = await snapshotTree(parent);

  const preview = cli(root, ['compact', '--rewrite', '--dry-run', '--diff']);

  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.match(preview.stdout, /No differences: proposed live files are unchanged\./);
  assert.doesNotMatch(preview.stdout, /^--- a\//m);
  assert.doesNotMatch(preview.stdout, /^\+\+\+ b\//m);
  assert.deepEqual(await snapshotTree(parent), before);
});

test('rewrite --diff shows the intended removals and additions without writing', async (t) => {
  const { parent, root } = await fixture(t, { handoff: rewriteHandoff(2), tasks: rewriteTasks(2) });
  const before = await snapshotTree(parent);

  const preview = cli(root, ['compact', '--rewrite', '--dry-run', '--diff']);

  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.match(preview.stdout, /^--- a\/\.agentos\/handoff\.md$/m);
  assert.match(preview.stdout, /^\+\+\+ b\/\.agentos\/handoff\.md$/m);
  assert.match(preview.stdout, /^-HANDOFF_SENTINEL_Ω old narrative old narrative /m);
  assert.match(preview.stdout, /^-Never deploy without owner approval\.$/m);
  assert.match(preview.stdout, /^\+- Never deploy without owner approval\.$/m);
  assert.match(preview.stdout, /^--- a\/\.agentos\/tasks\.md$/m);
  assert.match(preview.stdout, /^-- \[x\] TASKS_SENTINEL_雪 completed detail completed detail /m);
  assert.match(preview.stdout, /^\+## History$/m);
  assert.match(preview.stdout, /Source state: [a-f0-9]{64}/);
  assert.deepEqual(await snapshotTree(parent), before);
});

test('structural --diff renders intended Unicode CRLF changes without writing', async (t) => {
  const handoff = `# Handoff\r\n\r\n## Current objective\r\n\r\nKeep café ☕ context.\r\n\r\n## Previous objective\r\n\r\nOLD_雪 ${'history '.repeat(200)}\r\n`;
  const tasks = `# Tasks\r\n\r\n## Now\r\n\r\n- [ ] Ship 雪 safely.\r\n\r\n## Done\r\n\r\n- [x] OLD_☕ ${'detail '.repeat(200)}\r\n`;
  const { parent, root } = await fixture(t, { handoff, tasks });
  const before = await snapshotTree(parent);

  const preview = cli(root, ['compact', '--dry-run', '--diff']);

  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.match(preview.stdout, /^--- a\/\.agentos\/handoff\.md$/m);
  assert.match(preview.stdout, /^\+\+\+ b\/\.agentos\/handoff\.md$/m);
  assert.match(preview.stdout, /^--- a\/\.agentos\/tasks\.md$/m);
  assert.match(preview.stdout, /^\+\+\+ b\/\.agentos\/tasks\.md$/m);
  assert.match(preview.stdout, /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@$/m);
  assert.match(preview.stdout, /^-OLD_雪 history /m);
  assert.match(preview.stdout, /^-- \[x\] OLD_☕ detail /m);
  assert.match(preview.stdout, /^\+## History\r$/m);
  assert.match(preview.stdout, /café ☕ context/);
  assert.match(preview.stdout, /Ship 雪 safely/);
  assert.match(preview.stdout, /^ Keep café ☕ context\.\r$/m, 'CRLF context preserves its line terminator in the unified diff');
  assert.deepEqual(await snapshotTree(parent), before);
});

test('--diff is compact dry-run only and boolean false stays inactive', async (t) => {
  const { parent, root } = await fixture(t, {
    handoff: '# Handoff\n\n## Current objective\n\nPreview safely.\n',
    tasks: '# Tasks\n\n## Now\n\n- [ ] Preview safely.\n',
  });
  const before = await snapshotTree(parent);

  const applying = cli(root, ['compact', '--diff']);
  assert.equal(applying.status, 1, applying.stdout + applying.stderr);
  assert.match(applying.stdout + applying.stderr, /--diff requires --dry-run/);
  assert.deepEqual(await snapshotTree(parent), before, 'validation refusal must happen before locks, archives, backups, or temp files');

  const outsideCompact = cli(root, ['status', '--diff']);
  assert.equal(outsideCompact.status, 1, outsideCompact.stdout + outsideCompact.stderr);
  assert.match(outsideCompact.stdout + outsideCompact.stderr, /--diff is not supported by status/);
  assert.deepEqual(await snapshotTree(parent), before);

  const inactive = cli(root, ['compact', '--dry-run', '--diff=false']);
  assert.equal(inactive.status, 0, inactive.stdout + inactive.stderr);
  assert.doesNotMatch(inactive.stdout, /^--- a\/\.agentos\//m);
  assert.deepEqual(await snapshotTree(parent), before);
});

test('checkpoint dry-run is concise and independent of live body size', async (t) => {
  const makeHandoff = (repeat) => `# Handoff\n\n## Current objective\n\nCHECKPOINT_HANDOFF_SENTINEL ${'verbose handoff '.repeat(repeat)}\n`;
  const makeTasks = (repeat) => `# Tasks\n\n## Now\n\n- [ ] CHECKPOINT_TASKS_SENTINEL ${'verbose task '.repeat(repeat)}\n`;
  const small = await fixture(t, { handoff: makeHandoff(1), tasks: makeTasks(1) });
  const large = await fixture(t, { handoff: makeHandoff(5000), tasks: makeTasks(5000) });
  const beforeSmall = await snapshotTree(small.parent);
  const beforeLarge = await snapshotTree(large.parent);

  const smallPreview = cli(small.root, ['compact', '--checkpoint', '--dry-run']);
  const largePreview = cli(large.root, ['compact', '--checkpoint', '--dry-run']);

  for (const preview of [smallPreview, largePreview]) {
    assert.equal(preview.status, 0, preview.stdout + preview.stderr);
    assert.match(preview.stdout, /^AgentOS compact dry run/m);
    assert.match(preview.stdout, /Mode: archival checkpoint/);
    assert.match(preview.stdout, /handoff\.md: \d+ chars -> \d+ chars/);
    assert.match(preview.stdout, /tasks\.md: \d+ chars -> \d+ chars/);
    assert.match(preview.stdout, /total: \d+ chars -> \d+ chars \(\d+ chars added\)/);
    assert.match(preview.stdout, /Would archive: \.agentos\/runs\/compact-archive-[a-f0-9]{64}\.md/);
    assert.match(preview.stdout, /Would rewrite: \.agentos\/handoff\.md, \.agentos\/tasks\.md/);
    assert.doesNotMatch(preview.stdout, /CHECKPOINT_HANDOFF_SENTINEL|CHECKPOINT_TASKS_SENTINEL/);
    assert.doesNotMatch(preview.stdout, /--- Proposed|--- End proposed/);
  }
  assert.ok(largePreview.stdout.length <= smallPreview.stdout.length + 50, `output grew with body: ${smallPreview.stdout.length} -> ${largePreview.stdout.length}`);
  assert.deepEqual(await snapshotTree(small.parent), beforeSmall);
  assert.deepEqual(await snapshotTree(large.parent), beforeLarge);
});

test('rewrite dry-run is concise and independent of live body size', async (t) => {
  const small = await fixture(t, { handoff: rewriteHandoff(100), tasks: rewriteTasks(100) });
  const large = await fixture(t, { handoff: rewriteHandoff(4000), tasks: rewriteTasks(4000) });
  const beforeSmall = await snapshotTree(small.parent);
  const beforeLarge = await snapshotTree(large.parent);

  const smallPreview = cli(small.root, ['compact', '--rewrite', '--dry-run']);
  const largePreview = cli(large.root, ['compact', '--rewrite', '--dry-run']);

  for (const preview of [smallPreview, largePreview]) {
    assert.equal(preview.status, 0, preview.stdout + preview.stderr);
    assert.match(preview.stdout, /^AgentOS compact dry run/m);
    assert.match(preview.stdout, /Root:/);
    assert.match(preview.stdout, /handoff\.md: \d+ chars -> \d+ chars/);
    assert.match(preview.stdout, /tasks\.md: \d+ chars -> \d+ chars/);
    assert.match(preview.stdout, /total: \d+ chars -> \d+ chars \((?:\d+ chars (?:added|removed)|0 chars)\)/);
    assert.match(preview.stdout, /Would archive: \.agentos\/runs\/compact-rewrite-[a-f0-9]{64}\//);
    assert.match(preview.stdout, /Would rewrite: \.agentos\/handoff\.md, \.agentos\/tasks\.md/);
    assert.doesNotMatch(preview.stdout, /HANDOFF_SENTINEL_Ω|TASKS_SENTINEL_雪/);
    assert.doesNotMatch(preview.stdout, /Never deploy without owner approval/);
    assert.doesNotMatch(preview.stdout, /--- Proposed|--- End proposed/);
  }
  assert.ok(largePreview.stdout.length <= smallPreview.stdout.length + 250, `output grew with body: ${smallPreview.stdout.length} -> ${largePreview.stdout.length}`);
  assert.deepEqual(await snapshotTree(small.parent), beforeSmall);
  assert.deepEqual(await snapshotTree(large.parent), beforeLarge);
});
