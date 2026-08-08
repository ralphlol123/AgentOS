import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS, statusAgentOS, handoffAgentOS, doctorAgentOS, promptAgentOS, compactAgentOS, linkObsidianAgentOS, migrateClaudeAgentOS, skillsAgentOS } from '../dist/core.js';

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function tempProject() {
  return mkdtemp(join(tmpdir(), 'agentos-test-'));
}

test('init --new creates a single-workspace AgentOS project brain', async () => {
  const root = await tempProject();
  const result = await initAgentOS({ cwd: root, mode: 'new', yes: true });

  assert.equal(result.mode, 'new');
  assert.equal(await exists(join(root, '.agentos/project.yaml')), true);
  assert.equal(await exists(join(root, '.agentos/product.md')), true);
  assert.equal(await exists(join(root, 'AGENTS.md')), true);
  assert.equal(await exists(join(root, 'CLAUDE.md')), true);

  const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /AgentOS for Projects bootloader/);
  assert.match(agents, /declare role \+ repo scope/);
  assert.doesNotMatch(agents, /Repos: none/);
});

test('init --existing detects a multi-repo workspace from child package.json files', async () => {
  const root = await tempProject();
  await writeFile(join(root, 'README.md'), '# Demo Product\n');
  await mkdirp(join(root, 'frontend'));
  await mkdirp(join(root, 'backend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { build: 'vite build', dev: 'vite dev' }, dependencies: { '@vitejs/plugin-vue': '^5.0.0' } }, null, 2));
  await writeFile(join(root, 'frontend/bun.lock'), '');
  await writeFile(join(root, 'backend/package.json'), JSON.stringify({ scripts: { build: 'nest build', 'start:dev': 'nest start --watch', test: 'jest', 'test:e2e': 'jest --e2e' }, dependencies: { '@nestjs/core': '^10.0.0' } }, null, 2));
  await writeFile(join(root, 'backend/pnpm-lock.yaml'), '');

  const result = await initAgentOS({ cwd: root, mode: 'existing', yes: true });

  assert.equal(result.mode, 'existing');
  assert.equal(result.workspaceKind, 'multi-repo');
  assert.deepEqual(result.repos.map((r) => r.name).sort(), ['backend', 'frontend']);
  assert.equal(await exists(join(root, '.agentos/repos/frontend.md')), true);
  assert.equal(await exists(join(root, '.agentos/repos/backend.md')), true);
  const frontendGitignore = await readFile(join(root, 'frontend/.gitignore'), 'utf8');
  const backendGitignore = await readFile(join(root, 'backend/.gitignore'), 'utf8');
  assert.match(frontendGitignore, /AgentOS parent-workspace pointer files/);
  assert.match(frontendGitignore, /\/AGENTS\.md/);
  assert.match(backendGitignore, /\/CLAUDE\.md/);

  const projectYaml = await readFile(join(root, '.agentos/project.yaml'), 'utf8');
  assert.match(projectYaml, /workspace_kind: multi-repo/);
  assert.match(projectYaml, /path: \.\/frontend/);
  assert.match(projectYaml, /path: \.\/backend/);
  assert.match(projectYaml, /dev_command: pnpm run start:dev/);
  assert.match(projectYaml, /test_e2e_command: pnpm run test:e2e/);
  assert.match(projectYaml, /child_repo_gitignore_policy: ignore/);
});


test('init --existing uses detected agent profile with core delivery team, detected specialists, and skills index', async () => {
  const root = await tempProject();
  await mkdirp(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { vite: '^5.0.0', react: '^18.0.0' } }, null, 2));
  await mkdirp(join(root, 'backend'));
  await writeFile(join(root, 'backend/package.json'), JSON.stringify({ scripts: { build: 'nest build' }, dependencies: { '@nestjs/core': '^10.0.0' } }, null, 2));

  await initAgentOS({ cwd: root, mode: 'existing', yes: true });

  const projectYaml = await readFile(join(root, '.agentos/project.yaml'), 'utf8');
  assert.match(projectYaml, /profile: detected/);
  assert.match(projectYaml, /capabilities:/);
  assert.match(projectYaml, /implementation: implementation/);
  assert.match(projectYaml, /frontend: frontend-engineer/);
  assert.match(projectYaml, /backend: backend-engineer/);
  assert.match(projectYaml, /qa: qa/);
  assert.match(projectYaml, /enabled:/);
  for (const id of ['implementation', 'frontend-engineer', 'backend-engineer', 'qa', 'code-reviewer', 'release-manager']) {
    assert.equal(await exists(join(root, '.agentos/agents', `${id}.md`)), true, `${id} agent file should exist`);
    assert.match(projectYaml, new RegExp(`- ${id}`));
  }
  assert.equal(await exists(join(root, '.agentos/agents/qa-engineer.md')), false);
  const skills = await readFile(join(root, '.agentos/skills.md'), 'utf8');
  assert.match(skills, /Policy: on-demand/);
  assert.match(skills, /frontend-engineer/);
  assert.match(skills, /backend-service-verification/);
});


