import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  initAgentOS,
  doctorAgentOS,
  __setAtomicWriteFaultForTests,
  __clearAtomicWriteFaultForTests,
  __writeFileExclusiveAtomicForTests,
  __planAdapterFilesForTests,
  __applyAdapterPlansForTests,
} from '../dist/core.js';

// Task 4: conflict-safe AgentOS adapter repair.
//
// AgentOS wraps every AgentOS-owned adapter section in an explicit, bounded
// managed block so init/doctor --fix can tell "AgentOS owns this text" apart
// from "a human wrote this text" without guessing. These tests pin the exact
// marker strings because the format is now part of the documented on-disk
// contract (see README).
const MANAGED_START = '<!-- agentos:managed:start -->';
const MANAGED_END = '<!-- agentos:managed:end -->';

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function tempProject() {
  return mkdtemp(join(tmpdir(), 'agentos-adapter-conflict-'));
}

async function mkdirp(path) {
  await mkdir(path, { recursive: true });
}

async function findAllTempArtifacts(root) {
  const found = [];
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.name.includes('.agentos-tmp-')) found.push(abs);
      if (entry.isDirectory()) await walk(abs);
    }
  }
  await walk(root);
  return found;
}

function markerCount(content, marker) {
  return content.split(marker).length - 1;
}

// --- creation ---------------------------------------------------------

test('init wraps freshly created root adapter sections in exactly one managed-block marker pair', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });

  for (const file of ['AGENTS.md', 'CLAUDE.md', '.hermes.md']) {
    const content = await readFile(join(root, file), 'utf8');
    assert.equal(markerCount(content, MANAGED_START), 1, `${file} must have exactly one start marker`);
    assert.equal(markerCount(content, MANAGED_END), 1, `${file} must have exactly one end marker`);
    assert.ok(content.indexOf(MANAGED_START) < content.indexOf(MANAGED_END), `${file} start marker must precede end marker`);
  }
});

// --- appending after genuinely custom content --------------------------

test('init appends the managed block after pre-existing custom content, preserving it byte-for-byte, with one backup', async () => {
  const root = await tempProject();
  const originalAgents = '# Existing Agent Rules\n\nKeep this content exactly, please.\n';
  await writeFile(join(root, 'AGENTS.md'), originalAgents);
  await chmod(join(root, 'AGENTS.md'), 0o640);

  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });

  const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.ok(agents.startsWith(originalAgents), 'original custom bytes must be preserved verbatim at the start of the file');
  assert.equal(markerCount(agents, MANAGED_START), 1);
  assert.equal(markerCount(agents, MANAGED_END), 1);
  assert.match(agents, /AgentOS for Projects/);

  const backupPath = join(root, 'AGENTS.md.agentos.bak');
  assert.equal(await exists(backupPath), true);
  assert.equal(await readFile(backupPath, 'utf8'), originalAgents, 'backup must hold the exact pre-conversion bytes');
  const mode = (await stat(backupPath)).mode & 0o777;
  assert.equal(mode, 0o640, 'backup must preserve the original file mode');
});

test('missing adapter files need no backup', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), false);
  assert.equal(await exists(join(root, 'CLAUDE.md.agentos.bak')), false);
  assert.equal(await exists(join(root, '.hermes.md.agentos.bak')), false);
});

// --- idempotency ---------------------------------------------------------

test('doctor --fix is a no-op on already-canonical managed adapters and never multiplies backups', async () => {
  const root = await tempProject();
  const originalAgents = '# Existing Agent Rules\n\nKeep this.\n';
  await writeFile(join(root, 'AGENTS.md'), originalAgents);
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });

  const afterInit = await readFile(join(root, 'AGENTS.md'), 'utf8');
  const backupAfterInit = await readFile(join(root, 'AGENTS.md.agentos.bak'), 'utf8');

  await doctorAgentOS({ cwd: root, fix: true });
  await doctorAgentOS({ cwd: root, fix: true });

  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), afterInit, 'repeated doctor --fix must not change an already-canonical adapter');
  assert.equal(await readFile(join(root, 'AGENTS.md.agentos.bak'), 'utf8'), backupAfterInit, 'backup must not be overwritten by later repairs');
});

// --- custom content before AND after a managed block --------------------

test('doctor --fix updates only the bytes inside an existing managed block, preserving custom text before and after it', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });

  const before = '# Team Notes\n\nDo not delete this paragraph.\n\n';
  const after = '\n\n## Team addendum\n\nAlways run tests before pushing.\n';
  const stale = `${before}${MANAGED_START}\nstale generated content that no longer matches\n${MANAGED_END}${after}`;
  await writeFile(join(root, 'AGENTS.md'), stale);

  await doctorAgentOS({ cwd: root, fix: true });

  const content = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.ok(content.startsWith(before), 'custom text before the managed block must be untouched');
  assert.ok(content.endsWith(after), 'custom text after the managed block must be untouched');
  assert.equal(markerCount(content, MANAGED_START), 1);
  assert.equal(markerCount(content, MANAGED_END), 1);
  assert.doesNotMatch(content, /stale generated content/);
  assert.match(content, /AgentOS for Projects bootloader/);
  assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), false, 'a file that already has a valid managed block was never converted, so it needs no backup');
});

// --- CRLF ------------------------------------------------------------

test('doctor --fix preserves CRLF line endings for both untouched and updated bytes', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });

  const prefix = '# Team Notes\r\n\r\nWindows-authored notes.\r\n\r\n';
  const stale = `${prefix}${MANAGED_START}\r\nstale content\r\n${MANAGED_END}\r\n`;
  await writeFile(join(root, 'AGENTS.md'), stale);

  await doctorAgentOS({ cwd: root, fix: true });

  const content = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.ok(content.startsWith(prefix), 'CRLF custom prefix must be preserved exactly');
  assert.doesNotMatch(content, /stale content/);
  // No bare LF anywhere: every \n in a CRLF-styled file must be preceded by \r.
  assert.doesNotMatch(content.replace(/\r\n/g, ''), /\n/, 'updated block must use CRLF to match the file\'s existing newline style');
});

