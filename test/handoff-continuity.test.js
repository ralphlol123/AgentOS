import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const CLI = resolve('dist/cli.js');
const env = { ...process.env, GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
function run(root, args, expected = 0) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: root, env, encoding: 'utf8' });
  assert.equal(r.status, expected, r.stdout + r.stderr);
  return r.stdout;
}
const json = (root, args, expected) => JSON.parse(run(root, [...args, '--json'], expected));
function git(root, ...args) {
  const r = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-continuity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), '{"name":"continuity"}\n');
  await writeFile(join(root, 'app.js'), 'export const value = 1;\n');
  run(root, ['init', '--existing', '--yes']);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'baseline');
  return root;
}
function checkpoint(root) {
  run(root, ['checkpoint', '--task', 'feature', '--engine', 'claude-code', '--progress', 'Implementation drafted', '--next', 'Review the change', '--check', 'node -e process.exit(0)']);
}
async function snapshot(root) {
  const files = {};
  async function walk(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const key = `${prefix}${entry.name}`, path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path, `${key}/`);
      else files[key] = (await readFile(path)).toString('base64');
    }
  }
  await walk(root);
  return files;
}

test('startup context and resume agree on fresh checks, same-size edits, commits and branch changes without writing', async t => {
  const root = await fixture(t);
  checkpoint(root);
  let context = json(root, ['context', 'codex', '--task', 'feature']);
  assert.match(context.text, /Reconciliation: clean/);
  assert.match(context.text, /Current passing checks: 1/);
  await writeFile(join(root, 'app.js'), 'export const value = 2;\n');
  for (const change of ['content', 'commit', 'branch']) {
    if (change === 'commit') { git(root, 'add', 'app.js'); git(root, 'commit', '-qm', 'change'); }
    if (change === 'branch') git(root, 'switch', '-qc', 'next-engine');
    const before = await snapshot(root);
    const resume = json(root, ['resume', '--task', 'feature']);
    context = json(root, ['context', 'codex', '--task', 'feature']);
    assert.equal(resume.status, 'drifted');
    assert.match(context.text, /Reconciliation: drifted/);
    assert.match(context.text, /Current passing checks: 0/);
    assert.match(context.text, /stale \(recheck\)/);
    assert.ok(context.warnings.some(w => /checkpoint.*drifted/i.test(w)));
    assert.equal(resume.accomplished.receipts.length, 0);
    assert.equal(resume.remaining.receipts[0].stale, true);
    assert.deepEqual(await snapshot(root), before, 'context/resume must not mutate files or Git state');
  }
});

test('startup context does not treat unavailable Git evidence as current verification', async t => {
  const root = await fixture(t);
  checkpoint(root);
  await rm(join(root, '.git'), { recursive: true });
  const context = json(root, ['context', 'opencode', '--task', 'feature']);
  assert.match(context.text, /Reconciliation: unavailable/);
  assert.match(context.text, /Current passing checks: 0/);
  assert.match(context.text, /stale \(recheck\)/);
  assert.ok(context.warnings.some(w => /checkpoint.*unavailable/i.test(w)));
});

test('incomplete checkpoints are Missing in context and fail require-complete without rewriting them', async t => {
  const root = await fixture(t);
  checkpoint(root);
  await writeFile(join(root, '.agentos/checkpoints/feature/current.json'), '{broken');
  const before = await snapshot(root);
  const context = json(root, ['context', 'codex', '--task', 'feature', '--require-complete'], 1);
  assert.equal(context.complete, false);
  assert.ok(context.missing.some(item => /checkpoint.*incomplete/i.test(item)));
  assert.deepEqual(await snapshot(root), before);
});

test('the active checkpoint is mandatory context, including under a tight budget', async t => {
  const root = await fixture(t);
  checkpoint(root);
  const full = json(root, ['context', 'codex', '--task', 'feature']);
  assert.equal(full.included.find(item => item.id === 'checkpoint').reason, 'mandatory');
  const small = json(root, ['context', 'codex', '--task', 'feature', '--budget', '1'], 1);
  assert.ok(small.overflow.mandatory.some(item => item.id === 'checkpoint'));
});

test('an empty Brain is visible in doctor, status and startup context; inspection does not initialize it', async t => {
  const root = await fixture(t);
  await rm(join(root, '.agentos/brain'), { recursive: true });
  await writeFile(join(root, '.agentos/decisions.md'), '# Decisions\n');
  const before = await snapshot(root);
  const doctor = json(root, ['doctor']);
  const context = json(root, ['context', 'codex', '--task', 'feature']);
  assert.ok(doctor.warnings.some(w => /no registered.*Brain|Brain.*no registered/i.test(w)));
  assert.ok(context.warnings.some(w => /no registered.*Brain|Brain.*no registered/i.test(w)));
  assert.match(run(root, ['status']), /no registered.*Brain|Brain.*no registered/i);
  assert.deepEqual(await snapshot(root), before);
});