test('init supports minimal and custom agent profiles', async () => {
  const minimalRoot = await tempProject();
  await initAgentOS({ cwd: minimalRoot, mode: 'new', yes: true, agents: 'minimal' });
  const minimalYaml = await readFile(join(minimalRoot, '.agentos/project.yaml'), 'utf8');
  assert.match(minimalYaml, /profile: minimal/);
  assert.match(minimalYaml, /- implementation/);
  assert.match(minimalYaml, /- qa/);
  assert.doesNotMatch(minimalYaml, /frontend-engineer/);
  assert.equal(await exists(join(minimalRoot, '.agentos/agents/frontend-engineer.md')), false);

  const customRoot = await tempProject();
  await initAgentOS({ cwd: customRoot, mode: 'new', yes: true, agents: 'frontend,qa,release' });
  const customYaml = await readFile(join(customRoot, '.agentos/project.yaml'), 'utf8');
  assert.match(customYaml, /profile: custom/);
  for (const id of ['frontend-engineer', 'qa', 'release-manager']) assert.match(customYaml, new RegExp(`- ${id}`));
  assert.doesNotMatch(customYaml, /backend-engineer/);
});


test('init rejects unknown custom agent aliases', async () => {
  const root = await tempProject();
  await assert.rejects(
    () => initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'fronted,qa' }),
    /Unknown agent alias\(es\): fronted/,
  );
});


test('doctor warns when agent capabilities or skills index are inconsistent', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });
  const { rm } = await import('node:fs/promises');
  await rm(join(root, '.agentos/skills.md'), { force: true });
  await rm(join(root, '.agentos/agents/qa.md'), { force: true });
  await writeFile(join(root, '.agentos/agents/qa-engineer.md'), '# Old QA Engineer\n');

  const doctor = await doctorAgentOS({ cwd: root });

  assert.equal(doctor.ok, true);
  assert.match(doctor.text, /skills index missing: \.agentos\/skills\.md/);
  assert.match(doctor.text, /agents\.capabilities\.qa points to qa, but \.agentos\/agents\/qa\.md is missing/);
  assert.match(doctor.text, /\.agentos\/agents\/qa-engineer\.md is not listed in agents\.enabled/);
});


test('doctor treats a declared custom local agent with an existing agent file as valid', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const projectPath = join(root, '.agentos/project.yaml');
  let projectYaml = await readFile(projectPath, 'utf8');
  projectYaml = projectYaml.replace(/enabled:\n((?:\s+- .+\n)+)/, (m, list) => `enabled:\n${list}    - security-reviewer\n`);
  await writeFile(projectPath, projectYaml);
  await writeFile(join(root, '.agentos/agents/security-reviewer.md'), '# Security Reviewer\n\nMandate: custom security review.\n');

  const doctor = await doctorAgentOS({ cwd: root });

  assert.equal(doctor.ok, true);
  assert.doesNotMatch(doctor.text, /unknown agent/);
  assert.doesNotMatch(doctor.text, /security-reviewer\.md is missing/);
});

test('doctor warns when a declared custom local agent has no matching agent file', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const projectPath = join(root, '.agentos/project.yaml');
  let projectYaml = await readFile(projectPath, 'utf8');
  projectYaml = projectYaml.replace(/enabled:\n((?:\s+- .+\n)+)/, (m, list) => `enabled:\n${list}    - security-reviewer\n`);
  await writeFile(projectPath, projectYaml);

  const doctor = await doctorAgentOS({ cwd: root });

  assert.match(doctor.text, /agents\.enabled references security-reviewer, but \.agentos\/agents\/security-reviewer\.md is missing/);
});