test('a genuinely custom CRLF file gets an appended managed block that also uses CRLF', async () => {
  const root = await tempProject();
  const original = '# Rules\r\n\r\nKeep these Windows line endings.\r\n';
  await writeFile(join(root, 'CLAUDE.md'), original);

  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });

  const content = await readFile(join(root, 'CLAUDE.md'), 'utf8');
  assert.ok(content.startsWith(original));
  assert.doesNotMatch(content.slice(original.length).replace(/\r\n/g, ''), /\n/, 'appended block must use CRLF too');
});

// --- corrupted marker shapes ---------------------------------------------

const CORRUPTED_CASES = [
  ['missing end marker', (body) => `${MANAGED_START}\n${body}\n`],
  ['missing start marker', (body) => `${body}\n${MANAGED_END}\n`],
  ['reversed markers', (body) => `${MANAGED_END}\n${body}\n${MANAGED_START}\n`],
  ['duplicate start markers', (body) => `${MANAGED_START}\n${MANAGED_START}\n${body}\n${MANAGED_END}\n`],
  ['duplicate end markers', (body) => `${MANAGED_START}\n${body}\n${MANAGED_END}\n${MANAGED_END}\n`],
  ['nested marker pairs', (body) => `${MANAGED_START}\n${body}\n${MANAGED_START}\n${body}\n${MANAGED_END}\n${MANAGED_END}\n`],
];

for (const [label, build] of CORRUPTED_CASES) {
  test(`doctor reports and doctor --fix refuses a file with ${label}`, async () => {
    const root = await tempProject();
    await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
    const corrupted = build('AgentOS for Projects bootloader.\nWorkspace: single-repo');
    await writeFile(join(root, 'AGENTS.md'), corrupted);

    const report = await doctorAgentOS({ cwd: root });
    assert.equal(report.ok, false);
    assert.match(report.text, /AGENTS\.md.*ambiguous/i);

    const fixed = await doctorAgentOS({ cwd: root, fix: true });
    assert.equal(fixed.ok, false);
    assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), corrupted, `${label}: doctor --fix must leave an ambiguous file byte-identical`);
    assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), false, `${label}: an ambiguous file must not be backed up or converted`);
  });
}

// --- phrase-only ambiguous files ------------------------------------------

test('a file that merely mentions AgentOS without a recognized shape is reported as ambiguous, not silently replaced', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const ambiguous = '# My Project Notes\n\nWe should evaluate AgentOS for Projects tooling next quarter.\n\n## Other stuff\n\nUnrelated notes here.\n';
  await writeFile(join(root, 'CLAUDE.md'), ambiguous);

  const report = await doctorAgentOS({ cwd: root });
  assert.equal(report.ok, false);
  assert.match(report.text, /CLAUDE\.md.*ambiguous/i);

  const fixed = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(fixed.ok, false);
  assert.equal(await readFile(join(root, 'CLAUDE.md'), 'utf8'), ambiguous, 'phrase-only ambiguous content must be left completely untouched');
  assert.equal(await exists(join(root, 'CLAUDE.md.agentos.bak')), false);
});

// --- legacy migration: whole-file exact shape -----------------------------

test('a whole-file legacy AgentOS-generated shape migrates to a managed block with a single one-time backup', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const legacy = '# AGENTS.md\n\nAgentOS for Projects bootloader.\n\nWorkspace: single-repo\nRepos: none\n\nRead first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`.\n';
  await writeFile(join(root, 'AGENTS.md'), legacy);

  await doctorAgentOS({ cwd: root, fix: true });

  const content = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.equal(markerCount(content, MANAGED_START), 1);
  assert.equal(markerCount(content, MANAGED_END), 1);
  assert.match(content, /AgentOS for Projects bootloader/);
  const backupPath = join(root, 'AGENTS.md.agentos.bak');
  assert.equal(await exists(backupPath), true);
  assert.equal(await readFile(backupPath, 'utf8'), legacy);

  await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), content, 'second fix must not change the migrated file further');
  assert.equal(await readFile(backupPath, 'utf8'), legacy, 'second fix must not overwrite the one-time backup');
});

// --- legacy migration: bounded `---` separator convention -----------------

test('a legacy file using the old custom-prefix "---" separator convention migrates while preserving the custom prefix', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const prefix = '# My Team Rules\n\nAlways write tests first.';
  const legacySection = '# CLAUDE.md\n\nAgentOS for Projects. Read `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, `.agentos/skills.md`, relevant `.agentos/repos/*`, `.agentos/agents/*`, and `.agentos/engines/claude-code.md` before acting.\n';
  const legacyBounded = `${prefix}\n\n---\n\n${legacySection}`;
  await writeFile(join(root, 'CLAUDE.md'), legacyBounded);

  await doctorAgentOS({ cwd: root, fix: true });

  const content = await readFile(join(root, 'CLAUDE.md'), 'utf8');
  assert.ok(content.includes(prefix), 'custom prefix text must survive migration');
  assert.equal(markerCount(content, MANAGED_START), 1);
  assert.equal(markerCount(content, MANAGED_END), 1);
  assert.match(content, /AgentOS for Projects\./);
  assert.equal(await exists(join(root, 'CLAUDE.md.agentos.bak')), true);
  assert.equal(await readFile(join(root, 'CLAUDE.md.agentos.bak'), 'utf8'), legacyBounded);
});

// --- child repo paths -------------------------------------------------

