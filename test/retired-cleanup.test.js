import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { initAgentOS, doctorAgentOS } from '../dist/core.js';

// Slice 4: retired-card cleanup completion.
//
// Retired *agent* cards were already migrated when byte-matched; retired
// *skill* cards were detection-only, and stale `.agentos/skills.md` entries
// were warned about but never repaired. These tests pin the completion:
// per-card eligibility (provably generated vs customized), opt-in pruning of
// retired skill cards, and index repair - with byte-matching as the only thing
// that makes a card prunable.

const execFileAsync = promisify(execFile);
const CLI = resolve('dist/cli.js');

// Exact bytes the 0.3.0 CLI installed for these retired skills, captured by
// running that CLI from this repository's history:
//   skills add systematic-debugging            (summary mode)
//   skills add grounded-codebase-docs --mode full
// These literals are the evidence record for src/legacy-skill-shapes.ts - their
// SHA-256 (CRLF-normalized) is what marks a card as provably historical.
const HISTORICAL_SUMMARY_CARD = "---\nname: systematic-debugging\ncategory: core\nmode: summary\nsummary: \"use for unclear bugs or inconsistent reproduction.\"\n---\n\n# Systematic Debugging\n\nTrigger: Use when a bug's root cause is unclear or reproduction is inconsistent.\n\n## Scope and safety\n\n- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.\n- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.\n- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.\n\n## Procedure\n\n1. Reproduce the failure with the smallest possible input before changing any code.\n2. Form a specific hypothesis about the cause; do not guess-and-check broadly.\n3. Add logging/assertions or use a debugger to confirm or reject the hypothesis with real evidence.\n4. Fix the confirmed root cause, not just the symptom.\n5. Remove temporary debugging instrumentation before finishing.\n\n## Verification\n\n- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.\n- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.\n- Re-run the original failing case and confirm it now passes.\n- Run the existing test suite to check for regressions.\n\n## Notes\n\n- Prefer binary search (bisecting commits/inputs) over linear scanning when the failure is intermittent.\n- Write down the hypothesis and the evidence that confirmed/rejected it so the fix can be reviewed.\n";
const HISTORICAL_FULL_CARD = "---\nname: grounded-codebase-docs\ncategory: core\nmode: full\nsummary: \"use when writing/updating docs about code behavior.\"\n---\n\n# Grounded Codebase Docs\n\nTrigger: Use when writing or updating documentation (README, CLAUDE.md, comments) about how the code behaves.\n\n## Scope and safety\n\n- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.\n- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.\n- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.\n\n## Procedure\n\n1. Read the actual current implementation before describing behavior; do not describe intended/legacy behavior from memory.\n2. Prefer linking to file:line over duplicating logic in prose that can drift out of sync.\n3. Verify commands/examples in the doc by actually running them.\n\n## Verification\n\n- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.\n- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.\n- Every command and code reference in the doc has been executed/checked against the current codebase.\n\n## Notes\n\n- Docs that describe aspirational behavior instead of real behavior are worse than no docs — they actively mislead.\n";

// Same bytes plus one hand-written line: not in the allowlist, so it is a fork
// and must never be pruned or rewritten.
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