const badExclusions = (root) => appendFile(join(root, '.agentos/project.yaml'), 'handoff:\n  exclude_paths: 5\n');

test('context validates handoff.exclude_paths only when a checkpoint loads (no task, task without checkpoint)', async t => {
  const root = await fixture(t);
  await badExclusions(root);
  assert.match(run(root, ['context', 'codex']), /Follow AgentOS/);
  assert.match(run(root, ['context', 'codex', '--task', 'nothing-saved']), /Task: nothing-saved/);
});

test('invalid handoff.exclude_paths still fails context and resume when a checkpoint loads', async t => {
  const root = await fixture(t);
  checkpoint(root);
  await badExclusions(root);
  for (const args of [['context', 'codex', '--task', 'feature'], ['resume', '--task', 'feature']]) {
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd: root, env, encoding: 'utf8' });
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, /handoff\.exclude_paths must be a list of relative paths\./, args.join(' '));
  }
});

// The 2026-11-03 handoff: the checkpoint was current, the prose around it still described the earlier state.
const OLD_STATE = '809 passed, 6 skipped; the continuation trial is outstanding.';
const OLD_NEXT = 'Run the continuation trial.';
async function earlierProse(root) {
  const handoff = join(root, '.agentos/handoff.md'), tasks = join(root, '.agentos/tasks.md');
  await writeFile(handoff, (await readFile(handoff, 'utf8')).replace(/(## Current state\n\n).*/, `$1${OLD_STATE}`).replace(/(## Next exact action\n\n).*/, `$1${OLD_NEXT}`));
  await writeFile(tasks, (await readFile(tasks, 'utf8')).replace(/(## Now\n\n).*/, `$1- [ ] ${OLD_NEXT}`));
}
const sections = (text) => text.split(/\n(?=## )/).filter((part) => part.startsWith('## '));
const superseded = (part) => /^## [^\n]*\[superseded by checkpoint /.test(part);
const titles = (parts) => parts.map((part) => part.split('\n')[0].replace(/ \[.*/, ''));

test('after a checkpoint saves a next action, context presents it as the one current next action and marks older handoff prose superseded', async t => {
  const root = await fixture(t);
  await earlierProse(root);
  run(root, ['checkpoint', '--task', 'feature', '--engine', 'claude-code', '--progress', 'Continuation trial passed', '--next', 'Confirm CI on the new head', '--check', 'node -e process.exit(0)']);
  const { id } = JSON.parse(await readFile(join(root, '.agentos/checkpoints/feature/current.json'), 'utf8'));
  const before = await snapshot(root);
  const context = json(root, ['context', 'codex', '--task', 'feature']);
  const current = sections(context.text).filter((part) => !superseded(part)).join('\n');
  const older = sections(context.text).filter(superseded);
  assert.equal(current.match(/Next: Confirm CI on the new head/g)?.length, 1, context.text);
  assert.doesNotMatch(current, /continuation trial is outstanding|Run the continuation trial/, 'older next-action text must not read as current');
  assert.deepEqual(titles(older), ['## Current state', '## Next exact action'], context.text);
  for (const part of older) assert.ok(part.split('\n')[0].endsWith(`[superseded by checkpoint ${id}]`), part);
  assert.match(older.join('\n'), /Run the continuation trial/, 'superseded text is still shown, not dropped');
  assert.equal(json(root, ['resume', '--task', 'feature']).remaining.next, 'Confirm CI on the new head');
  assert.deepEqual(await snapshot(root), before, 'context/resume must not rewrite the older prose');
  assert.match(await readFile(join(root, '.agentos/tasks.md'), 'utf8'), /Run the continuation trial/);
});

test('handoff prose rewritten after the checkpoint, or a checkpoint without a saved next action, is not marked superseded', async t => {
  const root = await fixture(t);
  await earlierProse(root);
  run(root, ['checkpoint', '--task', 'feature', '--progress', 'Drafted', '--next', 'Review the change']);
  const handoff = join(root, '.agentos/handoff.md');
  await writeFile(handoff, (await readFile(handoff, 'utf8')).replace(OLD_NEXT, 'Merge after review.'));
  let context = json(root, ['context', 'codex', '--task', 'feature']);
  assert.deepEqual(titles(sections(context.text).filter(superseded)), ['## Current state'], 'only prose unchanged since the checkpoint is older than it');
  run(root, ['checkpoint', '--task', 'recovered', '--recover']);
  context = json(root, ['context', 'codex', '--task', 'recovered']);
  assert.deepEqual(sections(context.text).filter(superseded), [], 'a recovered checkpoint has no next action to supersede the prose with');
  assert.doesNotMatch(context.text, /not current/, 'a recovered checkpoint has no digests, so it labels no prose as not current');
});

test('a handoff Next exact action edited after the checkpoint is a labelled not-current note; the checkpoint Next stays the one current next action', async t => {
  const root = await fixture(t);
  await earlierProse(root);
  run(root, ['checkpoint', '--task', 'feature', '--progress', 'Drafted', '--next', 'Review the change']);
  const { id } = JSON.parse(await readFile(join(root, '.agentos/checkpoints/feature/current.json'), 'utf8'));
  const handoff = join(root, '.agentos/handoff.md');
  await writeFile(handoff, (await readFile(handoff, 'utf8')).replace(OLD_NEXT, 'Merge after review.'));
  const before = await snapshot(root);
  const context = json(root, ['context', 'codex', '--task', 'feature']);
  const labelled = (part) => /^## [^\n]*\[/.test(part);
  const current = sections(context.text).filter((part) => !labelled(part)).join('\n');
  assert.equal(current.match(/Next: Review the change/g)?.length, 1, context.text);
  assert.doesNotMatch(current, /Merge after review|^## Next exact action/m, 'the edited text must not read as a second current next action');
  const note = sections(context.text).filter((part) => part.startsWith('## Next exact action'));
  assert.equal(note.length, 1, context.text);
  assert.ok(note[0].split('\n')[0].endsWith(`[edited after checkpoint ${id}; not current]`), note[0]);
  assert.match(note[0], /Merge after review\./, 'the edited text stays visible');
  assert.match(note[0], /agentos checkpoint --task feature --next "/, 'the note says how to make it current');
  assert.ok(sections(context.text).some((part) => part.startsWith('## Current state') && part.split('\n')[0].endsWith(`[superseded by checkpoint ${id}]`)), 'unchanged prose keeps its superseded label');
  assert.deepEqual(await snapshot(root), before, 'context must not write');
});

test('without a checkpoint, handoff Next exact action is the unlabelled current next action (no task, task without checkpoint)', async t => {
  const root = await fixture(t);
  await earlierProse(root);
  for (const args of [['context', 'codex'], ['context', 'codex', '--task', 'nothing-saved']]) {
    const text = json(root, args).text;
    const next = sections(text).filter((part) => part.startsWith('## Next exact action'));
    assert.equal(next.length, 1, text);
    assert.equal(next[0].split('\n')[0], '## Next exact action', next[0]);
    assert.match(next[0], /Run the continuation trial\./);
    assert.doesNotMatch(text, /superseded by checkpoint|not current/, args.join(' '));
  }
});

test('prose directly above the managed block is still superseded after the first checkpoint inserts the block', async t => {
  const root = await fixture(t);
  await writeFile(join(root, '.agentos/handoff.md'), `# Handoff\n\n## Current objective\n\nShip it.\n\n## Next exact action\n\n${OLD_NEXT}\n`);
  run(root, ['checkpoint', '--task', 'feature', '--next', 'Review the change']);
  assert.deepEqual(titles(sections(json(root, ['context', 'codex', '--task', 'feature']).text).filter(superseded)), ['## Next exact action']);
});

test('status presents the newest checkpoint\'s Next as the one current next action, without writing', async t => {
  const root = await fixture(t);
  await earlierProse(root);
  run(root, ['checkpoint', '--task', 'older', '--next', 'Superseded task step']);
  run(root, ['checkpoint', '--task', 'feature', '--engine', 'claude-code', '--next', 'Confirm CI on the new head']);
  const { id } = JSON.parse(await readFile(join(root, '.agentos/checkpoints/feature/current.json'), 'utf8'));
  const before = await snapshot(root);
  const status = run(root, ['status']);
  assert.equal(status.match(/^Current next action/gm)?.length, 1, status);
  assert.match(status, new RegExp(`^Current next action \\(task feature, checkpoint ${id}\\): Confirm CI on the new head$`, 'm'), status);
  assert.doesNotMatch(status, /Run the continuation trial|Superseded task step/, 'older next-action text must not read as current');
  assert.deepEqual(await snapshot(root), before, 'status must not write');
});

test('generated startup instructions checkpoint milestones before limits and reuse the task id', async t => {
  const root = await fixture(t);
  for (const path of ['AGENTS.md', 'CLAUDE.md', '.hermes.md', '.agentos/guide.md']) {
    const text = await readFile(join(root, path), 'utf8');
    assert.match(text, /milestone/i, path);
    assert.match(text, /limit|interrupt/i, path);
    assert.match(text, /\bsame task id\b/i, path);
  }
});
