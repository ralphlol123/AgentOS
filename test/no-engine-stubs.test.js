import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS, doctorAgentOS, promptAgentOS } from '../dist/core.js';

// No per-engine stub files.
//
// `.agentos/engines/<engine>.md` was generated for five engines. Every file is 143-149 bytes of the
// same sentence ("Read AGENTS.md + .agentos context first. Before stopping: handoff ..."), which the
// bootloader rules already say, with nothing engine-specific in it. Two doctor checks even reported a
// PROBLEM when a child pointer failed to mention them.
//
// Contract pinned here:
//   * init and doctor --fix no longer create `.agentos/engines/`, and `init --dry-run` does not list it.
//   * No generated bootloader, child pointer or `agentos prompt` text mentions `engines/`.
//   * doctor does not require the files: no warning for a missing opencode.md, no problem for a
//     child pointer that does not name an engine adapter.
//   * Existing workspaces keep their stubs: doctor and doctor --fix tolerate them and leave them
//     byte-identical (never deleted).
//   * Adapters from the previous generator (which mention engines/) are reported stale and repaired
//     by doctor --fix, like any other generator change.

const CLI = resolve('dist/cli.js');
const ENGINES = ['claude-code', 'codex', 'opencode', 'hermes', 'chatgpt'];
const ROOT_ADAPTERS = ['AGENTS.md', 'CLAUDE.md', '.hermes.md'];
const CHILD_ADAPTERS = ['web/AGENTS.md', 'web/CLAUDE.md', 'api/AGENTS.md', 'api/CLAUDE.md'];
const STUB = '# Codex Adapter\n\nRead AGENTS.md + .agentos context first. Before stopping: handoff current state, files changed, tests, failures, next action.\n';

async function exists(path) { try { await stat(path); return true; } catch { return false; } }
const read = (root, rel) => readFile(join(root, rel), 'utf8');

async function multiRepo(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-noengines-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const repo of ['web', 'api']) {
    await mkdir(join(root, repo));
    await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo, scripts: { build: 'echo b', test: 'echo t' } }));
  }
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'detected' });
  return root;
}

async function snapshot(root) {
  const out = {};
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.name === '.git') continue;
      if (entry.isDirectory()) await walk(abs);
      else out[relative(root, abs)] = await readFile(abs, 'utf8');
    }
  }
  await walk(root);
  return out;
}

test('init creates no .agentos/engines directory and no engine stub files', async (t) => {
  const root = await multiRepo(t);
  assert.equal(await exists(join(root, '.agentos/engines')), false, '.agentos/engines must not be created');
  for (const id of ENGINES) assert.equal(await exists(join(root, `.agentos/engines/${id}.md`)), false, id);
});

test('init for a new project creates no engine stubs either', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'agentos-noengines-new-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true });
  assert.equal(await exists(join(root, '.agentos/engines')), false);
});

test('init --dry-run does not list engine stubs among the planned files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'agentos-noengines-dry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'x', scripts: { build: 'echo b' } }));
  const r = spawnSync(process.execPath, [CLI, 'init', '--existing', '--dry-run'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /engines\//);
  assert.deepEqual(await readdir(root), ['package.json'], 'dry run writes nothing');
});