test('child repo adapter files get the same managed-block conflict-safety as root files', async () => {
  const root = await tempProject();
  await mkdirp(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { vite: '^5.0.0' } }, null, 2));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });

  const legacyChildAgents = '# AGENTS.md\n\nAgentOS child repo: frontend (./frontend).\nParent context: `../AGENTS.md`, `../.agentos/project.yaml`, `../.agentos/repos/frontend.md`.\n';
  await writeFile(join(root, 'frontend/AGENTS.md'), legacyChildAgents);

  await doctorAgentOS({ cwd: root, fix: true });

  const content = await readFile(join(root, 'frontend/AGENTS.md'), 'utf8');
  assert.equal(markerCount(content, MANAGED_START), 1);
  assert.equal(markerCount(content, MANAGED_END), 1);
  assert.equal(await exists(join(root, 'frontend/AGENTS.md.agentos.bak')), true);
  assert.equal(await readFile(join(root, 'frontend/AGENTS.md.agentos.bak'), 'utf8'), legacyChildAgents);
});

// --- command-wide zero-side-effect preflight ------------------------------

test('doctor --fix makes zero changes anywhere when a child adapter is ambiguous, even though root adapters need real fixes', async () => {
  const root = await tempProject();
  await mkdirp(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { vite: '^5.0.0' } }, null, 2));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });

  const legacyAgents = '# AGENTS.md\n\nAgentOS for Projects bootloader.\n\nWorkspace: single-repo\nRepos: none\n\nRead first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`.\n';
  await writeFile(join(root, 'AGENTS.md'), legacyAgents);

  const corruptedChildClaude = `${MANAGED_START}\nAgentOS child repo: frontend.\n`; // missing end marker
  await writeFile(join(root, 'frontend/CLAUDE.md'), corruptedChildClaude);

  const projectPath = join(root, '.agentos/project.yaml');
  const skillsPath = join(root, '.agentos/skills.md');
  const beforeProject = await readFile(projectPath, 'utf8');
  const beforeSkills = await readFile(skillsPath, 'utf8');

  const result = await doctorAgentOS({ cwd: root, fix: true });

  assert.equal(result.ok, false);
  assert.match(result.text, /frontend\/CLAUDE\.md.*ambiguous/i);

  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), legacyAgents, 'root AGENTS.md must not be migrated when any other adapter in the command is ambiguous');
  assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), false);
  assert.equal(await readFile(join(root, 'frontend/CLAUDE.md'), 'utf8'), corruptedChildClaude, 'the ambiguous file itself must remain untouched');
  assert.equal(await readFile(projectPath, 'utf8'), beforeProject, 'project.yaml must not be touched when the command aborts during preflight');
  assert.equal(await readFile(skillsPath, 'utf8'), beforeSkills, 'skills.md must not be touched when the command aborts during preflight');
});

test('doctor reports every ambiguous adapter file in one run, not just the first one found', async () => {
  const root = await tempProject();
  await mkdirp(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { vite: '^5.0.0' } }, null, 2));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });

  await writeFile(join(root, 'AGENTS.md'), `${MANAGED_START}\n${MANAGED_START}\nbody\n${MANAGED_END}\n`);
  await writeFile(join(root, 'frontend/CLAUDE.md'), `${MANAGED_START}\nbody without an end marker\n`);

  const report = await doctorAgentOS({ cwd: root });
  assert.equal(report.ok, false);
  assert.match(report.text, /AGENTS\.md.*ambiguous/i);
  assert.match(report.text, /frontend\/CLAUDE\.md.*ambiguous/i);
});

test('doctor --json reports precise path-specific adapter conflicts', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  await writeFile(join(root, 'CLAUDE.md'), `${MANAGED_END}\n${MANAGED_START}\nbody\n`);

  const result = await doctorAgentOS({ cwd: root, json: true });
  assert.equal(result.ok, false);
  const parsed = JSON.parse(result.text);
  assert.ok(parsed.problems.some((p) => p.includes('CLAUDE.md') && /ambiguous/i.test(p)), `expected a precise CLAUDE.md conflict problem, got: ${JSON.stringify(parsed.problems)}`);
});

// --- rollback after a later failure ---------------------------------------

test('doctor --fix rolls back an already-converted adapter and its backup when a later adapter write fails', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const agentsPath = join(root, 'AGENTS.md');
  const claudePath = join(root, 'CLAUDE.md');
  const legacyAgents = '# AGENTS.md\n\nAgentOS for Projects bootloader.\n\nWorkspace: single-repo\nRepos: none\n\nRead first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`.\n';
  const legacyClaude = '# CLAUDE.md\n\nAgentOS for Projects. Read `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, `.agentos/skills.md`, relevant `.agentos/repos/*`, `.agentos/agents/*`, and `.agentos/engines/claude-code.md` before acting.\n';
  await writeFile(agentsPath, legacyAgents);
  await writeFile(claudePath, legacyClaude);

  __setAtomicWriteFaultForTests(claudePath, 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);

  await assert.rejects(() => doctorAgentOS({ cwd: root, fix: true }), /Injected atomic-write test fault/);

  assert.equal(await readFile(agentsPath, 'utf8'), legacyAgents, 'AGENTS.md must roll back to its pre-transaction legacy bytes');
  assert.equal(await exists(`${agentsPath}.agentos.bak`), false, 'AGENTS.md backup must be rolled back (removed) too');
  assert.equal(await readFile(claudePath, 'utf8'), legacyClaude, 'CLAUDE.md must be unchanged (it was the failing write)');
  assert.equal(await exists(`${claudePath}.agentos.bak`), false, 'CLAUDE.md backup must be rolled back (removed) too');

  assert.deepEqual(await findAllTempArtifacts(root), [], 'no atomic-write temp artifacts should remain anywhere');
});

