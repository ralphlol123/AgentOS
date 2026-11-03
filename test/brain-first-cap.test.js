// Brain-first packing for `context --about` is capped: at most three Brain --about hits (the top three in rank order)
// move ahead of the other optional records, and only while every always-relevant item that fits in the usual order
// still fits. Every other record keeps the usual order (score, freshness, source order).
// Derived from the Brain-ranking evaluation (ledgerline case, F3-question) as a small self-contained fixture: one common
// --about word ("invoice") hits many Brain records. Budgets come from this workspace's own runs (needed, item tokens).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const TASK = 'tax-authority-audit-prep';
const ABOUT = ['--about', 'how is the number on a new invoice generated?'];
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTOS_ENGINE: '' } });
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const context = (root, args) => {
  const r = cli(['context', 'claude', '--task', TASK, ...args, '--json'], root);
  try { return JSON.parse(r.stdout); } catch { throw new Error(`not JSON (exit ${r.status}): ${r.stdout}\n${r.stderr}`); }
};
const ids = (items) => items.map((item) => item.id);
const optional = (bundle) => bundle.included.filter((item) => item.reason !== 'mandatory');
const TASK_SECTIONS = ['acceptance', 'handoff:current-state', 'handoff:next-exact-action'];
const OTHERS = ['adr-0005', 'adr-0006', 'adr-0009', 'architecture', 'caching', 'conventions', 'glossary', 'release-process', 'ledger-export', 'credit-notes'];

/** `long`: deep paths and long titles, so every rendered Brain pointer costs several times as much. */
async function workspace(t, { long = false } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-cap-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  await mkdir(root, { recursive: true });
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  const dir = long ? 'knowledge/finance/billing/invoicing/architecture-decision-records/accepted/2026/q3/ledgerline-platform' : 'knowledge';
  const title = (name) => long ? `${name}: accepted architecture decision record for the Ledgerline billing platform, finance and invoicing area, reviewed by the platform team` : name;
  // The target matches number and invoice; every other record matches only invoice, once, in its body.
  const notes = [['invoice-numbering', `# ${title('Invoice numbering')}\n\nEach invoice number comes from a gapless per-account sequence.\n`],
    ...OTHERS.map((name) => [name, `# ${title(name)}\n\nNotes on ${name}; it also touches the invoice flow.\n`])];
  for (const [name, text] of notes) {
    const path = `${dir}/${name}.md`;
    await mkdir(join(root, dirname(path)), { recursive: true });
    await writeFile(join(root, path), text);
    ok(cli(['brain', 'register', path, '--kind', 'decision'], root));
  }
  // Task sections written after the notes (fresher).
  await writeFile(join(root, '.agentos/handoff.md'), [
    '# Handoff', '', '## Current objective', '', 'Prepare the ledger export the tax authority asked for.', '',
    '## Current state', '', 'Export query drafted; credit notes are not yet joined to their invoices.', '',
    '## Next exact action', '', 'Join credit notes to the original documents and rerun the export for September.', '',
  ].join('\n'));
  await writeFile(join(root, '.agentos/tasks.md'), [
    '# Tasks', '', '## Acceptance criteria', '', '- The export lists every document of the period with its sequence number.', '',
  ].join('\n'));
  return root;
}

const neededOf = (root) => context(root, [...ABOUT, '--budget', '1']).overflow.needed;
const fits = (bundle) => { assert.equal(bundle.ok, true, bundle.text); assert.ok(bundle.budget.estimate <= bundle.budget.limit, `estimate ${bundle.budget.estimate} within ${bundle.budget.limit}`); };
const missing = (bundle, wanted) => wanted.filter((id) => !bundle.included.some((item) => item.id === id));

test('F3-question at the tight budget (needed x 1.15): the target and the task sections are all included', async (t) => {
  const root = await workspace(t);
  const full = context(root, ABOUT);
  assert.equal(optional(full).filter((item) => item.kind === 'brain').length, 1 + OTHERS.length, `every record is an --about hit: ${JSON.stringify(full.omitted)}`);
  const tight = context(root, [...ABOUT, '--budget', String(Math.ceil(neededOf(root) * 1.15))]);
  fits(tight);
  assert.ok(tight.omitted.some((item) => item.reason === 'budget'), 'the budget is tight: something is omitted for budget');
  assert.deepEqual(missing(tight, ['brain:invoice-numbering', ...TASK_SECTIONS]), [], `omitted: ${JSON.stringify(tight.omitted)}`);
});

test('long Brain references: promoted pointers never displace task sections that fit in the usual order', async (t) => {
  const root = await workspace(t, { long: true });
  const full = context(root, ABOUT);
  const tokens = (id) => full.included.find((item) => item.id === id).tokens;
  const sections = optional(full).filter((item) => item.reason.includes('in scope'));
  assert.ok(sections.length >= TASK_SECTIONS.length, `task sections: ${ids(sections)}`);
  // Room above the minimum for the target and every always-relevant item, the order that held at 313107b.
  const budget = neededOf(root) + tokens('brain:invoice-numbering') + sections.reduce((sum, item) => sum + item.tokens, 0);
  const tight = context(root, [...ABOUT, '--budget', String(budget)]);
  fits(tight);
  assert.deepEqual(missing(tight, ['brain:invoice-numbering', ...ids(sections)]), [], `omitted: ${JSON.stringify(tight.omitted)}`);
});

test('only the top three Brain --about hits are promoted; the 4th and later keep their usual order after the task sections', async (t) => {
  const root = await workspace(t);
  const order = ids(optional(context(root, ABOUT)));
  const brain = order.filter((id) => id.startsWith('brain:'));
  assert.equal(brain[0], 'brain:invoice-numbering', `the two-term hit ranks first: ${order}`);
  assert.deepEqual(order.slice(0, 3), brain.slice(0, 3), `the top three Brain hits lead: ${order}`);
  const rest = order.slice(3);
  // Usual order: the always-relevant items (score 1, fresher) before the remaining one-term Brain hits (score 1).
  const firstBrain = rest.findIndex((id) => id.startsWith('brain:'));
  assert.ok(firstBrain > 0, `a task section follows the promoted three: ${order}`);
  assert.ok(rest.slice(firstBrain).every((id) => id.startsWith('brain:')), `then the 4th and later Brain hits: ${order}`);
  assert.deepEqual(rest.slice(firstBrain), brain.slice(3), `in their usual (source) order: ${order}`);
  for (const id of TASK_SECTIONS) assert.ok(rest.slice(0, firstBrain).includes(id), `${id} sits between: ${order}`);
});
