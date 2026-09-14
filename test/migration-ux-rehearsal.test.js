import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { initAgentOS, doctorAgentOS, normalizeRepoIdsAgentOS } from '../dist/core.js';

// Slice 5 rehearsal: one workspace carrying all three upgrade failure classes
// at once, exactly as they appeared in the real 0.3.x -> 0.4.x rollout, driven
// through the documented command sequence to a clean `doctor`.
//
// The point is end-to-end proof, not unit coverage: unsafe repo IDs, custom
// content interleaved with a stale Adapter section, and retired cards must all
// be reported, then migrated by the opt-in commands, without losing a byte of
// the owner's text.

const MANAGED_START = '<!-- agentos:managed:start -->';
const MANAGED_END = '<!-- agentos:managed:end -->';

const LEGACY_AGENTS_BODY = [
  '# AGENTS.md',
  '',
  'AgentOS for Projects bootloader.',
  '',
  'Workspace: multi-repo',
  'Repos: web=./web (frontend/unknown/npm); api=./api (backend/unknown/npm)',
  '',
  'Read first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`.',
].join('\n');

const OWNER_RULES = '# Product rules\n\n- Guest flow stays download-free.\n- Never rename the print queue folder.\n';
const OWNER_TAIL = '\n## Owner notes\n\nEscalate before touching billing code.\n';

// Exact bytes the 0.3.0 CLI installed for this retired skill (see
// test/retired-cleanup.test.js and src/legacy-skill-shapes.ts).
const HISTORICAL_SKILL_CARD = "---\nname: systematic-debugging\ncategory: core\nmode: summary\nsummary: \"use for unclear bugs or inconsistent reproduction.\"\n---\n\n# Systematic Debugging\n\nTrigger: Use when a bug's root cause is unclear or reproduction is inconsistent.\n\n## Scope and safety\n\n- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.\n- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.\n- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.\n\n## Procedure\n\n1. Reproduce the failure with the smallest possible input before changing any code.\n2. Form a specific hypothesis about the cause; do not guess-and-check broadly.\n3. Add logging/assertions or use a debugger to confirm or reject the hypothesis with real evidence.\n4. Fix the confirmed root cause, not just the symptom.\n5. Remove temporary debugging instrumentation before finishing.\n\n## Verification\n\n- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.\n- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.\n- Re-run the original failing case and confirm it now passes.\n- Run the existing test suite to check for regressions.\n\n## Notes\n\n- Prefer binary search (bisecting commits/inputs) over linear scanning when the failure is intermittent.\n- Write down the hypothesis and the evidence that confirmed/rejected it so the fix can be reviewed.\n";

async function snapshotTree(root) {
  const entries = [];
  async function walk(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) { entries.push(`${relative(root, abs)}/`); await walk(abs); }
      else entries.push(`${relative(root, abs)} ${createHash('sha256').update(await readFile(abs)).digest('hex')}`);
    }
  }
  await walk(root);
  return entries;
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

