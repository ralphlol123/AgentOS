import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  initAgentOS,
  compactAgentOS,
  runHandoffAgentOS,
  agentsAgentOS,
  templatesAgentOS,
  skillsAgentOS,
  linkObsidianAgentOS,
  obsidianAgentOS,
  doctorAgentOS,
  __setAtomicWriteFaultForTests,
  __clearAtomicWriteFaultForTests,
} from '../dist/core.js';
import { mkdir, rm } from 'node:fs/promises';

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

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function tempProject() {
  return mkdtemp(join(tmpdir(), 'agentos-rollback-'));
}

async function findArchiveFiles(root) {
  const runsDir = join(root, '.agentos/runs');
  if (!await exists(runsDir)) return [];
  return (await readdir(runsDir)).filter((name) => name.startsWith('compact-archive-'));
}

test('compact rolls back handoff/tasks rewrite and archive creation when the last write fails', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const handoffPath = join(root, '.agentos/handoff.md');
  const tasksPath = join(root, '.agentos/tasks.md');
  const beforeHandoff = await readFile(handoffPath, 'utf8');
  const beforeTasks = await readFile(tasksPath, 'utf8');
  const archivesBefore = await findArchiveFiles(root);

  __setAtomicWriteFaultForTests(tasksPath, 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);

  await assert.rejects(() => compactAgentOS({ cwd: root }), /Injected atomic-write test fault/);

  assert.equal(await readFile(handoffPath, 'utf8'), beforeHandoff, 'handoff.md must be restored to its pre-compact bytes');
  assert.equal(await readFile(tasksPath, 'utf8'), beforeTasks, 'tasks.md must be unchanged (it was the failing write)');
  assert.deepEqual(await findArchiveFiles(root), archivesBefore, 'no archive file should be left behind when compact fails');

  const leftoverTmp = (await readdir(join(root, '.agentos'))).filter((name) => name.includes('.agentos-tmp-'));
  assert.deepEqual(leftoverTmp, [], 'no atomic-write temp artifacts should remain in .agentos/');
});

test('agents add rolls back project.yaml patch and the new agent file when the project.yaml write fails', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const projectPath = join(root, '.agentos/project.yaml');
  const agentPath = join(root, '.agentos/agents/planner.md');
  const beforeProject = await readFile(projectPath, 'utf8');
  assert.equal(await exists(agentPath), false, 'precondition: planner agent must not exist yet');

  __setAtomicWriteFaultForTests(projectPath, 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);

  await assert.rejects(() => agentsAgentOS({ cwd: root, add: 'planner' }), /Injected atomic-write test fault/);

  assert.equal(await readFile(projectPath, 'utf8'), beforeProject, 'project.yaml must be unchanged (it was the failing write)');
  assert.equal(await exists(agentPath), false, 'the new agent file must not be left behind when project.yaml fails to update');

  const leftoverTmp = (await readdir(join(root, '.agentos'))).filter((name) => name.includes('.agentos-tmp-'));
  assert.deepEqual(leftoverTmp, [], 'no atomic-write temp artifacts should remain in .agentos/');
});

test('skills add rolls back newly written skill files when the skills.md index write fails', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const skillsMdPath = join(root, '.agentos/skills.md');
  const skillPathA = join(root, '.agentos/skills/core/debugging/SKILL.md');
  const skillPathB = join(root, '.agentos/skills/core/test-driven-development/SKILL.md');
  const beforeSkillsMd = await readFile(skillsMdPath, 'utf8');
  assert.equal(await exists(skillPathA), false);
  assert.equal(await exists(skillPathB), false);

  __setAtomicWriteFaultForTests(skillsMdPath, 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);

  await assert.rejects(() => skillsAgentOS({ cwd: root, add: 'debugging,test-driven-development' }), /Injected atomic-write test fault/);

  assert.equal(await readFile(skillsMdPath, 'utf8'), beforeSkillsMd, 'skills.md must be unchanged (it was the failing write)');
  assert.equal(await exists(skillPathA), false, 'debugging skill file must not be left behind');
  assert.equal(await exists(skillPathB), false, 'test-driven-development skill file must not be left behind');
  assert.equal(await exists(join(root, '.agentos/skills/core/debugging')), false, 'the new skill directory must not be left behind either');

  const leftoverTmp = (await readdir(join(root, '.agentos'))).filter((name) => name.includes('.agentos-tmp-'));
  assert.deepEqual(leftoverTmp, [], 'no atomic-write temp artifacts should remain in .agentos/');
});

