import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { initAgentOS, doctorAgentOS, adaptersAgentOS } from '../dist/core.js';

// Slice 1: read-only migration inventory.
//
// `doctor` (and `doctor --json`) must report what a workspace needs to migrate
// — custom-content adapters, unsafe repository IDs, retired agent/skill cards —
// without writing anything, so an owner can see the whole upgrade surface
// before approving a fix. `agentos adapters explain <file>` gives the same
// classification for exactly one adapter path.
//
// Every test here is read-only by construction: the read-only test snapshots
// the whole workspace before and after and compares bytes.

const MANAGED_START = '<!-- agentos:managed:start -->';

// Historical generated card shape (phase-1 agent-profile body for `qa`),
// copied verbatim from test/aliases-and-migration.test.js which took it from
// git history. Byte-matched retired cards are the only ones cleanup may touch.
const PHASE1_QA_CARD = `# Qa

Mandate: Verify changed behavior with real commands and browser checks when UI is touched.

## Responsibilities in

- Work only inside declared task scope.
- Read AgentOS project, memory, handoff, tasks, skills, repo, and role context before acting.
- Report files changed, verification run, failures, and next action before stopping.

## Responsibilities out

- Do not touch secrets, .env files, production config, migrations, or unrelated repos without explicit approval.
- Do not commit or push unless explicitly assigned.

## Skills

Use .agentos/skills.md as an on-demand index. Load only skills relevant to this role and task.
`;

async function workspace(t, agents = 'minimal') {
  const root = await mkdtemp(join(tmpdir(), 'agentos-migration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents });
  return root;
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function mkdirp(path) {
  await mkdir(path, { recursive: true });
}

// Sorted relative-path -> sha256 (+ mode) map of the whole workspace, used to
// prove the inventory commands changed nothing at all.
async function snapshotTree(root) {
  const entries = [];
  async function walk(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        entries.push(`${relative(root, abs)}/`);
        await walk(abs);
      } else if (entry.isSymbolicLink()) {
        entries.push(`${relative(root, abs)} -> symlink`);
      } else {
        const [buffer, info] = await Promise.all([readFile(abs), stat(abs)]);
        entries.push(`${relative(root, abs)} ${createHash('sha256').update(buffer).digest('hex')} ${info.mode}`);
      }
    }
  }
  await walk(root);
  return entries;
}

const INTERLEAVED_ADAPTER = `# Product rules

This workspace uses **AgentOS for Projects**.

- Keep the guest flow download-free.
- Operator edits stay event-scoped.

AgentOS for Projects bootloader.

Do not rename the print queue folder.
`;

test('doctor --json reports a migration inventory on a clean workspace with nothing to do', async t => {
  const root = await workspace(t);
  const result = await doctorAgentOS({ cwd: root, json: true });

  assert.equal(result.ok, true, `clean workspace should be OK, got problems: ${result.problems.join(' | ')}`);
  assert.ok(result.migration, 'doctor result must carry a migration inventory');

  const { adapters, repoIds, retiredCards, summary } = result.migration;
  assert.ok(Array.isArray(adapters) && adapters.length >= 3, 'root adapters must be inventoried');
  for (const adapter of adapters) {
    assert.equal(adapter.classification, 'noop', `${adapter.label} should be noop on a fresh init, got ${adapter.classification}`);
    assert.equal(adapter.safe, true);
    assert.ok(typeof adapter.path === 'string' && adapter.path && !adapter.path.startsWith('/'), 'adapter paths are root-relative');
  }
  assert.deepEqual(repoIds, []);
  assert.deepEqual(retiredCards, []);
  assert.equal(summary.action_required, 0);
  assert.equal(summary.adapter_count, adapters.length);
});

test('doctor --json flags a custom-content adapter that interleaves custom text with a stale bootloader', async t => {
  const root = await workspace(t);
  await writeFile(join(root, 'AGENTS.md'), INTERLEAVED_ADAPTER);

  const result = await doctorAgentOS({ cwd: root, json: true });
  const entry = result.migration.adapters.find((adapter) => adapter.label === 'AGENTS.md');

  assert.ok(entry, 'AGENTS.md must appear in the adapter inventory');
  assert.equal(entry.classification, 'conflict');
  assert.equal(entry.safe, false);
  assert.match(entry.reason, /resolve manually/i);
  assert.equal(entry.level, 'root');
  // The inventory is additive: the pre-existing conflict problem still fails doctor.
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /AGENTS\.md adapter ownership is ambiguous/.test(problem)));
});

