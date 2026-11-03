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
});

test('prose directly above the managed block is still superseded after the first checkpoint inserts the block', async t => {
  const root = await fixture(t);
  await writeFile(join(root, '.agentos/handoff.md'), `# Handoff\n\n## Current objective\n\nShip it.\n\n## Next exact action\n\n${OLD_NEXT}\n`);
  run(root, ['checkpoint', '--task', 'feature', '--next', 'Review the change']);
  assert.deepEqual(titles(sections(json(root, ['context', 'codex', '--task', 'feature']).text).filter(superseded)), ['## Next exact action']);
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
