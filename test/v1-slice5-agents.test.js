// v1 slice 5: agent manifests, lifecycle, engine adapter contract + capability matrix.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS, agentsAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const VERSION = JSON.parse(await readFile(resolve('package.json'), 'utf8')).version;
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTOS_ENGINE: '' } });
const json = (args, cwd) => {
  const r = cli([...args, '--json'], cwd);
  let out;
  try { out = JSON.parse(r.stdout); } catch { throw new Error(`not JSON (exit ${r.status}): ${r.stdout}\n${r.stderr}`); }
  return { r, out };
};
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const fails = (r) => assert.equal(r.status, 1, r.stdout + r.stderr);
const read = (root, rel) => readFile(join(root, rel), 'utf8');
const sha = (text) => createHash('sha256').update(text).digest('hex');
const bodyOf = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '');
const frontOf = (text) => /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
const TEMPLATE = (id) => readFile(resolve(`templates/agents/${id}.md`), 'utf8');
const HANDOFF = '# Handoff\n\n## Current objective\n\nShip the web settings page.\n';

/** Multi-repo fixture: web + backend child repos, minimal team, task_scope edit [web]. */
async function workspace(t, { scope = true } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-v1s5-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  for (const repo of ['web', 'backend']) {
    await mkdir(join(root, repo), { recursive: true });
    await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo, scripts: { test: 'echo t' } }));
  }
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), HANDOFF);
  if (scope) await writeFile(join(root, '.agentos/project.yaml'), `${await read(root, '.agentos/project.yaml')}task_scope:\n  edit: [web]\n`);
  await mkdir(join(base, 'outside'));
  await writeFile(join(base, 'outside/sentinel.md'), 'protected\n');
  return { base, root };
}

async function snapshot(dir) {
  const result = {};
  async function walk(path, rel = '') {
    for (const name of (await readdir(path)).sort()) {
      const abs = join(path, name), key = join(rel, name), info = await lstat(abs);
      if (info.isSymbolicLink()) result[key] = ['link', await readlink(abs)];
      else if (info.isDirectory()) { result[key] = ['dir', info.mode]; await walk(abs, key); }
      else result[key] = ['file', info.mode, (await readFile(abs)).toString('base64')];
    }
  }
  await walk(dir);
  return result;
}

async function withManifest(root, id, patch) {
  const path = join(root, `.agentos/agents/${id}.md`);
  const text = await readFile(path, 'utf8');
  await writeFile(path, text.replace(/\n---\n/, `\n${patch}\n---\n`));
}

// --- E1 manifest -----------------------------------------------------------------------------------

