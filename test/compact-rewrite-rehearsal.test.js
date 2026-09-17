import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { initAgentOS, compactAgentOS, doctorAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');

/** A disposable multi-repo workspace shaped like the real one that motivated compaction: dated
 *  objectives, a long Done list, custom sections, and old checkpoint links. */
function representativeState({ objectives = 1, previous = 30, detailsPerTask = 3 } = {}) {
  const handoff = ['# Handoff', ''];
  for (let i = 0; i < objectives; i++) {
    handoff.push(`## Current objective — 2026-09-${String(15 - i).padStart(2, '0')}${i === 0 ? ' (latest): AUM work merged' : ''}`, '',
      `Objective body ${i}: ${'context '.repeat(60)}`, '',
      `- [ ] Live obligation from objective ${i}`, '  - Acceptance: verified by tests.', '');
  }
  handoff.push('## Scope', '', '- Workspace kind: multi-repo', '- Repos in scope: backend, frontend, frontend-client', '',
    '## Protected files / do not touch', '', '- secrets/.env', '- migrations/', '',
    '## Known warnings / failures', '', '- Do not treat flaky CI as passing.', '',
    '## Open decisions', '', '- [ ] Decide the release cadence.', '',
    '## Files changed', '', '- src/core.ts', '',
    '## Custom escalation', '', 'Call the owner before migration.', '');
  const retainedObligations = new Map([
    [1, 'never push to main'],
    [2, '`migration.sql` must never be edited after being applied.'],
    [3, 'Accounts, locations and trips in the production database must not be modified without approval.'],
  ]);
  for (let i = 0; i < previous; i++) {
    handoff.push(`## Previous objective — 2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')} (run ${i})`, '',
      `Historical narrative ${i}: ${'detail '.repeat(120)}End.`, '',
      retainedObligations.get(i) ?? (i % 7 === 0 ? 'Never deploy this repo without owner approval.' : `- [x] Finished step ${i}`), '');
  }
  handoff.push('[Compaction archive: previous handoff.md](runs/compact-archive-deadbeef.md#previous-handoff)', '');

  const tasks = ['# Tasks', ''];
  for (const heading of ['Now', 'Next', 'Later']) {
    tasks.push(`## ${heading}`, '');
    for (let i = 0; i < 4; i++) {
      tasks.push(`- [ ] ${heading} task ${i}`, ...Array.from({ length: detailsPerTask }, (_, d) => `  - detail ${d} for ${heading} ${i}`), '');
    }
  }
  tasks.push('## Now', '', '- [x] Implement release workflow', '  - [ ] Obtain deployment approval', '  Preserve staging rollback instructions.', '',
    '## Blocked', '', '- [ ] Waiting on owner approval.', '',
    '## Done', '');
  for (let i = 0; i < 60; i++) tasks.push(`- [x] Completed task ${i}`);
  tasks.push('', '## History', '', '- [x] Earlier archived item.', '');
  return { handoff: handoff.join('\n'), tasks: tasks.join('\n') };
}

async function fixture(t, state) {
  const parent = await mkdtemp(join(tmpdir(), 'agentos-rewrite-rehearsal-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'workspace');
  await mkdir(root);
  for (const repo of ['backend', 'frontend', 'frontend-client']) {
    await mkdir(join(root, repo));
    await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo, private: true }));
  }
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), state.handoff);
  await writeFile(join(root, '.agentos/tasks.md'), state.tasks);
  return { parent, root };
}
function cli(root, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
}
async function snapshot(dir) {
  const out = {};
  async function walk(path, key) {
    const info = await lstat(path);
    out[key] = { mode: info.mode, ...(info.isDirectory() ? {} : { sha: createHash('sha256').update(await readFile(path)).digest('hex') }) };
    if (info.isDirectory()) for (const name of (await readdir(path)).sort()) await walk(join(path, name), `${key}/${name}`);
  }
  await walk(dir, '.');
  return out;
}
const unchecked = (text) => (text.match(/^\s*[-*+]\s+\[ \].*$/gm) ?? []).map((line) => line.trim());
const checkboxes = (text) => (text.match(/^\s*[-*+]\s+\[[ xX]\].*$/gm) ?? []).map((line) => line.trim());

