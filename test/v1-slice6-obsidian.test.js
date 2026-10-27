// v1 slice 6: optional Obsidian as a second location for the same Brain (F1) + manifests on generated cards (F2).
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parse as parseYaml } from 'yaml';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTOS_ENGINE: '' } });
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const fails = (r) => assert.equal(r.status, 1, r.stdout + r.stderr);
const json = (args, cwd) => {
  const r = cli([...args, '--json'], cwd);
  try { return { r, out: JSON.parse(r.stdout) }; } catch { throw new Error(`not JSON (exit ${r.status}): ${r.stdout}\n${r.stderr}`); }
};
const read = (root, rel) => readFile(join(root, rel), 'utf8');
const exists = (path) => lstat(path).then(() => true, () => false);
const HANDOFF = '# Handoff\n\n## Current objective\n\nDocument the design notes.\n';
const DEST = 'Projects/Demo/AgentOS';

async function snapshot(dir) {
  const result = {};
  async function walk(path, rel = '') {
    for (const name of (await readdir(path)).sort()) {
      const abs = join(path, name), key = rel ? `${rel}/${name}` : name, info = await lstat(abs);
      if (info.isSymbolicLink()) result[key] = ['link', await readlink(abs)];
      else if (info.isDirectory()) { result[key] = ['dir', info.mode]; await walk(abs, key); }
      else result[key] = ['file', info.mode, (await readFile(abs)).toString('base64')];
    }
  }
  await walk(dir);
  return result;
}

/** base/{ws, vault}: a single-repo workspace and an existing vault with unrelated notes and a .obsidian folder. */
async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-v1s6-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws'), vault = join(base, 'vault');
  await mkdir(root);
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), HANDOFF);
  for (const [rel, text] of [['.obsidian/app.json', '{"theme":"dark"}\n'], ['.obsidian/workspace.json', '{}\n'], ['Inbox/todo.md', '# Todo\n\npersonal\n'], ['Projects/Demo/existing.md', '# Existing\n'], ['Projects/Other/b.md', '# Other\n']]) {
    await mkdir(join(vault, rel, '..'), { recursive: true });
    await writeFile(join(vault, rel), text);
  }
  return { base, root, vault };
}

const linkVault = (root, vault, extra = []) => cli(['obsidian', 'link', '--vault', vault, '--dest', DEST, '--create', ...extra], root);

/** canonical: vault, plus one registered note in the linked folder. */
async function vaultRecord(t) {
  const fx = await fixture(t);
  ok(linkVault(fx.root, fx.vault, ['--canonical', 'vault']));
  const note = join(fx.vault, DEST, 'design.md');
  await writeFile(note, '# Design notes\n\nThe API is versioned.\n');
  ok(cli(['brain', 'register', note, '--kind', 'architecture'], fx.root));
  return { ...fx, note };
}

// --- F1: obsidian init (no vault) ------------------------------------------------------------------

test('obsidian init creates a plain knowledge folder with a relative-link index and patches project.yaml add-keys-only', async (t) => {
  const { base, root } = await fixture(t);
  ok(cli(['init', '--existing', '--yes'], root)); // `brain init` (workspace) was removed in 3.0.0; init runs the same Brain setup
  const yamlPath = join(root, '.agentos/project.yaml');
  const original = `# hand-written comment kept\n${await read(root, '.agentos/project.yaml')}knowledge:\n  docs:\n    - docs/  # docs comment\n`;
  await writeFile(yamlPath, original);

  const before = await snapshot(base);
  const dry = cli(['obsidian', 'init', '--dry-run'], root);
  ok(dry);
  assert.match(dry.stdout, /Would create: knowledge\/index\.md/);
  assert.deepEqual(await snapshot(base), before, '--dry-run writes nothing');

  const r = cli(['obsidian', 'init'], root);
  ok(r);
  assert.match(r.stdout, /\.obsidian\/ is not created/);
  const index = await read(root, 'knowledge/index.md');
  assert.match(index, /^# Ws AgentOS Index/m);
  assert.match(index, /\]\(<\.\.\/\.agentos\/brain\/architecture\.md>\)/, 'Brain records linked by relative path');
  assert.ok(!index.includes(root), 'no absolute workspace path in the index');
  assert.equal(await exists(join(root, 'knowledge/.obsidian')), false);

  const patched = await read(root, '.agentos/project.yaml');
  let at = 0;
  for (const line of original.split('\n')) { const found = patched.indexOf(line, at); assert.ok(found >= 0, `line kept in order: ${line}`); at = found + line.length; }
  const data = parseYaml(patched);
  assert.deepEqual(data.knowledge.docs, ['docs/']);
  assert.equal(data.knowledge.obsidian.vault, 'knowledge');
  assert.equal(data.knowledge.obsidian.destination, '.');
  assert.equal(data.knowledge.obsidian.canonical, 'workspace');

  const again = cli(['obsidian', 'init'], root);
  fails(again);
  assert.match(again.stdout, /already configured/);
  const doctor = json(['doctor'], root);
  ok(doctor.r);
  assert.ok(!doctor.out.warnings.some((w) => /Obsidian/.test(w)), doctor.out.warnings.join('\n'));
});