test('no generated bootloader or child pointer mentions engines/', async (t) => {
  const root = await multiRepo(t);
  for (const file of [...ROOT_ADAPTERS, ...CHILD_ADAPTERS, '.agentos/guide.md', '.agentos/skills.md']) {
    assert.doesNotMatch(await read(root, file), /engines\//, `${file} must not point at engine stub files`);
  }
});

test('child pointers still expose the parent project, skills and repo context', async (t) => {
  const root = await multiRepo(t);
  for (const file of CHILD_ADAPTERS) {
    const text = await read(root, file);
    assert.match(text, /\.\.\/\.agentos\/project\.yaml/, file);
    assert.match(text, /\.\.\/\.agentos\/skills\.md/, file);
    assert.match(text, /\.\.\/\.agentos\/repos\/(web|api)\.md/, file);
  }
  assert.match(await read(root, 'web/AGENTS.md'), /OpenCode|opencode/, 'the AGENTS.md pointer still names the engines it serves');
  assert.match(await read(root, 'web/CLAUDE.md'), /\.\.\/CLAUDE\.md/);
});

test('agentos prompt names the right bootloader for each engine and never an engines/ file', async (t) => {
  const root = await multiRepo(t);
  const expect = { 'claude-code': /CLAUDE\.md/, codex: /AGENTS\.md/, opencode: /AGENTS\.md/, hermes: /\.hermes\.md/ };
  for (const [engine, pattern] of Object.entries(expect)) {
    const r = await promptAgentOS({ cwd: root, engine });
    assert.equal(r.ok, true, engine);
    assert.doesNotMatch(r.text, /engines\//, `${engine} prompt`);
    assert.match(r.text, pattern, `${engine} prompt names its bootloader`);
    assert.match(r.text, /Read: AGENTS\.md;/, `${engine} prompt keeps the shared first read`);
  }
});

test('agentos handoff reading lists no longer ask for an engine file', async (t) => {
  const root = await multiRepo(t);
  for (const cwd of [root, join(root, 'web')]) {
    const r = spawnSync(process.execPath, [CLI, 'handoff'], { cwd, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /engines\//);
    assert.match(r.stdout, /relevant \.agentos\/agents\/<role>\.md/, 'the agent-card line stays');
  }
});

test('doctor does not require the files: a fresh workspace has no warning or problem about them', async (t) => {
  const root = await multiRepo(t);
  const result = await doctorAgentOS({ cwd: root });
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
  assert.equal([...result.problems, ...result.warnings].filter((m) => /engine/i.test(m)).length, 0, JSON.stringify(result.warnings));
});

test('doctor --fix on a workspace without the stubs does not create them', async (t) => {
  const root = await multiRepo(t);
  await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(await exists(join(root, '.agentos/engines')), false);
});

test('doctor --fix still records opencode in project.yaml engines.allowed', async (t) => {
  const root = await multiRepo(t);
  const projectPath = join(root, '.agentos/project.yaml');
  await writeFile(projectPath, (await readFile(projectPath, 'utf8')).replace(/ {4}- opencode\n/, ''));
  assert.doesNotMatch(await readFile(projectPath, 'utf8'), /- opencode/);
  await doctorAgentOS({ cwd: root, fix: true });
  assert.match(await readFile(projectPath, 'utf8'), /- opencode/);
});

test('existing engine stubs are tolerated and left byte-identical by doctor and doctor --fix', async (t) => {
  const root = await multiRepo(t);
  await mkdir(join(root, '.agentos/engines'), { recursive: true });
  for (const id of ENGINES) await writeFile(join(root, `.agentos/engines/${id}.md`), STUB.replace('Codex', id));
  await writeFile(join(root, '.agentos/engines/codex.md'), `${STUB}\nMy own note: keep this.\n`);
  const before = await snapshot(root);
  const check = await doctorAgentOS({ cwd: root });
  assert.equal(check.ok, true);
  assert.deepEqual(check.problems, []);
  await doctorAgentOS({ cwd: root, fix: true });
  const after = await snapshot(root);
  for (const id of ENGINES) assert.equal(after[`.agentos/engines/${id}.md`], before[`.agentos/engines/${id}.md`], `${id}.md must survive untouched`);
  assert.deepEqual(after, before, 'a current workspace with stubs is a doctor --fix no-op');
});

test('adapters from the previous generator (which mention engines/) are stale, repaired by doctor --fix, then stable', async (t) => {
  const root = await multiRepo(t);
  // Simulate pre-change output: add the engine-stub references back inside each managed block.
  const addBack = {
    'CLAUDE.md': (s) => s.replace('.agentos/tasks.md`', '.agentos/tasks.md`, and `.agentos/engines/claude-code.md`'),
    'web/AGENTS.md': (s) => s.replace('- `../.agentos/skills.md`', '- `../.agentos/skills.md`\n- `../.agentos/engines/opencode.md` when using OpenCode'),
  };
  for (const [file, fn] of Object.entries(addBack)) {
    const text = await read(root, file);
    const changed = fn(text);
    assert.notEqual(changed, text, `test fixture for ${file} must change the file`);
    await writeFile(join(root, file), changed);
  }
  const stale = await doctorAgentOS({ cwd: root });
  assert.ok(stale.problems.some((p) => /CLAUDE\.md/.test(p) && /stale/i.test(p)), JSON.stringify(stale.problems));
  assert.ok(stale.problems.some((p) => /web\/AGENTS\.md/.test(p) && /stale/i.test(p)), JSON.stringify(stale.problems));
  await doctorAgentOS({ cwd: root, fix: true });
  for (const file of Object.keys(addBack)) assert.doesNotMatch(await read(root, file), /engines\//, `${file} repaired`);
  assert.deepEqual((await doctorAgentOS({ cwd: root })).problems, []);
  const settled = await snapshot(root);
  await doctorAgentOS({ cwd: root, fix: true });
  assert.deepEqual(await snapshot(root), settled, 'a second doctor --fix is a byte-for-byte no-op');
});

test('a child pointer without any engine-adapter line is not a doctor problem', async (t) => {
  const root = await multiRepo(t);
  const result = await doctorAgentOS({ cwd: root });
  assert.equal(result.problems.filter((p) => /engine adapter/i.test(p)).length, 0);
});