test('init rolls back its ENTIRE mutation set - scaffold, agent/engine/repo files, adapters, and backups - when a later adapter write fails', async (t) => {
  const root = await tempProject();
  const agentsPath = join(root, 'AGENTS.md');
  const claudePath = join(root, 'CLAUDE.md');
  const customAgents = '# Existing Agent Rules\n\nKeep this.\n';
  const customClaude = '# Existing Claude Rules\n\nKeep this too.\n';
  await writeFile(agentsPath, customAgents);
  await writeFile(claudePath, customClaude);

  const beforeSnapshot = await snapshotDir(root);

  __setAtomicWriteFaultForTests(claudePath, 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);

  await assert.rejects(() => initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' }), /Injected atomic-write test fault/);

  assert.equal(await readFile(agentsPath, 'utf8'), customAgents, 'AGENTS.md must roll back to its pre-transaction bytes');
  assert.equal(await exists(`${agentsPath}.agentos.bak`), false, 'AGENTS.md backup must be rolled back (removed) too');
  assert.equal(await readFile(claudePath, 'utf8'), customClaude, 'CLAUDE.md must be unchanged (it was the failing write)');
  assert.equal(await exists(`${claudePath}.agentos.bak`), false, 'CLAUDE.md backup must be rolled back (removed) too');
  assert.equal(await exists(join(root, '.agentos')), false, 'the entire .agentos scaffold (project.yaml, agent/engine/repo files, everything) must be rolled back too, not just the adapter files');
  assert.deepEqual(await snapshotDir(root), beforeSnapshot, 'the whole workspace must be restored to its exact pre-init bytes');

  assert.deepEqual(await findAllTempArtifacts(root), [], 'no atomic-write temp artifacts should remain anywhere');
});

// === Follow-up review fixes ================================================

async function snapshotDir(root) {
  const result = {};
  async function walk(dir, rel) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(abs, relPath);
      else result[relPath] = (await readFile(abs)).toString('base64');
    }
  }
  await walk(root, '');
  return result;
}

// --- Finding 1: exclusive no-clobber backup creation (TOCTOU) -------------

test('writeFileExclusiveAtomic never lets two concurrent writers both believe they created the file, and leaves no temp artifacts', async () => {
  const root = await tempProject();
  const target = join(root, 'race-target.txt');

  const [a, b] = await Promise.all([
    __writeFileExclusiveAtomicForTests(target, 'AAAA-content'),
    __writeFileExclusiveAtomicForTests(target, 'BBBB-content'),
  ]);

  const createdCount = [a, b].filter((r) => r.created).length;
  assert.equal(createdCount, 1, 'exactly one concurrent writer must win the exclusive create; the other must observe it already exists');
  const finalContent = await readFile(target, 'utf8');
  assert.ok(finalContent === 'AAAA-content' || finalContent === 'BBBB-content', 'the file must hold exactly one writer\'s complete content, never a mix');

  const leftovers = (await readdir(root)).filter((name) => name.includes('.agentos-tmp-'));
  assert.deepEqual(leftovers, [], 'no temp artifacts from either concurrent writer should remain');
});

test('a pre-existing backup at the target path is never clobbered, even racing a fresh write', async () => {
  const root = await tempProject();
  const target = join(root, 'existing-backup.txt');
  await writeFile(target, 'SENTINEL: must survive');

  const result = await __writeFileExclusiveAtomicForTests(target, 'new content that must not land');

  assert.equal(result.created, false, 'the writer must recognize it lost the exclusive create');
  assert.equal(await readFile(target, 'utf8'), 'SENTINEL: must survive');
});

// --- Finding 2: init preflights every adapter before its first mutation ---

test('init preflights every root/child adapter before its first filesystem mutation: an ambiguous adapter leaves the whole workspace untouched', async () => {
  const root = await tempProject();
  await mkdirp(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { vite: '^5.0.0' } }, null, 2));
  await mkdirp(join(root, 'backend'));
  await writeFile(join(root, 'backend/package.json'), JSON.stringify({ scripts: { build: 'nest build' }, dependencies: { '@nestjs/core': '^10.0.0' } }, null, 2));
  // Ambiguous child CLAUDE.md: a standalone start marker with no matching end marker.
  await writeFile(join(root, 'frontend/CLAUDE.md'), `${MANAGED_START}\nsomething\n`);

  const before = await snapshotDir(root);

  await assert.rejects(() => initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' }), /ambiguous/i);

  assert.equal(await exists(join(root, '.agentos')), false, 'no .agentos directory/files should be created at all');
  assert.equal(await exists(join(root, 'AGENTS.md')), false, 'no root adapter file should be created');
  assert.equal(await exists(join(root, 'frontend/.gitignore')), false, 'no ambiguous-side child .gitignore should be created');
  assert.equal(await exists(join(root, 'backend/.gitignore')), false, 'no unrelated child .gitignore should be created either');
  assert.equal(await exists(join(root, 'backend/AGENTS.md')), false, 'no unrelated child adapter should be created either');
  assert.deepEqual(await snapshotDir(root), before, 'the whole workspace must be byte-for-byte unchanged when init aborts during adapter preflight');
});

// --- Finding 3: strict exact-shape legacy recognition ----------------------

test('one heading plus a known legacy phrase plus appended custom prose is a conflict, not a silent migration (whole-file shape)', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const withCustomTail = '# AGENTS.md\n\nAgentOS for Projects bootloader.\n\nWorkspace: single-repo\nRepos: none\n\nRead first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`.\n\nP.S. our team added this paragraph below the AgentOS section and it must never be discarded.\n';
  await writeFile(join(root, 'AGENTS.md'), withCustomTail);

  const report = await doctorAgentOS({ cwd: root });
  assert.equal(report.ok, false);
  assert.match(report.text, /AGENTS\.md.*ambiguous/i);

  const fixed = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(fixed.ok, false);
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), withCustomTail, 'appended custom prose after a legacy-looking section must never be discarded');
  assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), false, 'an ambiguous file must not be backed up or converted');
});