test('doctor --json flags unsafe repository IDs even when project.yaml fails strict validation', async t => {
  const root = await workspace(t);
  const projectPath = join(root, '.agentos/project.yaml');
  const project = await readFile(projectPath, 'utf8');
  const unsafe = project.replace(/^repos:\n(\s+)/m, 'repos:\n  frontend_client:\n    path: .\n');
  assert.notEqual(unsafe, project, 'fixture must actually rewrite the repos mapping');
  await writeFile(projectPath, unsafe);

  const result = await doctorAgentOS({ cwd: root, json: true });

  assert.ok(result.problems.some((problem) => /Unsafe repository ID: frontend_client/.test(problem)), 'strict validation still fails closed');
  const entry = result.migration.repoIds.find((repo) => repo.from === 'frontend_client');
  assert.ok(entry, 'unsafe repo id must be reported in the migration inventory');
  assert.equal(entry.to, 'frontend-client');
  assert.equal(entry.collides, false);
  assert.match(entry.next, /project\.yaml/);
});

test('doctor --json classifies retired cards by eligibility and ignores live cards', async t => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/agents/qa.md'), PHASE1_QA_CARD);
  await writeFile(join(root, '.agentos/agents/implementation.md'), '# Implementation\n\nHand-written card: keep my wording.\n');
  await mkdirp(join(root, '.agentos/skills/core/systematic-debugging'));
  await writeFile(join(root, '.agentos/skills/core/systematic-debugging/SKILL.md'), '# Systematic Debugging\n\nlocal fork\n');
  const skillsMdPath = join(root, '.agentos/skills.md');
  await writeFile(skillsMdPath, `${await readFile(skillsMdPath, 'utf8')}\n- grounded-codebase-docs — retired entry\n  Details: .agentos/skills/core/grounded-codebase-docs/SKILL.md\n`);

  const result = await doctorAgentOS({ cwd: root, json: true });
  const cards = result.migration.retiredCards;
  const byId = new Map(cards.map((card) => [`${card.kind}:${card.id}`, card]));

  assert.equal(byId.get('agent:qa').canonical, 'tester');
  assert.equal(byId.get('agent:qa').eligibility, 'already-canonical', 'tester.md is installed, so the stale qa card is redundant');
  assert.equal(byId.get('agent:implementation').canonical, 'developer');
  assert.equal(byId.get('agent:implementation').eligibility, 'customized', 'hand-written cards must never be prunable');
  assert.equal(byId.get('skill:systematic-debugging').canonical, 'debugging');
  assert.equal(byId.get('skill:systematic-debugging').eligibility, 'manual-review');
  assert.equal(byId.get('skill:grounded-codebase-docs').eligibility, 'index-only');
  assert.equal(byId.get('skill:grounded-codebase-docs').path, null);
  // Live cards are not retired and must not be reported.
  assert.equal(byId.has('agent:reviewer'), false);
  assert.equal(byId.has('agent:tester'), false);
});

test('the migration inventory and adapters explain are strictly read-only', async t => {
  const root = await workspace(t);
  await writeFile(join(root, 'AGENTS.md'), INTERLEAVED_ADAPTER);
  await writeFile(join(root, '.agentos/agents/qa.md'), PHASE1_QA_CARD);
  await mkdirp(join(root, '.agentos/skills/core/systematic-debugging'));
  await writeFile(join(root, '.agentos/skills/core/systematic-debugging/SKILL.md'), '# Systematic Debugging\n\nlocal fork\n');

  const before = await snapshotTree(root);
  await doctorAgentOS({ cwd: root, json: true });
  await doctorAgentOS({ cwd: root });
  await adaptersAgentOS({ cwd: root, explain: 'AGENTS.md' });
  const after = await snapshotTree(root);

  assert.deepEqual(after, before, 'no bytes, files, or modes may change');
  assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), false, 'no backup may be written by a read-only command');
});

test('agentos adapters explain classifies one adapter file without writing', async t => {
  const root = await workspace(t);

  const clean = await adaptersAgentOS({ cwd: root, explain: 'AGENTS.md' });
  assert.equal(clean.ok, true);
  assert.match(clean.text, /Classification: noop/);
  assert.match(clean.text, /Managed block: valid/);
  assert.match(clean.text, /root adapter/);

  await writeFile(join(root, 'AGENTS.md'), INTERLEAVED_ADAPTER);
  const conflicted = await adaptersAgentOS({ cwd: root, explain: 'AGENTS.md' });
  assert.equal(conflicted.ok, true, 'a conflict is a reportable classification, not a command failure');
  assert.match(conflicted.text, /Classification: conflict/);
  assert.match(conflicted.text, /resolve manually/i);

  const missing = await adaptersAgentOS({ cwd: root, explain: 'nope/NOT-AN-ADAPTER.md' });
  assert.equal(missing.ok, false);
  assert.match(missing.text, /not an AgentOS adapter target/i);

  const escaping = await adaptersAgentOS({ cwd: root, explain: '../outside.md' });
  assert.equal(escaping.ok, false);
  assert.match(escaping.text, /inside the workspace root/i);
});

