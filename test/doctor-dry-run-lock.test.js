import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS, doctorAgentOS } from '../dist/core.js';

// `doctor --fix --dry-run` is documented as a read-only preview. Every other dry run skips the workspace
// writer lock; doctor took it whenever --fix was set. Observed on a real workspace owned by another
// user: `agentos doctor failed: EACCES: permission denied, open '.../.agentos-write.lock'`, so the
// preview that tells an owner what a fix would do could not run read-only, and briefly created a file.
//
// Contract: a dry-run never takes the lock (so it is not blocked by another writer and needs no write
// permission), and a real --fix still does.

const CLI = resolve('dist/cli.js');

async function stale(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-dry-lock-'));
  t.after(async () => { await chmod(root, 0o755).catch(() => {}); await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, 'web'));
  await writeFile(join(root, 'web', 'package.json'), JSON.stringify({ name: 'web', scripts: { build: 'echo b', test: 'echo t' } }));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'detected' });
  // Make the adapters stale so the preview has real work to describe.
  const agents = join(root, 'AGENTS.md');
  await writeFile(agents, (await readFile(agents, 'utf8')).replace('Rules:', 'Old rules:'));
  return root;
}

async function snapshot(root) {
  const out = {};
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else out[relative(root, abs)] = await readFile(abs, 'utf8');
    }
  }
  await walk(root);
  return out;
}

test('doctor --fix --dry-run runs while another writer holds the lock, and does not touch it', async (t) => {
  const root = await stale(t);
  const lock = join(root, '.agentos-write.lock');
  const held = JSON.stringify({ pid: process.pid, host: 'some-other-host', started: '2026-01-01T00:00:00.000Z' }) + '\n';
  await writeFile(lock, held);
  const before = await snapshot(root);
  const preview = await doctorAgentOS({ cwd: root, fix: true, dryRun: true });
  assert.match(preview.text, /DRY RUN/i, 'the preview ran instead of failing on the lock');
  assert.equal(await readFile(lock, 'utf8'), held, 'the existing lock is left exactly as it was');
  assert.deepEqual(await snapshot(root), before, 'nothing in the workspace changed');
});

test('doctor --fix --dry-run works in a workspace the user cannot write to', { skip: process.getuid?.() === 0 }, async (t) => {
  const root = await stale(t);
  await chmod(root, 0o555);
  const r = spawnSync(process.execPath, [CLI, 'doctor', '--fix', '--dry-run'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /DRY RUN/i);
  assert.doesNotMatch(r.stderr, /EACCES|write\.lock/);
});

test('doctor --fix --dry-run --json is also lock-free', async (t) => {
  const root = await stale(t);
  await writeFile(join(root, '.agentos-write.lock'), JSON.stringify({ pid: process.pid, host: 'other', started: 'x' }) + '\n');
  const r = spawnSync(process.execPath, [CLI, 'doctor', '--fix', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.doesNotThrow(() => JSON.parse(r.stdout));
});

test('a real doctor --fix still takes the lock: a held lock blocks it with zero writes', async (t) => {
  const root = await stale(t);
  const lock = join(root, '.agentos-write.lock');
  await writeFile(lock, JSON.stringify({ pid: process.pid, host: 'other-host', started: '2026-01-01T00:00:00.000Z' }) + '\n');
  const before = await snapshot(root);
  await assert.rejects(doctorAgentOS({ cwd: root, fix: true }), /Workspace writer lock exists/);
  assert.deepEqual(await snapshot(root), before, 'a blocked fix writes nothing');
});

test('a real doctor --fix succeeds and leaves no lock behind', async (t) => {
  const root = await stale(t);
  const result = await doctorAgentOS({ cwd: root, fix: true });
  assert.equal(result.ok, true);
  await assert.rejects(readFile(join(root, '.agentos-write.lock')), /ENOENT/);
});

test('plain doctor (no --fix) never takes the lock either', async (t) => {
  const root = await stale(t);
  await writeFile(join(root, '.agentos-write.lock'), JSON.stringify({ pid: process.pid, host: 'other', started: 'x' }) + '\n');
  const result = await doctorAgentOS({ cwd: root });
  assert.ok(Array.isArray(result.problems));
});
