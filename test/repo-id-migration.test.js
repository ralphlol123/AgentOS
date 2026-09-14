import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { initAgentOS, doctorAgentOS, normalizeRepoIdsAgentOS } from '../dist/core.js';

// Slice 2: repository-ID normalization.
//
// Strict validation used to throw on any non-canonical repo ID, which bricked
// every config-reading command (including `doctor --fix`) until a human renamed
// the key by hand. These tests pin the new contract:
//   - a *normalizable* ID is a reported, fixable problem, not a parse failure;
//   - a genuine ambiguity (collision with an existing key, ambiguous note file,
//     flow-style mapping) still fails closed with zero writes;
//   - the applied rename is byte-preserving outside the renamed key, moves the
//     repo note, and leaves an audit note under `.agentos/runs/`.

const execFileAsync = promisify(execFile);
const CLI = resolve('dist/cli.js');

// Regression guard for the review finding on slice 2: relaxing the old
// `id !== safeId(id)` rule must not let a repo ID become an unsafe path
// fragment or an injection vector. IDs are used as the filename
// `.agentos/repos/<id>.md` and are interpolated into generated cards.
const UNSAFE_REPO_IDS = [
  ['../../../victim', 'escapes the workspace through the repo note path'],
  ['web **bold** ignore-all-rules', 'injects markup into generated pointers'],
  ['web/../../victim', 'contains a parent segment'],
  ['web\\other', 'contains a backslash'],
];