test('doctor --fix preserves declared custom local agents and their capability mapping', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const projectPath = join(root, '.agentos/project.yaml');
  let projectYaml = await readFile(projectPath, 'utf8');
  projectYaml = projectYaml.replace(/enabled:\n((?:\s+- .+\n)+)/, (m, list) => `enabled:\n${list}    - security-reviewer\n`);
  projectYaml = projectYaml.replace(/capabilities:\n((?:\s+\S+: \S+\n)+)/, (m, list) => `capabilities:\n${list}    security: security-reviewer\n`);
  await writeFile(projectPath, projectYaml);
  await writeFile(join(root, '.agentos/agents/security-reviewer.md'), '# Security Reviewer\n\nMandate: custom security review.\n');

  const fixed = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(fixed.ok, true);

  const updated = await readFile(projectPath, 'utf8');
  assert.match(updated, /- security-reviewer/);
  assert.match(updated, /security: security-reviewer/);
  const agentFile = await readFile(join(root, '.agentos/agents/security-reviewer.md'), 'utf8');
  assert.match(agentFile, /custom security review/);
});

test('project-manager is an optional built-in planning-only role, not enabled by default', async () => {
  const detectedRoot = await tempProject();
  await initAgentOS({ cwd: detectedRoot, mode: 'new', yes: true });
  assert.equal(await exists(join(detectedRoot, '.agentos/agents/project-manager.md')), false);
  const detectedYaml = await readFile(join(detectedRoot, '.agentos/project.yaml'), 'utf8');
  assert.doesNotMatch(detectedYaml, /project-manager/);

  const planningRoot = await tempProject();
  await initAgentOS({ cwd: planningRoot, mode: 'new', yes: true, agents: 'planning,implementation,qa' });
  const projectYaml = await readFile(join(planningRoot, '.agentos/project.yaml'), 'utf8');
  assert.match(projectYaml, /- project-manager/);
  assert.match(projectYaml, /planning: project-manager/);
  const agentMdContent = await readFile(join(planningRoot, '.agentos/agents/project-manager.md'), 'utf8');
  assert.match(agentMdContent, /does not implement, commit, or push/);
  assert.match(agentMdContent, /repo scope/i);
  assert.match(agentMdContent, /protected paths/i);

  const pmAliasRoot = await tempProject();
  await initAgentOS({ cwd: pmAliasRoot, mode: 'new', yes: true, agents: 'pm,qa' });
  const pmYaml = await readFile(join(pmAliasRoot, '.agentos/project.yaml'), 'utf8');
  assert.match(pmYaml, /- project-manager/);
});


test('multi-repo init preserves child .gitignore and ignores AgentOS pointer files', async () => {
  const root = await tempProject();
  await mkdirp(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { vite: '^5.0.0' } }, null, 2));
  await writeFile(join(root, 'frontend/.gitignore'), 'node_modules/\n.env\n');
  await mkdirp(join(root, 'backend'));
  await writeFile(join(root, 'backend/package.json'), JSON.stringify({ scripts: { build: 'nest build' }, dependencies: { '@nestjs/core': '^10.0.0' } }, null, 2));

  await initAgentOS({ cwd: root, mode: 'existing', yes: true });
  const gitignore = await readFile(join(root, 'frontend/.gitignore'), 'utf8');
  assert.match(gitignore, /node_modules\//);
  assert.match(gitignore, /\.env/);
  assert.match(gitignore, /# AgentOS parent-workspace pointer files/);
  assert.match(gitignore, /\/AGENTS\.md/);
  assert.match(gitignore, /\/CLAUDE\.md/);
  assert.match(gitignore, /\/\.hermes\.md/);
});

test('existing AGENTS.md and CLAUDE.md are patched with backups, not overwritten', async () => {
  const root = await tempProject();
  await writeFile(join(root, 'AGENTS.md'), '# Existing Agent Rules\n\nKeep this.\n');
  await writeFile(join(root, 'CLAUDE.md'), '# Existing Claude Rules\n\nKeep this too.\n');

  await initAgentOS({ cwd: root, mode: 'existing', yes: true });

  const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
  const claude = await readFile(join(root, 'CLAUDE.md'), 'utf8');
  assert.match(agents, /Keep this/);
  assert.match(agents, /AgentOS for Projects/);
  assert.match(claude, /Keep this too/);
  assert.match(claude, /agentos\/engines\/claude-code.md/);
  assert.match(claude, /\.agentos\/handoff.md/);
  assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), true);
  assert.equal(await exists(join(root, 'CLAUDE.md.agentos.bak')), true);
});

