// Bare `agentos resume` (no --task) must find the real checkpoint task, not a slug of the objective text.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
const git = (cwd, ...args) => assert.equal(spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } }).status, 0, `git ${args.join(' ')}`);

// The objective text slugs to something other than the task id, as in the Phase 5 tasktracker project.
const HANDOFF = '# Handoff\n\n## Current objective\n\nTask `task-tracker-cli`: a small TypeScript command-line task tracker.\n\n## Next exact action\n\nAdd the done command.\n';

async function project(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-resume-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'app' }));
  git(root, 'init', '-q', '-b', 'main');
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), HANDOFF);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}
const save = (root, task, next) => assert.equal(cli(['checkpoint', '--task', task, '--progress', `${task} progress`, '--next', next], root).status, 0);

test('bare resume with one checkpoint task resumes it, exactly as --task would (not a false "no checkpoint")', async (t) => {
  const root = await project(t);
  save(root, 'task-tracker-cli', 'Add the done command.');
  const bare = cli(['resume'], root);
  const explicit = cli(['resume', '--task', 'task-tracker-cli'], root);
  assert.doesNotMatch(bare.stdout, /no checkpoint/); // 65b06c6: "clean start — no checkpoint for task task-task-tracker-cli-…"
  assert.match(bare.stdout, /^AgentOS resume: task-tracker-cli\n/);
  assert.equal(bare.status, explicit.status);
  assert.equal(bare.stdout, explicit.stdout);
});

test('bare resume with no checkpoint task keeps the clean-start view but labels the derived id as not a real task', async (t) => {
  const root = await project(t);
  const r = cli(['resume'], root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^AgentOS resume: task-task-tracker-cli-a-small-typescript-command-line-task-track \(derived from the current objective; no task has a checkpoint\)\n/);
  assert.match(r.stdout, /Status: clean start — no checkpoint for task /);
});

test('bare resume with several checkpoint tasks lists them with --task hints and exits 2', async (t) => {
  const root = await project(t);
  save(root, 'alpha', 'Alpha next step.');
  save(root, 'beta', 'Beta next step.');
  const r = cli(['resume'], root);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /^AgentOS resume: several tasks have checkpoints; none was chosen\n/);
  assert.match(r.stdout, /- alpha \(latest checkpoint \d{4}-\d\d-\d\dT[^)]*\): Alpha next step\.\n {2}agentos resume --task alpha/);
  assert.match(r.stdout, /- beta \(latest checkpoint [^)]*\): Beta next step\.\n {2}agentos resume --task beta/);
  assert.doesNotMatch(r.stdout, /no checkpoint/);
  const j = cli(['resume', '--json'], root);
  assert.equal(j.status, 2);
  const out = JSON.parse(j.stdout);
  assert.equal(out.status, 'ambiguous');
  assert.deepEqual(out.tasks.map((task) => task.id), ['alpha', 'beta']);
});

test('bare resume picks the task the objective names when several have checkpoints', async (t) => {
  const root = await project(t);
  save(root, 'alpha', 'Alpha next step.');
  save(root, 'task-task-tracker-cli-a-small-typescript-command-line-task-track', 'Objective task next.');
  const r = cli(['resume'], root);
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout, cli(['resume', '--task', 'task-task-tracker-cli-a-small-typescript-command-line-task-track'], root).stdout);
});

test('explicit --task is unchanged: an unknown task still gets the plain clean-start view', async (t) => {
  const root = await project(t);
  save(root, 'alpha', 'Alpha next step.');
  const r = cli(['resume', '--task', 'ghost'], root);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'AgentOS resume: ghost\nStatus: clean start — no checkpoint for task ghost, no run notes and no changed files. No prior work is assumed; start with `agentos context generic --task ghost`.\n');
});

test('bare context loads the only checkpoint task, like bare resume', async (t) => {
  const root = await project(t);
  save(root, 'task-tracker-cli', 'Add the done command.');
  const r = cli(['context', 'generic'], root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Source: \.agentos\/checkpoints\/task-tracker-cli\/current\.json/);
});

// --- risk A: a save that failed must not hide or silently replace the last usable checkpoint ----------