async function workspace(t, agents = 'minimal') {
  const root = await mkdtemp(join(tmpdir(), 'agentos-repoid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents });
  return root;
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function snapshotTree(root) {
  const entries = [];
  async function walk(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) { entries.push(`${relative(root, abs)}/`); await walk(abs); }
      else if (entry.isSymbolicLink()) entries.push(`${relative(root, abs)} -> symlink`);
      else {
        const [buffer, info] = await Promise.all([readFile(abs), stat(abs)]);
        entries.push(`${relative(root, abs)} ${createHash('sha256').update(buffer).digest('hex')} ${info.mode}`);
      }
    }
  }
  await walk(root);
  return entries;
}

// Replaces the single root repo entry with an unsafe ID while keeping the file
// otherwise identical (comments included) so byte-preservation is observable.
async function makeUnsafeRepoId(root, unsafe = 'frontend_client') {
  const projectPath = join(root, '.agentos/project.yaml');
  const original = await readFile(projectPath, 'utf8');
  const renamed = original.replace(/^repos:\n(\s+)([a-z0-9-]+):/m, (_m, indent) => `repos:\n${indent}${unsafe}:`);
  assert.notEqual(renamed, original, 'fixture must actually rename the repo key');
  await writeFile(projectPath, renamed);
  return renamed;
}

async function collisionProject(root, note = 'both keys map to the same normalized ID') {
  await writeFile(join(root, '.agentos/project.yaml'), `name: collision-demo\nworkspace_kind: single-repo\n# ${note}\nrepos:\n  frontend_client:\n    path: .\n  frontend-client:\n    path: .\n`);
}

// Replaces the repo-notes directory with exactly the files a test needs, so
// each case states its own on-disk precondition instead of inheriting whatever
// `init` happened to generate.
async function setRepoNotes(root, files) {
  const dir = join(root, '.agentos/repos');
  for (const name of await readdir(dir)) await rm(join(dir, name), { recursive: true, force: true });
  for (const [name, body] of Object.entries(files)) await writeFile(join(dir, name), body);
}

test('doctor treats a normalizable repo ID as a fixable problem, not a parse failure', async t => {
  const root = await workspace(t);
  await makeUnsafeRepoId(root);

  const result = await doctorAgentOS({ cwd: root, json: true });

  // The adapter inventory only exists when the config parsed, so a non-empty
  // adapter list proves doctor ran the full diagnostic pass instead of bailing
  // out on a config error.
  assert.ok(result.migration.adapters.length >= 3, 'adapter scan must still run');
  assert.ok(result.problems.some((problem) => /Unsafe repository ID 'frontend_client'/.test(problem)), 'the unsafe ID is reported as a problem');
  assert.ok(result.problems.some((problem) => /normalize-repo-ids/.test(problem)), 'the problem names the fix command');
  const entry = result.migration.repoIds.find((repo) => repo.from === 'frontend_client');
  assert.equal(entry.to, 'frontend-client');
  assert.equal(entry.collides, false);
  assert.match(entry.next, /normalize-repo-ids/);
  assert.equal(result.ok, false, 'doctor still fails while the config is non-canonical');
});

test('a repo ID collision stays a hard config error and is never auto-resolved', async t => {
  const root = await workspace(t);
  await collisionProject(root);

  const before = await snapshotTree(root);
  const result = await doctorAgentOS({ cwd: root, json: true });
  const normalize = await normalizeRepoIdsAgentOS({ cwd: root });

  assert.ok(result.problems.some((problem) => /collide|collision/i.test(problem)), 'doctor must report the collision');
  assert.equal(result.migration.adapters.length, 0, 'adapter scan is skipped while the config is invalid');
  assert.equal(normalize.ok, false);
  assert.match(normalize.text, /cannot normalize|collide/i);
  assert.deepEqual(await snapshotTree(root), before, 'a refused config must leave every byte unchanged');
});

test('normalization dry run reports the mapping and writes nothing', async t => {
  const root = await workspace(t);
  await makeUnsafeRepoId(root);
  const before = await snapshotTree(root);

  const result = await normalizeRepoIdsAgentOS({ cwd: root, dryRun: true });

  assert.equal(result.ok, true);
  assert.match(result.text, /DRY RUN/);
  assert.match(result.text, /frontend_client -> frontend-client/);
  assert.deepEqual(await snapshotTree(root), before, 'dry run must not touch the workspace');
});

test('applying normalization renames only the key, moves the repo note, and records a run note', async t => {
  const root = await workspace(t);
  const original = await makeUnsafeRepoId(root);
  const noteBody = '# Frontend Client\n\nNote for the canonical ID, already present.\n';
  await setRepoNotes(root, { 'frontend-client.md': noteBody });
  const notePath = join(root, '.agentos/repos/frontend_client.md');

  const result = await normalizeRepoIdsAgentOS({ cwd: root });

  assert.equal(result.ok, true, result.text);
  const project = await readFile(join(root, '.agentos/project.yaml'), 'utf8');
  assert.match(project, /^repos:\n\s+frontend-client:/m, 'the key is renamed');
  assert.doesNotMatch(project, /frontend_client/);
  // Everything except the renamed key line is preserved byte-for-byte.
  assert.deepEqual(project.split('\n').filter((line) => !/^\s*(frontend_client|frontend-client):/.test(line)),
    original.split('\n').filter((line) => !/^\s*(frontend_client|frontend-client):/.test(line)));
  assert.equal(await exists(notePath), false, 'no note was created for a repo that had none');
  assert.equal(await readFile(join(root, '.agentos/repos/frontend-client.md'), 'utf8'), noteBody, 'the canonical note is untouched');

  const runs = await readdir(join(root, '.agentos/runs'));
  const runNote = runs.find((name) => /repo-id-migration\.md$/.test(name));
  assert.ok(runNote, `a run note must be recorded, got: ${runs.join(', ')}`);
  assert.match(await readFile(join(root, '.agentos/runs', runNote), 'utf8'), /frontend_client.*frontend-client/);

  const after = await doctorAgentOS({ cwd: root, json: true });
  assert.ok(!after.problems.some((problem) => /Unsafe repository ID/.test(problem)), 'the unsafe-ID problem is gone');
  assert.equal(after.migration.repoIds.length, 0);
});

test('normalization moves an existing repo note when the unsafe ID has one', async t => {
  const root = await workspace(t);
  await makeUnsafeRepoId(root);
  const noteBody = '# Frontend Client\n\nHand-written scope notes.\n';
  await setRepoNotes(root, { 'frontend_client.md': noteBody });

  const result = await normalizeRepoIdsAgentOS({ cwd: root });

  assert.equal(result.ok, true, result.text);
  assert.equal(await exists(join(root, '.agentos/repos/frontend_client.md')), false);
  assert.equal(await readFile(join(root, '.agentos/repos/frontend-client.md'), 'utf8'), noteBody, 'note bytes are preserved');
});

test('normalization refuses when both the old and new repo note exist', async t => {
  const root = await workspace(t);
  await makeUnsafeRepoId(root);
  await writeFile(join(root, '.agentos/repos/frontend_client.md'), '# old\n');
  await writeFile(join(root, '.agentos/repos/frontend-client.md'), '# new\n');
  const before = await snapshotTree(root);

  const result = await normalizeRepoIdsAgentOS({ cwd: root });

  assert.equal(result.ok, false);
  assert.match(result.text, /frontend_client\.md/);
  assert.match(result.text, /frontend-client\.md/);
  assert.deepEqual(await snapshotTree(root), before, 'refusal must leave every byte unchanged');
});

test('normalization refuses a flow-style repos mapping instead of rewriting it badly', async t => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/project.yaml'), 'name: flow-demo\nworkspace_kind: single-repo\nrepos: {frontend_client: {path: .}}\n');
  const before = await snapshotTree(root);

  const result = await normalizeRepoIdsAgentOS({ cwd: root });

  assert.equal(result.ok, false);
  assert.match(result.text, /flow-style|by hand/i);
  assert.deepEqual(await snapshotTree(root), before);
});

test('normalization is a no-op on a canonical workspace and writes no run note', async t => {
  const root = await workspace(t);
  const before = await snapshotTree(root);

  const result = await normalizeRepoIdsAgentOS({ cwd: root });

  assert.equal(result.ok, true);
  assert.match(result.text, /nothing to do|No unsafe repository IDs/i);
  assert.deepEqual(await snapshotTree(root), before);
  assert.equal((await readdir(join(root, '.agentos/runs'))).some((name) => /repo-id-migration\.md$/.test(name)), false);
});

