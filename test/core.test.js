import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS, statusAgentOS, handoffAgentOS, doctorAgentOS, promptAgentOS, compactAgentOS, linkObsidianAgentOS } from '../dist/core.js';

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
