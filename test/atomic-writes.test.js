import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, stat, writeFile, chmod, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { test } from 'node:test';
import { writeFileAtomic, __setAtomicWriteFaultForTests, __clearAtomicWriteFaultForTests } from '../dist/core.js';

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'agentos-atomic-'));
  t.after(async () => {
    await chmod(dir, 0o755).catch(() => {});
    const { rm } = await import('node:fs/promises');
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function siblingArtifacts(dir, targetBasename) {
  const names = await readdir(dir);
  return names.filter((name) => name !== targetBasename && name.includes(targetBasename));
}

test('writeFileAtomic writes via a uniquely named temp file in the same directory and leaves no artifact behind', async (t) => {
  const dir = await tempDir(t);
  const target = join(dir, 'handoff.md');
  let capturedTmpPath;
  __setAtomicWriteFaultForTests(target, 'before-rename', ({ tmpPath }) => { capturedTmpPath = tmpPath; });
  t.after(__clearAtomicWriteFaultForTests);

  await assert.rejects(() => writeFileAtomic(target, '# Handoff\n'), /Injected atomic-write test fault/);

  assert.equal(dirname(capturedTmpPath), dir, 'temp file must be created in the same directory as the destination');
  assert.notEqual(capturedTmpPath, target, 'temp file must not be the destination path itself');
  assert.equal(await exists(capturedTmpPath), false, 'temp file must be removed after a failed rename');
  assert.equal(await exists(target), false, 'destination must not be created when the rename never happens');
  assert.deepEqual(await siblingArtifacts(dir, 'handoff.md'), [], 'no leftover atomic-write artifacts should remain in the directory');
});

test('writeFileAtomic replaces content correctly and preserves the existing file mode', async (t) => {
  const dir = await tempDir(t);
  const target = join(dir, 'tasks.md');
  await writeFile(target, '# Tasks\n\nold\n', 'utf8');
  await chmod(target, 0o640);

  await writeFileAtomic(target, '# Tasks\n\nnew\n');

  assert.equal(await readFile(target, 'utf8'), '# Tasks\n\nnew\n');
  const mode = (await stat(target)).mode & 0o777;
  assert.equal(mode, 0o640, 'replacing an existing file should preserve its mode');
  assert.deepEqual(await siblingArtifacts(dir, 'tasks.md'), [], 'no leftover atomic-write artifacts should remain after a successful write');
});

test('writeFileAtomic creates a brand-new file with default permissions and no leftover artifacts', async (t) => {
  const dir = await tempDir(t);
  const target = join(dir, 'skills.md');

  await writeFileAtomic(target, '# Skills\n');

  assert.equal(await readFile(target, 'utf8'), '# Skills\n');
  assert.deepEqual(await siblingArtifacts(dir, 'skills.md'), []);
});

test('writeFileAtomic fails closed under a real filesystem permission fault and leaves no partial file', async (t) => {
  const dir = await tempDir(t);
  await chmod(dir, 0o555);
  const target = join(dir, 'knowledge.md');

  await assert.rejects(() => writeFileAtomic(target, '# Knowledge\n'), /EACCES/);

  await chmod(dir, 0o755);
  assert.equal(await exists(target), false, 'destination must not exist when directory permissions block temp-file creation');
  assert.deepEqual(await siblingArtifacts(dir, 'knowledge.md'), [], 'no temp artifact should be created when open() itself fails');
});

test('concurrent writeFileAtomic calls to distinct files in the same directory do not collide', async (t) => {
  const dir = await tempDir(t);
  const files = Array.from({ length: 12 }, (_, i) => join(dir, `agent-${i}.md`));

  await Promise.all(files.map((file, i) => writeFileAtomic(file, `# Agent ${i}\n`)));

  for (const [i, file] of files.entries()) {
    assert.equal(await readFile(file, 'utf8'), `# Agent ${i}\n`);
  }
  const leftover = (await readdir(dir)).filter((name) => name.includes('.agentos-tmp-'));
  assert.deepEqual(leftover, []);
});