// --- F1: obsidian link (existing vault) ------------------------------------------------------------

test('obsidian link creates only <dest>/ and its index note; every byte elsewhere in the vault is identical', async (t) => {
  const { base, root, vault } = await fixture(t);
  ok(cli(['init', '--existing', '--yes'], root)); // `brain init` (workspace) was removed in 3.0.0; init runs the same Brain setup
  const outsideDest = async () => Object.fromEntries(Object.entries(await snapshot(vault)).filter(([key]) => key !== DEST && !key.startsWith(`${DEST}/`) && key !== 'Projects/Demo'));
  const before = await outsideDest();
  const all = await snapshot(base);

  fails(cli(['obsidian', 'link', '--vault', vault, '--dest', DEST], root));
  assert.deepEqual(await snapshot(base), all, 'missing dest without --create: zero writes');
  ok(linkVault(root, vault, ['--dry-run']));
  assert.deepEqual(await snapshot(base), all, '--dry-run: zero writes');

  const r = linkVault(root, vault);
  ok(r);
  assert.deepEqual(await outsideDest(), before, 'nothing outside <dest> changed (including .obsidian/)');
  assert.deepEqual(await readdir(join(vault, DEST)), ['Ws AgentOS Index.md']);
  const index = await read(vault, `${DEST}/Ws AgentOS Index.md`);
  assert.match(index, /architecture\.md>\)/);
  const data = parseYaml(await read(root, '.agentos/project.yaml')).knowledge.obsidian;
  assert.equal(data.vault, undefined, 'no host path in the shared project.yaml (F10)');
  assert.equal(parseYaml(await read(root, '.agentos/local.yaml')).obsidian.vault, vault, 'host path in the machine-local file');
  assert.equal(data.destination, DEST);
  assert.equal(data.canonical, 'workspace');

  // canonical: workspace => the vault holds links only; registering a vault note is refused.
  await writeFile(join(vault, DEST, 'note.md'), '# Note\n');
  const snap = await snapshot(base);
  const refused = cli(['brain', 'register', join(vault, DEST, 'note.md')], root);
  fails(refused);
  assert.match(refused.stdout + refused.stderr, /canonical is workspace/);
  const init = cli(['brain', 'init', '--location', 'vault'], root);
  fails(init);
  assert.match(init.stdout + init.stderr, /canonical: vault/);
  assert.deepEqual(await snapshot(base), snap);
});

// --- F1: canonical vault, portable identity, boundary ---------------------------------------------

test('canonical: vault records use vault-relative sources; the absolute vault path lives only in the machine-local .agentos/local.yaml', async (t) => {
  const { base, root, vault, note } = await vaultRecord(t);
  const rel = `${DEST}/design.md`;
  const text = await readFile(note, 'utf8');
  assert.match(text, new RegExp(`^sources:\\n  - ${rel}$`, 'm'));
  assert.match(text, /^id: brain:design$/m);
  const ws = await snapshot(root);
  const holders = Object.entries(ws).filter(([, v]) => v[0] === 'file' && Buffer.from(v[2], 'base64').toString('utf8').includes(vault)).map(([k]) => k);
  assert.deepEqual(holders, ['.agentos/local.yaml'], 'absolute vault path only in the machine-local local.yaml');
  assert.ok(!text.includes(base));
  const index = JSON.parse(await read(root, '.agentos/brain/index.json'));
  assert.deepEqual(index.records.find((r) => r.id === 'brain:design'), { id: 'brain:design', kind: 'architecture', status: 'accepted', scope: '.', title: 'Design notes', path: rel, location: 'vault', source_hash: index.records.find((r) => r.id === 'brain:design').source_hash });
  const list = cli(['brain', 'list'], root);
  ok(list);
  assert.ok(list.stdout.includes(rel) && list.stdout.includes(note), list.stdout);
  const show = cli(['brain', 'show', 'brain:design'], root);
  ok(show);
  assert.ok(show.stdout.includes(`Path: ${rel}`) && show.stdout.includes(note), show.stdout);
  const context = json(['context', 'claude', '--task', 'design notes'], root);
  ok(context.r);
  assert.ok(context.out.included.some((item) => item.id === 'brain:design'), JSON.stringify(context.out.included));
});

test('register/propose of a vault note outside <dest> is refused with zero writes', async (t) => {
  const { base, root, vault } = await vaultRecord(t);
  await writeFile(join(base, 'p.md'), '# Todo\n\nreplaced\n');
  const before = await snapshot(base);
  for (const args of [['brain', 'register', join(vault, 'Inbox/todo.md')], ['brain', 'propose', join(vault, 'Inbox/todo.md'), '--from', join(base, 'p.md')], ['brain', 'register', join(vault, '.obsidian/app.json')]]) {
    const r = cli(args, root);
    fails(r);
    assert.match(r.stdout + r.stderr, /outside the linked folder/);
  }
  assert.deepEqual(await snapshot(base), before);
  // inside <dest>: propose + apply work and write only the record and workspace state.
  await writeFile(join(base, 'p2.md'), '# Design notes\n\nThe API is versioned per major release.\n');
  ok(cli(['brain', 'propose', 'brain:design', '--from', join(base, 'p2.md')], root));
  const proposal = (await readdir(join(root, '.agentos/brain/proposals'))).find((name) => name.endsWith('.md'));
  ok(cli(['brain', 'apply', proposal, '--by', 'owner'], root));
  assert.match(await read(vault, `${DEST}/design.md`), /per major release/);
});