test('skills remove restores the removed skill directory when the skills.md index write fails', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  await skillsAgentOS({ cwd: root, add: 'debugging' });
  const skillsMdPath = join(root, '.agentos/skills.md');
  const skillPath = join(root, '.agentos/skills/core/debugging/SKILL.md');
  const skillDir = join(root, '.agentos/skills/core/debugging');
  const beforeSkillsMd = await readFile(skillsMdPath, 'utf8');
  const beforeSkillContent = await readFile(skillPath, 'utf8');

  __setAtomicWriteFaultForTests(skillsMdPath, 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);

  await assert.rejects(() => skillsAgentOS({ cwd: root, remove: 'debugging' }), /Injected atomic-write test fault/);

  assert.equal(await readFile(skillsMdPath, 'utf8'), beforeSkillsMd, 'skills.md must be unchanged (it was the failing write)');
  assert.equal(await exists(skillDir), true, 'the removed skill directory must be restored');
  assert.equal(await readFile(skillPath, 'utf8'), beforeSkillContent, 'the restored skill file must be byte-identical to the original');

  const leftoverTmp = (await readdir(join(root, '.agentos'))).filter((name) => name.includes('.agentos-tmp-'));
  assert.deepEqual(leftoverTmp, [], 'no atomic-write temp artifacts should remain in .agentos/');
});

test('doctor --fix rolls back project.yaml patches and leaves skills.md absent when the skills.md write fails', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const projectPath = join(root, '.agentos/project.yaml');
  const skillsMdPath = join(root, '.agentos/skills.md');
  const agentsMdPath = join(root, 'AGENTS.md');
  await rm(skillsMdPath, { force: true });
  const beforeProject = await readFile(projectPath, 'utf8');
  const beforeAgentsMd = await readFile(agentsMdPath, 'utf8');

  __setAtomicWriteFaultForTests(skillsMdPath, 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);

  await assert.rejects(() => doctorAgentOS({ cwd: root, fix: true }), /Injected atomic-write test fault/);

  assert.equal(await readFile(projectPath, 'utf8'), beforeProject, 'project.yaml must be restored to its pre-doctor bytes even though it was patched twice before the failing write');
  assert.equal(await exists(skillsMdPath), false, 'skills.md must remain absent (it was the failing write)');
  assert.equal(await readFile(agentsMdPath, 'utf8'), beforeAgentsMd, 'AGENTS.md must be untouched since fixAgentOSAdapters never reached it');

  assert.deepEqual(await findAllTempArtifacts(root), [], 'no atomic-write temp artifacts should remain anywhere in the workspace');
});

test('link-obsidian rolls back knowledge.md and note creation when the project.yaml patch write fails', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const vault = join(root, 'vault');
  await mkdir(vault, { recursive: true });
  const knowledgePath = join(root, '.agentos/knowledge.md');
  const projectPath = join(root, '.agentos/project.yaml');
  const beforeKnowledge = await readFile(knowledgePath, 'utf8');
  const beforeProject = await readFile(projectPath, 'utf8');

  __setAtomicWriteFaultForTests(projectPath, 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);

  await assert.rejects(
    () => linkObsidianAgentOS({ cwd: root, vault, dest: 'Projects/Demo', create: true }),
    /Injected atomic-write test fault/,
  );

  assert.equal(await readFile(knowledgePath, 'utf8'), beforeKnowledge, 'knowledge.md must be restored to its pre-command bytes');
  assert.equal(await readFile(projectPath, 'utf8'), beforeProject, 'project.yaml must be unchanged (it was the failing write)');
  assert.equal(await exists(join(vault, 'Projects')), false, 'no Obsidian note or folder should be created when the command fails');

  const leftoverTmp = (await readdir(join(root, '.agentos'))).filter((name) => name.includes('.agentos-tmp-'));
  assert.deepEqual(leftoverTmp, [], 'no atomic-write temp artifacts should remain in .agentos/');
});