test('a workspace with all three upgrade classes migrates end to end without losing owner content', async t => {
  const root = await mkdtemp(join(tmpdir(), 'agentos-rehearsal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [dir, name] of [['web', 'web'], ['api', 'api']]) {
    await mkdir(join(root, dir), { recursive: true });
    await writeFile(join(root, dir, 'package.json'), JSON.stringify({ name, scripts: { build: 'echo build', test: 'echo test' } }, null, 2));
  }
  await writeFile(join(root, 'README.md'), '# Fixture product\n');
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });

  // --- build the three failure classes -------------------------------------
  // 1. unsafe repo IDs, with the repo notes the old AgentOS wrote for them
  const projectPath = join(root, '.agentos/project.yaml');
  const project = await readFile(projectPath, 'utf8');
  const unsafeProject = project.replace(/^(\s+)web:/m, '$1frontend_client:').replace(/^(\s+)api:/m, '$1backend_client:');
  assert.notEqual(unsafeProject, project, 'fixture must rename both repo keys');
  await writeFile(projectPath, unsafeProject);
  for (const [from, to] of [['web.md', 'frontend_client.md'], ['api.md', 'backend_client.md']]) {
    const body = await readFile(join(root, '.agentos/repos', from), 'utf8');
    await writeFile(join(root, '.agentos/repos', to), body);
    await rm(join(root, '.agentos/repos', from));
  }

  // 2. owner content with a stale Adapter section interleaved in it
  await writeFile(join(root, 'AGENTS.md'), `${OWNER_RULES}\n${LEGACY_AGENTS_BODY}\n${OWNER_TAIL}`);

  // 3. a retired historical skill card plus a hand-written retired agent card
  await mkdir(join(root, '.agentos/skills/core/systematic-debugging'), { recursive: true });
  await writeFile(join(root, '.agentos/skills/core/systematic-debugging/SKILL.md'), HISTORICAL_SKILL_CARD);
  const customAgentCard = '# Implementation\n\nOur own implementation role notes. Keep them.\n';
  await writeFile(join(root, '.agentos/agents/implementation.md'), customAgentCard);

  // --- 1. everything is reported -------------------------------------------
  const reported = await doctorAgentOS({ cwd: root, json: true });
  assert.equal(reported.ok, false);
  assert.equal(reported.migration.repoIds.length, 2, 'both unsafe IDs reported');
  assert.ok(reported.migration.adapters.some((adapter) => adapter.classification === 'adopt'), 'the interleaved adapter is adoptable');
  assert.ok(reported.migration.retiredCards.some((card) => card.id === 'systematic-debugging' && card.eligibility === 'prunable'));
  assert.ok(reported.migration.retiredCards.some((card) => card.id === 'implementation' && card.eligibility === 'customized'));

  // --- 2. the read-only preview writes nothing ------------------------------
  const beforePreview = await snapshotTree(root);
  const preview = await doctorAgentOS({ cwd: root, fix: true, dryRun: true, adoptCustomAdapters: true, json: true });
  assert.match(preview.text, /DRY RUN/);
  assert.ok(preview.summary.adopt_count >= 1);
  assert.deepEqual(await snapshotTree(root), beforePreview, 'preview must not write');

  // --- 3. migrate, in the documented order ----------------------------------
  await normalizeRepoIdsAgentOS({ cwd: root });
  await doctorAgentOS({ cwd: root, fix: true, adoptCustomAdapters: true, json: true });
  await doctorAgentOS({ cwd: root, fix: true, pruneRetired: true, json: true });

  // --- 4. verify the outcome ------------------------------------------------
  const final = await doctorAgentOS({ cwd: root, json: true });
  assert.equal(final.ok, true, `expected a clean workspace, got: ${final.problems.join(' | ')}`);
  // Nothing machine-migratable is left: no repo IDs to rename and no adapter
  // needing work. The one deliberate remainder is the owner-authored retired
  // agent card, which the inventory keeps reporting for a human decision.
  assert.deepEqual(final.migration.repoIds, []);
  assert.deepEqual(final.migration.adapters.filter((adapter) => adapter.classification !== 'noop'), []);
  const leftovers = final.migration.retiredCards.map((card) => `${card.id}:${card.eligibility}`);
  assert.deepEqual(leftovers.sort(), ['implementation:customized'], `unexpected leftovers: ${leftovers.join(', ')}`);
  assert.deepEqual(final.migration.summary.action_required, 1, 'the human-owned card is the only outstanding item');

  const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.equal(agents.split(MANAGED_START).length - 1, 1, 'exactly one managed block');
  assert.equal(agents.split(MANAGED_END).length - 1, 1);
  // Byte-for-byte: removing the managed block must leave exactly the owner's
  // bytes as they were outside the replaced legacy span, in the same order.
  const stripped = agents.slice(0, agents.indexOf(MANAGED_START)) + agents.slice(agents.indexOf(MANAGED_END) + MANAGED_END.length);
  assert.equal(stripped, `${OWNER_RULES}\n\n${OWNER_TAIL}`, 'every owner byte outside the managed block is preserved exactly');
  assert.doesNotMatch(agents, /Repos: web=\.\/web/, 'the stale section is gone');

  const projectAfter = await readFile(projectPath, 'utf8');
  assert.match(projectAfter, /frontend-client:/);
  assert.match(projectAfter, /backend-client:/);
  assert.doesNotMatch(projectAfter, /frontend_client|backend_client/);
  assert.equal(await exists(join(root, '.agentos/repos/frontend-client.md')), true);
  assert.equal(await exists(join(root, '.agentos/repos/frontend_client.md')), false);

  assert.equal(await exists(join(root, '.agentos/skills/core/systematic-debugging/SKILL.md')), false, 'the provably historical card is pruned');
  assert.equal(await readFile(join(root, '.agentos/agents/implementation.md'), 'utf8'), customAgentCard, 'the owner-authored agent card is untouched');

  // A backup of every adopted/converted adapter exists, and the git-facing
  // files all carry the canonical repo IDs.
  assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), true, 'adoption leaves a one-time backup');
  const child = await readFile(join(root, 'web/AGENTS.md'), 'utf8');
  assert.match(child, /\.agentos\/repos\/frontend-client\.md/);
  assert.doesNotMatch(child, /frontend_client/);
});