test('doctor --fix replaces stale adapter context without duplicate bootloaders', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });
  await writeFile(join(root, 'AGENTS.md'), '# AGENTS.md\n\nAgentOS for Projects bootloader.\n\nWorkspace: single-repo\nRepos: none\n\nRead first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`.\n');
  await writeFile(join(root, 'CLAUDE.md'), '# CLAUDE.md\n\nAgentOS for Projects. Read `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, `.agentos/skills.md`, relevant `.agentos/repos/*`, `.agentos/agents/*`, and `.agentos/engines/claude-code.md` before acting.\n');
  await writeFile(join(root, '.hermes.md'), '# Hermes Agent Adapter\n\nAgentOS for Projects. Read `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, `.agentos/skills.md`, relevant `.agentos/repos/*` and `.agentos/agents/*` before work.\nHermes rules: load relevant skills; verify real state.\n');

  await doctorAgentOS({ cwd: root, fix: true });

  for (const file of ['CLAUDE.md', '.hermes.md']) {
    const content = await readFile(join(root, file), 'utf8');
    assert.equal((content.match(/^# /gm) || []).length, 1);
    assert.doesNotMatch(content, /agents\/\*/);
    assert.match(content, /only relevant|only the repo/);
  }
  const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(agents, /Repos: none/);
  assert.match(agents, /current repo \(single-repo workspace\)|app=\./);
});

test('doctor --fix refreshes stale child pointers with selective context wording', async () => {
  const root = await tempProject();
  await mkdirp(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { vite: '^5.0.0' } }, null, 2));
  await mkdirp(join(root, 'backend'));
  await writeFile(join(root, 'backend/package.json'), JSON.stringify({ scripts: { build: 'nest build' }, dependencies: { '@nestjs/core': '^10.0.0' } }, null, 2));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true });
  await writeFile(join(root, 'frontend/AGENTS.md'), '# AGENTS.md\n\nAgentOS child repo: frontend (./frontend).\nParent context: `../AGENTS.md`, `../.agentos/project.yaml`, `../.agentos/memory.md`, `../.agentos/handoff.md`, `../.agentos/tasks.md`, `../.agentos/knowledge.md`, `../.agentos/skills.md`, relevant `../.agentos/agents/*`, `../.agentos/engines/*`, and `../.agentos/repos/frontend.md`.\n');
  await writeFile(join(root, 'frontend/CLAUDE.md'), '# CLAUDE.md\n\nAgentOS child repo: frontend (./frontend).\nBefore acting read `../CLAUDE.md`, `../AGENTS.md`, `../.agentos/project.yaml`, `../.agentos/handoff.md`, `../.agentos/tasks.md`, `../.agentos/knowledge.md`, `../.agentos/skills.md`, relevant `../.agentos/agents/*`, and `../.agentos/repos/frontend.md`.\n');

  await doctorAgentOS({ cwd: root, fix: true });

  for (const file of ['frontend/AGENTS.md', 'frontend/CLAUDE.md']) {
    const content = await readFile(join(root, file), 'utf8');
    assert.doesNotMatch(content, /agents\/\*/);
    assert.match(content, /only when relevant/);
  }
});

test('status, handoff, and doctor summarize a healthy initialized workspace', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });

  const status = await statusAgentOS({ cwd: root });
  assert.equal(status.ok, true);
  assert.match(status.text, /AgentOS status: OK/);

  const handoff = await handoffAgentOS({ cwd: root });
  assert.match(handoff.text, /Read these before continuing/);
  assert.match(handoff.text, /\.agentos\/handoff.md/);

  const doctor = await doctorAgentOS({ cwd: root });
  assert.equal(doctor.ok, true);
  assert.match(doctor.text, /AgentOS doctor: OK/);
});


test('status and prompt read quoted project YAML values without leaking YAML syntax', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });
  const projectPath = join(root, '.agentos/project.yaml');
  const projectYaml = await readFile(projectPath, 'utf8');
  await writeFile(projectPath, projectYaml
    .replace(/^name: .+$/m, 'name: "AgentOS: YAML Parser"')
    .replace('workspace_kind: single-repo', "workspace_kind: 'single-repo'"));

  const status = await statusAgentOS({ cwd: root });
  const prompt = await promptAgentOS({ cwd: root, engine: 'hermes' });

  assert.match(status.text, /Project: AgentOS: YAML Parser/);
  assert.doesNotMatch(status.text, /Project: "AgentOS: YAML Parser"/);
  assert.match(prompt.text, /Project: AgentOS: YAML Parser/);
  assert.match(prompt.text, /kind: single-repo/);
  assert.doesNotMatch(prompt.text, /kind: 'single-repo'/);
});