test('obsidian link-workspace rolls back knowledge.md when the project.yaml patch write fails', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const vault = join(root, 'vault');
  await mkdir(vault, { recursive: true });
  const knowledgePath = join(root, '.agentos/knowledge.md');
  const projectPath = join(root, '.agentos/project.yaml');
  const beforeKnowledge = await readFile(knowledgePath, 'utf8');
  const beforeProject = await readFile(projectPath, 'utf8');

  __setAtomicWriteFaultForTests(projectPath, 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);

  await assert.rejects(
    () => obsidianAgentOS({ cwd: root, command: 'link-workspace', vault, dest: 'Projects/Demo', create: true }),
    /Injected atomic-write test fault/,
  );

  assert.equal(await readFile(knowledgePath, 'utf8'), beforeKnowledge, 'knowledge.md must be restored to its pre-command bytes');
  assert.equal(await readFile(projectPath, 'utf8'), beforeProject, 'project.yaml must be unchanged (it was the failing write)');
  assert.equal(await exists(join(vault, 'Projects')), false, 'the new workspace folder must not be left behind');

  const leftoverTmp = (await readdir(join(root, '.agentos'))).filter((name) => name.includes('.agentos-tmp-'));
  assert.deepEqual(leftoverTmp, [], 'no atomic-write temp artifacts should remain in .agentos/');
});

test('templates import (skill) rolls back the imported skill file when the skills.md index write fails', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const source = join(root, 'safe-skill.md');
  await writeFile(source, 'License: MIT\n# Safe Skill\n\n1. Inspect the diff.\n2. Run tests.\n');
  const skillsMdPath = join(root, '.agentos/skills.md');
  const targetPath = join(root, '.agentos/skills/imported/safe-skill/SKILL.md');
  const beforeSkillsMd = await readFile(skillsMdPath, 'utf8');

  __setAtomicWriteFaultForTests(skillsMdPath, 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);

  await assert.rejects(
    () => templatesAgentOS({ cwd: root, command: 'import', source, type: 'skill', name: 'safe-skill', yes: true }),
    /Injected atomic-write test fault/,
  );

  assert.equal(await readFile(skillsMdPath, 'utf8'), beforeSkillsMd, 'skills.md must be unchanged (it was the failing write)');
  assert.equal(await exists(targetPath), false, 'the imported skill file must not be left behind');
  assert.equal(await exists(join(root, '.agentos/skills/imported')), false, 'the new imported-skill directory must not be left behind either');

  const leftoverTmp = (await readdir(join(root, '.agentos'))).filter((name) => name.includes('.agentos-tmp-'));
  assert.deepEqual(leftoverTmp, [], 'no atomic-write temp artifacts should remain in .agentos/');
});

test('templates copy (agent) rolls back the copied agent file when the project.yaml registration write fails', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const projectPath = join(root, '.agentos/project.yaml');
  const agentPath = join(root, '.agentos/agents/security-reviewer.md');
  const beforeProject = await readFile(projectPath, 'utf8');
  assert.equal(await exists(agentPath), false, 'precondition: security-reviewer agent must not exist yet');

  __setAtomicWriteFaultForTests(projectPath, 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);

  await assert.rejects(() => templatesAgentOS({ cwd: root, command: 'copy', id: 'agent:security-reviewer' }), /Injected atomic-write test fault/);

  assert.equal(await readFile(projectPath, 'utf8'), beforeProject, 'project.yaml must be unchanged (it was the failing write)');
  assert.equal(await exists(agentPath), false, 'the copied agent file must not be left behind when project.yaml registration fails');

  const leftoverTmp = (await readdir(join(root, '.agentos'))).filter((name) => name.includes('.agentos-tmp-'));
  assert.deepEqual(leftoverTmp, [], 'no atomic-write temp artifacts should remain in .agentos/');
});

