import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { initAgentOS, doctorAgentOS } from '../dist/core.js';

// Retired (pre-0.4.0) cards in 3.0.0: reported read-only in the doctor migration inventory with the
// manual step and the 2.x command that still migrates/prunes them; `doctor --fix` never touches them.

// Exact bytes the 0.3.0 CLI installed for a retired skill (`skills add systematic-debugging`, summary mode).
const HISTORICAL_SUMMARY_CARD = "---\nname: systematic-debugging\ncategory: core\nmode: summary\nsummary: \"use for unclear bugs or inconsistent reproduction.\"\n---\n\n# Systematic Debugging\n\nTrigger: Use when a bug's root cause is unclear or reproduction is inconsistent.\n\n## Scope and safety\n\n- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.\n- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.\n- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.\n\n## Procedure\n\n1. Reproduce the failure with the smallest possible input before changing any code.\n2. Form a specific hypothesis about the cause; do not guess-and-check broadly.\n3. Add logging/assertions or use a debugger to confirm or reject the hypothesis with real evidence.\n4. Fix the confirmed root cause, not just the symptom.\n5. Remove temporary debugging instrumentation before finishing.\n\n## Verification\n\n- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.\n- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.\n- Re-run the original failing case and confirm it now passes.\n- Run the existing test suite to check for regressions.\n\n## Notes\n\n- Prefer binary search (bisecting commits/inputs) over linear scanning when the failure is intermittent.\n- Write down the hypothesis and the evidence that confirmed/rejected it so the fix can be reviewed.\n";

// Same bytes plus one hand-written line.
const CUSTOMIZED_SKILL_CARD = HISTORICAL_SUMMARY_CARD.replace('## Notes\n', '## Notes\n\n- OUR FORK: also run the flaky suite twice.\n');

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-retired-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  return root;
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function installCard(root, category, id, content) {
  const dir = join(root, '.agentos/skills', category, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), content);
}

test('the inventory lists every retired skill card for manual review with the 2.x prune command', async t => {
  const root = await workspace(t);
  await installCard(root, 'core', 'systematic-debugging', HISTORICAL_SUMMARY_CARD);
  await installCard(root, 'frontend', 'ai-slop-design-review', CUSTOMIZED_SKILL_CARD);

  const result = await doctorAgentOS({ cwd: root, json: true });
  const byId = new Map(result.migration.retiredCards.map((card) => [card.id, card]));

  assert.equal(byId.get('systematic-debugging').kind, 'skill');
  assert.equal(byId.get('systematic-debugging').canonical, 'debugging');
  assert.equal(byId.get('systematic-debugging').eligibility, 'manual-review');
  assert.equal(byId.get('ai-slop-design-review').eligibility, 'manual-review');
  assert.match(byId.get('systematic-debugging').next, /agentos skills remove systematic-debugging.*agentos skills add debugging.*npx agentos-for-projects@2 doctor --fix --prune-retired/);
  assert.equal(result.migration.summary.retired_card_count, 2);
});

test('doctor --fix never prunes retired cards (removed in 3.0.0)', async t => {
  const root = await workspace(t);
  await installCard(root, 'core', 'systematic-debugging', HISTORICAL_SUMMARY_CARD);
  const cardPath = join(root, '.agentos/skills/core/systematic-debugging/SKILL.md');

  await doctorAgentOS({ cwd: root, fix: true, json: true });

  assert.equal(await readFile(cardPath, 'utf8'), HISTORICAL_SUMMARY_CARD, 'the card must be byte-identical');
  assert.equal(await exists(cardPath), true);
});