test('link-obsidian preserves existing project.yaml knowledge fields', async () => {
  const root = await tempProject();
  const vault = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });
  const projectPath = join(root, '.agentos/project.yaml');
  const projectYaml = await readFile(projectPath, 'utf8');
  await writeFile(projectPath, `${projectYaml.trimEnd()}\n\nknowledge:\n  docs:\n    mode: link-only\n    links:\n      - docs/README.md\n`);

  await linkObsidianAgentOS({ cwd: root, vault, dest: 'Projects/AgentOS', create: true });

  const updated = await readFile(projectPath, 'utf8');
  assert.match(updated, /knowledge:/);
  assert.match(updated, /docs:/);
  assert.match(updated, /links:/);
  assert.match(updated, /- docs\/README\.md/);
  assert.match(updated, /obsidian:/);
  assert.match(updated, /mode: link-only/);
});

async function mkdirp(path) {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path, { recursive: true });
}


test('prompt renders engine-specific AgentOS task prefix', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });

  const prompt = await promptAgentOS({ cwd: root, engine: 'opencode' });
  assert.equal(prompt.ok, true);
  assert.equal(prompt.engine, 'opencode');
  assert.match(prompt.text, /Follow AgentOS for Projects/);
  assert.match(prompt.text, /engine: opencode/);
  assert.match(prompt.text, /engines\/opencode.md/);
  assert.match(prompt.text, /no commit\/push unless asked/);
  assert.match(prompt.text, /Now:/);
  assert.match(prompt.text, /only the assigned repo\/agent\/engine context needed/);
  assert.doesNotMatch(prompt.text, /agents\/\*/);
});

test('generated adapters steer engines toward selective context loading', async () => {
  const root = await tempProject();
  await mkdirp(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { vite: '^5.0.0' } }, null, 2));
  await mkdirp(join(root, 'backend'));
  await writeFile(join(root, 'backend/package.json'), JSON.stringify({ scripts: { build: 'nest build' }, dependencies: { '@nestjs/core': '^10.0.0' } }, null, 2));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true });

  const files = [
    'AGENTS.md',
    'CLAUDE.md',
    '.hermes.md',
    'frontend/AGENTS.md',
    'frontend/CLAUDE.md',
  ];
  for (const file of files) {
    const content = await readFile(join(root, file), 'utf8');
    assert.match(content, /only|relevant/);
    assert.doesNotMatch(content, /agents\/\*/);
  }
});


test('doctor detects duplicate tasks, missing commands, git status, untracked adapters, and ports', async () => {
  const root = await tempProject();
  await mkdirp(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { dev: 'vite dev' }, dependencies: { vite: '^5.0.0' } }, null, 2));
  await mkdirp(join(root, 'backend'));
  await writeFile(join(root, 'backend/package.json'), JSON.stringify({ scripts: { build: 'nest build', dev: 'nest start --watch', test: 'jest' }, dependencies: { '@nestjs/core': '^10.0.0' } }, null, 2));
  spawnSync('git', ['init'], { cwd: join(root, 'frontend'), encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'agentos@example.test'], { cwd: join(root, 'frontend'), encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'AgentOS Test'], { cwd: join(root, 'frontend'), encoding: 'utf8' });
  spawnSync('git', ['add', 'package.json'], { cwd: join(root, 'frontend'), encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: join(root, 'frontend'), encoding: 'utf8' });

  await initAgentOS({ cwd: root, mode: 'existing', yes: true });
  const projectPath = join(root, '.agentos/project.yaml');
  const projectYaml = await readFile(projectPath, 'utf8');
  await writeFile(projectPath, projectYaml.replace('test_command: unknown', 'test_command: unknown\n    dev_port: 9'));
  await writeFile(join(root, '.agentos/tasks.md'), '# Tasks\n\n## Now\n\n- [ ] Do thing.\n\n## Now\n\n- [ ] Duplicate.\n');

  const doctor = await doctorAgentOS({ cwd: root });
  assert.equal(doctor.ok, false);
  assert.match(doctor.text, /duplicate ## Now/);
  assert.match(doctor.text, /missing build_command/);
  assert.match(doctor.text, /missing test_command/);
  assert.match(doctor.text, /git:/);
  assert.match(doctor.text, /has no upstream/);
  assert.doesNotMatch(doctor.text, /untracked AgentOS adapter files/);
  assert.match(doctor.text, /has no untracked adapter files/);
  assert.match(doctor.text, /dev_port 9:/);
});