test('rehearsal: plain compact reduces a representative multi-repo workspace without losing live obligations', async (t) => {
  const state = representativeState();
  const { root } = await fixture(t, state);

  // 1. A sole dated objective auto-selects in the ordinary write-free preview.
  const before = await snapshot(root);
  const preview = cli(root, ['compact', '--dry-run']);
  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.match(preview.stdout, /chars removed/);
  assert.doesNotMatch(preview.stdout, /Historical narrative 12/, 'concise preview must not dump full source/proposed files');
  assert.deepEqual(await snapshot(root), before, 'dry run must not write');

  // 2. Plain apply, then verify retention, recovery, diagnostics, and no-op behaviour.
  const applied = cli(root, ['compact']);
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  const liveHandoff = await readFile(join(root, '.agentos/handoff.md'), 'utf8');
  const liveTasks = await readFile(join(root, '.agentos/tasks.md'), 'utf8');

  assert.ok(liveHandoff.length < state.handoff.length / 3, `expected a large reduction: ${state.handoff.length} -> ${liveHandoff.length}`);
  assert.ok(liveTasks.length < state.tasks.length, `${state.tasks.length} -> ${liveTasks.length}`);

  // Every unresolved obligation, with its nested detail, is still live.
  for (const line of unchecked(state.handoff)) assert.ok(liveHandoff.includes(line), `live obligation lost from handoff: ${line}`);
  for (const line of unchecked(state.tasks)) assert.ok(liveTasks.includes(line), `live obligation lost from tasks: ${line}`);
  assert.ok(liveTasks.includes('Obtain deployment approval'), 'unchecked descendant of a checked parent must stay live');
  assert.ok(liveTasks.includes('Preserve staging rollback instructions.'));
  // Standing constraints and custom sections survive, verbatim.
  assert.ok(liveHandoff.includes('- secrets/.env'));
  assert.ok(liveHandoff.includes('Do not treat flaky CI as passing.'));
  assert.ok(liveHandoff.includes('Call the owner before migration.'));
  assert.ok(liveHandoff.includes('Never deploy this repo without owner approval.'), 'constraint inside archived history is carried forward');
  assert.ok(liveHandoff.includes('never push to main'), 'lowercase obligation from history must stay live');
  assert.ok(liveHandoff.includes('`migration.sql` must never be edited after being applied.'), 'code-led obligation from history must stay live');
  assert.ok(liveHandoff.includes('Accounts, locations and trips in the production database must not be modified without approval.'), 'long-subject obligation from history must stay live');
  assert.ok(liveHandoff.includes('## Custom escalation') || liveHandoff.includes('### Custom escalation'));
  assert.ok(liveHandoff.includes('## Current objective — 2026-09-15 (latest): AUM work merged'), 'selected objective keeps its heading');

  // Everything that left live context is recoverable byte-for-byte from the archive.
  const bundles = (await readdir(join(root, '.agentos/runs'), { withFileTypes: true })).filter((entry) => entry.name.startsWith('compact-rewrite-'));
  assert.equal(bundles.length, 1);
  const bundle = join(root, '.agentos/runs', bundles[0].name);
  assert.equal(await readFile(join(bundle, 'handoff.md'), 'utf8'), state.handoff);
  assert.equal(await readFile(join(bundle, 'tasks.md'), 'utf8'), state.tasks);
  const manifest = JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8'));
  const archivedHandoff = manifest.classification.handoff.filter((section) => section.decision === 'archived');
  assert.equal(archivedHandoff.length, 30, 'explicit history sections with no unresolved work are archived');
  assert.ok(archivedHandoff.every((section) => /^Previous objective/.test(section.heading)), JSON.stringify(archivedHandoff));
  assert.equal(
    manifest.classification.handoff.filter((section) => section.role === 'current-objective' && section.decision === 'preserved').length,
    0,
    'the sole selected objective stays live rather than being classified as a preserved superseded objective',
  );

  // 3. Status and doctor share objective recognition, and a repeat is a write-free no-op.
  const status = cli(root, ['status']);
  assert.equal(status.status, 0, status.stdout + status.stderr);
  assert.match(status.stdout, /Current handoff:/);
  assert.match(status.stdout, /2026-09-15 \(latest\): AUM work merged/);
  const doctor = await doctorAgentOS({ cwd: root });
  assert.ok(!/current-objective headings/.test(doctor.text), doctor.text);
  assert.ok(!/has no ## Current objective/.test(doctor.text), doctor.text);
  assert.ok(!/duplicate ## (Now|Next|Later|Done)/.test(doctor.text), doctor.text);
  const after = await snapshot(root);
  const repeat = cli(root, ['compact']);
  assert.equal(repeat.status, 0, repeat.stdout + repeat.stderr);
  assert.match(repeat.stdout, /No safe reduction found; files unchanged\./);
  assert.deepEqual(await snapshot(root), after, 'repeat compact must not write, re-archive, or re-link');
  assert.equal((await readdir(join(root, '.agentos/runs'), { withFileTypes: true })).filter((e) => e.name.startsWith('compact-rewrite-')).length, 1);
});

test('rehearsal: the compatibility alias and explicit checkpoint remain separate', async (t) => {
  const state = representativeState({ previous: 4, detailsPerTask: 1 });
  const { root } = await fixture(t, state);
  const alias = cli(root, ['compact', '--rewrite']);
  assert.equal(alias.status, 0, alias.stdout + alias.stderr);
  assert.match(alias.stdout, /Mode: structural rewrite/);

  const checkpoint = cli(root, ['compact', '--checkpoint']);
  assert.equal(checkpoint.status, 0, checkpoint.stdout + checkpoint.stderr);
  assert.match(checkpoint.stdout, /Mode: archival checkpoint/);
  const doctor = cli(root, ['doctor']);
  assert.equal(doctor.status, 0, doctor.stdout + doctor.stderr);
  assert.ok(!/has no ## Current objective/.test(doctor.stdout), doctor.stdout);
});

test('rehearsal: unclear sections are reported, not silently dropped', async (t) => {
  const state = representativeState({ objectives: 1, previous: 1, detailsPerTask: 1 });
  const { root } = await fixture(t, state);
  const result = await compactAgentOS({ cwd: root, rewrite: true, dryRun: true });
  assert.equal(result.ok, true, result.text);
  assert.equal(result.missing.length, 2);
  assert.match(result.text, new RegExp(`missing canonical sections: ${result.missing.length}`));
  assert.ok(result.classification.handoff.some((section) => section.role === 'unknown' && section.decision === 'preserved'));
  assert.deepEqual(
    checkboxes(result.proposed.tasks).filter((line) => line.includes('[ ]')).sort(),
    unchecked(state.tasks).sort(),
    'every unchecked task survives, merged into the canonical sections',
  );
});

test('rehearsal: ambiguous default compact refuses with zero writes', async (t) => {
  const state = representativeState({ objectives: 2, previous: 2, detailsPerTask: 1 });
  const { root } = await fixture(t, state);
  const before = await snapshot(root);
  const blocked = cli(root, ['compact']);
  assert.equal(blocked.status, 1, blocked.stdout + blocked.stderr);
  assert.match(blocked.stdout, /2 current-objective headings/);
  assert.equal(new Set(blocked.stdout.match(/obj-[a-f0-9]{10}/g) ?? []).size, 2);
  assert.deepEqual(await snapshot(root), before, 'ambiguous default compact must not archive, lock, or write');
});
