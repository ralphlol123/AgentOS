import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { initAgentOS, doctorAgentOS } from '../dist/core.js';

// Repository IDs. A *normalizable* ID is a reported problem, not a parse failure;
// a genuine ambiguity (collision, unsafe path fragment) fails closed with zero
// writes. The rename itself (`doctor --fix --normalize-repo-ids`) was removed in
// 3.0.0: rename by hand, or run it once with 2.x (`npx agentos-for-projects@2`).

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

test('doctor treats a normalizable repo ID as a fixable problem, not a parse failure', async t => {
  const root = await workspace(t);
  await makeUnsafeRepoId(root);

  const result = await doctorAgentOS({ cwd: root, json: true });

  // The adapter inventory only exists when the config parsed, so a non-empty
  // adapter list proves doctor ran the full diagnostic pass instead of bailing
  // out on a config error.
  assert.ok(result.migration.adapters.length >= 3, 'adapter scan must still run');
  assert.ok(result.problems.some((problem) => /Unsafe repository ID 'frontend_client'/.test(problem)), 'the unsafe ID is reported as a problem');
  assert.ok(result.problems.some((problem) => /npx agentos-for-projects@2 doctor --fix --normalize-repo-ids/.test(problem)), 'the problem names the manual rename and the 2.x command');
  const entry = result.migration.repoIds.find((repo) => repo.from === 'frontend_client');
  assert.equal(entry.to, 'frontend-client');
  assert.equal(entry.collides, false);
  assert.match(entry.next, /rename 'frontend_client' to 'frontend-client'.*by hand/);
  assert.equal(result.ok, false, 'doctor still fails while the config is non-canonical');

  const fixed = await doctorAgentOS({ cwd: root, fix: true, json: true });
  assert.equal(fixed.ok, false, 'doctor --fix does not rename repository IDs (removed in 3.0.0)');
  assert.match(await readFile(join(root, '.agentos/project.yaml'), 'utf8'), /frontend_client:/);
});

test('a repo ID collision stays a hard config error and is never auto-resolved', async t => {
  const root = await workspace(t);
  await collisionProject(root);

  const before = await snapshotTree(root);
  const result = await doctorAgentOS({ cwd: root, json: true });

  assert.ok(result.problems.some((problem) => /collide|collision/i.test(problem)), 'doctor must report the collision');
  assert.equal(result.migration.adapters.length, 0, 'adapter scan is skipped while the config is invalid');
  assert.deepEqual(await snapshotTree(root), before, 'a refused config must leave every byte unchanged');
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
    const cli = await execFileAsync('node', [CLI, 'doctor', '--fix'], { cwd: root }).catch((error) => error);

    assert.ok(doctor.problems.some((problem) => /Unsafe repository ID/.test(problem)), `${id} (${why}) must be reported as unsafe`);
    assert.equal(fix.problems.length > 0, true, `${id} (${why}) must not be repairable`);
    assert.notEqual(cli.code, 0, `${id} (${why}) must fail through the CLI too`);
    assert.deepEqual(await snapshotTree(base), before, `${id} (${why}) must leave every byte - inside and outside the workspace - unchanged`);
  }
});
