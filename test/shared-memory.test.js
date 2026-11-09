import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile, symlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parse, stringify } from 'yaml';

const CLI = resolve('dist/cli.js');
const SETUP = resolve('scripts/setup-shared-memory.mjs');
const mapping = { contract_version: 1, provider: 'unified-brain', project_id: 'sample-project', store_id: 'personal-brain', connection: 'obsidian-brain', brain_root: 'Brain/Projects/Sample-Project', documents_root: 'Projects/Sample-Project' };
const run = (file, args, cwd) => spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8' });
const ok = r => { assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const setupArgs = ['--project-id', mapping.project_id, '--store-id', mapping.store_id, '--brain-root', mapping.brain_root, '--documents-root', mapping.documents_root];
async function workspace(t, mode = 'existing') {
  const root = await mkdtemp(join(tmpdir(), 'agentos-shared-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), '{"name":"sample"}');
  ok(run(CLI, ['init', `--${mode}`, '--yes', '--agents', 'minimal'], root));
  return root;
}
async function configure(root, value) {
  const file = join(root, '.agentos/project.yaml');
  const data = parse(await readFile(file, 'utf8'));
  data.knowledge = { ...data.knowledge, shared_memory: value };
  await writeFile(file, stringify(data));
}

test('setup previews, preserves legacy configuration and instructions, and is repeatable from a child directory', async t => {
  const root = await workspace(t);
  const file = join(root, '.agentos/project.yaml');
  await writeFile(file, (await readFile(file, 'utf8')) + '\n# Keep this comment\nknowledge:\n  obsidian:\n    mode: link-only\n    vault: /legacy/vault\n    destination: Legacy\n');
  const before = await readFile(file, 'utf8');
  const instructions = await readFile(join(root, 'AGENTS.md'), 'utf8');
  ok(run(SETUP, setupArgs, root));
  assert.equal(await readFile(file, 'utf8'), before);
  ok(run(SETUP, [...setupArgs, '--apply'], root));
  const after = await readFile(file, 'utf8');
  assert.match(after, /# Keep this comment/);
  assert.equal(parse(after).knowledge.obsidian.vault, '/legacy/vault');
  assert.deepEqual(parse(after).knowledge.shared_memory, mapping);
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), instructions);
  await mkdir(join(root, 'child'));
  ok(run(SETUP, [...setupArgs, '--apply'], join(root, 'child')));
  assert.equal(await readFile(file, 'utf8'), after);
  assert.equal(run(SETUP, [...setupArgs, '--connection', 'different', '--apply'], root).status, 1);
  assert.equal(await readFile(file, 'utf8'), after);
});

test('new project mapping gives both engine contexts the same instructions but never claims MCP retrieval', async t => {
  const root = await workspace(t, 'new');
  await configure(root, mapping);
  for (const engine of ['claude-code', 'codex', 'opencode', 'hermes']) {
    const result = JSON.parse(ok(run(CLI, ['context', engine, '--task', 'sample-task', '--json'], root)).stdout);
    assert.equal(result.shared_memory.state, 'configured-unverified');
    assert.equal(result.shared_memory.config.project_id, 'sample-project');
    assert.match(result.text, /brain_search/);
    assert.match(result.text, /task_id/);
    assert.match(result.text, /request_id/);
    assert.match(result.text, /older or unknown servers/);
    assert.match(result.text, /sample-project/);
    assert.ok(result.missing.some(x => /shared memory.*not retrieved/i.test(x)));
    assert.equal(run(CLI, ['context', engine, '--task', 'sample-task', '--require-complete'], root).status, 1);
  }
  assert.match(ok(run(CLI, ['status'], root)).stdout, /configured-unverified/);
  ok(run(CLI, ['checkpoint', '--task', 'sample-task', '--progress', 'Local progress', '--next', 'Verify shared connection'], root));
  ok(run(CLI, ['resume', '--task', 'sample-task'], root));
  ok(run(CLI, ['brain', 'list'], root));
});

test('invalid mapping is diagnosed without breaking local continuity; disabled mapping stays inactive', async t => {
  const root = await workspace(t);
  for (const value of [{ ...mapping, brain_root: '../escape' }, { ...mapping, contract_version: 2 }, { ...mapping, connection: 'bad\ncommand' }, { ...mapping, vault: '/host/path' }]) {
    await configure(root, value);
    const ctx = JSON.parse(ok(run(CLI, ['context', 'codex', '--json'], root)).stdout);
    assert.equal(ctx.shared_memory.state, 'invalid');
    assert.equal(run(CLI, ['doctor'], root).status, 1);
    assert.equal(run(CLI, ['status'], root).status, 1);
    ok(run(CLI, ['brain', 'list'], root));
  }
  await configure(root, { ...mapping, enabled: false });
  const ctx = JSON.parse(ok(run(CLI, ['context', 'codex', '--json'], root)).stdout);
  assert.equal(ctx.shared_memory.state, 'disabled');
  assert.ok(!ctx.missing.some(x => /shared memory/i.test(x)));
});

test('setup refuses malformed YAML, symlink targets and active writer locks without modifying the target', async t => {
  const root = await workspace(t);
  const file = join(root, '.agentos/project.yaml');
  const before = await readFile(file, 'utf8');
  await writeFile(file, 'knowledge: [broken');
  assert.equal(run(SETUP, [...setupArgs, '--apply'], root).status, 1);
  assert.equal(await readFile(file, 'utf8'), 'knowledge: [broken');
  await writeFile(file, before);
  await writeFile(join(root, '.agentos-write.lock'), '{}');
  assert.equal(run(SETUP, [...setupArgs, '--apply'], root).status, 1);
  assert.equal(await readFile(file, 'utf8'), before);
  await rm(join(root, '.agentos-write.lock'));
  await rename(file, join(root, 'original.yaml'));
  await symlink(join(root, 'original.yaml'), file);
  assert.equal(run(SETUP, [...setupArgs, '--apply'], root).status, 1);
  assert.equal(await readFile(join(root, 'original.yaml'), 'utf8'), before);
});

test('mapping is portable to another checkout and its rules remain mandatory under a tight budget', async t => {
  const first = await workspace(t);
  const second = await workspace(t);
  ok(run(SETUP, [...setupArgs, '--apply'], first));
  await writeFile(join(second, '.agentos/project.yaml'), await readFile(join(first, '.agentos/project.yaml')));
  const a = JSON.parse(ok(run(CLI, ['context', 'claude-code', '--json'], first)).stdout);
  const b = JSON.parse(ok(run(CLI, ['context', 'codex', '--json'], second)).stdout);
  assert.deepEqual(a.shared_memory, b.shared_memory);
  const tight = run(CLI, ['context', 'codex', '--budget', '100', '--json'], second);
  assert.equal(tight.status, 1);
  assert.equal(JSON.parse(tight.stdout).shared_memory.state, 'configured-unverified');
  assert.equal(JSON.parse(tight.stdout).ok, false);
});

test('new bootloaders and guide explain shared memory without silently enabling it', async t => {
  const root = await workspace(t, 'new');
  for (const file of ['AGENTS.md', 'CLAUDE.md']) assert.match(await readFile(join(root, file), 'utf8'), /knowledge.shared_memory/);
  assert.match(await readFile(join(root, '.agentos/guide.md'), 'utf8'), /not external retrieval/);
  assert.equal(parse(await readFile(join(root, '.agentos/project.yaml'), 'utf8')).knowledge?.shared_memory, undefined);
  const ctx = JSON.parse(ok(run(CLI, ['context', 'codex', '--json'], root)).stdout);
  assert.equal(ctx.shared_memory, undefined);
  assert.ok(!ctx.missing.some(x => /shared memory/i.test(x)));
});
