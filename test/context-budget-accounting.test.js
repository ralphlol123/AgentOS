// A successful `agentos context` fits its --budget: the estimate counts everything rendered (header, mandatory and
// optional sections, Omitted/Conflicts/Missing/Warnings, ADVISORY lines), and OVERFLOW.needed is the real minimum.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const TASK = ['--task', 'auth tokens'];
const run = (root, budget, json = true) => spawnSync(process.execPath, [CLI, 'context', 'claude', ...TASK, '--budget', String(budget), ...(json ? ['--json'] : [])], { cwd: root, encoding: 'utf8' });
const bundleAt = (root, budget) => { const r = run(root, budget); return { status: r.status, bundle: JSON.parse(r.stdout) }; };

// 40 unrelated decisions: a long Omitted trailer that the mandatory-only check never counted.
async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-budget-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  await mkdir(root);
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nShip the token rotation feature.\n\n## Current state\n\nRotation endpoint drafted.\n');
  const unrelated = Array.from({ length: 40 }, (_, i) => `## 2026-07-${String(1 + (i % 28)).padStart(2, '0')} — Logging format variant ${i}\n\n- Status: accepted\n`);
  await writeFile(join(root, '.agentos/decisions.md'), ['# Decisions', '', '## 2026-10-01 — Auth tokens: rotate weekly', '', '- Status: accepted', '', ...unrelated].join('\n'));
  return root;
}

test('every successful context fits its budget, and OVERFLOW.needed is the smallest budget that succeeds', async (t) => {
  const root = await fixture(t);
  const impossible = bundleAt(root, 1);
  assert.equal(impossible.status, 1);
  const needed = impossible.bundle.overflow.needed;

  // needed - 1 is the documented overflow: exit 1, ok:false, nothing rendered, same needed figure.
  const below = bundleAt(root, needed - 1);
  assert.equal(below.status, 1, `budget ${needed - 1}: ${below.bundle.budget.estimate}`);
  assert.equal(below.bundle.ok, false);
  assert.equal(below.bundle.overflow.needed, needed);
  assert.deepEqual(below.bundle.included, []);
  const human = run(root, needed - 1, false);
  assert.equal(human.status, 1);
  assert.match(human.stdout, /^AgentOS context: OVERFLOW\n/);

  // needed itself succeeds within budget.
  const at = bundleAt(root, needed);
  assert.equal(at.status, 0);
  assert.equal(at.bundle.ok, true);
  assert.ok(at.bundle.budget.estimate <= needed, `estimate ${at.bundle.budget.estimate} > limit ${needed}`);

  // From needed to the default-budget size, no ok:true result is over its limit; optional items only grow.
  const full = bundleAt(root, 24000).bundle;
  let previous = -1;
  for (let budget = needed; budget <= full.budget.estimate + 10; budget += 10) {
    const { status, bundle } = bundleAt(root, budget);
    assert.equal(status, 0, `budget ${budget}`);
    assert.ok(bundle.budget.estimate <= budget, `budget ${budget}: estimate ${bundle.budget.estimate} > limit`);
    const optional = bundle.included.filter((item) => item.reason !== 'mandatory').length;
    assert.ok(optional >= previous, `budget ${budget}: ${optional} optional < ${previous}`);
    previous = optional;
  }
});

test('the estimate counts the ADVISORY lines printed after the context text', async (t) => {
  const root = await fixture(t);
  const r = run(root, 24000);
  const out = JSON.parse(r.stdout);
  assert.ok(out.advisories.length, 'claude-code prints an advisory');
  assert.equal(out.budget.estimate, out.budget.overhead + Math.ceil([out.text, '', ...out.advisories].join('\n').length / 4));
  const human = run(root, 24000, false).stdout;
  assert.ok(human.startsWith([out.text, '', ...out.advisories].join('\n')), 'human output is the measured text plus the advisories');
});