// Adds a stale, retired entry inside the managed AgentOS Local Skills block, the
// way an older AgentOS generation left one behind after its card was deleted.
async function poisonSkillsIndex(root, entries) {
  const path = join(root, '.agentos/skills.md');
  const text = await readFile(path, 'utf8');
  const block = `# AgentOS Local Skills\n\n### core\n\n${entries.map((id) => `- ${id} — retired entry\n  Details: .agentos/skills/core/${id}/SKILL.md`).join('\n')}\n# End AgentOS Local Skills`;
  const replaced = /# AgentOS Local Skills[\s\S]*?# End AgentOS Local Skills/.test(text)
    ? text.replace(/# AgentOS Local Skills[\s\S]*?# End AgentOS Local Skills/, block)
    : `${text.trimEnd()}\n\n${block}\n`;
  await writeFile(path, replaced);
  return replaced;
}

test('the inventory marks byte-identical historical skill cards prunable and forks manual-review', async t => {
  const root = await workspace(t);
  await installCard(root, 'core', 'systematic-debugging', HISTORICAL_SUMMARY_CARD);
  await installCard(root, 'frontend', 'ai-slop-design-review', CUSTOMIZED_SKILL_CARD);

  const result = await doctorAgentOS({ cwd: root, json: true });
  const byId = new Map(result.migration.retiredCards.map((card) => [card.id, card]));

  assert.equal(byId.get('systematic-debugging').kind, 'skill');
  assert.equal(byId.get('systematic-debugging').canonical, 'debugging');
  assert.equal(byId.get('systematic-debugging').eligibility, 'prunable', 'bytes match a body the old CLI really installed');
  assert.equal(byId.get('ai-slop-design-review').eligibility, 'manual-review', 'a hand-edited card is never prunable');
  assert.match(byId.get('systematic-debugging').next, /prune-retired/);
});

test('plain doctor --fix does not prune retired cards', async t => {
  const root = await workspace(t);
  await installCard(root, 'core', 'systematic-debugging', HISTORICAL_SUMMARY_CARD);
  const cardPath = join(root, '.agentos/skills/core/systematic-debugging/SKILL.md');
  const before = await readFile(cardPath, 'utf8');

  const result = await doctorAgentOS({ cwd: root, fix: true, json: true });

  assert.equal(await exists(cardPath), true, 'pruning is opt-in');
  assert.equal(await readFile(cardPath, 'utf8'), before, 'the card must be byte-identical');
  assert.ok(result.problems.length >= 0);
});

test('doctor --fix --prune-retired removes only provably historical cards and leaves forks alone', async t => {
  const root = await workspace(t);
  await installCard(root, 'core', 'systematic-debugging', HISTORICAL_SUMMARY_CARD);
  await installCard(root, 'core', 'grounded-codebase-docs', HISTORICAL_FULL_CARD);
  await installCard(root, 'frontend', 'ai-slop-design-review', CUSTOMIZED_SKILL_CARD);

  const result = await doctorAgentOS({ cwd: root, fix: true, pruneRetired: true, json: true });

  assert.equal(await exists(join(root, '.agentos/skills/core/systematic-debugging/SKILL.md')), false, 'a provably generated card is removed');
  assert.equal(await exists(join(root, '.agentos/skills/core/systematic-debugging')), false, 'the emptied card directory goes with it');
  assert.equal(await exists(join(root, '.agentos/skills/core/grounded-codebase-docs/SKILL.md')), false);
  assert.equal(await exists(join(root, '.agentos/skills/frontend/ai-slop-design-review/SKILL.md')), true, 'a fork stays');
  assert.equal(await readFile(join(root, '.agentos/skills/frontend/ai-slop-design-review/SKILL.md'), 'utf8'), CUSTOMIZED_SKILL_CARD, 'a fork is byte-identical');
  assert.ok(result.diagnostics.some((note) => /retired skill card/.test(note)), `expected a prune diagnostic, got: ${result.diagnostics.join(' | ')}`);
  assert.ok(result.diagnostics.some((note) => /left customized retired skill card/.test(note)), 'the skipped fork is reported');
});

test('pruning repairs stale retired entries inside the managed index', async t => {
  const root = await workspace(t);
  await installCard(root, 'core', 'systematic-debugging', HISTORICAL_SUMMARY_CARD);
  await poisonSkillsIndex(root, ['systematic-debugging', 'grounded-codebase-docs']);

  const result = await doctorAgentOS({ cwd: root, fix: true, pruneRetired: true, json: true });
  const index = await readFile(join(root, '.agentos/skills.md'), 'utf8');

  assert.doesNotMatch(index, /systematic-debugging/);
  assert.doesNotMatch(index, /grounded-codebase-docs/);
  assert.match(index, /Policy: on-demand/, 'the policy line survives');
  assert.ok(result.diagnostics.some((note) => /skills\.md/.test(note)), 'the index repair is reported');
});

test('pruning never touches native engine copies of a retired skill', async t => {
  const root = await workspace(t);
  await installCard(root, 'core', 'systematic-debugging', HISTORICAL_SUMMARY_CARD);
  await mkdir(join(root, '.claude/skills/systematic-debugging'), { recursive: true });
  await writeFile(join(root, '.claude/skills/systematic-debugging/SKILL.md'), HISTORICAL_SUMMARY_CARD);

  await doctorAgentOS({ cwd: root, fix: true, pruneRetired: true, json: true });

  assert.equal(await exists(join(root, '.agentos/skills/core/systematic-debugging/SKILL.md')), false);
  assert.equal(await readFile(join(root, '.claude/skills/systematic-debugging/SKILL.md'), 'utf8'), HISTORICAL_SUMMARY_CARD, 'engine-native copies are out of scope');
});

test('pruning is idempotent', async t => {
  const root = await workspace(t);
  await installCard(root, 'core', 'systematic-debugging', HISTORICAL_SUMMARY_CARD);
  await doctorAgentOS({ cwd: root, fix: true, pruneRetired: true, json: true });

  const indexAfterFirst = await readFile(join(root, '.agentos/skills.md'), 'utf8');
  const second = await doctorAgentOS({ cwd: root, fix: true, pruneRetired: true, json: true });

  assert.equal(await readFile(join(root, '.agentos/skills.md'), 'utf8'), indexAfterFirst);
  assert.equal(second.diagnostics.some((note) => /prune|retired skill card/.test(note)), false, 'nothing left to prune');
});

test('CLI requires --fix alongside --prune-retired', async t => {
  const root = await workspace(t);
  await installCard(root, 'core', 'systematic-debugging', HISTORICAL_SUMMARY_CARD);

  const refused = await execFileAsync('node', [CLI, 'doctor', '--prune-retired'], { cwd: root }).catch((error) => error);
  assert.equal(refused.code, 1);
  assert.match(refused.stdout, /--fix/);
  assert.equal(await exists(join(root, '.agentos/skills/core/systematic-debugging/SKILL.md')), true);

  await execFileAsync('node', [CLI, 'doctor', '--fix', '--prune-retired'], { cwd: root });
  assert.equal(await exists(join(root, '.agentos/skills/core/systematic-debugging/SKILL.md')), false);
});
