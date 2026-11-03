// Brain ranking for `context --about`: function words are not match terms, and under a budget a Brain record with a
// real --about hit is packed before the always-relevant optional items. Without --about nothing changes.
// Derived from the Brain-ranking evaluation (F1-question, R1-broad/F3-broad), as a small self-contained fixture.
// Budgets are computed from this workspace's own runs; no token figure is compared across differently rendered outputs.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTOS_ENGINE: '' } });
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const context = (root, args) => {
  const r = cli(['context', 'claude', '--task', 'merchant-endpoint-outage', ...args, '--json'], root);
  try { return JSON.parse(r.stdout); } catch { throw new Error(`not JSON (exit ${r.status}): ${r.stdout}\n${r.stderr}`); }
};
const ids = (items) => items.map((item) => item.id);
const optional = (bundle) => bundle.included.filter((item) => item.reason !== 'mandatory');
const ALWAYS = new Set(['acceptance', 'handoff:current-state', 'handoff:next-exact-action', 'repo:app']);

async function workspace(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-rank-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  await mkdir(join(root, 'knowledge'), { recursive: true });
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), [
    '# Handoff', '', '## Current objective', '', 'Stop losing webhook events when a merchant endpoint is down.', '',
    '## Current state', '', 'Delivery job drafted; the dead-letter table exists but nothing writes to it yet.', '',
    '## Next exact action', '', 'Write the integration test for a 410 Gone response.', '',
  ].join('\n'));
  await writeFile(join(root, '.agentos/tasks.md'), [
    '# Tasks', '', '## Acceptance criteria', '',
    '- A delivery that keeps failing ends in the dead-letter table and can be replayed from the dashboard.',
    '- A 410 Gone response disables the endpoint at once.', '',
  ].join('\n'));
  const notes = {
    // F1-question's winner at 313107b: an incident note that shares only function words (how, long, time) with the question.
    'knowledge/stale-rates.md': ['note', '# Incident: stale exchange rates\n\nNobody knew how long the provider was down; by the time anyone looked, invoices had stale rates.\n'],
    // R1-broad/F3-broad: a record whose only hit is the one --about term ("webhook"), in its body.
    'knowledge/delivery.md': ['decision', '# Decision 2026-09-14\n\nOutbound webhook deliveries are retried with exponential backoff, then dead-lettered.\n'],
  };
  for (const [path, [kind, text]] of Object.entries(notes)) {
    await writeFile(join(root, path), text);
    ok(cli(['brain', 'register', path, '--kind', kind], root));
  }
  return root;
}

test('a function-word-only --about query matches no Brain record', async (t) => {
  const root = await workspace(t);
  const out = context(root, ['--about', 'how long does it take, and what time is it?']);
  assert.equal(out.ok, true, out.text);
  assert.deepEqual(ids(out.included.filter((item) => item.kind === 'brain')), [], `function words matched: ${JSON.stringify(out.included)}`);
  assert.equal(out.omitted.find((item) => item.id === 'brain:stale-rates')?.reason, 'no-match');
});

test('under a tight budget a Brain record with a real --about hit is packed before the always-relevant items', async (t) => {
  const root = await workspace(t);
  const about = ['--about', 'webhook'];
  const full = context(root, about);
  const record = full.included.find((item) => item.id === 'brain:delivery');
  assert.ok(record, `the webhook decision matches at the default budget: ${JSON.stringify(full.included)}`);
  assert.match(record.reason, /webhook/);
  // Room for that one record above the mandatory-only minimum, not for the always-relevant items as well.
  const needed = context(root, [...about, '--budget', '1']).overflow.needed;
  const tight = context(root, [...about, '--budget', String(needed + record.tokens)]);
  assert.equal(tight.ok, true, tight.text);
  assert.ok(tight.budget.estimate <= tight.budget.limit, `estimate ${tight.budget.estimate} within ${tight.budget.limit}`);
  assert.equal(optional(tight)[0]?.id, 'brain:delivery', `packed first: ${JSON.stringify(optional(tight))}`);
  const dropped = tight.omitted.filter((item) => ALWAYS.has(item.id) && item.reason === 'budget');
  assert.ok(dropped.length, `an always-relevant item is omitted for budget instead: ${JSON.stringify(tight.omitted)}`);
});

test('without --about the packing order is unchanged: always-relevant items first, Brain by task terms after', async (t) => {
  const root = await workspace(t);
  // "delivery" in the task id matches brain:delivery by its id slug; it ranks after the always-relevant items.
  const r = cli(['context', 'claude', '--task', 'delivery', '--json'], root);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true, out.text);
  assert.deepEqual(ids(optional(out)), ['acceptance', 'handoff:current-state', 'handoff:next-exact-action', 'repo:app', 'brain:delivery']);
  const needed = JSON.parse(cli(['context', 'claude', '--task', 'delivery', '--budget', '1', '--json'], root).stdout).overflow.needed;
  const brain = out.included.find((item) => item.id === 'brain:delivery');
  const tight = JSON.parse(cli(['context', 'claude', '--task', 'delivery', '--budget', String(needed + brain.tokens), '--json'], root).stdout);
  assert.equal(tight.ok, true, tight.text);
  assert.equal(tight.omitted.find((item) => item.id === 'brain:delivery')?.reason, 'budget', 'the Brain record still waits behind the always-relevant items');
});