test('doctor returns structured JSON data when requested', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });
  await writeFile(join(root, '.agentos/tasks.md'), '# Tasks\n\n## Now\n\n- [ ] Do thing.\n\n## Now\n\n- [ ] Duplicate.\n');

  const doctor = await doctorAgentOS({ cwd: root, json: true });

  assert.equal(doctor.ok, false);
  assert.equal(doctor.root, root);
  assert.equal(doctor.status, 'FAIL');
  assert.ok(Array.isArray(doctor.problems));
  assert.ok(doctor.problems.includes('.agentos/tasks.md has duplicate ## Now sections'));
  assert.ok(Array.isArray(doctor.warnings));
  assert.ok(Array.isArray(doctor.diagnostics));
  assert.equal(typeof doctor.text, 'string');
  assert.equal(JSON.parse(doctor.text).ok, false);
});


test('doctor --json CLI prints parseable JSON only', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });

  const result = spawnSync(process.execPath, [join(process.cwd(), 'dist/cli.js'), 'doctor', '--json'], { cwd: root, encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, 'OK');
  assert.equal(parsed.root, root);
  assert.ok(Array.isArray(parsed.problems));
  assert.ok(Array.isArray(parsed.warnings));
  assert.ok(Array.isArray(parsed.diagnostics));
});


test('doctor --fix adds OpenCode engine adapter to older workspaces', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });
  const projectPath = join(root, '.agentos/project.yaml');
  let projectYaml = await readFile(projectPath, 'utf8');
  projectYaml = projectYaml.replace('    - opencode\n', '');
  await writeFile(projectPath, projectYaml);
  const { rm } = await import('node:fs/promises');
  await rm(join(root, '.agentos/engines/opencode.md'), { force: true });

  const before = await doctorAgentOS({ cwd: root });
  assert.equal(before.ok, true);
  assert.match(before.text, /opencode/);

  const fixed = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(fixed.ok, true);
  assert.equal(await exists(join(root, '.agentos/engines/opencode.md')), true);
  assert.match(await readFile(projectPath, 'utf8'), /- opencode/);
});


test('compact archives verbose handoff/tasks and rewrites compact live state', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });
  await writeFile(join(root, '.agentos/handoff.md'), `# Handoff

## Current objective

Build agentos compact.

## Scope

AgentOS package only.

## Current state

Verbose history line 1.
Verbose history line 2.
Verbose history line 3.

## Last completed step

Pushed TypeScript MVP.

## Files changed

src/core.ts
src/cli.ts

## Tests run

npm test passed.

## Known failures

None.

## Next exact action

Implement deterministic compaction.

## Open decisions

- Link Obsidian later.
`);
  await writeFile(join(root, '.agentos/tasks.md'), `# Tasks

## Done

- [x] Initialize AgentOS.
- [x] Push TypeScript MVP.

## Now

- [ ] Implement deterministic compaction.

## Now

- [ ] Duplicate stale now item.

## Next

- [ ] Add Obsidian link command.

## Later

- [ ] Add CI.
`);

  const dry = await compactAgentOS({ cwd: root, dryRun: true });
  assert.equal(dry.ok, true);
  assert.match(dry.text, /AgentOS compact dry run/);
  assert.match(dry.text, /Would archive/);
  assert.equal(await exists(dry.archivePath), false);

  const result = await compactAgentOS({ cwd: root });
  assert.equal(result.ok, true);
  assert.match(result.text, /Archived: \.agentos\/runs\/compact-archive-/);
  assert.match(result.text, /AgentOS doctor: OK/);
  assert.equal(await exists(result.archivePath), true);
  assert.ok(result.after < result.before);

  const handoff = await readFile(join(root, '.agentos/handoff.md'), 'utf8');
  const tasks = await readFile(join(root, '.agentos/tasks.md'), 'utf8');
  const archive = await readFile(result.archivePath, 'utf8');
  assert.match(handoff, /Build agentos compact/);
  assert.match(handoff, /Implement deterministic compaction/);
  assert.match(tasks, /## Now/);
  assert.equal((tasks.match(/^## Now$/gm) || []).length, 1);
  assert.match(archive, /Previous handoff.md/);
  assert.match(archive, /Duplicate stale now item/);
});


test('link-obsidian creates link-only knowledge config and default notes', async () => {
  const root = await tempProject();
  const vault = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });

  const result = await linkObsidianAgentOS({ cwd: root, vault, dest: 'Projects/AgentOS', create: true });
  assert.equal(result.ok, true);
  assert.match(result.text, /AgentOS link-obsidian/);
  assert.match(result.text, /Mode: link-only/);

  const knowledge = await readFile(join(root, '.agentos/knowledge.md'), 'utf8');
  const project = await readFile(join(root, '.agentos/project.yaml'), 'utf8');
  assert.match(knowledge, /Do not bulk-load/);
  assert.match(knowledge, /\[\[Projects\/AgentOS\/.*Overview\]\]/);
  assert.match(project, /knowledge:/);
  assert.match(project, /mode: link-only/);
  assert.equal(await exists(join(vault, result.linked[0])), true);

  const doctor = await doctorAgentOS({ cwd: root });
  assert.equal(doctor.ok, true);
});