test('one heading plus a known legacy phrase plus appended custom prose is a conflict after the old "---" separator too', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const prefix = '# My Team Rules\n\nAlways write tests first.';
  const legacyWithTail = '# CLAUDE.md\n\nAgentOS for Projects. Read `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, `.agentos/skills.md`, relevant `.agentos/repos/*`, `.agentos/agents/*`, and `.agentos/engines/claude-code.md` before acting.\n\nP.S. do not remove this note about our on-call rotation.\n';
  const content = `${prefix}\n\n---\n\n${legacyWithTail}`;
  await writeFile(join(root, 'CLAUDE.md'), content);

  const fixed = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(fixed.ok, false);
  assert.equal(await readFile(join(root, 'CLAUDE.md'), 'utf8'), content, 'the entire file, prefix and appended tail alike, must survive untouched when the suffix is not an exact legacy shape');
  assert.equal(await exists(join(root, 'CLAUDE.md.agentos.bak')), false);
});

// --- Finding 4: markers only count as exact standalone lines --------------

test('marker text embedded inline in a custom line is ambiguous, not a real marker', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const content = `# Notes\n\nOur managed block marker is literally the text ${MANAGED_START} inline in this sentence, and ${MANAGED_END} too.\n`;
  await writeFile(join(root, 'CLAUDE.md'), content);

  const report = await doctorAgentOS({ cwd: root });
  assert.equal(report.ok, false);
  assert.match(report.text, /CLAUDE\.md.*ambiguous/i);

  const fixed = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(fixed.ok, false);
  assert.equal(await readFile(join(root, 'CLAUDE.md'), 'utf8'), content, 'marker text embedded in prose must never be treated as a real owned block');
});

test('marker text inside a fenced code example is ambiguous, not a real owned block', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const content = [
    '# Docs',
    '',
    'Here is what our managed block format looks like:',
    '',
    '```',
    MANAGED_START,
    'example body',
    MANAGED_END,
    '```',
    '',
  ].join('\n');
  await writeFile(join(root, 'CLAUDE.md'), content);

  const report = await doctorAgentOS({ cwd: root });
  assert.equal(report.ok, false);
  assert.match(report.text, /CLAUDE\.md.*ambiguous/i);

  const fixed = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(fixed.ok, false);
  assert.equal(await readFile(join(root, 'CLAUDE.md'), 'utf8'), content, 'a fenced documentation example of the marker format must never be treated as a real owned block');
});

// --- Finding 5: hybrid root+child repo detection ---------------------------

test('a hybrid workspace where the root itself has a package.json keeps root adapters as bootloaders and only gives non-root repos child pointers', async () => {
  const root = await tempProject();
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'monorepo-root', private: true, workspaces: ['frontend'] }, null, 2));
  await mkdirp(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { vite: '^5.0.0' } }, null, 2));

  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });

  const rootAgents = await readFile(join(root, 'AGENTS.md'), 'utf8');
  const rootClaude = await readFile(join(root, 'CLAUDE.md'), 'utf8');
  assert.match(rootAgents, /AgentOS for Projects bootloader/, 'root AGENTS.md must stay the bootloader');
  assert.doesNotMatch(rootAgents, /AgentOS child repo:/, 'root AGENTS.md must never become a child pointer');
  assert.doesNotMatch(rootClaude, /AgentOS child repo:/, 'root CLAUDE.md must never become a child pointer');

  const childAgents = await readFile(join(root, 'frontend/AGENTS.md'), 'utf8');
  assert.match(childAgents, /AgentOS child repo:/, 'the non-root repo must get a real child pointer');

  // Re-running init and doctor --fix must not oscillate the root adapters into child-pointer content.
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  const afterSecondInit = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.match(afterSecondInit, /AgentOS for Projects bootloader/);
  assert.doesNotMatch(afterSecondInit, /AgentOS child repo:/);

  await doctorAgentOS({ cwd: root, fix: true });
  const afterFix = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.match(afterFix, /AgentOS for Projects bootloader/);
  assert.doesNotMatch(afterFix, /AgentOS child repo:/);
});

// --- Finding 6: doctor reports a stale managed block directly -------------

test('doctor reports a stale managed block even when surrounding custom text independently satisfies the legacy health checks', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });

  const noise = '# Team notes\n\nAgentOS for Projects has been great. See .agentos/project.yaml and .agentos/handoff.md. Please declare your role before editing anything.\n\n';
  const staleInner = 'This is an intentionally stale managed section that no longer matches the canonical bootloader text.';
  const content = `${noise}${MANAGED_START}\n${staleInner}\n${MANAGED_END}\n`;
  await writeFile(join(root, 'AGENTS.md'), content);

  const report = await doctorAgentOS({ cwd: root });
  assert.equal(report.ok, false, 'a stale managed block must fail doctor even though the surrounding prose satisfies every legacy substring check');
  assert.match(report.text, /AGENTS\.md.*(stale|update)/i);

  await doctorAgentOS({ cwd: root, fix: true });
  const fixedContent = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.ok(fixedContent.startsWith(noise), 'the surrounding custom text must still be preserved');
  assert.doesNotMatch(fixedContent, /intentionally stale/);
  assert.match(fixedContent, /AgentOS for Projects bootloader/);
});

// --- Finding 7: immutable preflight plans, no reread/reclassify at apply --

