import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, lstat, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { initAgentOS, compactAgentOS, __setAtomicWriteFaultForTests, __clearAtomicWriteFaultForTests } from '../dist/core.js';

const CLI = resolve('dist/cli.js');

const HANDOFF = [
  '# Handoff', '',
  '## Scope', '', '- Workspace kind: multi-repo', '- Repos in scope: backend, frontend', '',
  '## Current objective — 2026-09-15 (latest): AUM work merged', '', 'Finish the compaction rewrite.', '',
  '## Current objective — 2026-09-01', '', 'Superseded narrative that must leave live context.', '',
  '## Previous objective — 2026-08-15', '', 'Much older narrative.', '', 'Never deploy without owner approval.', '',
  '## Known failures', '', '- Flaky CI must never be treated as passing.', '',
  '## Files changed', '', '- src/core.ts', '',
  '```md', '## Current objective — fenced example, not a section', '```', '',
  '## Next exact action', '', 'Apply the verified rewrite.', '',
].join('\n');

const TASKS = [
  '# Tasks', '',
  '## Now', '', '- [ ] Apply the verified rewrite.', '  - Acceptance: archive is byte-exact.', '',
  '## Next', '', '- [ ] Wire the CLI flag.', '',
  '## Later', '', '- [ ] Publish the release.', '',
  '## Done', '', '- [x] Slice 1 heading recognition.', '',
].join('\n');

async function fixture(t, { handoff = HANDOFF, tasks = TASKS } = {}) {
  const parent = await mkdtemp(join(tmpdir(), 'agentos-rewrite-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'workspace');
  await mkdir(root);
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), handoff);
  await writeFile(join(root, '.agentos/tasks.md'), tasks);
  return { parent, root };
}

/** Whole-tree snapshot: relative path -> mode + content hash, so no write can hide. */
async function snapshot(dir) {
  const out = {};
  async function walk(path, key) {
    const info = await lstat(path);
    out[key] = {
      mode: info.mode,
      ...(info.isSymbolicLink() ? { link: (await readdir(path).catch(() => null)) === null ? 'link' : 'dir' } : {}),
      ...(info.isDirectory() ? {} : { sha: createHash('sha256').update(await readFile(path)).digest('hex') }),
    };
    if (info.isDirectory()) for (const name of (await readdir(path)).sort()) await walk(join(path, name), `${key}/${name}`);
  }
  await walk(dir, '.');
  return out;
}

