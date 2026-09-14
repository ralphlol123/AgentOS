import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, lstat, readlink, rm, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initAgentOS, skillsAgentOS, templatesAgentOS, __setAtomicWriteFaultForTests, __clearAtomicWriteFaultForTests } from '../dist/core.js';
import { withWorkspaceWriter } from '../dist/workspace-lock.js';

const dir = '.agentos/skills/core/code-review';
const ref = `${dir}/references/security-review.md`;
const install = (root, via, options = {}) => via === 'add'
  ? skillsAgentOS({ cwd: root, add: 'debugging,code-review', ...options })
  : templatesAgentOS({ cwd: root, command: 'copy', id: 'skill:core/code-review', ...options });
async function fixture(t) {
  const parent = await mkdtemp(join(tmpdir(), 'agentos-refs-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'workspace');
  await mkdir(root);
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  return { parent, root };
}
async function snapshot(root) {
  const result = [];
  async function visit(path, rel = '') {
    const info = await lstat(path);
    if (info.isSymbolicLink()) result.push([rel, 'link', await readlink(path)]);
    else if (info.isDirectory()) {
      result.push([rel, 'dir', info.mode]);
      for (const name of (await readdir(path)).sort()) await visit(join(path, name), `${rel}/${name}`);
    } else result.push([rel, 'file', info.mode, (await readFile(path)).toString('base64')]);
  }
  await visit(root);
  return result;
}

test('installed inventory does not call missing or customized references source-match', async t => {
  const { root } = await fixture(t);
  await install(root, 'add');
  const state = async () => (await skillsAgentOS({ cwd: root, list: true, installed: true })).entries.find(e => e.id === 'code-review').state;
  assert.equal(await state(), 'source-match');
  await writeFile(join(root, ref), 'Custom reference\n');
  assert.equal(await state(), 'custom-or-imported');
  await rm(join(root, ref));
  assert.equal(await state(), 'custom-or-imported');
});

for (const via of ['add', 'copy']) {
  test(`${via}: preview includes references and writes nothing`, async t => {
    const { parent, root } = await fixture(t);
    const before = await snapshot(parent);
    const result = await install(root, via, { dryRun: true });
    assert.equal(result.ok, true);
    assert.match(result.text, /references\/security-review.md/);
    assert.deepEqual(await snapshot(parent), before);
  });
  test(`${via}: orphan custom reference blocks the entire install until explicit replacement`, async t => {
    const { parent, root } = await fixture(t);
    await mkdir(join(root, dir, 'references'), { recursive: true });
    await writeFile(join(root, ref), Buffer.from([0xff, 0, 42]));
    await chmod(join(root, ref), 0o640);
    await writeFile(join(root, dir, 'references/owner.md'), 'Owner-only reference\n');
    const before = await snapshot(parent);
    for (const dryRun of [true, false]) {
      await assert.rejects(() => install(root, via, { dryRun }), /--replace/);
      assert.deepEqual(await snapshot(parent), before);
    }
    assert.equal((await install(root, via, { replace: true })).ok, true);
    assert.deepEqual(await readFile(join(root, ref)), await readFile(new URL('../templates/skills/core/code-review/references/security-review.md', import.meta.url)));
    assert.equal(await readFile(join(root, dir, 'references/owner.md'), 'utf8'), 'Owner-only reference\n');
    assert.equal((await lstat(join(root, ref))).mode & 0o777, 0o640);
  });
  for (const existing of [false, true]) for (const failing of [ref, '.agentos/skills.md']) {
    test(`${via}: rollback ${existing ? 'replacement' : 'new install'} on ${failing}`, async t => {
      const { parent, root } = await fixture(t);
      if (existing) {
        await install(root, via);
        await writeFile(join(root, dir, 'SKILL.md'), 'Custom card\n');
        await writeFile(join(root, ref), 'Custom reference\n');
        await chmod(join(root, ref), 0o640);
        await writeFile(join(root, dir, 'references/owner.md'), 'Owner-only\n');
      }
      const before = await snapshot(parent);
      __setAtomicWriteFaultForTests(join(root, failing), 'before-rename');
      t.after(__clearAtomicWriteFaultForTests);
      await assert.rejects(() => install(root, via, { replace: true }), /Injected atomic-write test fault/);
      assert.deepEqual(await snapshot(parent), before, 'bytes, modes, directories and temp artifacts must all roll back');
    });
  }
  for (const target of [`${dir}/references`, ref]) for (const dangling of [false, true]) {
    test(`${via}: rejects ${dangling ? 'dangling' : 'outside'} symlink at ${target}`, async t => {
      const { parent, root } = await fixture(t);
      const outside = join(parent, 'outside');
      await mkdir(outside);
      await writeFile(join(outside, 'sentinel'), 'Protected\n');
      const destination = dangling ? join(outside, 'absent') : target === ref ? join(outside, 'sentinel') : outside;
      await mkdir(join(root, target, '..'), { recursive: true });
      await symlink(destination, join(root, target));
      const before = await snapshot(parent);
      for (const dryRun of [true, false]) {
        await assert.rejects(() => install(root, via, { replace: true, dryRun }), /symlink/i);
        assert.deepEqual(await snapshot(parent), before);
      }
    });
  }
  test(`${via}: cooperates with existing writer locks`, async t => {
    const { root } = await fixture(t);
    await withWorkspaceWriter(root, async () => {
      const before = await snapshot(root);
      const args = via === 'add' ? ['skills', 'add', 'code-review'] : ['templates', 'copy', 'skill:core/code-review'];
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), ...args], { cwd: root, encoding: 'utf8' });
      assert.ifError(result.error);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /writer lock exists/);
      assert.deepEqual(await snapshot(root), before);
    });
  });
  test(`${via}: removal rolls back references on failure then removes only the local skill`, async t => {
    const { parent, root } = await fixture(t);
    await install(root, via);
    assert.ok((await readFile(join(root, ref))).length);
    await chmod(join(root, ref), 0o640);
    for (const native of ['.claude', '.opencode']) {
      await mkdir(join(root, native, 'skills/code-review/references'), { recursive: true });
      await writeFile(join(root, native, 'skills/code-review/references/security-review.md'), 'Native copy\n');
    }
    const before = await snapshot(parent);
    await skillsAgentOS({ cwd: root, remove: 'code-review', dryRun: true });
    assert.deepEqual(await snapshot(parent), before);
    __setAtomicWriteFaultForTests(join(root, '.agentos/skills.md'), 'before-rename');
    t.after(__clearAtomicWriteFaultForTests);
    await assert.rejects(() => skillsAgentOS({ cwd: root, remove: 'code-review' }), /Injected atomic-write test fault/);
    assert.deepEqual(await snapshot(parent), before);
    await skillsAgentOS({ cwd: root, remove: 'code-review' });
    await assert.rejects(() => lstat(join(root, dir)), { code: 'ENOENT' });
    assert.doesNotMatch(await readFile(join(root, '.agentos/skills.md'), 'utf8'), /code-review —|Details: .*code-review\/SKILL.md/);
    for (const native of ['.claude', '.opencode']) assert.equal(await readFile(join(root, native, 'skills/code-review/references/security-review.md'), 'utf8'), 'Native copy\n');
  });
}