test('adapter plans are computed once and applied verbatim, without rereading/reclassifying the file at apply time', async () => {
  const root = await tempProject();
  const target = { path: join(root, 'AGENTS.md'), label: 'AGENTS.md', section: '# AGENTS.md\n\nSTABLE CANONICAL SECTION\n' };

  const plans = await __planAdapterFilesForTests([target]);

  // Simulate an intervening on-disk change that would classify completely
  // differently (an ambiguous corrupted-marker shape) if the apply step
  // reread and reclassified the file instead of trusting the precomputed plan.
  await writeFile(target.path, `${MANAGED_START}\n${MANAGED_START}\nnested\n${MANAGED_END}\n${MANAGED_END}\n`);

  await __applyAdapterPlansForTests(plans);

  const content = await readFile(target.path, 'utf8');
  assert.match(content, /STABLE CANONICAL SECTION/, 'apply must honor the precomputed plan, not reclassify the file that changed underneath it');
});

// === Third review round fixes ===============================================

// --- Finding 1: CommonMark-relevant fence parsing (char + run length) -----

test('marker lines inside a 4+ backtick fence remain ambiguous even when a shorter backtick run appears inside it', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const content = [
    '# Docs',
    '',
    'Example:',
    '',
    '````',
    '```',
    MANAGED_START,
    'example body',
    MANAGED_END,
    '```',
    '````',
    '',
  ].join('\n');
  await writeFile(join(root, 'CLAUDE.md'), content);

  const report = await doctorAgentOS({ cwd: root });
  assert.equal(report.ok, false);
  assert.match(report.text, /CLAUDE\.md.*ambiguous/i);

  const fixed = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(fixed.ok, false);
  assert.equal(await readFile(join(root, 'CLAUDE.md'), 'utf8'), content, 'a 4-backtick-fenced example containing a shorter backtick run must never become a live owned block');
});

test('a backtick run never closes a tilde-opened fence, so marker lines that follow stay inside the fence', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const content = [
    '# Docs',
    '',
    'Example:',
    '',
    '~~~~',
    '```',
    MANAGED_START,
    'example body',
    MANAGED_END,
    '```',
    '~~~~',
    '',
  ].join('\n');
  await writeFile(join(root, 'CLAUDE.md'), content);

  const report = await doctorAgentOS({ cwd: root });
  assert.equal(report.ok, false);
  assert.match(report.text, /CLAUDE\.md.*ambiguous/i);

  const fixed = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(fixed.ok, false);
  assert.equal(await readFile(join(root, 'CLAUDE.md'), 'utf8'), content, 'a mismatched-character-type run must never close a fence opened by a different delimiter character');
});

// --- Finding 2: duplicate/equivalent repo paths ----------------------------

function insertRepoEntryLines(projectYamlText, entryLines) {
  const lines = projectYamlText.split('\n');
  const reposIdx = lines.findIndex((l) => l === 'repos:');
  let insertIdx = lines.length;
  for (let i = reposIdx + 1; i < lines.length; i++) {
    if (lines[i] && !lines[i].startsWith(' ')) { insertIdx = i; break; }
  }
  lines.splice(insertIdx, 0, ...entryLines);
  return lines.join('\n');
}

test('doctor and doctor --fix report duplicate/equivalent repo paths as a precise conflict before any mutation', async () => {
  const root = await tempProject();
  await mkdirp(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { vite: '^5.0.0' } }, null, 2));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });

  const projectPath = join(root, '.agentos/project.yaml');
  const original = await readFile(projectPath, 'utf8');
  const patched = insertRepoEntryLines(original, [
    '  fe:',
    '    path: ./frontend',
    '    type: frontend',
    '    framework: unknown',
    '    package_manager: npm',
  ]);
  await writeFile(projectPath, patched);

  const beforeSnapshot = await snapshotDir(root);

  const report = await doctorAgentOS({ cwd: root });
  assert.equal(report.ok, false);
  assert.match(report.text, /frontend.*(duplicate|same adapter file)/i);

  const jsonReport = await doctorAgentOS({ cwd: root, json: true });
  const parsed = JSON.parse(jsonReport.text);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.problems.some((p) => /duplicate|same adapter file/i.test(p)), `expected a duplicate-path problem, got: ${JSON.stringify(parsed.problems)}`);

  const fixed = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(fixed.ok, false);
  assert.deepEqual(await snapshotDir(root), beforeSnapshot, 'doctor --fix must make zero changes anywhere when repo entries collide on the same adapter path');
});

// --- Finding 4: malformed project.yaml must not drive adapter diagnostics -

test('doctor does not derive misleading stale-adapter diagnostics from an untrusted malformed project.yaml', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const agentsBefore = await readFile(join(root, 'AGENTS.md'), 'utf8');

  const projectPath = join(root, '.agentos/project.yaml');
  await writeFile(projectPath, 'name: agentos\nrepos: [1, 2\n  bad: true\n');

  const report = await doctorAgentOS({ cwd: root });
  assert.equal(report.ok, false);
  assert.match(report.text, /project\.yaml.*(malformed|not valid YAML)/i);
  assert.doesNotMatch(report.text, /AGENTS\.md.*(stale|managed block)/i, 'must not derive a misleading stale-adapter diagnostic from an untrusted config');
  assert.doesNotMatch(report.text, /CLAUDE\.md.*(stale|managed block)/i);
  assert.doesNotMatch(report.text, /run `agentos doctor --fix`/i, 'must not suggest doctor --fix based on a comparison derived from an untrusted config');

  const jsonReport = await doctorAgentOS({ cwd: root, json: true });
  const parsed = JSON.parse(jsonReport.text);
  assert.equal(parsed.ok, false);
  assert.ok(!parsed.problems.some((p) => /stale|managed block/i.test(p)), `expected no stale-adapter problems, got: ${JSON.stringify(parsed.problems)}`);

  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), agentsBefore, 'doctor (read-only) must never modify AGENTS.md regardless');
});

// --- Finding 5: close backup source reread TOCTOU --------------------------

