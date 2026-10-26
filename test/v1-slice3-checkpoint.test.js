// v1 slice 3: reliable checkpoints and resume (`agentos checkpoint`, `agentos resume`).
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, unlink, writeFile, realpath } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import * as core from '../dist/core.js';

const { initAgentOS } = core;

const CLI = resolve('dist/cli.js');
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const cli = (args, cwd, env = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV, ...env } });
const json = (args, cwd, env) => {
  const r = cli([...args, '--json'], cwd, env);
  let out;
  try { out = JSON.parse(r.stdout); } catch { throw new Error(`not JSON (exit ${r.status}): ${r.stdout}\n${r.stderr}`); }
  return { r, out };
};
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

const HANDOFF = '# Handoff\n\n## Current objective\n\nShip the token rotation feature.\n\n## Next exact action\n\nWire the web settings page.\n\n## Protected files / do not touch\n\n- .env files\n';
const TASK = 'token-rotation';

// Multi-repo fixture: a non-git workspace root with two committed child git repos.
async function multi(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-v1s3-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  await mkdir(join(base, 'tmp'));
  for (const repo of ['web', 'api']) {
    await mkdir(join(root, repo), { recursive: true });
    await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo, scripts: { build: 'echo b', test: 'echo t' } }));
  }
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), HANDOFF);
  await writeFile(join(root, '.agentos/decisions.md'), '# Decisions\n\n## 2026-10-01 — Token rotation: weekly\n\n- Status: accepted\n');
  for (const repo of ['web', 'api']) {
    git(join(root, repo), 'init', '-q', '-b', 'main');
    git(join(root, repo), 'add', '-A');
    git(join(root, repo), 'commit', '-q', '-m', 'init');
  }
  return { base, root, env: { TMPDIR: join(base, 'tmp'), TMP: join(base, 'tmp'), TEMP: join(base, 'tmp') } };
}

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

const checkpointDir = (root, task = TASK) => join(root, '.agentos/checkpoints', task);
const records = async (root, task = TASK) => (await readdir(checkpointDir(root, task))).filter((name) => name.endsWith('.json') && name !== 'current.json').sort();

// --- 2. receipts: the status vocabulary ----------------------------------------------------------