test('adapters explain reports structural detail for a workspace whose project.yaml is invalid', async t => {
  const root = await workspace(t);
  await writeFile(join(root, 'AGENTS.md'), INTERLEAVED_ADAPTER);
  const projectPath = join(root, '.agentos/project.yaml');
  await writeFile(projectPath, 'repos:\n  frontend_client:\n    path: .\n');

  const explained = await adaptersAgentOS({ cwd: root, explain: 'AGENTS.md' });
  assert.equal(explained.ok, true, 'explain must still work when config cannot be parsed');
  assert.match(explained.text, /Classification: conflict/);
  assert.match(explained.text, /not an AgentOS adapter target|canonical section unavailable/i);

  const doctor = await doctorAgentOS({ cwd: root, json: true });
  assert.ok(doctor.problems.some((problem) => /Unsafe repository ID/.test(problem)));
  assert.ok(doctor.migration.repoIds.some((repo) => repo.from === 'frontend_client'));
});

test('migration inventory adapter entries cover child repo pointers', async t => {
  const root = await mkdtemp(join(tmpdir(), 'agentos-migration-child-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdirp(join(root, 'apps/web'));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });

  const result = await doctorAgentOS({ cwd: root, json: true });
  const child = result.migration.adapters.filter((adapter) => adapter.level === 'child');
  assert.ok(result.migration.adapters.some((adapter) => adapter.label === 'CLAUDE.md'), 'root adapters still listed');
  for (const adapter of child) {
    assert.ok(adapter.path.includes('apps/web'), `child adapter path should be repo-relative: ${adapter.path}`);
    assert.ok(['noop', 'update', 'migrate', 'append', 'create', 'conflict'].includes(adapter.classification));
  }
  assert.match(await readFile(join(root, 'AGENTS.md'), 'utf8'), new RegExp(MANAGED_START));
});

// --- review follow-ups (MF-1 and the fallback-classification findings) ------

test('adapters explain usage text does not advertise an unsupported flag', async t => {
  const root = await workspace(t);
  const usage = await adaptersAgentOS({ cwd: root });

  assert.equal(usage.ok, false);
  assert.equal(usage.text, 'Usage: agentos adapters explain <file>');
  assert.doesNotMatch(usage.text, /--json/, 'the CLI allowlist rejects --json for this command');
});

test('adapters explain classifies an empty adapter as create, not migrate', async t => {
  const root = await workspace(t);
  await writeFile(join(root, 'AGENTS.md'), '');
  // An invalid config forces the structural fallback, where an empty file must
  // still agree with the planner's `create` action.
  await writeFile(join(root, '.agentos/project.yaml'), 'repos:\n  frontend_client:\n    path: .\n');

  const explained = await adaptersAgentOS({ cwd: root, explain: 'AGENTS.md' });
  assert.equal(explained.ok, true);
  assert.match(explained.text, /Classification: create/);
  assert.doesNotMatch(explained.text, /Classification: migrate/);
});

test('adapters explain rejects a directory argument instead of claiming it is missing', async t => {
  const root = await workspace(t);
  // Invalid config skips adapter-target lookup, so the path reaches the
  // filesystem checks directly (the reviewer's original repro).
  await writeFile(join(root, '.agentos/project.yaml'), 'repos:\n  frontend_client:\n    path: .\n');
  const explained = await adaptersAgentOS({ cwd: root, explain: '.agentos' });

  assert.equal(explained.ok, false);
  assert.match(explained.text, /is a directory, not an adapter file/);
});

test('a clean workspace reports no migration section and reports one for real findings', async t => {
  const root = await workspace(t);
  const clean = await doctorAgentOS({ cwd: root });
  assert.doesNotMatch(clean.text, /Migration:/, 'clean workspaces keep doctor output unchanged');

  await writeFile(join(root, 'AGENTS.md'), INTERLEAVED_ADAPTER);
  const flagged = await doctorAgentOS({ cwd: root });
  assert.match(flagged.text, /Migration:/);
  assert.match(flagged.text, /AGENTS\.md: adapter conflict/);
  // Within the Migration section the conflict line states its instruction once,
  // not twice (the same reason also appears in the Problems block above).
  const migrationSection = flagged.text.slice(flagged.text.indexOf('Migration:'));
  assert.equal((migrationSection.match(/resolve manually/g) || []).length, 1);
});