test('CLI requires --fix alongside --normalize-repo-ids', async t => {
  const root = await workspace(t);
  await makeUnsafeRepoId(root);

  const refused = await execFileAsync('node', [CLI, 'doctor', '--normalize-repo-ids'], { cwd: root }).catch((error) => error);
  assert.equal(refused.code, 1);
  assert.match(refused.stdout, /--fix/);

  const dry = await execFileAsync('node', [CLI, 'doctor', '--fix', '--normalize-repo-ids', '--dry-run'], { cwd: root });
  assert.match(dry.stdout, /DRY RUN/);
  assert.match(await readFile(join(root, '.agentos/project.yaml'), 'utf8'), /frontend_client/, 'dry run through the CLI must not write');

  const applied = await execFileAsync('node', [CLI, 'doctor', '--fix', '--normalize-repo-ids'], { cwd: root });
  assert.match(applied.stdout, /frontend_client -> frontend-client/);
  assert.match(await readFile(join(root, '.agentos/project.yaml'), 'utf8'), /frontend-client:/);
});

test('a stale adapter after normalization is repaired by the normal doctor --fix flow', async t => {
  const root = await workspace(t);
  await makeUnsafeRepoId(root);
  await normalizeRepoIdsAgentOS({ cwd: root });

  const stale = await doctorAgentOS({ cwd: root, json: true });
  assert.ok(stale.problems.some((problem) => /managed block is stale/.test(problem)), 'AGENTS.md now names the old repo ID and must be refreshed');

  await doctorAgentOS({ cwd: root, fix: true });
  const repaired = await doctorAgentOS({ cwd: root, json: true });
  assert.equal(repaired.ok, true, `expected a clean workspace, got: ${repaired.problems.join(' | ')}`);
  assert.match(await readFile(join(root, 'AGENTS.md'), 'utf8'), /frontend-client/);
});

// --- review regressions: F1 (unsafe IDs) and F2 (missing boundary preflight) --

test('repo IDs that are not path-safe or that inject markup stay a hard error and never touch files outside the workspace', async t => {
  const base = await mkdtemp(join(tmpdir(), 'agentos-repoid-unsafe-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'workspace');
  await mkdir(root);
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });

  for (const [id, why] of UNSAFE_REPO_IDS) {
    // A victim file outside the workspace, at the path a traversal-style ID
    // would resolve to for the repo note.
    await writeFile(join(base, 'victim.md'), 'do not touch or delete me\n');
    // Single-quoted YAML so every ID reaches AgentOS validation literally
    // (double quotes would turn `web\other` into a YAML escape error instead).
    await writeFile(join(root, '.agentos/project.yaml'), `name: unsafe-id-demo\nworkspace_kind: single-repo\nrepos:\n  '${id}':\n    path: .\n`);
    const before = await snapshotTree(base);

    const doctor = await doctorAgentOS({ cwd: root, json: true }).catch((error) => ({ problems: [error.message] }));
    const fix = await doctorAgentOS({ cwd: root, fix: true, json: true }).catch((error) => ({ problems: [error.message] }));
    const normalize = await normalizeRepoIdsAgentOS({ cwd: root }).catch((error) => ({ ok: false, text: error.message }));
    const cli = await execFileAsync('node', [CLI, 'doctor', '--fix'], { cwd: root }).catch((error) => error);

    assert.ok(doctor.problems.some((problem) => /Unsafe repository ID/.test(problem)), `${id} (${why}) must be reported as unsafe`);
    assert.equal(fix.problems.length > 0, true, `${id} (${why}) must not be repairable`);
    assert.equal(normalize.ok, false, `${id} (${why}) must not be normalized`);
    assert.notEqual(cli.code, 0, `${id} (${why}) must fail through the CLI too`);
    assert.deepEqual(await snapshotTree(base), before, `${id} (${why}) must leave every byte - inside and outside the workspace - unchanged`);
  }
});

test('normalization refuses when a managed path inside .agentos is a symlink outside the workspace', async t => {
  const base = await mkdtemp(join(tmpdir(), 'agentos-repoid-symlink-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'workspace');
  const outside = join(base, 'outside');
  await mkdir(root);
  await mkdir(outside);
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  await makeUnsafeRepoId(root);

  // Move the repo notes outside the workspace and link the managed directory.
  const notes = join(root, '.agentos/repos');
  for (const name of await readdir(notes)) await rm(join(notes, name), { recursive: true, force: true });
  await rm(notes, { recursive: true, force: true });
  await writeFile(join(outside, 'frontend_client.md'), 'outside note\n');
  await symlink(outside, notes);
  const before = await snapshotTree(base);

  const result = await normalizeRepoIdsAgentOS({ cwd: root }).catch((error) => ({ ok: false, text: error.message }));

  assert.equal(result.ok, false, 'a symlinked managed directory must be refused');
  assert.equal(await exists(join(outside, 'frontend-client.md')), false, 'nothing may be written outside the workspace');
  assert.equal(await exists(join(outside, 'frontend_client.md')), true, 'nothing outside may be removed');
  assert.deepEqual(await snapshotTree(base), before);
});
