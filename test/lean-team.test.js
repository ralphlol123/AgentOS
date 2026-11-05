import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm, mkdir, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { initAgentOS, agentsAgentOS, __setAtomicWriteFaultForTests, __clearAtomicWriteFaultForTests } from '../dist/core.js';
import { parseAgentCard, renderCard, validateAgentManifest } from '../dist/agents.js';

async function workspace(t, agents) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-team-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, ...(agents ? { agents } : {}) });
  return root;
}
const read = (root, path) => readFile(join(root, path), 'utf8');
const sync = (root, engine, extra = {}) => agentsAgentOS({ cwd: root, command: 'sync', engine, team: true, ...extra });
const ok = r => assert.equal(r.ok, true, r.text);
async function model(root, id, values) {
  const path = `.agentos/agents/${id}.md`;
  const card = parseAgentCard(id, await read(root, path));
  await writeFile(join(root, path), renderCard({ ...card.manifest, ...values }, card.body));
}

test('new core default and preserved legacy/custom selections', async t => {
  const root = await workspace(t);
  const config = parse(await read(root, '.agentos/project.yaml'));
  assert.deepEqual(config.agents.enabled, ['developer', 'writer', 'researcher']);
  assert.equal(config.agents.capabilities.documentation, 'writer');
  assert.equal(config.agents.capabilities.review, 'developer');
  assert.equal(parseAgentCard('researcher', await read(root, '.agentos/agents/researcher.md')).manifest.permission_intent, 'read-only');
  const legacy = await workspace(t, 'minimal');
  const before = await read(legacy, '.agentos/project.yaml');
  await initAgentOS({ cwd: legacy, mode: 'existing', yes: true, refresh: true });
  assert.equal(await read(legacy, '.agentos/project.yaml'), before);
  assert.deepEqual(parse(before).agents.enabled, ['developer', 'tester', 'reviewer', 'release-manager']);
});

for (const [engine, dir, ext] of [['claude-code', '.claude/agents', 'md'], ['codex', '.codex/agents', 'toml'], ['opencode', '.opencode/agents', 'md']]) {
  test(`${engine}: roles coexist, explicit models, repeat sync, hand-edit protection and disabled-role cleanup`, async t => {
    const root = await workspace(t);
    const chosen = engine === 'opencode' ? 'provider/example-small' : 'example-small';
    await model(root, 'writer', { models: { [engine]: chosen } });
    const before = await read(root, 'AGENTS.md');
    const preview = await sync(root, engine, { dryRun: true }); ok(preview);
    await assert.rejects(read(root, `${dir}/agentos-writer.${ext}`), { code: 'ENOENT' });
    ok(await sync(root, engine));
    assert.equal(await read(root, 'AGENTS.md'), before);
    assert.deepEqual((await readdir(join(root, dir))).sort(), ['developer', 'researcher', 'writer'].map(id => `agentos-${id}.${ext}`));
    const writer = await read(root, `${dir}/agentos-writer.${ext}`);
    if (ext === 'md') assert.equal(parse(writer.split('---\n')[1]).model, chosen);
    else {
      const fields = Object.fromEntries(writer.trim().split('\n').map(line => { const [key, ...value] = line.split(' = '); return [key, JSON.parse(value.join(' = '))]; }));
      assert.equal(fields.model, chosen); assert.match(fields.developer_instructions, /fresh session/);
      assert.equal(fields.name, 'agentos-writer');
    }
    const second = await sync(root, engine); ok(second);
    assert.ok(second.files.every(f => f.action === 'unchanged'));
    await writeFile(join(root, dir, `agentos-writer.${ext}`), writer + '\nOwner edit\n');
    const record = await read(root, `.agentos/synced/team-${engine}.json`);
    assert.equal((await sync(root, engine)).ok, false);
    assert.equal(await read(root, `.agentos/synced/team-${engine}.json`), record);
    ok(await sync(root, engine, { replace: true }));
    assert.equal(await read(root, `${dir}/agentos-writer.${ext}`), writer);
    await writeFile(join(root, dir, 'user-owned.md'), 'Leave me alone');
    const cfg = parse(await read(root, '.agentos/project.yaml'));
    cfg.agents.enabled = ['developer', 'researcher'];
    await writeFile(join(root, '.agentos/project.yaml'), stringify(cfg));
    ok(await sync(root, engine));
    await assert.rejects(read(root, `${dir}/agentos-writer.${ext}`), { code: 'ENOENT' });
    assert.equal(await read(root, `${dir}/user-owned.md`), 'Leave me alone');
  });
}

