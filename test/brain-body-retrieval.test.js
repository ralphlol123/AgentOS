// Brain body retrieval: `context --about "<phrase>"` finds a record by words in its body, from a differently
// named task, without changing the task id that checkpoint/resume use, and within the existing budget rules.
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTOS_ENGINE: '' } });
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const json = (args, cwd) => {
  const r = cli([...args, '--json'], cwd);
  try { return JSON.parse(r.stdout); } catch { throw new Error(`not JSON (exit ${r.status}): ${r.stdout}\n${r.stderr}`); }
};
const TASK = 'fix-payment-callbacks';
const PHRASE = 'retry webhook deliveries with exponential backoff';

/** Two repos; task_scope covers payments-api only. The decision has a generic title and the phrase only in its body;
 *  the legacy-notifier note has the same phrase but its repo is outside the read scope. */
async function workspace(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos body '));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  for (const repo of ['payments-api', 'legacy-notifier']) {
    await mkdir(join(root, repo, 'docs'), { recursive: true });
    await writeFile(join(root, repo, 'package.json'), `{ "name": "${repo}", "scripts": { "test": "node --test" } }\n`);
  }
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await appendFile(join(root, '.agentos/project.yaml'), 'task_scope:\n  read:\n    - payments-api\n  edit:\n    - payments-api\n');
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nFix duplicate payment callbacks.\n');
  const notes = {
    'payments-api/docs/2026-10-12.md': ['decision', 'payments-api', `# Decision 2026-10-12\n\nWe ${PHRASE} and dedupe on the event id.\n`],
    'legacy-notifier/docs/delivery-notes.md': ['note', 'legacy-notifier', `# Notifier delivery notes\n\nThe old notifier used to ${PHRASE}.\n`],
    'payments-api/docs/ledger.md': ['architecture', 'payments-api', '# Ledger posting model\n\nTwo ledger lines per booking.\n'],
  };
  for (const [path, [kind, scope, text]] of Object.entries(notes)) {
    await writeFile(join(root, path), text);
    ok(cli(['brain', 'register', path, '--kind', kind, '--scope', scope], root));
  }
  return root;
}

const ids = (items) => items.map((item) => item.id);

test('context --about finds the in-scope decision by a body phrase; the task id stays the --task value', async (t) => {
  const root = await workspace(t);
  const before = json(['context', 'claude', '--task', TASK], root);
  assert.equal(before.omitted.find((item) => item.id === 'brain:2026-10-12')?.reason, 'no-match', 'without --about the body is not searched (unchanged)');

  const out = json(['context', 'claude', '--task', TASK, '--about', PHRASE], root);
  assert.equal(out.ok, true, out.text);
  assert.equal(out.task, TASK, 'the phrase does not become the task id');
  const decision = out.included.find((item) => item.id === 'brain:2026-10-12');
  assert.ok(decision, `decision included: ${JSON.stringify(out.included)}`);
  assert.equal(decision.source, 'payments-api/docs/2026-10-12.md');
  assert.match(decision.reason, /retry, webhook/);
  assert.match(out.text, /Source: payments-api\/docs\/2026-10-12\.md/);
  assert.ok(!ids(out.included).includes('brain:delivery-notes'), 'the same phrase in an out-of-scope repo stays out');
  assert.equal(out.omitted.find((item) => item.id === 'brain:delivery-notes')?.reason, 'out-of-scope');
  assert.equal(out.omitted.find((item) => item.id === 'brain:ledger')?.reason, 'no-match', 'unrelated records still need a match');
});

test('context --about keeps the budget rules: same mandatory overflow, optional records by rank', async (t) => {
  const root = await workspace(t);
  const overflow = (args) => json(['context', 'claude', '--task', TASK, '--budget', '100', ...args], root);
  const [plain, about] = [overflow([]), overflow(['--about', PHRASE])];
  assert.equal(about.ok, false);
  assert.deepEqual(about.overflow, plain.overflow, 'mandatory records and the overflow figure do not change');
  const needed = about.overflow.needed;
  const tight = json(['context', 'claude', '--task', TASK, '--about', PHRASE, '--budget', String(needed + 120)], root);
  assert.equal(tight.ok, true, tight.text);
  assert.ok(tight.budget.estimate <= tight.budget.limit, `estimate ${tight.budget.estimate} within ${tight.budget.limit}`);
  assert.deepEqual(ids(tight.included.filter((item) => item.reason === 'mandatory')), ids(plain.overflow.mandatory), 'mandatory records unchanged');
  assert.ok(ids(tight.included).includes('brain:2026-10-12'), 'the best match is ranked first among optional records');
  assert.ok(tight.omitted.some((item) => item.reason === 'budget'), 'lower-ranked records are omitted for budget');
});

test('checkpoint, resume and context share the --task id; --about never touches it', async (t) => {
  const root = await workspace(t);
  ok(cli(['checkpoint', '--task', TASK, '--progress', 'read the retry decision', '--next', 'make the capture handler idempotent'], root));
  const resume = json(['resume', '--task', TASK], root);
  assert.equal(resume.task.id, TASK);
  const out = json(['context', 'claude', '--task', TASK, '--about', PHRASE], root);
  assert.equal(out.task, TASK);
  assert.match(out.included.find((item) => item.id === 'checkpoint')?.source ?? '', new RegExp(`\\.agentos/checkpoints/${TASK}/`));
  assert.deepEqual(await readdir(join(root, '.agentos/checkpoints')), [TASK], 'no checkpoint folder derived from the phrase');
  assert.match(cli(['checkpoint', '--task', TASK, '--about', PHRASE, '--progress', 'x'], root).stderr, /--about is not supported by checkpoint/);
});