test('agents add developer writes a validated manifest: installed_from catalog:developer, package version, source_hash of the body', async (t) => {
  const { root } = await workspace(t);
  await rm(join(root, '.agentos/agents/developer.md'));
  const before = await snapshot(root);
  ok(cli(['agents', 'add', 'developer', '--dry-run'], root));
  assert.deepEqual(await snapshot(root), before, '--dry-run writes nothing');
  ok(cli(['agents', 'add', 'developer'], root));
  const text = await read(root, '.agentos/agents/developer.md');
  const template = await TEMPLATE('developer');
  assert.equal(bodyOf(text), template, 'body is the catalog card byte for byte');
  const front = frontOf(text);
  assert.match(front, /^id: developer$/m);
  assert.match(front, /^  installed_from: catalog:developer$/m);
  assert.match(front, new RegExp(`^  version: ${VERSION.replace(/\./g, '\\.')}$`, 'm'));
  assert.match(front, new RegExp(`^  source_hash: ${sha(template)}$`, 'm'));
  assert.match(front, /^permission_intent: edit-in-scope$/m);
  assert.match(front, /^custom: false$/m);
  const { r, out } = json(['agents', 'show', 'developer'], root);
  ok(r);
  assert.equal(out.state, 'manifest');
  assert.equal(out.manifest.provenance.installed_from, 'catalog:developer');
  assert.equal(out.modified, false);
  // Re-adding an unmodified card is a no-op.
  const after = await read(root, '.agentos/agents/developer.md');
  const again = cli(['agents', 'add', 'developer'], root);
  ok(again);
  assert.match(again.stdout, /Already installed/);
  assert.equal(await read(root, '.agentos/agents/developer.md'), after);
  // The context role section carries the body, not the YAML.
  const ctx = json(['context', 'claude', '--task', 'settings page'], root);
  ok(ctx.r);
  assert.doesNotMatch(ctx.out.text, /installed_from/);
  assert.match(ctx.out.text, /## Role: developer\nSource: \.agentos\/agents\/developer\.md\nPermission intent: edit-in-scope/);
  const doctor = json(['doctor'], root);
  assert.equal(doctor.out.ok, true, JSON.stringify(doctor.out.problems));
});

test('validateAgentManifest rejects unknown keys and widening intents; the schema file has the same key set', async () => {
  const { validateAgentManifest, MANIFEST_KEYS, MANIFEST_REQUIRED, PERMISSION_INTENTS, PROVENANCE_KEYS, manifestFor, provenanceFor } = await import('../dist/agents.js');
  const good = manifestFor('developer', await TEMPLATE('developer'), provenanceFor('catalog:developer', 'x'), { catalog: true });
  assert.deepEqual(validateAgentManifest(good, 'developer'), []);
  assert.deepEqual(validateAgentManifest({ ...good, provenance: 'unknown', custom: true }, 'developer'), []);
  assert.match(validateAgentManifest({ ...good, sandbox: 'off' }).join(), /unknown manifest key "sandbox"/);
  for (const widening of ['edit-anywhere', 'admin', 'write-all', '']) {
    assert.match(validateAgentManifest({ ...good, permission_intent: widening }).join(), /permission_intent must be one of read-only\|edit-in-scope\|release; a manifest cannot widen/);
  }
  assert.match(validateAgentManifest({ ...good, edit_request: ['../outside'] }).join(), /edit_request entry/);
  assert.match(validateAgentManifest({ ...good, provenance: { ...good.provenance, extra: 1 } }).join(), /unknown provenance key "extra"/);
  assert.match(validateAgentManifest({ ...good, id: 'tester' }, 'developer').join(), /does not match/);
  const { purpose, ...missing } = good;
  assert.match(validateAgentManifest(missing).join(), /missing manifest key "purpose"/);

  const schema = JSON.parse(await readFile(resolve('templates/schemas/agent-manifest.schema.json'), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), [...MANIFEST_KEYS].sort());
  assert.deepEqual([...schema.required].sort(), [...MANIFEST_REQUIRED].sort());
  assert.deepEqual(schema.properties.permission_intent.enum, [...PERMISSION_INTENTS]);
  const provenance = schema.properties.provenance.oneOf.find((option) => option.type === 'object');
  assert.deepEqual(Object.keys(provenance.properties).sort(), [...PROVENANCE_KEYS].sort());
  assert.equal(provenance.additionalProperties, false);
});

test('an invalid manifest is a doctor problem; a legacy card is reported with the command that adds a manifest', async (t) => {
  const { root } = await workspace(t);
  await writeFile(join(root, '.agentos/agents/developer.md'), await TEMPLATE('developer')); // a pre-slice-6 legacy card
  const { out } = json(['doctor'], root);
  assert.ok(out.diagnostics.some((line) => line.includes('legacy agent card .agentos/agents/developer.md has no manifest') && line.includes('agentos agents manifest developer --from-catalog')), out.diagnostics.join('\n'));
  assert.equal(out.ok, true, 'legacy cards are not problems');
  ok(cli(['agents', 'add', 'developer'], root));
  await withManifest(root, 'developer', 'sandbox: off');
  const bad = json(['doctor'], root);
  assert.equal(bad.r.status, 1);
  assert.ok(bad.out.problems.some((line) => /developer\.md: unknown manifest key "sandbox"/.test(line)), bad.out.problems.join('\n'));
});

test('effective edit scope never exceeds the task scope: a card requesting edit of backend under task scope [web] gets [web] and a warning', async (t) => {
  const { root } = await workspace(t);
  ok(cli(['agents', 'add', 'developer'], root));
  await withManifest(root, 'developer', 'edit_request:\n  - backend');
  const { r, out } = json(['context', 'claude', '--task', 'settings page'], root);
  ok(r);
  assert.deepEqual(out.scope.edit, ['web']);
  assert.ok(out.warnings.some((line) => /requests edit of backend, which is outside the task edit scope \(web\); ignored/.test(line)), out.warnings.join('\n'));
  // --scope narrows further and the manifest still cannot widen it back.
  const narrowed = json(['context', 'claude', '--task', 'settings page', '--scope', 'backend'], root);
  ok(narrowed.r);
  assert.deepEqual(narrowed.out.scope.edit, []);
  // read-only intent narrows to nothing.
  ok(cli(['agents', 'add', 'reviewer', '--replace'], root));
  const reviewer = json(['context', 'claude', '--task', 'settings page', '--role', 'reviewer'], root);
  ok(reviewer.r);
  assert.deepEqual(reviewer.out.scope.edit, []);
  assert.ok(reviewer.out.warnings.some((line) => /reviewer is read-only \(permission_intent\): edit scope narrowed from web to \(none\)/.test(line)));
});

// --- E2 lifecycle ----------------------------------------------------------------------------------

test('a hand-edited card survives doctor --fix and agents add byte for byte; --replace --dry-run shows the diff and writes nothing', async (t) => {
  const { root } = await workspace(t);
  ok(cli(['agents', 'add', 'developer'], root));
  const path = '.agentos/agents/developer.md';
  const edited = (await read(root, path)).replace('## Responsibilities out', '- Always run the e2e suite (local rule).\n\n## Responsibilities out');
  await writeFile(join(root, path), edited);

  ok(cli(['doctor', '--fix'], root));
  assert.equal(await read(root, path), edited, 'doctor --fix keeps the edited card');
  const before = await snapshot(root);
  const add = cli(['agents', 'add', 'developer'], root);
  fails(add);
  assert.match(add.stderr, /body changed since install/);
  assert.match(add.stderr, /--replace --dry-run/);
  assert.deepEqual(await snapshot(root), before, 'refused add writes nothing');

  const preview = cli(['agents', 'add', 'developer', '--replace', '--dry-run'], root);
  ok(preview);
  assert.match(preview.stdout, /Would replace: \.agentos\/agents\/developer\.md/);
  assert.match(preview.stdout, /Diff summary: -2 \+0 lines \(body\)/);
  assert.match(preview.stdout, /-- Always run the e2e suite \(local rule\)\./);
  assert.deepEqual(await snapshot(root), before, '--replace --dry-run writes nothing');

  // custom: true protects a card even when its body is unmodified.
  await writeFile(join(root, path), (await read(root, path)).replace('custom: false', 'custom: true').replace('- Always run the e2e suite (local rule).\n\n', ''));
  const customBytes = await read(root, path);
  fails(cli(['agents', 'add', 'developer'], root));
  ok(cli(['doctor', '--fix'], root));
  assert.equal(await read(root, path), customBytes);

  const replaced = cli(['agents', 'add', 'developer', '--replace'], root);
  ok(replaced);
  assert.match(frontOf(await read(root, path)), /^custom: false$/m);
  const kept = await readdir(join(root, '.agentos/runs/replaced-agents'));
  assert.equal(kept.length, 1);
  assert.equal(await read(root, `.agentos/runs/replaced-agents/${kept[0]}`), customBytes, 'the replaced card is kept, not lost');
});

test('legacy cards: a byte-matched card gets its manifest from add or manifest --from-catalog; an unmatched one is never given inferred provenance', async (t) => {
  const { root } = await workspace(t);
  const template = await TEMPLATE('tester');
  await writeFile(join(root, '.agentos/agents/tester.md'), template); // a pre-slice-6 legacy card (init now writes manifests)
  ok(cli(['agents', 'manifest', 'tester', '--from-catalog'], root));
  assert.equal(bodyOf(await read(root, '.agentos/agents/tester.md')), template);
  assert.match(frontOf(await read(root, '.agentos/agents/tester.md')), /installed_from: catalog:tester/);

  ok(cli(['agents', 'add', 'release-manager'], root));
  assert.match(frontOf(await read(root, '.agentos/agents/release-manager.md')), /^permission_intent: release$/m);

  const edited = `${await TEMPLATE('reviewer')}\nLocal note.\n`;
  await writeFile(join(root, '.agentos/agents/reviewer.md'), edited);
  const before = await snapshot(root);
  const refused = cli(['agents', 'manifest', 'reviewer', '--from-catalog'], root);
  fails(refused);
  assert.match(refused.stdout, /differs from catalog:reviewer, so its provenance cannot be inferred/);
  fails(cli(['agents', 'add', 'reviewer'], root));
  ok(cli(['doctor', '--fix'], root));
  assert.deepEqual(await snapshot(root), before, 'unmatched legacy card left alone by manifest --from-catalog, add and doctor --fix');
  const diag = json(['doctor'], root).out.diagnostics;
  assert.ok(diag.includes('legacy agent card .agentos/agents/reviewer.md has no manifest; add one with `agentos agents manifest reviewer --custom` (it differs from catalog:reviewer; or replace it with `agentos agents add reviewer --replace`)'), diag.join('\n'));

  ok(cli(['agents', 'manifest', 'reviewer', '--custom'], root));
  const custom = await read(root, '.agentos/agents/reviewer.md');
  assert.equal(bodyOf(custom), edited, 'body byte-identical');
  assert.match(frontOf(custom), /^provenance: unknown$/m);
  assert.match(frontOf(custom), /^custom: true$/m);
});

test('disable edits only agents.enabled (comments and layout kept, card kept); context and checkpoint refuse the disabled role naming agents enable', async (t) => {
  const { root } = await workspace(t);
  const projectPath = join(root, '.agentos/project.yaml');
  const original = (await read(root, '.agentos/project.yaml')).replace('agents:\n', 'agents:\n  # team chosen 2026-10 (keep this comment)\n');
  await writeFile(projectPath, original);
  const card = await read(root, '.agentos/agents/tester.md');
  const before = await snapshot(root);
  ok(cli(['agents', 'disable', 'tester', '--dry-run'], root));
  assert.deepEqual(await snapshot(root), before);
  const r = cli(['agents', 'disable', 'tester'], root);
  ok(r);
  assert.match(r.stdout, /agents\.capabilities\.qa still point to tester/);
  assert.equal(await read(root, '.agentos/project.yaml'), original.replace('    - tester\n', ''), 'exactly one line removed');
  assert.equal(await read(root, '.agentos/agents/tester.md'), card, 'card stays on disk');

  const ctx = cli(['context', 'claude', '--role', 'tester'], root);
  fails(ctx);
  assert.match(ctx.stderr, /tester is disabled.*agentos agents enable tester/);
  const checkpoint = cli(['checkpoint', '--role', 'tester', '--progress', 'p', '--task', 't'], root);
  fails(checkpoint);
  assert.match(checkpoint.stderr, /agentos agents enable tester/);

  ok(cli(['agents', 'enable', 'tester'], root));
  assert.match(await read(root, '.agentos/project.yaml'), /# team chosen 2026-10 \(keep this comment\)/);
  ok(cli(['context', 'claude', '--role', 'tester'], root));
  fails(cli(['agents', 'enable', 'nobody'], root));
});

test('remove refuses while referenced (enabled, capabilities, current checkpoint role, Brain tag) with zero writes, then moves the card to runs/removed-agents', async (t) => {
  const { root } = await workspace(t);
  ok(cli(['checkpoint', '--role', 'tester', '--progress', 'tested', '--task', 'settings'], root));
  await writeFile(join(root, 'docs.md'), '---\ntags:\n  - agent:tester\n---\n# QA notes\n');
  ok(cli(['brain', 'register', 'docs.md', '--kind', 'note'], root));
  const card = await read(root, '.agentos/agents/tester.md');

  let before = await snapshot(root);
  const refused = cli(['agents', 'remove', 'tester'], root);
  fails(refused);
  for (const ref of ['agents.enabled (run `agentos agents disable tester`)', 'agents.capabilities.qa', '.agentos/checkpoints/settings/current.json (current checkpoint role)', 'docs.md (Brain record tag)']) {
    assert.ok(refused.stdout.includes(ref), `${ref} listed:\n${refused.stdout}`);
  }
  assert.match(refused.stdout, /Nothing was written/);
  assert.deepEqual(await snapshot(root), before, 'refusal writes nothing');

  ok(cli(['agents', 'disable', 'tester'], root));
  const projectPath = join(root, '.agentos/project.yaml');
  await writeFile(projectPath, (await read(root, '.agentos/project.yaml')).replace('    qa: tester\n', ''));
  ok(cli(['checkpoint', '--role', 'developer', '--progress', 'handed over', '--task', 'settings'], root));
  await writeFile(join(root, 'docs.md'), (await read(root, 'docs.md')).replace('agent:tester', 'qa'));
  before = await snapshot(root);
  ok(cli(['agents', 'remove', 'tester', '--dry-run'], root));
  assert.deepEqual(await snapshot(root), before, '--dry-run writes nothing');
  const removed = cli(['agents', 'remove', 'tester'], root);
  ok(removed);
  await assert.rejects(lstat(join(root, '.agentos/agents/tester.md')));
  const moved = await readdir(join(root, '.agentos/runs/removed-agents'));
  assert.equal(moved.length, 1);
  assert.match(moved[0], /^\d{4}-\d{2}-\d{2}T.*-tester\.md$/);
  assert.equal(await read(root, `.agentos/runs/removed-agents/${moved[0]}`), card, 'moved byte for byte, not deleted');
});

// --- E3 engines --------------------------------------------------------------------------------------

test('agentos engines --json: five engines, exactly the six rows each, statuses from the closed set, nothing verified', async (t) => {
  const { root } = await workspace(t);
  const { r, out } = json(['engines'], root);
  ok(r);
  assert.deepEqual(Object.keys(out.matrix), ['claude-code', 'codex', 'opencode', 'hermes', 'generic']);
  const rows = ['context_rendering', 'native_agent_config', 'tool_restrictions', 'permission_enforcement', 'launch', 'native_session_resume'];
  for (const [engine, matrix] of Object.entries(out.matrix)) {
    assert.deepEqual(Object.keys(matrix), rows, engine);
    for (const [key, value] of Object.entries(matrix)) {
      assert.deepEqual(Object.keys(value), ['status', 'evidence']);
      assert.ok(['verified', 'advisory', 'unsupported', 'unverified'].includes(value.status), `${engine}.${key}`);
      assert.notEqual(value.status, 'verified', `${engine}.${key} must not claim verified without a trial`);
      assert.ok(value.evidence.length > 20, `${engine}.${key} has evidence text`);
    }
  }
  assert.equal(out.matrix['claude-code'].permission_enforcement.status, 'unverified');
  assert.equal(out.matrix['claude-code'].context_rendering.status, 'advisory');
  assert.match(out.matrix.codex.tool_restrictions.evidence, /launch-time/);
  const docs = await readFile(resolve('docs/engines.md'), 'utf8');
  for (const [engine, matrix] of Object.entries(out.matrix)) {
    for (const [key, value] of Object.entries(matrix)) assert.ok(docs.includes(`| ${engine} | ${key} | ${value.status} | ${value.evidence.replace(/\|/g, '\\|')} |`), `docs/engines.md row ${engine}.${key} matches src/engines.ts`);
  }
});

test('context prints one ADVISORY line per unenforced hard requirement; --require-enforcement exits 1 UNSUPPORTED for every engine today', async (t) => {
  const { root } = await workspace(t);
  for (const engine of ['claude-code', 'codex', 'opencode', 'hermes', 'generic']) {
    const r = cli(['context', engine, '--task', 'settings page'], root);
    ok(r);
    assert.equal(r.stdout.split('\n').filter((line) => line.startsWith('ADVISORY:')).length, 1);
    assert.match(r.stdout, new RegExp(`^ADVISORY: edit scope is instruction-only for ${engine}$`, 'm'));
    const strict = cli(['context', engine, '--task', 'settings page', '--require-enforcement'], root);
    fails(strict);
    assert.match(strict.stdout, /^AgentOS context: UNSUPPORTED/);
    assert.match(strict.stdout, /permission_enforcement is (unverified|unsupported)/);
    assert.doesNotMatch(strict.stdout, /## Objective/);
  }
  const { out } = json(['context', 'codex', '--task', 'settings page'], root);
  assert.deepEqual(out.advisories, ['ADVISORY: edit scope is instruction-only for codex']);
});

test('agents sync claude-code: dry run writes nothing; sync writes the subagent and an add-keys-only settings fragment; conflicting values refuse with zero writes', async (t) => {
  const { root } = await workspace(t);
  ok(cli(['agents', 'add', 'developer'], root));
  ok(cli(['context', 'claude', '--task', 'settings page'], root));
  ok(cli(['checkpoint', '--engine', 'claude', '--progress', 'p', '--task', 'settings'], root));
  await assert.rejects(lstat(join(root, '.claude')), 'context/checkpoint never write native engine config');

  let before = await snapshot(root);
  const dry = cli(['agents', 'sync', 'claude-code', '--dry-run'], root);
  ok(dry);
  assert.match(dry.stdout, /Would create: \.claude\/agents\/developer\.md/);
  assert.match(dry.stdout, /Edit\(\/web\/\*\*\)/);
  assert.match(dry.stdout, /not proof of enforcement: permission_enforcement is unverified/);
  assert.deepEqual(await snapshot(root), before, 'dry run writes nothing');

  await mkdir(join(root, '.claude'));
  await writeFile(join(root, '.claude/settings.local.json'), JSON.stringify({ model: 'opus', permissions: { ask: ['Bash'] } }, null, 2));
  ok(cli(['agents', 'sync', 'claude-code'], root));
  const agent = await read(root, '.claude/agents/developer.md');
  assert.match(agent, /^---\nname: developer\ndescription: "Implement scoped changes/);
  assert.ok(agent.includes(bodyOf(await read(root, '.agentos/agents/developer.md')).replace(/^\n+/, '')), 'agent file carries the card body');
  const settings = JSON.parse(await read(root, '.claude/settings.local.json'));
  assert.deepEqual(settings, { model: 'opus', permissions: { ask: ['Bash'], allow: ['Edit(/web/**)'] } }, 'existing keys kept, only new keys added');
  const synced = await snapshot(root);
  ok(cli(['agents', 'sync', 'claude-code'], root));
  assert.deepEqual(await snapshot(root), synced, 're-sync is a no-op');

  // A conflicting existing value refuses the whole sync: no settings change, no agent file.
  await rm(join(root, '.claude/agents'), { recursive: true });
  await writeFile(join(root, '.claude/settings.local.json'), JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } }));
  before = await snapshot(root);
  const conflict = cli(['agents', 'sync', 'claude-code'], root);
  fails(conflict);
  assert.match(conflict.stdout, /permissions\.allow: existing \["Bash\(npm test\)"\] != proposed \["Edit\(\/web\/\*\*\)"\]/);
  assert.match(conflict.stdout, /Nothing was written/);
  assert.deepEqual(await snapshot(root), before, 'conflict: zero writes');

  // A read-only role gets deny rules instead.
  await rm(join(root, '.claude'), { recursive: true });
  ok(cli(['agents', 'add', 'reviewer', '--replace'], root));
  ok(cli(['agents', 'sync', 'claude-code', '--role', 'reviewer'], root));
  assert.deepEqual(JSON.parse(await read(root, '.claude/settings.local.json')), { permissions: { deny: ['Edit', 'Write', 'NotebookEdit'] } });
});

test('agents sync codex writes a managed role block into the in-scope repo AGENTS.md; bytes outside it and doctor stay intact', async (t) => {
  const { root } = await workspace(t);
  ok(cli(['agents', 'add', 'developer'], root));
  const pointer = await read(root, 'web/AGENTS.md');
  ok(cli(['agents', 'sync', 'codex'], root));
  const after = await read(root, 'web/AGENTS.md');
  assert.ok(after.startsWith(pointer), 'pointer bytes preserved');
  assert.match(after.slice(pointer.length), /^\n<!-- agentos:role:start -->\n## AgentOS role: developer\n[\s\S]*Edit scope: web\.[\s\S]*codex exec --sandbox[\s\S]*<!-- agentos:role:end -->\n$/);
  const synced = await snapshot(root);
  ok(cli(['agents', 'sync', 'codex'], root));
  assert.deepEqual(await snapshot(root), synced, 're-sync replaces the block in place (no-op)');
  const doctor = json(['doctor'], root);
  assert.equal(doctor.out.ok, true, doctor.out.problems.join('\n'));
  ok(cli(['doctor', '--fix'], root));
  assert.equal(await read(root, 'web/AGENTS.md'), after, 'doctor --fix keeps the role block');
  fails(cli(['agents', 'sync', 'opencode'], root));
});

test('agents sync refuses a legacy card and a symlinked .claude directory without writing anywhere', async (t) => {
  const { base, root } = await workspace(t);
  await writeFile(join(root, '.agentos/agents/developer.md'), await TEMPLATE('developer')); // a pre-slice-6 legacy card
  let before = await snapshot(base);
  const legacy = cli(['agents', 'sync', 'claude-code'], root);
  fails(legacy);
  assert.match(legacy.stdout, /no manifest.*agentos agents manifest developer --from-catalog/s);
  assert.deepEqual(await snapshot(base), before);
  ok(cli(['agents', 'manifest', 'developer', '--from-catalog'], root));
  await symlink(join(base, 'outside'), join(root, '.claude'));
  before = await snapshot(base);
  await assert.rejects(() => agentsAgentOS({ cwd: root, command: 'sync', engine: 'claude-code' }), /symlink/i);
  assert.deepEqual(await snapshot(base), before, 'nothing written through the symlink');
});