test('applying a plan whose source file changed after planning fails closed instead of writing a stale backup or content', async () => {
  const root = await tempProject();
  const target = { path: join(root, 'AGENTS.md'), label: 'AGENTS.md', section: '# AGENTS.md\n\nSTABLE CANONICAL SECTION\n' };
  const original = '# Existing Agent Rules\n\nKeep this original text.\n';
  await writeFile(target.path, original);

  const plans = await __planAdapterFilesForTests([target]);

  const drifted = '# Existing Agent Rules\n\nSomeone changed this after planning, before applying.\n';
  await writeFile(target.path, drifted);

  await assert.rejects(() => __applyAdapterPlansForTests(plans), /changed on disk|stale plan/i);

  assert.equal(await readFile(target.path, 'utf8'), drifted, 'the drifted file must be left exactly as found, not overwritten based on a stale plan');
  assert.equal(await exists(`${target.path}.agentos.bak`), false, 'no backup should be created from a plan whose source has gone stale');
});

// === Fourth review round fixes =============================================

for (const apparentClose of ['```not-a-close', '``` trailing-text']) {
  test(`a CommonMark fence is not closed by a delimiter with trailing text: ${apparentClose}`, async () => {
    const root = await tempProject();
    await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
    const content = ['# Docs', '', '```', apparentClose, MANAGED_START, 'example', MANAGED_END, '```', ''].join('\n');
    await writeFile(join(root, 'CLAUDE.md'), content);
    const report = await doctorAgentOS({ cwd: root });
    assert.equal(report.ok, false);
    assert.match(report.text, /CLAUDE\.md.*ambiguous/i);
    await doctorAgentOS({ cwd: root, fix: true });
    assert.equal(await readFile(join(root, 'CLAUDE.md'), 'utf8'), content);
  });
}

test('an adapter that existed empty at plan time cannot overwrite content added before apply', async () => {
  const root = await tempProject();
  const path = join(root, 'AGENTS.md');
  await writeFile(path, Buffer.alloc(0));
  const plans = await __planAdapterFilesForTests([{ path, label: 'AGENTS.md', section: '# AGENTS.md\n\nCANONICAL\n' }]);
  await writeFile(path, '# human content added after planning\n');
  await assert.rejects(() => __applyAdapterPlansForTests(plans), /changed on disk|stale plan/i);
  assert.equal(await readFile(path, 'utf8'), '# human content added after planning\n');
  assert.equal(await exists(`${path}.agentos.bak`), false);
});

test('invalid UTF-8 in root and child adapters fails closed without rewriting bytes', async () => {
  const root = await tempProject();
  await mkdirp(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ dependencies: { vite: '^5.0.0' } }));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  for (const rel of ['AGENTS.md', 'frontend/CLAUDE.md']) {
    const bytes = Buffer.from([0x23, 0x20, 0x78, 0x0a, 0xff, 0xfe, 0x0a]);
    await writeFile(join(root, rel), bytes);
    const report = await doctorAgentOS({ cwd: root });
    assert.equal(report.ok, false);
    assert.match(report.text, /UTF-8/i);
    await doctorAgentOS({ cwd: root, fix: true });
    assert.deepEqual(await readFile(join(root, rel)), bytes);
  }
});

function historicalAdapters(includeSkills) {
  const skills = includeSkills ? ', `.agentos/skills.md`' : '';
  const parentSkills = includeSkills ? ', `../.agentos/skills.md`' : '';
  return [
    ['AGENTS.md', [
      '# AGENTS.md', '', 'AgentOS for Projects bootloader.', '', 'Workspace: multi-repo',
      'Repos: frontend=frontend (frontend/vite/npm)', '',
      `Read first: \`.agentos/project.yaml\`, \`.agentos/memory.md\`, \`.agentos/handoff.md\`, \`.agentos/tasks.md\`, \`.agentos/knowledge.md\`${skills}, relevant \`.agentos/repos/*\`, \`.agentos/agents/*\`, \`.agentos/engines/*\`.`, '',
      'Rules: declare role + repo scope before editing; edit only in scope; never touch secrets/.env/migrations/prod config without approval; do not commit/push unless explicitly asked; verify; update handoff/tasks before stopping.', '',
    ].join('\n')],
    ['CLAUDE.md', [
      '# CLAUDE.md', '',
      `AgentOS for Projects. Read \`AGENTS.md\`, \`.agentos/project.yaml\`, \`.agentos/memory.md\`, \`.agentos/handoff.md\`, \`.agentos/tasks.md\`, \`.agentos/knowledge.md\`${skills}, relevant \`.agentos/repos/*\`, \`.agentos/agents/*\`, and \`.agentos/engines/claude-code.md\` before acting.`, '',
      'Rules: declare role + repo scope before editing; edit only in scope; backend only if in scope; no secrets/.env/migrations/prod config without approval; no commit/push unless explicitly asked; verify; update handoff/tasks before stopping.', '',
      'If launched from a child repo, follow pointer files back to the parent AgentOS root.', '',
    ].join('\n')],
    ['.hermes.md', [
      '# Hermes Agent Adapter', '',
      `AgentOS for Projects. Read \`AGENTS.md\`, \`.agentos/project.yaml\`, \`.agentos/memory.md\`, \`.agentos/handoff.md\`, \`.agentos/tasks.md\`, \`.agentos/knowledge.md\`${skills}, relevant \`.agentos/repos/*\` and \`.agentos/agents/*\` before work.`,
      'Hermes rules: load relevant skills; verify real file/git/terminal/browser state; do not trust subagent reports without checking; update handoff/tasks when state changes.', '',
    ].join('\n')],
    ['frontend/AGENTS.md', [
      '# AGENTS.md', '', 'AgentOS child repo: frontend (frontend).',
      `Parent context: \`../AGENTS.md\`, \`../.agentos/project.yaml\`, \`../.agentos/memory.md\`, \`../.agentos/handoff.md\`, \`../.agentos/tasks.md\`, \`../.agentos/knowledge.md\`${parentSkills}, relevant \`../.agentos/agents/*\`, \`../.agentos/engines/*\`, and \`../.agentos/repos/frontend.md\`.`,
      'Rules: do not treat this repo as the whole product; declare scope; edit only in scope; no commit/push unless asked; update parent handoff/tasks.', '',
    ].join('\n')],
    ['frontend/CLAUDE.md', [
      '# CLAUDE.md', '', 'AgentOS child repo: frontend (frontend).',
      `Before acting read \`../CLAUDE.md\`, \`../AGENTS.md\`, \`../.agentos/project.yaml\`, \`../.agentos/handoff.md\`, \`../.agentos/tasks.md\`, \`../.agentos/knowledge.md\`${parentSkills}, relevant \`../.agentos/agents/*\`, and \`../.agentos/repos/frontend.md\`.`,
      'Declare scope; edit only in scope; no commit/push unless asked; update parent handoff/tasks.', '',
    ].join('\n')],
  ];
}