test('link-obsidian dry-run does not create missing notes', async () => {
  const root = await tempProject();
  const vault = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });
  const result = await linkObsidianAgentOS({ cwd: root, vault, dest: 'Projects/AgentOS', create: true, dryRun: true });
  assert.equal(result.ok, true);
  assert.match(result.text, /dry run/);
  assert.equal(await exists(join(vault, result.linked[0])), false);
});


test('link-obsidian treats --link folder as default note destination', async () => {
  const root = await tempProject();
  const vault = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });
  const result = await linkObsidianAgentOS({ cwd: root, vault, dest: 'Projects/Unused', link: 'Projects/LinkedFolder', create: true });
  assert.equal(result.ok, true);
  assert.match(result.linked[0], /^Projects\/LinkedFolder\//);
  assert.equal(await exists(join(vault, result.linked[0])), true);
});

test('link-obsidian defaults to Projects/<ProjectName>/AgentOS when dest is omitted', async () => {
  const root = await tempProject();
  const vault = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true });
  const result = await linkObsidianAgentOS({ cwd: root, vault, create: true, dryRun: true });
  assert.equal(result.ok, true);
  assert.match(result.destination, /^Projects\/Agentos Test .+\/AgentOS$/);
  assert.match(result.text, /Destination: Projects\/Agentos Test .+\/AgentOS/);
});

test('migrate claude --preserve disables active .claude files and patches CLAUDE.md', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'existing', yes: true });
  await mkdirp(join(root, '.claude/agents'));
  await writeFile(join(root, '.claude/agents/frontend-engineer.md'), '# Legacy Frontend\n');
  await writeFile(join(root, '.claude/settings.local.json'), '{"secret":"do-not-read"}\n');
  await writeFile(join(root, 'CLAUDE.md'), '# Existing Claude\n');

  const result = await migrateClaudeAgentOS({ cwd: root, preserve: true });
  assert.equal(result.ok, true);
  assert.equal(await exists(join(root, '.claude/agents')), false);
  assert.equal(await exists(join(root, '.claude/settings.local.json')), false);
  assert.equal(await exists(join(root, '.claude/README.agentos.md')), true);
  const files = await readdir(join(root, '.claude'));
  assert.ok(files.some((name) => /^agents\.agentos-legacy-/.test(name)));
  assert.ok(files.some((name) => /^settings\.local\.json\.agentos-legacy-/.test(name)));
  const claude = await readFile(join(root, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /AgentOS canonical Claude Code context/);
  assert.match(claude, /Do not use `\.claude\/agents\*`/);
});

test('migrate claude --preserve dry-run is non-mutating and requires --preserve', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'existing', yes: true });
  await mkdirp(join(root, '.claude/agents'));
  const missingPreserve = await migrateClaudeAgentOS({ cwd: root });
  assert.equal(missingPreserve.ok, false);
  assert.match(missingPreserve.text, /Use --preserve/);
  const dry = await migrateClaudeAgentOS({ cwd: root, preserve: true, dryRun: true });
  assert.equal(dry.ok, true);
  assert.match(dry.text, /dry run/);
  assert.equal(await exists(join(root, '.claude/agents')), true);
  assert.equal(await exists(join(root, '.claude/README.agentos.md')), false);
});