test('receipts: exit 1 is observed-fail, --claim is claimed, a missing binary is unavailable, declared checks not run are not-run', async (t) => {
  const { root } = await multi(t);
  const { r, out } = json(['checkpoint', '--task', TASK, '--engine', 'claude', '--progress', 'Endpoint drafted.', '--next', 'Wire the page.',
    '--check', 'node -e process.exit(1)', '--cwd', 'web',
    '--check', 'node -e process.exit(0)',
    '--check', 'agentos-no-such-binary-xyz --version',
    '--claim', 'all unit tests pass'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const record = out.record;
  assert.equal(record.schema, 'agentos.checkpoint/1');
  const by = (command) => record.receipts.find((receipt) => receipt.command === command);
  const fail = by('node -e process.exit(1)');
  assert.equal(fail.status, 'observed-fail');
  assert.equal(fail.exit_code, 1);
  assert.equal(fail.cwd, 'web');
  assert.match(fail.state_tested, /^[a-f0-9]{64}$/);
  assert.match(fail.observed_at, /^\d{4}-\d\d-\d\dT/);
  assert.ok(fail.evidence.startsWith(`.agentos/checkpoints/${TASK}/`), fail.evidence);
  await readFile(join(root, fail.evidence), 'utf8');
  assert.equal(by('node -e process.exit(0)').status, 'observed-pass');
  assert.equal(by('node -e process.exit(0)').cwd, '.');
  const missing = by('agentos-no-such-binary-xyz --version');
  assert.equal(missing.status, 'unavailable');
  assert.equal(missing.exit_code, null);
  const claim = by('all unit tests pass');
  assert.equal(claim.status, 'claimed');
  assert.equal(claim.exit_code, null);
  const notRun = record.receipts.filter((receipt) => receipt.status === 'not-run').map((receipt) => `${receipt.cwd}:${receipt.command}`);
  assert.ok(notRun.includes('web:npm run test') && notRun.includes('api:npm run build'), notRun.join('|'));
  assert.deepEqual([...new Set(record.receipts.map((receipt) => receipt.status))].sort(), ['claimed', 'not-run', 'observed-fail', 'observed-pass', 'unavailable']);

  const resume = json(['resume', '--task', TASK], root);
  assert.equal(resume.r.status, 0, resume.r.stdout + resume.r.stderr);
  const accomplished = JSON.stringify(resume.out.accomplished);
  assert.doesNotMatch(accomplished, /process\.exit\(1\)/, 'a failed check is never reported as done');
  assert.doesNotMatch(accomplished, /all unit tests pass/, 'a claim is never reported as done');
  assert.match(accomplished, /process\.exit\(0\)/);
  const remaining = resume.out.remaining.receipts.map((receipt) => `${receipt.status}:${receipt.command}`);
  for (const expected of ['observed-fail:node -e process.exit(1)', 'claimed:all unit tests pass', 'unavailable:agentos-no-such-binary-xyz --version', 'not-run:npm run test']) {
    assert.ok(remaining.includes(expected), `${expected} in ${remaining.join('|')}`);
  }
  const human = cli(['resume', '--task', TASK], root);
  assert.match(human.stdout, /observed-fail: `node -e process\.exit\(1\)`/);
  assert.match(human.stdout, /agentos context claude-code --task token-rotation/);
});

// --- 1/7. record shape, default task id ----------------------------------------------------------

test('record carries ids, objective, scope, per-repo branch/HEAD/fingerprint, knowledge refs; the default task id is the objective slug', async (t) => {
  const { root } = await multi(t);
  await writeFile(join(root, 'web/new.txt'), 'x');
  const { r, out } = json(['checkpoint', '--progress', 'p', '--role', 'developer'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const record = out.record;
  assert.equal(record.task.id, 'ship-the-token-rotation-feature');
  assert.equal(record.task.source, 'objective');
  assert.match(record.objective.text, /Ship the token rotation feature/);
  assert.equal(record.project.root, await realpath(root)); // canonical root (macOS /private/var)
  assert.equal(record.role, 'developer');
  assert.deepEqual(record.scope.read, ['.']);
  const web = record.repos.find((repo) => repo.name === 'web');
  assert.equal(web.branch, 'main');
  assert.equal(web.head, git(join(root, 'web'), 'rev-parse', 'HEAD'));
  assert.match(web.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(web.changed_paths, ['new.txt']);
  assert.ok(record.knowledge_refs.some((ref) => ref.id === 'decision:2026-10-01-token-rotation-weekly'), JSON.stringify(record.knowledge_refs));
  const human = cli(['checkpoint', '--dry-run'], root);
  assert.match(human.stdout, /Task: ship-the-token-rotation-feature \(default: slug of the current objective; pass --task to choose\)/);
});

// --- 3. immutable + atomic -------------------------------------------------------------------------

test('records are immutable: a second write to the same id refuses (ok:false → exit 1) and leaves bytes unchanged', async (t) => {
  const { root } = await multi(t);
  const now = new Date('2026-10-25T04:00:00.000Z');
  const first = await core.checkpointAgentOS({ cwd: root, task: TASK, progress: 'same', now });
  assert.equal(first.ok, true, first.text);
  const [name] = await records(root);
  const before = await snapshot(root);
  const second = await core.checkpointAgentOS({ cwd: root, task: TASK, progress: 'same', now });
  assert.equal(second.ok, false);
  assert.match(second.text, /already exists; checkpoint records are immutable/);
  assert.deepEqual(await snapshot(root), before, 'record, pointer and handoff bytes unchanged');
  assert.deepEqual(await records(root), [name]);
});

test('resume after an interruption reports incomplete with the recovery evidence (missing pointer, truncated record)', async (t) => {
  const { root } = await multi(t);
  assert.equal(cli(['checkpoint', '--task', TASK, '--progress', 'p'], root).status, 0);
  const [name] = await records(root);
  // current.json lost after the record was written
  await unlink(join(checkpointDir(root), 'current.json'));
  let { r, out } = json(['resume', '--task', TASK], root);
  assert.equal(r.status, 1);
  assert.equal(out.status, 'incomplete');
  assert.ok(out.evidence.files.some((file) => file.name === name), JSON.stringify(out.evidence));
  assert.match(out.evidence.reason, /current\.json is missing/);
  // pointer restored, record truncated
  assert.equal(cli(['checkpoint', '--task', TASK, '--progress', 'p2'], root).status, 0);
  const latest = JSON.parse(await readFile(join(checkpointDir(root), 'current.json'), 'utf8')).id;
  const path = join(checkpointDir(root), `${latest}.json`);
  await writeFile(path, (await readFile(path, 'utf8')).slice(0, 40));
  ({ r, out } = json(['resume', '--task', TASK], root));
  assert.equal(r.status, 1);
  assert.equal(out.status, 'incomplete');
  assert.match(out.evidence.error, /JSON|Unexpected|Unterminated/);
  assert.ok(out.evidence.files.length >= 3, 'both records and the pointer are listed');
  const human = cli(['resume', '--task', TASK], root);
  assert.match(human.stdout, /Status: incomplete/);
  assert.match(human.stdout, new RegExp(`${latest}\\.json \\(40 bytes\\)`));
  // a record that parses but fails the runtime contract
  await writeFile(path, JSON.stringify({ schema: 'agentos.checkpoint/1', id: latest }));
  ({ out } = json(['resume', '--task', TASK], root));
  assert.equal(out.status, 'incomplete');
  assert.match(out.evidence.error, /Checkpoint\./);
});

// --- 5. resume: reconciliation ---------------------------------------------------------------------

test('resume right after a checkpoint is clean; a new commit or an added untracked file is drifted with the exact difference and stale receipts', async (t) => {
  const { root } = await multi(t);
  assert.equal(cli(['checkpoint', '--task', TASK, '--progress', 'p', '--check', 'node -e process.exit(0)'], root).status, 0);
  let { r, out } = json(['resume', '--task', TASK], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(out.reconciliation.status, 'clean', JSON.stringify(out.reconciliation));
  assert.equal(out.accomplished.receipts[0].stale, false);

  await writeFile(join(root, 'api/added.txt'), 'x');
  ({ out } = json(['resume', '--task', TASK], root));
  assert.equal(out.reconciliation.status, 'drifted');
  const api = out.reconciliation.repos.find((repo) => repo.name === 'api');
  assert.equal(api.status, 'drifted');
  assert.deepEqual(api.new_changed_paths, ['added.txt']);
  assert.equal(api.fingerprint_changed, true);
  assert.equal(api.head_moved, null);
  assert.equal(out.reconciliation.repos.find((repo) => repo.name === 'web').status, 'clean');
  assert.equal(out.remaining.receipts.find((receipt) => receipt.command === 'node -e process.exit(0)').stale, true);
  assert.equal(out.accomplished.receipts.length, 0, 'a stale pass is a recheck, not accomplished');

  const oldHead = git(join(root, 'web'), 'rev-parse', 'HEAD');
  await writeFile(join(root, 'web/feature.txt'), 'y');
  git(join(root, 'web'), 'add', 'feature.txt');
  git(join(root, 'web'), 'commit', '-q', '-m', 'feature');
  ({ out } = json(['resume', '--task', TASK], root));
  const web = out.reconciliation.repos.find((repo) => repo.name === 'web');
  assert.equal(web.status, 'drifted');
  assert.deepEqual(web.head_moved, { from: oldHead, to: git(join(root, 'web'), 'rev-parse', 'HEAD') });
  const human = cli(['resume', '--task', TASK], root);
  assert.match(human.stdout, /^Reconciliation: drifted$/m);
  assert.match(human.stdout, /web: HEAD moved [0-9a-f]{7} -> [0-9a-f]{7}/);
  assert.match(human.stdout, /api: new changed paths: added\.txt/);
  assert.match(human.stdout, /stale \(recheck\)/);
});

test('single-repo workspace with tracked .agentos/: the checkpoint\'s own writes do not count as drift', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'agentos-v1s3-single-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'single', scripts: { test: 'echo t' } }));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), HANDOFF);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  assert.equal(cli(['checkpoint', '--task', TASK, '--progress', 'p', '--check', 'node -e process.exit(0)'], root).status, 0);
  assert.match(git(root, 'status', '--porcelain'), /\.agentos\/handoff\.md/, 'handoff.md (tracked) was modified by the checkpoint');
  const { out } = json(['resume', '--task', TASK], root);
  assert.equal(out.reconciliation.status, 'clean', JSON.stringify(out.reconciliation));
  assert.equal(out.accomplished.receipts.length, 1);
});

test('a repo that disappeared is unavailable', async (t) => {
  const { root } = await multi(t);
  assert.equal(cli(['checkpoint', '--task', TASK, '--progress', 'p'], root).status, 0);
  await rm(join(root, 'api'), { recursive: true, force: true });
  const { out } = json(['resume', '--task', TASK], root);
  assert.equal(out.reconciliation.repos.find((repo) => repo.name === 'api').status, 'unavailable');
  assert.equal(out.reconciliation.status, 'unavailable');
});

// --- 4. bounded live summary in handoff.md ---------------------------------------------------------

test('five checkpoints keep one managed section of constant size; every byte outside it is preserved (CRLF, no trailing newline)', async (t) => {
  const { root } = await multi(t);
  const path = join(root, '.agentos/handoff.md');
  const original = HANDOFF.replace(/\n/g, '\r\n').replace(/\r\n$/, '');
  await writeFile(path, original);
  const START = '<!-- agentos:checkpoint:start -->', END = '<!-- agentos:checkpoint:end -->';
  const split = (text) => {
    const start = text.indexOf(START), end = text.indexOf(END) + END.length;
    assert.ok(start > 0 && end > start, 'one block');
    assert.equal(text.indexOf(START, start + 1), -1, 'exactly one start marker');
    return { outside: text.slice(0, start) + text.slice(end), block: text.slice(start, end) };
  };
  const sizes = [];
  let outside;
  for (let i = 0; i < 5; i++) {
    const r = cli(['checkpoint', '--task', TASK, '--progress', 'Endpoint drafted.', '--blocker', 'Waiting on design.', '--next', 'Wire the page.', '--claim', 'tests pass'], root);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const text = await readFile(path, 'utf8');
    const parts = split(text);
    assert.match(parts.block, /^## Checkpoint \(managed\)\r$/m, 'CRLF kept inside the block');
    assert.match(parts.block, /Receipts: observed-pass 0, observed-fail 0, claimed 1, not-run 4, unavailable 0/);
    if (i === 0) {
      assert.ok(text.startsWith(original), 'first insertion keeps the original bytes as a prefix');
      assert.ok(text.endsWith(END), 'a file without a trailing newline still ends without one');
      outside = parts.outside;
    } else assert.equal(parts.outside, outside, `checkpoint ${i + 1}: bytes outside the block unchanged`);
    sizes.push(parts.block.length);
  }
  assert.equal(new Set(sizes).size, 1, `section size constant: ${sizes.join(',')}`);
});

test('checkpoint never touches tasks.md and refuses an ambiguous handoff block with zero writes', async (t) => {
  const { root } = await multi(t);
  const tasks = await readFile(join(root, '.agentos/tasks.md'));
  assert.equal(cli(['checkpoint', '--task', TASK, '--progress', 'p'], root).status, 0);
  assert.deepEqual(await readFile(join(root, '.agentos/tasks.md')), tasks);
  await writeFile(join(root, '.agentos/handoff.md'), `${HANDOFF}\n<!-- agentos:checkpoint:start -->\n<!-- agentos:checkpoint:start -->\n`);
  const before = await snapshot(root);
  const r = cli(['checkpoint', '--task', TASK, '--progress', 'p'], root);
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /handoff\.md/);
  assert.deepEqual(await snapshot(root), before);
});

// --- 3/7. read-only commands and dry run -----------------------------------------------------------

test('--dry-run, resume, list and show create, change or lock nothing (whole parent tree, private TMPDIR)', async (t) => {
  const { base, root, env } = await multi(t);
  assert.equal(cli(['checkpoint', '--task', TASK, '--progress', 'p', '--check', 'node -e process.exit(0)'], root, env).status, 0);
  const [name] = await records(root);
  const id = name.replace(/\.json$/, '');
  const before = await snapshot(base);
  const modes = [
    ['checkpoint', '--task', TASK, '--dry-run', '--check', 'touch ran.txt'],
    ['checkpoint', '--task', TASK, '--dry-run', '--json'],
    ['checkpoint', '--recover', '--task', 'other', '--dry-run'],
    ['resume', '--task', TASK], ['resume', '--task', TASK, '--json'], ['resume', '--task', 'nothing-here'],
    ['checkpoint', 'list'], ['checkpoint', 'list', '--json'],
    ['checkpoint', 'show', id], ['checkpoint', 'show', id, '--json'], ['checkpoint', 'show', 'nope'],
  ];
  const results = modes.map((args) => cli(args, root, env));
  assert.equal(results[0].status, 0, results[0].stdout + results[0].stderr);
  assert.match(results[0].stdout, /not-run: `touch ran\.txt` \(cwd \., dry run\)/);
  assert.equal(JSON.parse(results[1].stdout).dryRun, true);
  assert.equal(results[3].status, 0, results[3].stderr);
  assert.match(results[6].stdout, new RegExp(id));
  assert.equal(JSON.parse(results[9].stdout).id, id);
  assert.equal(results[10].status, 1);
  assert.deepEqual(await snapshot(base), before);
});

test('checkpoint takes the workspace writer lock; resume does not', async (t) => {
  const { root } = await multi(t);
  await writeFile(join(root, '.agentos-write.lock'), JSON.stringify({ pid: 999999, host: `${hostname()}-other` }));
  const r = cli(['checkpoint', '--task', TASK, '--progress', 'p'], root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Workspace writer lock exists/);
  assert.equal(cli(['checkpoint', '--task', TASK, '--dry-run'], root).status, 0, 'dry run takes no lock');
  const resume = cli(['resume', '--task', TASK], root);
  assert.doesNotMatch(resume.stdout + resume.stderr, /writer lock/, 'resume does not take the lock');
});

// --- 6. recovery -----------------------------------------------------------------------------------

test('recovered checkpoint: --recover writes a record with recovered:true and unknown fields; resume without a record shows the same view read-only', async (t) => {
  const { root } = await multi(t);
  await writeFile(join(root, 'web/half-done.ts'), 'export {}');
  const view = json(['resume', '--task', TASK], root);
  assert.equal(view.r.status, 0, view.r.stdout + view.r.stderr);
  assert.equal(view.out.status, 'recovered');
  assert.equal(view.out.record.recovered, true);
  assert.equal(view.out.record.progress, '(unknown: engine stopped without a summary)');
  assert.equal(view.out.record.next, '(unknown)');
  assert.deepEqual(view.out.record.receipts, []);
  assert.ok(view.out.record.repos.find((repo) => repo.name === 'web').changed_paths.includes('half-done.ts'));
  await assertNoCheckpoints(root);
  assert.match(cli(['resume', '--task', TASK], root).stdout, /agentos checkpoint --recover --task token-rotation/);

  const refused = cli(['checkpoint', '--recover', '--task', TASK, '--progress', 'all done'], root);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /--recover records git evidence only/);
  const { r, out } = json(['checkpoint', '--recover', '--task', TASK], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(out.record.recovered, true);
  assert.equal(out.record.progress, '(unknown: engine stopped without a summary)');
  assert.equal(out.record.next, '(unknown)');
  assert.deepEqual(out.record.receipts, []);
  const resumed = json(['resume', '--task', TASK], root).out;
  assert.equal(resumed.record.recovered, true);
  assert.equal(resumed.reconciliation.status, 'clean');
  assert.match(cli(['resume', '--task', TASK], root).stdout, /recovered: true/);
});

async function assertNoCheckpoints(root) {
  await assert.rejects(lstat(join(root, '.agentos/checkpoints')), /ENOENT/);
}

test('resume with no record and no evidence of work is a clean start: exit 0 with a clear message', async (t) => {
  const { root } = await multi(t);
  const r = cli(['resume', '--task', TASK], root);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /clean start — no checkpoint for task token-rotation/);
});

// --- runtime contract, context, doctor -------------------------------------------------------------

test('assertCheckpoint rejects bad shapes', async () => {
  const { assertCheckpoint } = await import('../dist/checkpoint.js');
  assert.throws(() => assertCheckpoint(null), /Checkpoint must be an object/);
  assert.throws(() => assertCheckpoint({ schema: 'agentos.checkpoint/2' }), /Checkpoint\.schema/);
  assert.throws(() => assertCheckpoint({ schema: 'agentos.checkpoint/1', id: 'x' }), /Checkpoint\./);
});

test('assertCheckpoint accepts a written record and rejects an unknown receipt status', async (t) => {
  const { root } = await multi(t);
  const { out } = json(['checkpoint', '--task', TASK, '--claim', 'x'], root);
  const { assertCheckpoint } = await import('../dist/checkpoint.js');
  assertCheckpoint(out.record);
  const bad = structuredClone(out.record);
  bad.receipts[0].status = 'passed';
  assert.throws(() => assertCheckpoint(bad), /status/);
});

test('context includes the current checkpoint as an always record', async (t) => {
  const { root } = await multi(t);
  assert.equal(cli(['checkpoint', '--task', TASK, '--progress', 'Endpoint drafted.', '--blocker', 'design', '--next', 'Wire it.', '--claim', 'x'], root).status, 0);
  const { r, out } = json(['context', 'claude', '--task', TASK], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const item = out.included.find((entry) => entry.id === 'checkpoint');
  assert.ok(item, out.included.map((entry) => entry.id).join(','));
  assert.equal(item.source, `.agentos/checkpoints/${TASK}/current.json`);
  assert.match(out.text, /Progress: Endpoint drafted\./);
  assert.match(out.text, /Receipts: observed-pass 0, observed-fail 0, claimed 1/);
  const none = json(['context', 'claude', '--task', 'unrelated'], root).out;
  assert.equal(none.included.find((entry) => entry.id === 'checkpoint'), undefined);
});

test('doctor reports a current.json that points at a missing or invalid record as a problem', async (t) => {
  const { root } = await multi(t);
  assert.equal(cli(['checkpoint', '--task', TASK, '--progress', 'p'], root).status, 0);
  const healthy = json(['doctor'], root).out;
  assert.ok(!healthy.problems.some((problem) => /checkpoint/i.test(problem)), healthy.problems.join('|'));
  await writeFile(join(checkpointDir(root), 'current.json'), JSON.stringify({ schema: 'agentos.checkpoint-pointer/1', task: TASK, id: 'gone' }));
  const { r, out } = json(['doctor'], root);
  assert.equal(r.status, 1);
  assert.ok(out.problems.some((problem) => /\.agentos\/checkpoints\/token-rotation\/current\.json/.test(problem)), out.problems.join('|'));
});