function cli(root, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
}
function candidateIds(text) {
  return [...new Set(text.match(/obj-[a-f0-9]{10}/g) ?? [])];
}
/** Ambiguous state: the blocked report is the review surface that lists candidate ids. */
function objectiveIdFor(root) {
  const blocked = cli(root, ['compact', '--rewrite']);
  const [id] = candidateIds(blocked.stdout);
  assert.ok(id, `expected objective candidates in:\n${blocked.stdout}`);
  return id;
}
async function archiveDirs(root) {
  return (await readdir(join(root, '.agentos/runs'), { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('compact-rewrite-'))
    .map((entry) => entry.name)
    .sort();
}

test('ambiguous objective blocks the rewrite with exit 1 and zero writes', async (t) => {
  const { root } = await fixture(t);
  const before = await snapshot(root);
  const result = cli(root, ['compact', '--rewrite']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /blocked/i);
  assert.match(result.stdout, /2 current-objective headings/);
  assert.match(result.stdout, /--objective/);
  assert.equal(candidateIds(result.stdout).length, 2, 'blocked output lists the candidate ids');
  assert.deepEqual(await snapshot(root), before, 'a blocked rewrite must not touch the workspace');

  const unknown = cli(root, ['compact', '--rewrite', '--objective', 'obj-0000000000']);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stdout, /unknown --objective/);
  assert.deepEqual(await snapshot(root), before);
});

test('dry run keeps exact live proposals in the API and prints a concise CLI summary', async (t) => {
  const { root } = await fixture(t);
  const before = await snapshot(root);
  const objective = objectiveIdFor(root);
  const plan = await compactAgentOS({ cwd: root, rewrite: true, objective, dryRun: true });
  assert.equal(plan.ok, true, plan.text);
  assert.ok(plan.proposed.handoff.includes('## Current objective — 2026-09-15 (latest): AUM work merged'));
  assert.equal(plan.proposed.handoff.includes('Superseded narrative that must leave live context.'), false);
  assert.equal(plan.objectiveCandidates.length, 2);

  const preview = cli(root, ['compact', '--rewrite', '--objective', objective, '--dry-run']);
  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.match(preview.stdout, /dry run/i);
  assert.match(preview.stdout, /Mode: structural rewrite/);
  assert.match(preview.stdout, /Would archive: \.agentos\/runs\/compact-rewrite-[a-f0-9]{64}\//);
  assert.doesNotMatch(preview.stdout, /--- Proposed/);
  assert.doesNotMatch(preview.stdout, /Superseded narrative that must leave live context\./);
  assert.deepEqual(await snapshot(root), before, 'dry run must not create archives, temp files or locks');
});

test('apply archives original bytes, replaces live state, and preserves unresolved work', async (t) => {
  const { root } = await fixture(t);
  const originalHandoff = await readFile(join(root, '.agentos/handoff.md'));
  const originalTasks = await readFile(join(root, '.agentos/tasks.md'));
  const preview = cli(root, ['compact', '--rewrite', '--dry-run']);
  const [objective] = candidateIds(preview.stdout);
  assert.ok(objective, preview.stdout);

  const apply = cli(root, ['compact', '--rewrite', '--objective', objective]);
  assert.equal(apply.status, 0, apply.stdout + apply.stderr);
  assert.match(apply.stdout, /rewrite/i);

  const dirs = await archiveDirs(root);
  assert.equal(dirs.length, 1, `exactly one archive bundle expected: ${JSON.stringify(dirs)}`);
  const bundle = join(root, '.agentos/runs', dirs[0]);
  assert.deepEqual(await readdir(bundle).then((names) => names.sort()), ['README.md', 'handoff.md', 'manifest.json', 'tasks.md']);
  assert.deepEqual(await readFile(join(bundle, 'handoff.md')), originalHandoff, 'archived handoff must be byte-identical');
  assert.deepEqual(await readFile(join(bundle, 'tasks.md')), originalTasks, 'archived tasks must be byte-identical');

  const manifest = JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8'));
  assert.equal(manifest.format, 'agentos-compact-rewrite');
  assert.equal(manifest.source['handoff.md'].sha256, createHash('sha256').update(originalHandoff).digest('hex'));
  assert.equal(manifest.source['tasks.md'].sha256, createHash('sha256').update(originalTasks).digest('hex'));
  assert.equal(manifest.source['handoff.md'].bytes, originalHandoff.length);
  assert.equal(manifest.objective.id, objective);
  assert.ok(Array.isArray(manifest.classification.handoff));
  assert.ok(manifest.classification.handoff.some((section) => section.decision === 'archived'));

  const liveHandoff = await readFile(join(root, '.agentos/handoff.md'), 'utf8');
  const liveTasks = await readFile(join(root, '.agentos/tasks.md'), 'utf8');
  assert.ok(liveHandoff.includes('## Current objective — 2026-09-15 (latest): AUM work merged'));
  assert.equal(liveHandoff.includes('Superseded narrative that must leave live context.'), false);
  assert.equal(liveHandoff.includes('Much older narrative.'), false);
  assert.ok(liveHandoff.includes('Never deploy without owner approval.'), 'constraint lines carried forward verbatim');
  assert.ok(liveHandoff.includes('- src/core.ts'), 'unclassified sections stay live');
  assert.ok(liveHandoff.includes('## Known failures'));
  assert.equal(liveHandoff.includes('fenced example, not a section'), true, 'fenced examples stay live as content');
  assert.ok(liveTasks.includes('- [ ] Apply the verified rewrite.'));
  assert.ok(liveTasks.includes('Acceptance: archive is byte-exact.'));
  assert.equal(liveTasks.includes('Slice 1 heading recognition.'), false);

  const doctor = cli(root, ['doctor']);
  assert.ok(!/has no ## Current objective/.test(doctor.stdout), doctor.stdout);
  assert.equal(doctor.status, 0, doctor.stdout + doctor.stderr);
});

test('a second rewrite of unchanged state is a write-free no-op', async (t) => {
  const { root } = await fixture(t);
  const preview = cli(root, ['compact', '--rewrite', '--dry-run']);
  const [objective] = candidateIds(preview.stdout);
  assert.equal(cli(root, ['compact', '--rewrite', '--objective', objective]).status, 0);
  const after = await snapshot(root);
  const again = cli(root, ['compact', '--rewrite', '--objective', objective]);
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.match(again.stdout, /no changes|already/i);
  assert.deepEqual(await snapshot(root), after, 'repeat rewrite must not write, re-archive, or re-link');
  assert.equal((await archiveDirs(root)).length, 1);

  const dryAgain = cli(root, ['compact', '--rewrite', '--objective', objective, '--dry-run']);
  assert.equal(dryAgain.status, 0);
  assert.deepEqual(await snapshot(root), after);
});

test('expect-state refuses to apply a stale preview', async (t) => {
  const { root } = await fixture(t);
  const objective = objectiveIdFor(root);
  const preview = cli(root, ['compact', '--rewrite', '--objective', objective, '--dry-run', '--diff']);
  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  const state = /--expect-state ([a-f0-9]{64})/.exec(preview.stdout);
  assert.ok(state, `preview must print the source state hash:\n${preview.stdout}`);
  await writeFile(join(root, '.agentos/handoff.md'), `${await readFile(join(root, '.agentos/handoff.md'), 'utf8')}\n## Late addition\n\n- Added by another agent.\n`);
  const before = await snapshot(root);
  const stale = cli(root, ['compact', '--rewrite', '--objective', objective, '--expect-state', state[1]]);
  assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  assert.match(stale.stdout, /changed after this preview/);
  assert.match(stale.stdout, /--expect-state/);
  assert.deepEqual(await snapshot(root), before, 'stale preview must not write');

  const fresh = cli(root, ['compact', '--rewrite', '--objective', objective, '--dry-run', '--diff']);
  const freshState = /--expect-state ([a-f0-9]{64})/.exec(fresh.stdout);
  assert.ok(freshState);
  assert.equal(cli(root, ['compact', '--rewrite', '--objective', objective, '--expect-state', freshState[1]]).status, 0);
});

test('apply rolls the whole workspace back when any write fails', async (t) => {
  const { root } = await fixture(t);
  const preview = cli(root, ['compact', '--rewrite', '--dry-run']);
  const [objective] = candidateIds(preview.stdout);
  const before = await snapshot(root);
  const live = await readFile(join(root, '.agentos/handoff.md'), 'utf8');
  const plan = await compactAgentOS({ cwd: root, rewrite: true, objective, dryRun: true });
  assert.equal(plan.ok, true, plan.text);
  const expectedArchive = plan.archivePath;

  __setAtomicWriteFaultForTests(join(root, '.agentos/tasks.md'), 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);
  await assert.rejects(compactAgentOS({ cwd: root, rewrite: true, objective }), /Injected atomic-write test fault/);
  assert.deepEqual(await snapshot(root), before, 'failed apply must restore live files and remove the archive bundle');
  assert.equal(await readFile(join(root, '.agentos/handoff.md'), 'utf8'), live);

  __setAtomicWriteFaultForTests(join(expectedArchive, 'handoff.md'), 'before-rename');
  await assert.rejects(compactAgentOS({ cwd: root, rewrite: true, objective }), /Injected atomic-write test fault/);
  assert.deepEqual(await snapshot(root), before, 'archive failure must leave live state untouched');
});

test('rewrite refuses invalid UTF-8 and unreadable sources without writing', async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, '.agentos/tasks.md'), Buffer.from([0x23, 0x20, 0xff, 0x0a]));
  const before = await snapshot(root);
  const result = cli(root, ['compact', '--rewrite', '--dry-run']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /UTF-8/);
  assert.deepEqual(await snapshot(root), before);
});

