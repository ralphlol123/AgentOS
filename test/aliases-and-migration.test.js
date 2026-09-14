import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { initAgentOS, skillsAgentOS, templatesAgentOS, agentsAgentOS, doctorAgentOS } from '../dist/core.js';

async function workspace(t, agents = 'minimal') {
  const root = await mkdtemp(join(tmpdir(), 'agentos-aliases-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents });
  return root;
}

async function exists(path) {
  try { await readFile(path); return true; } catch { return false; }
}

// --- Historical generated card shapes (copied from git history) ---

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

const MVP_CODE_REVIEWER_CARD = `# Code Reviewer

Mandate: Review diffs for correctness, security, scope, and project consistency.
Rules: read project/handoff/tasks first; work only in declared scope; update handoff before stopping; escalate destructive/prod/credential/cross-scope actions.
`;

test('init --agents resolves retired agent IDs and friendly shorthands without dropping roles', async t => {
  const root = await workspace(t, 'pm,qa,impl,code-reviewer,frontend,backend');
  const projectYaml = await readFile(join(root, '.agentos/project.yaml'), 'utf8');
  assert.match(projectYaml, /profile: custom/);
  for (const id of ['planner', 'tester', 'developer', 'reviewer']) assert.match(projectYaml, new RegExp(`- ${id}`));
  // developer appears once despite frontend/backend/impl all mapping to it.
  assert.equal((projectYaml.match(/- developer/g) || []).length, 1);
  assert.doesNotMatch(projectYaml, /- implementation/);
  assert.doesNotMatch(projectYaml, /- qa\b/);
  assert.doesNotMatch(projectYaml, /- code-reviewer/);
  for (const id of ['planner', 'tester', 'developer', 'reviewer']) assert.equal(await exists(join(root, '.agentos/agents', `${id}.md`)), true);
});

test('init --agents emits a deprecation notice for retired IDs but not friendly shorthands', async t => {
  const root = await mkdtemp(join(tmpdir(), 'agentos-aliases-'));
  const result = await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'qa,pm' });
  assert.match(result.text, /Deprecated agent alias 'qa' -> 'tester'/);
  assert.doesNotMatch(result.text, /Deprecated agent alias 'pm'/);
});

test('agents add resolves a retired agent ID to its canonical card with a notice', async t => {
  const root = await workspace(t);
  const result = await agentsAgentOS({ cwd: root, add: 'qa' });
  assert.equal(result.ok, true);
  assert.match(result.text, /Deprecated agent alias 'qa' -> 'tester'/);
  assert.equal(await exists(join(root, '.agentos/agents/tester.md')), true);
  assert.equal(await exists(join(root, '.agentos/agents/qa.md')), false);
});

test('security is an alias and a capability default for security-reviewer', async t => {
  const aliasRoot = await workspace(t, 'security');
  const aliasYaml = await readFile(join(aliasRoot, '.agentos/project.yaml'), 'utf8');
  assert.match(aliasYaml, /- security-reviewer/);
  assert.match(aliasYaml, /security: security-reviewer/);

  const fullRoot = await workspace(t, 'security-reviewer');
  const fullYaml = await readFile(join(fullRoot, '.agentos/project.yaml'), 'utf8');
  assert.match(fullYaml, /- security-reviewer/);
  assert.match(fullYaml, /security: security-reviewer/);
});

test('skills add resolves retired skill IDs to canonical, dedupes, and names the canonical skill', async t => {
  const root = await workspace(t);
  const result = await skillsAgentOS({ cwd: root, add: 'systematic-debugging' });
  assert.equal(result.ok, true);
  assert.match(result.text, /Deprecated skill 'systematic-debugging' -> 'debugging'/);
  assert.deepEqual(result.skills, ['debugging']);
  assert.equal(await exists(join(root, '.agentos/skills/core/debugging/SKILL.md')), true);
  assert.equal(await exists(join(root, '.agentos/skills/core/systematic-debugging/SKILL.md')), false);
});