test('skill templates default to compact summary mode and support opt-in full mode', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });

  await skillsAgentOS({ cwd: root, add: 'systematic-debugging' });
  const summary = await readFile(join(root, '.agentos/skills/core/systematic-debugging/SKILL.md'), 'utf8');
  assert.match(summary, /^---\nname: systematic-debugging\ncategory: core\nmode: summary\n---/);
  assert.match(summary, /Trigger:/);
  assert.match(summary, /## Procedure/);
  assert.match(summary, /## Verification/);
  assert.doesNotMatch(summary, /## Notes/);

  const fullRoot = await tempProject();
  await initAgentOS({ cwd: fullRoot, mode: 'new', yes: true, agents: 'minimal' });
  await skillsAgentOS({ cwd: fullRoot, add: 'systematic-debugging', mode: 'full' });
  const full = await readFile(join(fullRoot, '.agentos/skills/core/systematic-debugging/SKILL.md'), 'utf8');
  assert.match(full, /mode: full/);
  assert.match(full, /## Notes/);
  assert.ok(full.length > summary.length);
});

test('skills add with a specific skill id writes only that skill and updates the skills index', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });

  const result = await skillsAgentOS({ cwd: root, add: 'ai-slop-design-review' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.skills, ['ai-slop-design-review']);
  assert.equal(await exists(join(root, '.agentos/skills/frontend/ai-slop-design-review/SKILL.md')), true);
  assert.equal(await exists(join(root, '.agentos/skills/core')), false);

  const skillsMd = await readFile(join(root, '.agentos/skills.md'), 'utf8');
  assert.match(skillsMd, /Policy: on-demand/);
  assert.match(skillsMd, /Details: \.agentos\/skills\/frontend\/ai-slop-design-review\/SKILL\.md/);
});

test('skills add supports category-pack aliases', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const result = await skillsAgentOS({ cwd: root, add: 'github-pack' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.skills.slice().sort(), ['github-actions-verification', 'github-code-review', 'github-pr-workflow']);
});

test('skills add rejects unknown skill ids loudly', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  await assert.rejects(
    () => skillsAgentOS({ cwd: root, add: 'not-a-real-skill' }),
    /Unknown skill\(s\): not-a-real-skill/,
  );
});

test('skills add --dry-run reports planned writes without touching the filesystem', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const result = await skillsAgentOS({ cwd: root, add: 'systematic-debugging', dryRun: true });
  assert.match(result.text, /Would write/);
  assert.equal(await exists(join(root, '.agentos/skills/core/systematic-debugging/SKILL.md')), false);
});

test('skills add --detected materializes core, frontend, backend, fullstack, and github skills for a full-stack multi-repo', async () => {
  const root = await tempProject();
  await mkdirp(join(root, 'frontend'));
  await writeFile(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { build: 'nuxt build' }, dependencies: { nuxt: '^4.0.0' } }, null, 2));
  await mkdirp(join(root, 'backend'));
  await writeFile(join(root, 'backend/package.json'), JSON.stringify({ scripts: { build: 'nest build' }, dependencies: { '@nestjs/core': '^10.0.0' } }, null, 2));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true });
  spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' });

  const result = await skillsAgentOS({ cwd: root, detected: true });
  assert.equal(result.ok, true);
  const expectedByCategory = {
    core: 'systematic-debugging',
    frontend: 'nuxt-e2e-testing',
    backend: 'nestjs-feature-implementation',
    fullstack: 'full-system-rehearsal',
    github: 'github-pr-workflow',
  };
  for (const [category, id] of Object.entries(expectedByCategory)) {
    assert.equal(await exists(join(root, `.agentos/skills/${category}/${id}/SKILL.md`)), true, `${id} should be materialized`);
  }
  const skillsMd = await readFile(join(root, '.agentos/skills.md'), 'utf8');
  assert.match(skillsMd, /Details: \.agentos\/skills\/core\/systematic-debugging\/SKILL\.md/);
});

test('skill catalog contains no project-specific skill ids', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  await skillsAgentOS({ cwd: root, add: 'core-pack,frontend-pack,backend-pack,fullstack-pack,github-pack' });

  const { readdir } = await import('node:fs/promises');
  async function walk(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) out.push(...await walk(join(dir, entry.name)));
      else out.push(join(dir, entry.name));
    }
    return out;
  }
  const files = await walk(join(root, '.agentos/skills'));
  const joined = files.join('\n').toLowerCase();
  assert.doesNotMatch(joined, /photobooth|kargax/);
  assert.ok(files.length >= 19, `expected at least 19 skill files, got ${files.length}`);
});

test('CLI skills add --detected materializes skills for a project', async () => {
  const root = await tempProject();
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const result = spawnSync(process.execPath, [join(process.cwd(), 'dist/cli.js'), 'skills', 'add', '--detected'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /AgentOS skills add/);
  assert.equal(await exists(join(root, '.agentos/skills/core/systematic-debugging/SKILL.md')), true);
});