const dir = (root, task) => join(root, '.agentos/checkpoints', task);
const recordNames = async (root, task) => (await readdir(dir(root, task))).filter((name) => /^\d.*\.json$/.test(name)).sort();

test('(1) a failing check saved in the newest checkpoint stays visible in status', async (t) => {
  const root = await project(t);
  save(root, 'task-tracker-cli', 'Older next.');
  assert.equal(cli(['checkpoint', '--task', 'task-tracker-cli', '--progress', 'p', '--next', 'Fix the failing test.', '--check', 'node -e process.exit(1)'], root).status, 0);
  const s = cli(['status'], root);
  assert.match(s.stdout, /Current next action \(task task-tracker-cli, checkpoint [^)]*\): Fix the failing test\./);
  assert.match(s.stdout, /Checks not passing in that checkpoint: observed-fail `node -e process\.exit\(1\)`/);
});

test('(2) a corrupt newest record: resume names it and shows the last usable checkpoint as older state', async (t) => {
  const root = await project(t);
  save(root, 'task-tracker-cli', 'Older usable next.');
  save(root, 'task-tracker-cli', 'Newest next.');
  const [older, newest] = await recordNames(root, 'task-tracker-cli');
  await writeFile(join(dir(root, 'task-tracker-cli'), newest), '{"schema": "agentos.checkpoint/1", "id":');
  const r = cli(['resume', '--task', 'task-tracker-cli'], root);
  assert.equal(r.status, 1);
  assert.match(r.stdout, new RegExp(`Reason: record ${newest.replace(/\./g, '\\.')} is invalid`));
  assert.match(r.stdout, new RegExp(`Showing OLDER state: last usable checkpoint ${older.replace(/\.json$/, '')} from \\S+; it is not the newest record\\.`));
  assert.match(r.stdout, /- Next: Older usable next\./);
  const c = cli(['context', 'generic', '--task', 'task-tracker-cli'], root);
  assert.match(c.stdout, new RegExp(`last usable checkpoint ${older.replace(/\.json$/, '')}`));
  const s = cli(['status'], root);
  assert.match(s.stdout, /task-tracker-cli\/current\.json: record .* is invalid/);
});

test('(2) a corrupt current.json with no readable record: resume says no usable checkpoint exists', async (t) => {
  const root = await project(t);
  save(root, 'task-tracker-cli', 'Only next.');
  const [only] = await recordNames(root, 'task-tracker-cli');
  await writeFile(join(dir(root, 'task-tracker-cli'), only), 'garbage');
  await writeFile(join(dir(root, 'task-tracker-cli'), 'current.json'), '{');
  const r = cli(['resume', '--task', 'task-tracker-cli'], root);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Reason: current\.json is unreadable/);
  assert.match(r.stdout, /Last usable checkpoint: none — no record of this task is readable\./);
});

test('(2) a save interrupted before the current.json update: resume flags the newer record and labels the shown one older', async (t) => {
  const root = await project(t);
  save(root, 'task-tracker-cli', 'Committed next.');
  const pointer = await readFile(join(dir(root, 'task-tracker-cli'), 'current.json'));
  save(root, 'task-tracker-cli', 'Uncommitted next.');
  await writeFile(join(dir(root, 'task-tracker-cli'), 'current.json'), pointer); // crash between record and pointer
  const [older, newer] = await recordNames(root, 'task-tracker-cli');
  const r = cli(['resume', '--task', 'task-tracker-cli'], root);
  assert.match(r.stdout, new RegExp(`Showing OLDER state: checkpoint ${older.replace(/\.json$/, '')} from \\S+ is what current\\.json names, but newer record ${newer.replace(/\./g, '\\.')} exists`));
  assert.match(r.stdout, /- Next: Committed next\./);
  const c = cli(['context', 'generic', '--task', 'task-tracker-cli'], root);
  assert.match(c.stdout, new RegExp(`newer record ${newer.replace(/\./g, '\\.')}`));
  assert.match(cli(['doctor'], root).stdout, new RegExp(`newer record ${newer.replace(/\./g, '\\.')}`));
});
