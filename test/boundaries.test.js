import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, lstat, symlink, rm, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initAgentOS, doctorAgentOS, linkObsidianAgentOS, obsidianAgentOS, skillsAgentOS, templatesAgentOS, compactAgentOS, agentsAgentOS, migrateClaudeAgentOS } from '../dist/core.js';

async function snapshot(dir) {
  const result = {};
  async function walk(path, rel = '') {
    for (const name of (await readdir(path)).sort()) {
      const abs = join(path, name), key = join(rel, name), info = await lstat(abs);
      if (info.isSymbolicLink()) result[key] = ['link', await readlink(abs)];
      else if (info.isDirectory()) { result[key] = ['dir']; await walk(abs, key); }
      else result[key] = ['file', (await readFile(abs)).toString('base64')];
    }
  }
  await walk(dir);
  return result;
}
async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-boundary-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'workspace'), outside = join(base, 'outside');
  await mkdir(root); await mkdir(outside);
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  return { base, root, outside };
}
async function rejectedWithoutChanges(base, action) {
  const before = await snapshot(base);
  let failed = false;
  try { const result = await action(); failed = result.ok === false; }
  catch (error) { assert.match(error.message, /boundary|unsafe|symlink|relative/i); failed = true; }
  assert.equal(failed, true, 'unsafe operation must fail');
  assert.deepEqual(await snapshot(base), before, 'rejection must have zero filesystem side effects');
}

test('boundary: symlinked managed targets fail before writes or deletions', async t => {
  const cases = [
    ['.agentos/skills', root => skillsAgentOS({ cwd: root, add: 'core-pack' })],
    ['.agentos/agents', root => agentsAgentOS({ cwd: root, add: 'planner' })],
    ['.agentos/skills.md', root => templatesAgentOS({ cwd: root, command: 'copy', id: 'skill:core/debugging', replace: true })],
    ['.agentos/runs', root => compactAgentOS({ cwd: root })],
    ['AGENTS.md', root => doctorAgentOS({ cwd: root, fix: true })],
  ];
  for (const [target, action] of cases) {
    const { base, root, outside } = await fixture(t);
    const file = target.endsWith('.md');
    const dest = join(outside, file ? 'sentinel.md' : 'data');
    if (file) await writeFile(dest, 'protected'); else await mkdir(dest);
    await rm(join(root, target), { recursive: true, force: true });
    await symlink(dest, join(root, target));
    await rejectedWithoutChanges(base, () => action(root));
  }
});

test('boundary: Obsidian rejects raw escapes and symlink destinations without partial writes', async t => {
  for (const command of ['legacy', 'workspace']) {
    for (const dest of ['../outside', '/absolute', 'C:/outside', 'escape/new']) {
      const { base, root, outside } = await fixture(t);
      const vault = join(base, 'vault'); await mkdir(vault);
      await symlink(outside, join(vault, 'escape'));
      const options = { cwd: root, vault, dest, create: true };
      await rejectedWithoutChanges(base, () => command === 'legacy'
        ? linkObsidianAgentOS(options)
        : obsidianAgentOS({ ...options, command: 'link-workspace' }));
    }
  }
});

test('boundary: init and migration reject symlink targets before creating files', async t => {
  for (const mode of ['init', 'migrate']) {
    const { base, root, outside } = await fixture(t);
    const target = mode === 'init' ? '.agentos' : '.claude';
    await rm(join(root, target), { recursive: true, force: true });
    await symlink(outside, join(root, target));
    await rejectedWithoutChanges(base, () => mode === 'init'
      ? initAgentOS({ cwd: root, mode: 'new', yes: true })
      : migrateClaudeAgentOS({ cwd: root, preserve: true }));
  }
});

test('boundary: dangling links, nested repository links, and backup links are rejected', async t => {
  for (const target of ['.agentos/knowledge.md', 'AGENTS.md.agentos.bak', 'child/AGENTS.md', 'child/.gitignore', 'child']) {
    const { base, root, outside } = await fixture(t);
    await mkdir(join(root, 'child'));
    await writeFile(join(root, '.agentos/project.yaml'), 'name: test\nrepos:\n  child:\n    path: ./child\n');
    await rm(join(root, target), { recursive: true, force: true });
    await symlink(join(outside, 'missing'), join(root, target));
    await rejectedWithoutChanges(base, () => doctorAgentOS({ cwd: root, fix: true }));
  }
});