test('team does not modify legacy task settings, refuses invalid flags and supports real CLI', async t => {
  const root = await workspace(t);
  await mkdir(join(root, '.claude'), { recursive: true });
  const settings = '{"permissions":{"deny":["Write"]}}';
  await writeFile(join(root, '.claude/settings.local.json'), settings);
  const result = spawnSync(process.execPath, [resolve('dist/cli.js'), 'agents', 'sync', 'claude-code', '--team'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /inherits engine\/session model/);
  assert.equal(await read(root, '.claude/settings.local.json'), settings);
  assert.equal((await sync(root, 'codex', { role: 'developer' })).ok, false);
  assert.equal((await sync(root, 'codex', { scope: '.' })).ok, false);
  assert.equal((await sync(root, 'hermes')).ok, false);
});

test('invalid model settings fail validation without writes', async t => {
  const root = await workspace(t);
  const base = parseAgentCard('writer', await read(root, '.agentos/agents/writer.md')).manifest;
  for (const fields of [{ model_preference: 'cheapest' }, { models: [] }, { models: { unknown: 'model' } }, { models: { codex: 'x\nname = bad' } }, { models: { opencode: 'no-provider' } }]) {
    assert.ok(validateAgentManifest({ ...base, ...fields }).length);
  }
  await model(root, 'writer', { models: { codex: 'bad\nmodel' } });
  assert.equal((await sync(root, 'codex')).ok, false);
  await assert.rejects(read(root, '.codex/agents/agentos-developer.toml'), { code: 'ENOENT' });
});

test('team ownership cannot remove unrelated files; symlink escapes refused', async t => {
  const root = await workspace(t);
  ok(await sync(root, 'codex'));
  const path = '.agentos/synced/team-codex.json';
  const record = JSON.parse(await read(root, path));
  record.files[0].path = 'README.md';
  await writeFile(join(root, path), JSON.stringify(record));
  assert.equal((await sync(root, 'codex', { replace: true })).ok, false);
  if (process.platform === 'win32') return;
  const other = await workspace(t);
  await rm(join(other, '.codex'), { recursive: true, force: true });
  await symlink(root, join(other, '.codex'));
  await assert.rejects(sync(other, 'codex'), /symlink|boundary|outside/i);
});

test('team writes roll back when a later file fails', async t => {
  const root = await workspace(t);
  __setAtomicWriteFaultForTests(join(root, '.codex/agents/agentos-writer.toml'), 'before-rename');
  try { await assert.rejects(sync(root, 'codex'), /Injected|injected/); }
  finally { __clearAtomicWriteFaultForTests(); }
  await assert.rejects(read(root, '.codex/agents/agentos-developer.toml'), { code: 'ENOENT' });
  await assert.rejects(read(root, '.agentos/synced/team-codex.json'), { code: 'ENOENT' });
});

test('custom card and model configuration survive init refresh and catalog upgrades', async t => {
  const root = await workspace(t);
  await model(root, 'writer', { model_preference: 'deep', models: { codex: 'configured-model' } });
  const card = parseAgentCard('writer', await read(root, '.agentos/agents/writer.md'));
  const { planCardInstall } = await import('../dist/agents.js');
  const upgraded = planCardInstall('writer', await read(root, '.agentos/agents/writer.md'), card.body + '\nUpdated catalog advice.\n', 'catalog:writer', { catalog: true, replace: false, raw: 'writer' });
  assert.equal(upgraded.action, 'upgrade');
  assert.deepEqual(parseAgentCard('writer', upgraded.content).manifest.models, { codex: 'configured-model' });
  assert.equal(parseAgentCard('writer', upgraded.content).manifest.model_preference, 'deep');
  const custom = renderCard({ ...card.manifest, id: 'project-editor', name: 'Project editor', custom: true }, '# Custom\nOwner instructions.\n');
  await writeFile(join(root, '.agentos/agents/project-editor.md'), custom);
  const cfg = parse(await read(root, '.agentos/project.yaml'));
  cfg.agents.enabled.push('project-editor');
  await writeFile(join(root, '.agentos/project.yaml'), stringify(cfg));
  await initAgentOS({ cwd: root, yes: true, refresh: true });
  assert.equal(await read(root, '.agentos/agents/project-editor.md'), custom);
  ok(await sync(root, 'codex'));
  assert.match(await read(root, '.codex/agents/agentos-project-editor.toml'), /Owner instructions/);
});

test('team rejects missing and legacy cards before writing exports', async t => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/agents/writer.md'), '# Owner legacy writer\n');
  const legacy = await sync(root, 'claude-code');
  assert.equal(legacy.ok, false); assert.match(legacy.text, /validated manifest/);
  await rm(join(root, '.agentos/agents/writer.md'));
  const missing = await sync(root, 'claude-code');
  assert.equal(missing.ok, false); assert.match(missing.text, /Missing card/);
  await assert.rejects(read(root, '.claude/agents/agentos-developer.md'), { code: 'ENOENT' });
});

test('doctor distinguishes OpenCode team definitions from task-scoped permissions', async t => {
  const root = await workspace(t);
  ok(await sync(root, 'opencode'));
  const result = spawnSync(process.execPath, [resolve('dist/cli.js'), 'doctor', '--engines', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const capabilities = JSON.parse(result.stdout).matrix.opencode;
  assert.match(capabilities.native_agent_config.evidence, /agents sync opencode --team/);
  assert.match(capabilities.native_agent_config.evidence, /task-scoped/i);
  assert.equal(capabilities.permission_enforcement.status, 'unsupported');
});
