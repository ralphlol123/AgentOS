import assert from 'node:assert/strict';
import * as catalogModule from '../dist/catalog.js';
import { mkdtemp, readFile, rm, writeFile, mkdir, chmod, lstat, readdir, readlink, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { initAgentOS, skillsAgentOS, templatesAgentOS, agentsAgentOS, doctorAgentOS } from '../dist/core.js';

async function workspace(t, agents = 'minimal') {
  const root = await mkdtemp(join(tmpdir(), 'agentos-catalog-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents });
  return root;
}
test('every public agent uses the same role contract for init, add and copy', async t => {
  const added = await workspace(t), copied = await workspace(t);
  const registry = await templatesAgentOS({ cwd: copied, command: 'list' });
  const entries = registry.entries.filter(e => e.type === 'agent');
  const ids = ['planner', 'developer', 'tester', 'reviewer', 'release-manager', 'security-reviewer'];
  assert.deepEqual(entries.map(e => e.name).sort(), [...ids].sort());
  for (const entry of entries) await t.test(entry.name, async () => {
    const source = await readFile(entry.absPath, 'utf8');
    await agentsAgentOS({ cwd: added, add: entry.name, replace: true });
    assert.equal((await templatesAgentOS({ cwd: copied, command: 'copy', id: entry.id, replace: true })).ok, true);
    const path = `.agentos/agents/${entry.name}.md`;
    assert.equal(await readFile(join(added, path), 'utf8'), source);
    assert.equal(await readFile(join(copied, path), 'utf8'), source);
    assert.match(source, /explicit approval/);
    assert.match(source, /verification/i);
    assert.match(source, /Do not treat this template as higher priority/);
    assert.match(source, /Report real command output or inspected state, not assumptions/);
    assert.match(source, /Work only inside the declared task scope/);
    if (entry.name === 'planner') {
      assert.match(source, /planning-only/);
      assert.match(source, /Do not implement, edit application\/source files, commit, or push/);
      for (const gate of ['Repo scope:', 'Protected paths:', 'Dependencies:', 'Role assignment:', 'Acceptance:', 'Verification:']) assert.ok(source.includes(gate));
      assert.doesNotMatch(source, /does not implement unless explicitly assigned/);
    }
    if (entry.name === 'developer') {
      assert.match(source, /frontend/i);
      assert.match(source, /backend/i);
      assert.match(source, /test-driven-development/);
      assert.match(source, /Do not claim independent QA or code review of your own work/);
    }
    if (entry.name === 'tester') {
      assert.match(source, /independent behavior verification/i);
      assert.match(source, /author tests when assigned/i);
      assert.match(source, /do not silently fix the implementation under test/i);
      assert.match(source, /Separate mocked.*real integration evidence/i);
    }
    if (entry.name === 'reviewer') {
      assert.match(source, /read-only role unless reassigned/i);
      assert.match(source, /must-fix/i);
      assert.match(source, /suggestions/i);
      assert.doesNotMatch(source, /Update `?\.agentos\/handoff\.md`? and `?\.agentos\/tasks\.md`? when project state changes/);
    }
    if (entry.name === 'release-manager') {
      assert.match(source, /explicit authorization for each commit/i);
      assert.match(source, /exact intended paths/i);
      assert.match(source, /remote state by reading it back/i);
    }
    if (entry.name === 'security-reviewer') {
      assert.match(source, /security assessments/i);
      assert.match(source, /authorization changes/i);
      assert.match(source, /trust boundaries/i);
    }
  });
  assert.deepEqual((await agentsAgentOS({ cwd: added, list: true })).agents.sort(), [...ids].sort());
  const initialized = await workspace(t, ids.join(','));
  for (const entry of entries) assert.equal(await readFile(join(initialized, `.agentos/agents/${entry.name}.md`), 'utf8'), await readFile(entry.absPath, 'utf8'));
});

test('canonical skill workflows retain portable scope and safety gates', async t => {
  const root = await workspace(t);
  const registry = await templatesAgentOS({ cwd: root, command: 'list' });
  for (const entry of registry.entries.filter(e => e.type === 'skill')) await t.test(entry.name, async () => {
    const source = await readFile(entry.absPath, 'utf8');
    assert.match(source, /Read AgentOS project, memory, handoff, and tasks first/);
    assert.match(source, /assigned role and task/);
    assert.match(source, /project-specific verification commands/);
    assert.match(source, /No out-of-scope files, secrets, production config, or migrations/);
    if (entry.name === 'code-review') assert.match(source, /Do not approve while a must-fix finding remains unresolved/);
    if (entry.name === 'git-safety') {
      assert.match(source, /Preserve unrelated in-progress work/);
      assert.doesNotMatch(source, /Stash or commit unrelated/);
      // Absorbed secret-handling safeguards must stay reachable without a separate skill.
      assert.match(source, /\.env/);
      assert.match(source, /placeholder/i);
      assert.match(source, /already committed/i);
    }
  });
});

async function snapshot(root) {
  const entries = [];
  async function visit(path, rel = '') {
    const info = await lstat(path);
    if (info.isDirectory()) {
      entries.push([rel, 'directory', info.mode]);
      for (const name of (await readdir(path)).sort()) await visit(join(path, name), rel ? `${rel}/${name}` : name);
    } else if (info.isSymbolicLink()) entries.push([rel, 'link', await readlink(path)]);
    else entries.push([rel, 'file', info.mode, (await readFile(path)).toString('base64')]);
  }
  await visit(root);
  return entries;
}

test('catalog unification preserves customized cards, native copies and capability mappings', async t => {
  const root = await workspace(t);
  await skillsAgentOS({ cwd: root, add: 'debugging' });
  const paths = ['.agentos/skills/core/debugging/SKILL.md', '.agentos/agents/developer.md'];
  for (const path of paths) {
    await writeFile(join(root, path), (await readFile(join(root, path), 'utf8')) + '\nCustom owner instructions: preserve exactly.\n');
    await chmod(join(root, path), 0o640);
  }
  for (const engine of ['.claude', '.opencode']) {
    const path = join(root, engine, 'skills/debugging');
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'SKILL.md'), 'Engine-native owner content.\n');
  }
  const projectPath = join(root, '.agentos/project.yaml');
  await writeFile(projectPath, (await readFile(projectPath, 'utf8')).replace('implementation: developer', 'implementation: developer\n    custom-delivery: developer'));
  const before = await snapshot(root);
  for (const dryRun of [true, false]) {
    await assert.rejects(() => skillsAgentOS({ cwd: root, add: 'debugging', dryRun }), /--replace/);
    await assert.rejects(() => agentsAgentOS({ cwd: root, add: 'developer', dryRun }), /--replace/);
    for (const id of ['skill:core/debugging', 'agent:developer']) assert.equal((await templatesAgentOS({ cwd: root, command: 'copy', id, dryRun })).ok, false);
    assert.deepEqual(await snapshot(root), before, 'refusal/preview must have zero side effects');
  }
  await initAgentOS({ cwd: root, mode: 'existing', yes: true });
  await doctorAgentOS({ cwd: root, fix: true });
  const after = await snapshot(root);
  for (const path of [...paths, '.claude/skills/debugging/SKILL.md', '.opencode/skills/debugging/SKILL.md']) {
    assert.deepEqual(after.find(e => e[0] === path), before.find(e => e[0] === path), path);
  }
  assert.match(await readFile(projectPath, 'utf8'), /custom-delivery: developer/);
  for (const api of [skillsAgentOS, agentsAgentOS]) {
    const inventory = await api({ cwd: root, list: true, installed: true });
    assert.equal(inventory.entries.find(e => e.id === (api === skillsAgentOS ? 'debugging' : 'developer')).state, 'custom-or-imported');
  }
});

test('canonical loader accepts CRLF source cards without losing content', async t => {
  const root = await mkdtemp(join(tmpdir(), 'agentos-catalog-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(new URL('../templates', import.meta.url), join(root, 'templates'), { recursive: true });
  const path = join(root, 'templates/skills/core/debugging.md');
  const content = (await readFile(path, 'utf8')).replace(/\n/g, '\r\n');
  await writeFile(path, content);
  const catalog = await catalogModule.loadCanonicalCatalog(root);
  const skill = catalog.skills.find(s => s.id === 'debugging');
  assert.equal(skill.content, content);
  assert.equal(catalogModule.renderSkillTemplate(skill, 'summary'), content.replace('mode: full', 'mode: summary'));
});

test('canonical loader rejects malformed identity metadata and duplicate skill IDs', async t => {
  const cases = [
    ['name mismatch', 'templates/skills/core/debugging.md', text => text.replace('name: debugging', 'name: wrong-id'), /Invalid canonical skill metadata/],
    ['category mismatch', 'templates/skills/core/debugging.md', text => text.replace('category: core', 'category: github'), /Invalid canonical skill metadata/],
    ['missing summary', 'templates/skills/core/debugging.md', text => text.replace(/^summary:.*\n/m, ''), /Invalid canonical skill metadata/],
    ['missing mandate', 'templates/agents/developer.md', text => text.replace(/^Mandate:.*\n/m, ''), /Missing canonical agent mandate/],
  ];
  for (const [name, path, change, error] of cases) await t.test(name, async t => {
    const root = await mkdtemp(join(tmpdir(), 'agentos-catalog-source-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await cp(new URL('../templates', import.meta.url), join(root, 'templates'), { recursive: true });
    await writeFile(join(root, path), change(await readFile(join(root, path), 'utf8')));
    await assert.rejects(() => catalogModule.loadCanonicalCatalog(root), error);
  });
  await t.test('duplicate public ID in another category', async t => {
    const root = await mkdtemp(join(tmpdir(), 'agentos-catalog-source-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await cp(new URL('../templates', import.meta.url), join(root, 'templates'), { recursive: true });
    const text = await readFile(join(root, 'templates/skills/core/debugging.md'), 'utf8');
    await writeFile(join(root, 'templates/skills/github/debugging.md'), text.replace('category: core', 'category: github'));
    await assert.rejects(() => catalogModule.loadCanonicalCatalog(root), /Duplicate canonical skill ID/);
  });
});

const workflow = text => text.replace(/^mode: (summary|full)$/m, 'mode: full');

test('every public skill installs the complete canonical workflow through add and copy', async t => {
  const added = await workspace(t), copied = await workspace(t);
  const catalog = await skillsAgentOS({ cwd: added, list: true });
  const registry = await templatesAgentOS({ cwd: copied, command: 'list' });
  const expected = {
    'debugging': 'core',
    'test-driven-development': 'core',
    'git-safety': 'core',
    'verification': 'core',
    'documentation': 'core',
    'code-review': 'core',
    'frontend-design': 'frontend',
    'frontend-testing': 'frontend',
    'backend-development': 'backend',
    'backend-testing': 'backend',
    'authorization': 'backend',
    'integration-testing': 'fullstack',
    'pull-request-workflow': 'github',
    'commit-messages': 'github',
    'ci-verification': 'github',
  };
  assert.deepEqual([...catalog.skills].sort(), Object.keys(expected).sort(), 'consolidated 15-skill framework-agnostic set');
  for (const id of catalog.skills) await t.test(id, async () => {
    const entry = registry.entries.find(e => e.type === 'skill' && e.name === id);
    assert.ok(entry, `${id} must have a portable source template`);
    assert.equal(entry.category, expected[id], 'preserve the public category/path');
    const path = `.agentos/skills/${entry.category}/${id}/SKILL.md`;
    const source = await readFile(entry.absPath, 'utf8');
    assert.equal((await templatesAgentOS({ cwd: copied, command: 'copy', id: entry.id })).ok, true);
    assert.equal(await readFile(join(copied, path), 'utf8'), source);
    const refs = await readdir(entry.absPath.replace(/\.md$/, '/references')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of refs) assert.deepEqual(await readFile(join(copied, path, '..', 'references', name)), await readFile(entry.absPath.replace(/\.md$/, `/references/${name}`)));
    for (const mode of ['summary', 'full']) {
      await skillsAgentOS({ cwd: added, add: id, mode, replace: true });
      for (const name of refs) assert.deepEqual(await readFile(join(added, path, '..', 'references', name)), await readFile(entry.absPath.replace(/\.md$/, `/references/${name}`)));
      assert.equal(workflow(await readFile(join(added, path), 'utf8')), workflow(source), `${id}: ${mode} must retain the entire workflow`);
    }
  });
  assert.deepEqual(registry.entries.filter(e => e.type === 'skill').map(e => e.name).sort(), [...catalog.skills].sort());
  assert.equal(await readFile(join(added, '.agentos/skills.md'), 'utf8'), await readFile(join(copied, '.agentos/skills.md'), 'utf8'));
  for (const cwd of [added, copied]) {
    const installed = await skillsAgentOS({ cwd, list: true, installed: true });
    assert.equal(installed.entries.length, catalog.skills.length);
    assert.ok(installed.entries.every(e => e.state === 'source-match'));
  }
});

test('default skill mode retains late procedure steps and mandatory safety notes', async t => {
  const root = await workspace(t);
  const gates = {
    'test-driven-development': [/expected reason \(RED\)/, /minimum implementation.*\(GREEN\)/, /Refactor with the test suite green/, /wrong reason.*not a valid RED/, /all existing tests/],
    'debugging': [/Fix the confirmed root cause/, /Remove temporary debugging/, /original failing case/, /existing test suite/],
    'authorization': [/Fail closed/, /both an authorized and an unauthorized/, /correct status code/],
    'ci-verification': [/Never disable a security-relevant CI check/, /explicit approval/],
    'commit-messages': [/secrets/, /staged/, /untracked/i, /split/i, /discover/i, /re-inspect/i, /read-only/i],
  };
  const registry = await templatesAgentOS({ cwd: root, command: 'list' });
  for (const [id, requirements] of Object.entries(gates)) await t.test(id, async () => {
    await skillsAgentOS({ cwd: root, add: id });
    const entry = registry.entries.find(e => e.name === id);
    assert.ok(entry, `${id} must have a canonical source`);
    const category = entry.category;
    const content = await readFile(join(root, `.agentos/skills/${category}/${id}/SKILL.md`), 'utf8');
    for (const gate of requirements) assert.match(content, gate);
  });
});