test('boundary: imports and skill removal reject linked storage with no changes', async t => {
  for (const mode of ['import', 'remove']) {
    const { base, root, outside } = await fixture(t);
    await skillsAgentOS({ cwd: root, add: 'debugging' });
    const source = join(base, 'source.md'); await writeFile(source, '# Example\nSafe reusable instructions.\n');
    const target = mode === 'import' ? '.agentos/imports' : '.agentos/skills/core/debugging';
    await rm(join(root, target), { recursive: true, force: true });
    await symlink(outside, join(root, target));
    await rejectedWithoutChanges(base, () => mode === 'import'
      ? templatesAgentOS({ cwd: root, command: 'import', source, type: 'skill', name: 'example', yes: true })
      : skillsAgentOS({ cwd: root, remove: 'debugging' }));
  }
});

test('boundary: linked notes stay in declared boundary and valid nested destinations work', async t => {
  const { base, root } = await fixture(t);
  const vault = join(base, 'vault'); await mkdir(vault);
  for (const link of ['../outside.md', '/outside.md', 'C:/outside.md']) {
    await rejectedWithoutChanges(base, () => linkObsidianAgentOS({ cwd: root, vault, dest: 'Projects/Test', link, create: true }));
  }
  await rejectedWithoutChanges(base, () => obsidianAgentOS({ cwd: root, command: 'link-workspace', vault, dest: 'Projects/Test', linked: ['Projects/Other/note.md'], create: true }));
  const result = await obsidianAgentOS({ cwd: root, command: 'link-workspace', vault, dest: 'Projects/Test', create: true });
  assert.equal(result.ok, true);
  assert.deepEqual(await readdir(join(vault, 'Projects/Test')), []);
  // Legacy explicit vault-relative note allowlists remain supported.
  const legacy = await linkObsidianAgentOS({ cwd: root, vault, dest: 'Projects/Test', link: 'Reference/note.md', create: true });
  assert.equal(legacy.ok, true);
  assert.match(await readFile(join(vault, 'Reference/note.md'), 'utf8'), /# note/);
});

test('boundary: dangling local root never falls back to an ancestor workspace', async t => {
  const { base, root, outside } = await fixture(t);
  const child = join(root, 'child'); await mkdir(child);
  await symlink(join(outside, 'missing'), join(child, '.agentos'));
  await rejectedWithoutChanges(base, () => compactAgentOS({ cwd: child }));
});

test('boundary: quoted absolute Obsidian tokens are rejected rather than repaired', async t => {
  const { base, root } = await fixture(t);
  const vault = join(base, 'vault'); await mkdir(vault);
  await rejectedWithoutChanges(base, () => obsidianAgentOS({ cwd: root, command: 'link-workspace', vault, dest: '"/absolute"', create: true }));
});

test('boundary: migration preserves unrelated native skill links', async t => {
  const { root, outside } = await fixture(t);
  await mkdir(join(root, '.claude/skills'), { recursive: true });
  await symlink(outside, join(root, '.claude/skills/example'));
  const result = await migrateClaudeAgentOS({ cwd: root, preserve: true });
  assert.equal(result.ok, true);
  assert.equal(await readlink(join(root, '.claude/skills/example')), outside);
});

test('boundary: doctor rejects escaping repository paths before any repair', async t => {
  for (const path of ['../outside', '/tmp/agentos-absolute-escape', 'C:\\outside']) {
    const { base, root } = await fixture(t);
    const config = join(root, '.agentos/project.yaml');
    await writeFile(config, `name: test\nrepos:\n  external:\n    path: ${JSON.stringify(path)}\n`);
    await writeFile(join(root, 'AGENTS.md'), 'stale adapter');
    await rejectedWithoutChanges(base, () => doctorAgentOS({ cwd: root, fix: true }));
  }
});