test('compact flags are validated and the checkpoint mode is unchanged', async (t) => {
  const { root } = await fixture(t);
  const noRewrite = cli(root, ['compact', '--objective', 'obj-abcdef0123']);
  assert.equal(noRewrite.status, 1);
  assert.match(noRewrite.stderr + noRewrite.stdout, /--objective requires --rewrite/);

  const checkpoint = cli(root, ['compact']);
  assert.equal(checkpoint.status, 0, checkpoint.stdout + checkpoint.stderr);
  assert.match(checkpoint.stdout, /Mode: archival checkpoint/);
  assert.equal((await archiveDirs(root)).length, 0, 'checkpoint mode uses the compact-archive-* format');
  const runs = await readdir(join(root, '.agentos/runs'));
  assert.ok(runs.some((name) => /^compact-archive-[a-f0-9]{64}\.md$/.test(name)), JSON.stringify(runs));
});

test('rewrite reports growth honestly and never claims negative savings', async (t) => {
  const { root } = await fixture(t, {
    handoff: '# Handoff\n\n## Current objective\n\nSmall objective.\n\n## Scope\n\n- Single repo.\n',
    tasks: '# Tasks\n\n## Now\n\n- [ ] Small task.\n\n## Done\n\n- [x] Nothing yet.\n',
  });
  const preview = cli(root, ['compact', '--rewrite', '--dry-run']);
  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.match(preview.stdout, /chars (added|removed)/);
  assert.doesNotMatch(preview.stdout, /-\d+\s*%/);
  assert.match(preview.stdout, /No sections qualified for archival|archived/);
});

test('rewrite reports how many sections it archived per file', async (t) => {
  const { root } = await fixture(t);
  const preview = cli(root, ['compact', '--rewrite', '--objective', objectiveIdFor(root), '--dry-run']);
  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.match(preview.stdout, /Classification:/);
  assert.match(preview.stdout, /handoff\.md: \d+ archived/);
  assert.match(preview.stdout, /tasks\.md: \d+ archived/);
  assert.match(preview.stdout, /carried-forward constraints: \d+ line\(s\)/);
  assert.doesNotMatch(preview.stdout, /Objective candidates:/);
});

test('rewrite refuses symlinked live state without touching the link target', async (t) => {
  const { parent, root } = await fixture(t);
  const outside = join(parent, 'outside-handoff.md');
  await writeFile(outside, HANDOFF);
  await rm(join(root, '.agentos/handoff.md'));
  await (await import('node:fs/promises')).symlink(outside, join(root, '.agentos/handoff.md'));
  const before = await snapshot(parent);
  const result = cli(root, ['compact', '--rewrite', '--dry-run']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /symlink/i, 'boundary preflight must refuse linked live state');
  assert.deepEqual(await snapshot(parent), before, 'no write, no outside mutation, no archive');
  assert.equal(await readFile(outside, 'utf8'), HANDOFF);
});