test('skills add dedupes multiple retired IDs that merge to one canonical skill', async t => {
  const root = await workspace(t);
  const result = await skillsAgentOS({ cwd: root, add: 'ai-slop-design-review,interface-feel-polish' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.skills, ['frontend-design']);
  assert.match(result.text, /Deprecated skill 'ai-slop-design-review' -> 'frontend-design'/);
  assert.match(result.text, /Deprecated skill 'interface-feel-polish' -> 'frontend-design'/);
  const entries = await readdir(join(root, '.agentos/skills/frontend'));
  assert.deepEqual(entries, ['frontend-design']);
});

test('templates copy resolves retired skill and agent IDs with a notice', async t => {
  const root = await workspace(t);
  const skill = await templatesAgentOS({ cwd: root, command: 'copy', id: 'systematic-debugging' });
  assert.equal(skill.ok, true);
  assert.match(skill.text, /Deprecated skill 'systematic-debugging' -> 'debugging'/);
  assert.equal(await exists(join(root, '.agentos/skills/core/debugging/SKILL.md')), true);

  const agent = await templatesAgentOS({ cwd: root, command: 'copy', id: 'qa' });
  assert.equal(agent.ok, true);
  assert.match(agent.text, /Deprecated agent alias 'qa' -> 'tester'/);
  assert.equal(await exists(join(root, '.agentos/agents/tester.md')), true);
});

test('doctor detects legacy agent cards, retired enabled/capabilities, and stale skills.md entries', async t => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/agents/qa.md'), PHASE1_QA_CARD);
  await writeFile(join(root, '.agentos/agents/frontend-engineer.md'), '# Custom Frontend Engineer\n\nCustom owner notes.\n');
  const projectPath = join(root, '.agentos/project.yaml');
  let projectYaml = await readFile(projectPath, 'utf8');
  projectYaml = projectYaml.replace('profile: minimal', 'profile: custom');
  projectYaml = projectYaml.replace(/enabled:\n((?:    - .+\n)+)/, (m, list) => `enabled:\n    - implementation\n    - qa\n`);
  projectYaml = projectYaml.replace(/capabilities:\n((?:    .+\n)+)/, (m, list) => `capabilities:\n    implementation: implementation\n    qa: qa\n`);
  await writeFile(projectPath, projectYaml);
  const skillsMd = join(root, '.agentos/skills.md');
  await writeFile(skillsMd, (await readFile(skillsMd, 'utf8')) + '\n- systematic-debugging — old entry\n');

  const doctor = await doctorAgentOS({ cwd: root });
  assert.match(doctor.text, /agents\.enabled references retired agent 'implementation' -> 'developer'/);
  assert.match(doctor.text, /agents\.enabled references retired agent 'qa' -> 'tester'/);
  assert.match(doctor.text, /agents\.capabilities\.implementation references retired agent 'implementation' -> 'developer'/);
  assert.match(doctor.text, /\.agentos\/agents\/qa\.md is a retired agent card -> 'tester'/);
  assert.match(doctor.text, /\.agentos\/agents\/frontend-engineer\.md is a retired agent card -> 'developer'/);
  assert.match(doctor.text, /\.agentos\/skills\.md still lists retired skill 'systematic-debugging' -> 'debugging'/);
});

test('doctor --fix migrates clearly-generated retired cards and remaps project.yaml, preserving customized cards and native copies', async t => {
  const root = await workspace(t);
  // Clearly-generated retired cards (historical shapes).
  await writeFile(join(root, '.agentos/agents/qa.md'), PHASE1_QA_CARD);
  await writeFile(join(root, '.agentos/agents/code-reviewer.md'), MVP_CODE_REVIEWER_CARD);
  // A customized retired card that must be preserved.
  await writeFile(join(root, '.agentos/agents/frontend-engineer.md'), '# Custom Frontend Engineer\n\nOwner-specific instructions.\n');
  // A native engine copy that must be preserved.
  await mkdir(join(root, '.claude/agents'), { recursive: true });
  await writeFile(join(root, '.claude/agents/qa.md'), 'Native engine qa content.\n');

  const projectPath = join(root, '.agentos/project.yaml');
  let projectYaml = await readFile(projectPath, 'utf8');
  projectYaml = projectYaml.replace('profile: minimal', 'profile: custom');
  projectYaml = projectYaml.replace(/enabled:\n((?:    - .+\n)+)/, (m, list) => `enabled:\n    - implementation\n    - qa\n    - code-reviewer\n    - release-manager\n`);
  projectYaml = projectYaml.replace(/capabilities:\n((?:    .+\n)+)/, (m, list) => `capabilities:\n    implementation: implementation\n    qa: qa\n    review: code-reviewer\n    release: release-manager\n`);
  await writeFile(projectPath, projectYaml);

  const beforeFix = await doctorAgentOS({ cwd: root });
  assert.match(beforeFix.text, /retired agent/);

  const fixed = await doctorAgentOS({ cwd: root, fix: true });

  // Clearly-generated retired cards were migrated to canonical cards.
  assert.equal(await exists(join(root, '.agentos/agents/qa.md')), false);
  assert.equal(await exists(join(root, '.agentos/agents/tester.md')), true);
  assert.equal(await exists(join(root, '.agentos/agents/code-reviewer.md')), false);
  assert.equal(await exists(join(root, '.agentos/agents/reviewer.md')), true);

  // Customized retired card and native engine copy are untouched.
  assert.equal(await readFile(join(root, '.agentos/agents/frontend-engineer.md'), 'utf8'), '# Custom Frontend Engineer\n\nOwner-specific instructions.\n');
  assert.equal(await readFile(join(root, '.claude/agents/qa.md'), 'utf8'), 'Native engine qa content.\n');

  // project.yaml enabled/capabilities remapped to canonical IDs.
  const updated = await readFile(projectPath, 'utf8');
  assert.doesNotMatch(updated, /- implementation/);
  assert.doesNotMatch(updated, /- qa\b/);
  assert.doesNotMatch(updated, /- code-reviewer/);
  assert.match(updated, /- developer/);
  assert.match(updated, /- tester/);
  assert.match(updated, /- reviewer/);
  assert.match(updated, /implementation: developer/);
  assert.match(updated, /qa: tester/);
  assert.match(updated, /review: reviewer/);

  // The customized retired card is still surfaced as a warning for manual review.
  assert.match(fixed.text, /\.agentos\/agents\/frontend-engineer\.md is a retired agent card -> 'developer'/);

  // A second fix is idempotent (the customized card remains the only legacy item).
  const again = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(await exists(join(root, '.agentos/agents/frontend-engineer.md')), true);
  assert.equal(await readFile(join(root, '.claude/agents/qa.md'), 'utf8'), 'Native engine qa content.\n');
  assert.match(again.text, /retired agent card/);
});