function historicalInitialAdapters() {
  return [
    ['AGENTS.md', ['# AGENTS.md', '', 'AgentOS for Projects bootloader.', '', 'Workspace: multi-repo', 'Repos: frontend=frontend (frontend/vite/npm)', '', 'Read first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, relevant `.agentos/repos/*`, `.agentos/agents/*`, `.agentos/engines/*`.', '', 'Rules: declare role + repo scope before editing; edit only in scope; never touch secrets/.env/migrations/prod config without approval; do not commit/push unless explicitly asked; verify; update handoff/tasks before stopping.', ''].join('\n')],
    ['CLAUDE.md', ['# CLAUDE.md', '', 'AgentOS for Projects. Read `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, relevant `.agentos/repos/*`, `.agentos/agents/*`, and `.agentos/engines/claude-code.md` before acting.', '', 'Rules: declare role + repo scope before editing; edit only in scope; backend only if in scope; no secrets/.env/migrations/prod config without approval; no commit/push unless explicitly asked; verify; update handoff/tasks before stopping.', '', 'If launched from a child repo, follow pointer files back to the parent AgentOS root.', ''].join('\n')],
    ['.hermes.md', ['# Hermes Agent Adapter', '', 'AgentOS for Projects. Read `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, relevant `.agentos/repos/*` and `.agentos/agents/*` before work.', 'Hermes rules: load relevant skills; verify real file/git/terminal/browser state; do not trust subagent reports without checking; update handoff/tasks when state changes.', ''].join('\n')],
    ['frontend/AGENTS.md', ['# AGENTS.md', '', 'AgentOS child repo: frontend (frontend).', 'Parent context: `../AGENTS.md`, `../.agentos/project.yaml`, `../.agentos/memory.md`, `../.agentos/handoff.md`, `../.agentos/tasks.md`, relevant `../.agentos/agents/*`, `../.agentos/engines/*`, and `../.agentos/repos/frontend.md`.', 'Rules: do not treat this repo as the whole product; declare scope; edit only in scope; no commit/push unless asked; update parent handoff/tasks.', ''].join('\n')],
    ['frontend/CLAUDE.md', ['# CLAUDE.md', '', 'AgentOS child repo: frontend (frontend).', 'Before acting read `../CLAUDE.md`, `../AGENTS.md`, `../.agentos/project.yaml`, `../.agentos/handoff.md`, `../.agentos/tasks.md`, relevant `../.agentos/agents/*`, and `../.agentos/repos/frontend.md`.', 'Declare scope; edit only in scope; no commit/push unless asked; update parent handoff/tasks.', ''].join('\n')],
  ];
}

function historicalOnDemandChildAdapters() {
  return [
    ['frontend/AGENTS.md', ['# AGENTS.md', '', 'AgentOS child repo: frontend (frontend).', 'Parent context: `../AGENTS.md`, `../.agentos/project.yaml`, `../.agentos/memory.md`, `../.agentos/handoff.md`, `../.agentos/tasks.md`, `../.agentos/repos/frontend.md`; then load skills/agent/engine files only when relevant.', 'Rules: do not treat this repo as the whole product; declare scope; edit only in scope; no commit/push unless asked; update parent handoff/tasks.', ''].join('\n')],
    ['frontend/CLAUDE.md', ['# CLAUDE.md', '', 'AgentOS child repo: frontend (frontend).', 'Before acting read `../CLAUDE.md`, `../AGENTS.md`, `../.agentos/project.yaml`, `../.agentos/handoff.md`, `../.agentos/tasks.md`, `../.agentos/repos/frontend.md`; then load skills/agent files only when relevant.', 'Declare scope; edit only in scope; no commit/push unless asked; update parent handoff/tasks.', ''].join('\n')],
  ];
}

test('all grounded full pre-marker adapters from repository history migrate exactly', async () => {
  const fixtures = [...historicalInitialAdapters(), ...historicalAdapters(true), ...historicalAdapters(false), ...historicalOnDemandChildAdapters()];
  for (const [rel, historical] of fixtures) {
    const root = await tempProject();
    await mkdirp(join(root, 'frontend'));
    await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ dependencies: { vite: '^5.0.0' } }));
    await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
    const prefix = '# Team-specific instructions\n\nPreserve these bytes exactly.';
    const combined = `${prefix}\n\n---\n\n${historical}`;
    await writeFile(join(root, rel), combined);
    const result = await doctorAgentOS({ cwd: root, fix: true });
    assert.equal(result.ok, true, `${rel} historical format should migrate`);
    assert.equal(await readFile(`${join(root, rel)}.agentos.bak`, 'utf8'), combined);
    const migrated = await readFile(join(root, rel), 'utf8');
    assert.ok(migrated.startsWith(prefix), `${rel} custom prefix should remain byte-identical`);
    assert.equal(markerCount(migrated, MANAGED_START), 1);
  }
});