test('external vault edit -> changed; vault removed -> unavailable in check, missing in context, doctor warning; missing index reported', async (t) => {
  const { base, root, vault, note } = await vaultRecord(t);
  await writeFile(note, (await readFile(note, 'utf8')).replace('versioned.', 'versioned by date.'));
  const changed = json(['brain', 'check'], root);
  ok(changed.r);
  assert.equal(changed.out.records.find((r) => r.id === 'brain:design').state, 'changed');

  await rename(vault, join(base, 'vault-unmounted'));
  const check = json(['brain', 'check'], root);
  const record = check.out.records.find((r) => r.id === 'brain:design');
  assert.equal(record?.state, 'unavailable', JSON.stringify(check.out));
  const human = cli(['brain', 'check'], root);
  assert.match(human.stdout, /unavailable brain:design .*vault unavailable/);

  const context = json(['context', 'claude', '--task', 'design notes'], root);
  ok(context.r);
  assert.equal(context.out.ok, true);
  assert.ok(context.out.missing.includes(`vault unavailable: ${join(vault, DEST)}`), JSON.stringify(context.out.missing));
  assert.ok(context.out.missing.some((m) => m.startsWith('brain:design')), JSON.stringify(context.out.missing));
  const text = cli(['context', 'claude', '--task', 'design notes'], root);
  ok(text);
  assert.match(text.stdout, /## Missing\n- vault unavailable:/);
  const strict = cli(['context', 'claude', '--task', 'design notes', '--require-complete'], root);
  fails(strict);
  assert.match(strict.stdout, /INCOMPLETE/);

  const doctor = json(['doctor'], root);
  assert.equal(doctor.r.status, 0, doctor.r.stdout);
  assert.ok(doctor.out.warnings.some((w) => /Obsidian vault unavailable/.test(w)), doctor.out.warnings.join('\n'));

  await rename(join(base, 'vault-unmounted'), vault);
  await rm(join(vault, DEST, 'Ws AgentOS Index.md'));
  const noIndex = json(['doctor'], root);
  assert.ok(noIndex.out.warnings.some((w) => /no index note/.test(w)), noIndex.out.warnings.join('\n'));
});

// --- F2: manifests on generated cards --------------------------------------------------------------

test('init, doctor --fix and agents add write catalog cards with manifests; doctor --fix (2.1) gives a byte-matched legacy card its manifest', async (t) => {
  const { root } = await fixture(t);
  for (const id of ['developer', 'tester', 'reviewer', 'release-manager']) {
    const card = await read(root, `.agentos/agents/${id}.md`);
    assert.match(card, new RegExp(`^---\\nid: ${id}\\n[\\s\\S]*?\\n  installed_from: catalog:${id}\\n[\\s\\S]*?\\ncustom: false\\n---\\n`), id);
    assert.equal(card.replace(/^---\n[\s\S]*?\n---\n/, ''), await readFile(resolve(`templates/agents/${id}.md`), 'utf8'));
  }
  const doctor = json(['doctor'], root);
  ok(doctor.r);
  assert.ok(!doctor.out.diagnostics.some((d) => /legacy agent card/.test(d)), doctor.out.diagnostics.join('\n'));
  const show = cli(['agents', 'show', 'developer'], root);
  ok(show);
  assert.match(show.stdout, /Provenance: catalog:developer @/);

  await rm(join(root, '.agentos/agents/tester.md'));
  const legacy = await readFile(resolve('templates/agents/reviewer.md'), 'utf8');
  await writeFile(join(root, '.agentos/agents/reviewer.md'), legacy);
  ok(cli(['doctor', '--fix'], root));
  assert.match(await read(root, '.agentos/agents/tester.md'), /^---\nid: tester\n[\s\S]*installed_from: catalog:tester/);
  const upgraded = await read(root, '.agentos/agents/reviewer.md');
  assert.match(upgraded, /^---\nid: reviewer\n[\s\S]*installed_from: catalog:reviewer/, 'byte-matched legacy card upgraded');
  assert.equal(upgraded.replace(/^---\n[\s\S]*?\n---\n/, ''), legacy, 'body byte-identical');
  assert.ok(!json(['doctor'], root).out.diagnostics.some((d) => /legacy agent card/.test(d)));

  ok(cli(['agents', 'add', 'planner'], root));
  const planner = await read(root, '.agentos/agents/planner.md');
  assert.match(planner, /^---\nid: planner\n[\s\S]*\n---\n/);
  assert.match(planner, /^  installed_from: catalog:planner$/m);
  assert.match(planner, /^permission_intent: read-only$/m);
  assert.equal(planner.replace(/^---\n[\s\S]*?\n---\n/, ''), await readFile(resolve('templates/agents/planner.md'), 'utf8'));
});