test('run handoff rolls back the run note and tasks.md rewrite when the final handoff.md write fails', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const handoffPath = join(root, '.agentos/handoff.md');
  const tasksPath = join(root, '.agentos/tasks.md');
  const beforeHandoff = await readFile(handoffPath, 'utf8');
  const beforeTasks = await readFile(tasksPath, 'utf8');
  const runsBefore = await exists(join(root, '.agentos/runs')) ? await readdir(join(root, '.agentos/runs')) : [];

  __setAtomicWriteFaultForTests(handoffPath, 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);

  await assert.rejects(() => runHandoffAgentOS({ cwd: root, engine: 'claude-code', reason: 'test-fault' }), /Injected atomic-write test fault/);

  assert.equal(await readFile(handoffPath, 'utf8'), beforeHandoff, 'handoff.md must be unchanged (it was the failing write)');
  assert.equal(await readFile(tasksPath, 'utf8'), beforeTasks, 'tasks.md must be restored to its pre-run-handoff bytes');
  assert.deepEqual(await readdir(join(root, '.agentos/runs')), runsBefore, 'no new run handoff note should be left behind');

  const leftoverTmp = (await readdir(join(root, '.agentos'))).filter((name) => name.includes('.agentos-tmp-'));
  assert.deepEqual(leftoverTmp, [], 'no atomic-write temp artifacts should remain in .agentos/');
});

test('doctor --fix is idempotent across repeated runs and leaves no atomic-write artifacts', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });

  const first = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(first.ok, true);
  const snapshotAfterFirst = {};
  for (const rel of ['.agentos/project.yaml', '.agentos/skills.md', 'AGENTS.md', 'CLAUDE.md', '.hermes.md']) {
    snapshotAfterFirst[rel] = await readFile(join(root, rel), 'utf8');
  }

  const second = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(second.ok, true);
  for (const rel of Object.keys(snapshotAfterFirst)) {
    assert.equal(await readFile(join(root, rel), 'utf8'), snapshotAfterFirst[rel], `${rel} must be stable across a repeated doctor --fix run`);
  }

  assert.deepEqual(await findAllTempArtifacts(root), [], 'no atomic-write temp artifacts should remain after successful repeated runs');
});

test('skills add is idempotent when re-adding an already-installed skill and leaves no atomic-write artifacts', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });

  const first = await skillsAgentOS({ cwd: root, add: 'debugging' });
  assert.equal(first.ok, true);
  const skillPath = join(root, '.agentos/skills/core/debugging/SKILL.md');
  const contentAfterFirst = await readFile(skillPath, 'utf8');
  const skillsMdAfterFirst = await readFile(join(root, '.agentos/skills.md'), 'utf8');

  const second = await skillsAgentOS({ cwd: root, add: 'debugging' });
  assert.equal(second.ok, true);
  assert.equal(await readFile(skillPath, 'utf8'), contentAfterFirst, 'skill content must be stable across a repeated add');
  assert.equal(await readFile(join(root, '.agentos/skills.md'), 'utf8'), skillsMdAfterFirst, 'skills.md must be stable across a repeated add');

  assert.deepEqual(await findAllTempArtifacts(root), [], 'no atomic-write temp artifacts should remain after successful repeated runs');
});

test('successful multi-file commands leave no atomic-write temp artifacts behind', async (t) => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });

  await compactAgentOS({ cwd: root });
  await runHandoffAgentOS({ cwd: root, engine: 'claude-code', reason: 'manual-pause' });
  await agentsAgentOS({ cwd: root, add: 'planner' });
  await skillsAgentOS({ cwd: root, add: 'test-driven-development' });
  await skillsAgentOS({ cwd: root, remove: 'test-driven-development' });
  await templatesAgentOS({ cwd: root, command: 'copy', id: 'agent:security-reviewer' });
  const vault = join(root, 'vault');
  await mkdir(vault, { recursive: true });
  await linkObsidianAgentOS({ cwd: root, vault, dest: 'Projects/Demo', create: true });
  await obsidianAgentOS({ cwd: root, command: 'link-workspace', vault, dest: 'Projects/DemoWorkspace', create: true });
  await doctorAgentOS({ cwd: root, fix: true });

  assert.deepEqual(await findAllTempArtifacts(root), [], 'no atomic-write temp artifacts should remain anywhere after a batch of successful commands');
  assert.deepEqual(await findAllTempArtifacts(vault), [], 'no atomic-write temp artifacts should remain in the Obsidian vault either');
});
