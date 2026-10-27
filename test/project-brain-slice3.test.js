// Project Brain slice 3: setup and discovery (F5, F6, F10 bindings; A09–A12).
import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parse as parseYaml } from 'yaml';

const CLI = resolve('dist/cli.js');
const cli = (args, cwd, env = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTOS_ENGINE: '', ...env } });
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const fails = (r) => assert.equal(r.status, 1, r.stdout + r.stderr);
const json = (args, cwd) => {
  const r = cli([...args, '--json'], cwd);
  try { return { r, out: JSON.parse(r.stdout) }; } catch { throw new Error(`not JSON (exit ${r.status}): ${r.stdout}\n${r.stderr}`); }
};
const read = (root, rel) => readFile(join(root, rel), 'utf8');
const exists = (path) => lstat(path).then(() => true, () => false);
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const UNKNOWN = '(unknown — fill in)';
const HANDOFF = '# Handoff\n\n## Current objective\n\nShip the demo.\n';
const ids = (root) => json(['brain', 'list'], root).out.records.map((record) => record.id).sort();

/** Every entry under dir: path → bytes + mtime (dirs: 'dir', symlinks: 'link'). */
async function snapshot(dir) {
  const result = {};
  async function walk(path, rel = '') {
    for (const name of (await readdir(path)).sort()) {
      const abs = join(path, name), key = rel ? `${rel}/${name}` : name, info = await lstat(abs);
      if (info.isSymbolicLink()) result[key] = 'link';
      else if (info.isDirectory()) { result[key] = 'dir'; await walk(abs, key); } else result[key] = [(await readFile(abs)).toString('base64'), info.mtimeMs];
    }
  }
  await walk(dir);
  return result;
}

async function base(t, prefix = 'agentos pb3 ') {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
/** `agentos init --existing` in `<base>/<name>` (a space in every path), with a resolvable objective. */
async function project(dir, name = 'my ws', files = {}) {
  const root = join(dir, name);
  await mkdir(root, { recursive: true });
  for (const [rel, text] of Object.entries(files)) { await mkdir(dirname(join(root, rel)), { recursive: true }); await writeFile(join(root, rel), text); }
  ok(cli(['init', '--existing', '--yes', '--agents', 'minimal'], root));
  await writeFile(join(root, '.agentos/handoff.md'), HANDOFF);
  return root;
}

// --- A09 / F5: init creates or adopts the Brain ------------------------------------------------------

test('F5/A09: init --new creates a usable Brain without duplicates; re-running init changes no byte or mtime', async (t) => {
  const root = join(await base(t), 'new ws');
  await mkdir(root);
  const r = cli(['init', '--new', '--yes'], root);
  ok(r);
  assert.match(r.stdout, /Project Brain/);
  assert.match(r.stdout, /brain propose/, 'init names the bounded, engine-run discovery step');
  assert.deepEqual(ids(root), ['brain:architecture', 'brain:conventions', 'brain:decisions', 'brain:glossary']);
  // init --new writes .agentos/architecture.md and decisions.md: both adopted in place, never duplicated.
  assert.equal(await exists(join(root, '.agentos/brain/architecture.md')), false);
  assert.equal(await exists(join(root, '.agentos/brain/decisions.md')), false);
  assert.match(await read(root, '.agentos/architecture.md'), /^---\nid: brain:architecture\nkind: architecture\nscope: \.\nstatus: proposed\n/);
  for (const name of ['conventions', 'glossary']) {
    const text = await read(root, `.agentos/brain/${name}.md`);
    assert.ok(text.includes(UNKNOWN), `${name}: unknowns are marked, nothing is invented`);
    assert.match(text, /\nstatus: proposed\n/);
  }
  ok(cli(['brain', 'check'], root));

  await writeFile(join(root, '.agentos/brain/conventions.md'), `${await read(root, '.agentos/brain/conventions.md')}\nCustom: tabs, never spaces.\n`);
  const before = await snapshot(root);
  const again = cli(['init', '--new', '--yes'], root);
  ok(again);
  assert.match(again.stdout, /Present: brain:conventions/);
  assert.deepEqual(await snapshot(root), before, 'second init: every file byte- and mtime-identical, custom content kept');
  ok(cli(['init', '--existing', '--yes'], root)); // `brain init` (workspace) was removed in 3.0.0; init runs the same Brain setup
  assert.deepEqual(await snapshot(root), before, '`brain init` after init is a no-op');
});

test('F5/A09: init --existing adopts: covering docs are named, not duplicated or edited; registered docs stay put on re-run', async (t) => {
  const ARCH = '# Architecture\n\nA CLI over plain files.\n';
  const CONV = '---\ntitle: House rules\n---\n# Conventions\n\nTwo-space indent.\n';
  const root = await project(await base(t), 'old app', { 'package.json': '{"name":"old-app"}', 'ARCHITECTURE.md': ARCH, 'docs/conventions.md': CONV });
  assert.equal(await read(root, 'ARCHITECTURE.md'), ARCH, 'init never edits a project doc');
  assert.equal(await read(root, 'docs/conventions.md'), CONV);
  assert.equal(await exists(join(root, '.agentos/brain/architecture.md')), false, 'no duplicate architecture template');
  assert.equal(await exists(join(root, '.agentos/brain/conventions.md')), false, 'no duplicate conventions template');
  assert.deepEqual(ids(root), ['brain:decisions', 'brain:glossary']);

  const again = cli(['init', '--existing', '--yes'], root);
  ok(again);
  assert.match(again.stdout, /agentos brain register ARCHITECTURE\.md --kind architecture/);
  assert.match(again.stdout, /agentos brain register docs\/conventions\.md --kind convention/);

  ok(cli(['brain', 'register', 'ARCHITECTURE.md', '--kind', 'architecture'], root));
  ok(cli(['brain', 'register', 'docs/conventions.md', '--kind', 'convention'], root));
  assert.match(await read(root, 'docs/conventions.md'), /^---\ntitle: House rules\n/, 'existing frontmatter kept (keys added only)');
  const before = await snapshot(root);
  const third = cli(['init', '--existing', '--yes'], root);
  ok(third);
  assert.match(third.stdout, /Present: brain:architecture \(ARCHITECTURE\.md\)/);
  assert.deepEqual(await snapshot(root), before, 'adopted records are kept as they are');
  assert.deepEqual(ids(root), ['brain:architecture', 'brain:conventions', 'brain:decisions', 'brain:glossary']);
});

test('F5/A09: a hand-written file at a template path is never overwritten; init still succeeds and says why', async (t) => {
  const dir = await base(t);
  const root = join(dir, 'ws');
  await mkdir(join(root, '.agentos/brain'), { recursive: true });
  await writeFile(join(root, '.agentos/brain/glossary.md'), 'my own glossary\n');
  const r = cli(['init', '--existing', '--yes', '--agents', 'minimal'], root);
  ok(r);
  assert.match(r.stdout, /glossary\.md exists; refusing to overwrite it/);
  assert.equal(await read(root, '.agentos/brain/glossary.md'), 'my own glossary\n');
});

// --- A10 / F6: bounded overview, selective retrieval, isolation ---------------------------------------

test('F6/A10: context opens with a bounded overview from memory.md; Brain record bodies stay out', async (t) => {
  const root = await project(await base(t), 'ws', { 'docs/adr/0001-db.md': '# ADR 1: Use Postgres for storage\n\nBODY-SENTINEL tenant data.\n' });
  ok(cli(['brain', 'register', 'docs/adr/0001-db.md', '--kind', 'adr'], root));
  await writeFile(join(root, '.agentos/memory.md'), `# Memory\n\nPurpose: PB-PURPOSE-SENTINEL demo tracker.\n\n${'Long stable fact. '.repeat(400)}TAIL-SENTINEL\n`);
  const { r, out } = json(['context', 'claude', '--task', 'storage'], root);
  ok(r);
  const overview = out.included.find((item) => item.id === 'overview');
  assert.ok(overview, 'overview included');
  assert.equal(overview.source, '.agentos/memory.md');
  assert.equal(overview.reason, 'mandatory');
  assert.ok(out.text.indexOf('## Project overview') < out.text.indexOf('## Objective'), 'overview first');
  assert.match(out.text, /PB-PURPOSE-SENTINEL/);
  assert.doesNotMatch(out.text, /TAIL-SENTINEL/, 'cut at the explicit budget');
  assert.match(out.text, /cut at 1500 of \d+ chars; read \.agentos\/memory\.md/);
  assert.ok(overview.tokens <= 450, `overview ${overview.tokens} tokens`);
  assert.ok(out.included.some((item) => item.id === 'brain:0001-db'), 'relevant record selected by reference');
  assert.doesNotMatch(out.text, /BODY-SENTINEL/, 'record body is not injected');
  const other = json(['context', 'claude', '--task', 'billing emails'], root).out;
  assert.ok(other.omitted.some((item) => item.id === 'brain:0001-db' && item.reason === 'no-match'), 'irrelevant record omitted');
});

test('D7: a Brain record whose file is shown section by section is reported as covered, not no-match', async (t) => {
  const root = await project(await base(t), 'ws', {});
  await writeFile(join(root, '.agentos/decisions.md'), '# Decisions\n\n## 2026-10-01 Storage: use Postgres\n\nTenant data lives in Postgres.\n');
  ok(cli(['brain', 'register', '.agentos/decisions.md', '--kind', 'decision'], root));
  const { r, out } = json(['context', 'claude', '--task', 'storage'], root);
  ok(r);
  const record = out.omitted.find((item) => item.id === 'brain:decisions');
  assert.ok(record, JSON.stringify(out.omitted));
  const section = out.included.find((item) => item.kind === 'decision');
  assert.ok(section && section.source.startsWith('.agentos/decisions.md#'), JSON.stringify(out.included));
  assert.deepEqual(record, { id: record.id, kind: 'brain', reason: 'covered', via: section.id });
  assert.ok(!out.omitted.some((item) => item.reason === 'no-match' && item.id === record.id));
  assert.match(out.text, new RegExp(`- ${record.id} \\(brain\\): covered by ${section.id} \\(same file, shown above\\)`));
  // Nothing from that file shown: still an honest no-match.
  const other = json(['context', 'claude', '--task', 'billing'], root).out;
  assert.equal(other.omitted.find((item) => item.id === record.id).reason, 'no-match');
});

test('A10: one Brain per workspace: a child repo uses the parent Brain; sibling and nested projects never see each other', async (t) => {
  const dir = await base(t);
  const alpha = await project(dir, 'alpha ws', { 'web/package.json': '{"name":"web"}', 'notes/alpha.md': '# Alpha plan\n\nALPHA.\n' });
  git(join(alpha, 'web'), 'init', '-q');
  ok(cli(['brain', 'register', 'notes/alpha.md'], alpha));
  const bravo = await project(dir, 'bravo ws', { 'notes/bravo.md': '# Bravo plan\n\nBRAVO.\n' });
  ok(cli(['brain', 'register', 'notes/bravo.md'], bravo));
  const inner = await project(alpha, 'tools/inner ws', { 'notes/inner.md': '# Inner plan\n\nINNER.\n' });
  ok(cli(['brain', 'register', 'notes/inner.md'], inner));

  const alphaIds = ids(alpha);
  assert.ok(alphaIds.includes('brain:alpha'));
  assert.deepEqual(ids(join(alpha, 'web')), alphaIds, 'nested child repo: nearest workspace is alpha');
  for (const [root, own, foreign] of [[alpha, 'brain:alpha', ['brain:bravo', 'brain:inner']], [bravo, 'brain:bravo', ['brain:alpha', 'brain:inner']], [inner, 'brain:inner', ['brain:alpha', 'brain:bravo']]]) {
    const list = ids(root);
    assert.ok(list.includes(own), `${own} in its own Brain`);
    for (const id of foreign) assert.ok(!list.includes(id), `${id} must not appear in ${root}`);
    const ctx = json(['context', 'claude', '--task', 'alpha bravo inner plan'], root).out;
    for (const id of foreign) assert.ok(![...ctx.included, ...ctx.omitted].some((item) => item.id === id), `context of ${root} must not know ${id}`);
    assert.equal(json(['brain', 'search', 'alpha', 'bravo', 'inner'], root).out.records.filter((rec) => foreign.includes(rec.id)).length, 0);
  }
  const status = cli(['status'], join(alpha, 'web'));
  assert.match(status.stdout, new RegExp(`Root: ${realpathSync(alpha).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\n`));
});

// --- A11 / F10: machine-local binding ----------------------------------------------------------------

const DEST = 'Projects/Demo';
async function vault(dir, name = 'My Vault') {
  const v = join(dir, name);
  await mkdir(join(v, '.obsidian'), { recursive: true });
  await mkdir(join(v, 'Daily'), { recursive: true });
  await mkdir(join(v, 'Projects'), { recursive: true });
  await writeFile(join(v, '.obsidian/app.json'), '{"sentinel":"settings"}\n');
  await writeFile(join(v, 'Daily/2026-10-26.md'), '---\ntags: [daily]\n---\n# Unrelated\n\nPersonal note.\n');
  await writeFile(join(v, 'Projects/Other.md'), '# Other project\n');
  return v;
}

test('F10/A11: obsidian link writes the host vault path to git-ignored .agentos/local.yaml, never to shared project.yaml', async (t) => {
  const dir = await base(t);
  const root = await project(dir);
  git(root, 'init', '-q');
  const v = await vault(dir);
  const r = cli(['obsidian', 'link', '--vault', v, '--dest', DEST, '--create'], root);
  ok(r);
  for (const file of ['.agentos/project.yaml', '.agentos/knowledge.md']) assert.ok(!(await read(root, file)).includes(v), `${file} holds no host path`);
  assert.equal(parseYaml(await read(root, '.agentos/project.yaml')).knowledge.obsidian.destination, DEST);
  assert.equal(parseYaml(await read(root, '.agentos/local.yaml')).obsidian.vault, v);
  assert.match(await read(root, '.agentos/local.yaml'), /^# Machine-local AgentOS settings/, 'self-describing file');
  assert.equal(git(root, 'check-ignore', '-q', '.agentos/local.yaml').status, 0, 'local.yaml is git-ignored');
  assert.doesNotMatch(git(root, 'status', '--porcelain', '-uall').stdout, /local\.yaml/);
  const atRoot = cli(['obsidian', 'status'], root);
  ok(atRoot);
  assert.match(atRoot.stdout, /Vault: .*My Vault \(from \.agentos\/local\.yaml\)/);
  await mkdir(join(root, 'sub/deeper'), { recursive: true });
  assert.equal(cli(['obsidian', 'status'], join(root, 'sub/deeper')).stdout, atRoot.stdout, 'nested status resolves the same binding');

  // Another machine (a clone without local.yaml): integration reported unbound; local Brain unaffected.
  await unlink(join(root, '.agentos/local.yaml'));
  const unbound = cli(['obsidian', 'status'], root);
  fails(unbound);
  assert.match(unbound.stdout, /not bound on this machine/);
  ok(cli(['brain', 'list'], root));
  const ctx = cli(['context', 'claude', '--task', 'demo', '--require-complete', '--json'], root);
  ok(ctx);
  assert.ok(JSON.parse(ctx.stdout).warnings.some((w) => /not bound on this machine/.test(w)));
});

test('F10/A11: precedence: local.yaml obsidian.vault beats a legacy vault in project.yaml; the legacy binding alone still works', async (t) => {
  const dir = await base(t);
  const root = await project(dir);
  const oldVault = await vault(dir, 'Old Vault'), newVault = await vault(dir, 'New Vault');
  await mkdir(join(oldVault, DEST)); await mkdir(join(newVault, DEST));
  await writeFile(join(root, '.agentos/project.yaml'), `${await read(root, '.agentos/project.yaml')}knowledge:\n  obsidian:\n    mode: workspace-folder\n    vault: ${JSON.stringify(oldVault)}\n    destination: ${DEST}\n    canonical: workspace\n    index: Index.md\n`);
  const legacy = cli(['obsidian', 'status'], root);
  assert.match(legacy.stdout, /Vault: .*Old Vault \(from \.agentos\/project\.yaml\)/, 'legacy shared binding still readable');
  ok(cli(['brain', 'index'], root));
  assert.ok(await exists(join(oldVault, DEST, 'Index.md')));

  await writeFile(join(root, '.agentos/local.yaml'), `obsidian:\n  vault: ${JSON.stringify(newVault)}\n`);
  assert.match(cli(['obsidian', 'status'], root).stdout, /Vault: .*New Vault \(from \.agentos\/local\.yaml\)/);
  ok(cli(['brain', 'index'], root));
  assert.ok(await exists(join(newVault, DEST, 'Index.md')), 'writes follow the machine-local binding');
});

test('F10/A11: obsidian init --dir outside the workspace keeps the host path machine-local too', async (t) => {
  const dir = await base(t);
  const root = await project(dir);
  const outside = join(dir, 'Shared Knowledge');
  ok(cli(['obsidian', 'init', '--dir', outside], root));
  assert.ok(!(await read(root, '.agentos/project.yaml')).includes(outside));
  assert.equal(parseYaml(await read(root, '.agentos/local.yaml')).obsidian.vault, outside);
  ok(cli(['obsidian', 'status'], root));
});

// --- A12: both vault setup paths ---------------------------------------------------------------------

test('A12: existing vault: one labelled navigation note; unrelated notes and .obsidian/ untouched; no symlinks or copies; re-run is a no-op', async (t) => {
  const dir = await base(t);
  const root = await project(dir);
  const v = await vault(dir);
  const before = await snapshot(v);
  ok(cli(['obsidian', 'link', '--vault', v, '--dest', DEST, '--create'], root));
  const after = await snapshot(v);
  for (const [key, value] of Object.entries(before)) assert.deepEqual(after[key], value, `${key} untouched`);
  const added = Object.keys(after).filter((key) => !(key in before));
  assert.deepEqual(added, ['Projects/Demo', 'Projects/Demo/My Ws AgentOS Index.md']);
  assert.ok(!Object.values(after).includes('link'), 'no symlinks');
  const note = await read(v, 'Projects/Demo/My Ws AgentOS Index.md');
  const fm = note.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fm, 'frontmatter first');
  assert.deepEqual(parseYaml(fm[1]), { tags: ['agentos-navigation'] });
  assert.match(note, /\*\*Navigation only\.\*\*/);
  assert.ok(!note.includes(UNKNOWN), 'links only: no record body copied into the vault');

  const ws = await snapshot(join(root, '.agentos'));
  ok(cli(['obsidian', 'link', '--vault', v, '--dest', DEST, '--create'], root));
  assert.deepEqual(await snapshot(v), after, 're-run: vault byte- and mtime-identical');
  const ws2 = await snapshot(join(root, '.agentos'));
  for (const file of ['project.yaml', 'local.yaml', 'knowledge.md', '.gitignore']) assert.deepEqual(ws2[file], ws[file], `re-run: .agentos/${file} unchanged`);
});

test('A12: new knowledge folder opened as its own vault: its .obsidian/ settings and user notes survive Brain writes and index recovery', async (t) => {
  const root = await project(await base(t), 'ws', { 'docs/adr/0001-db.md': '# ADR 1\n\nPostgres.\n' });
  const KNOW = 'Project Knowledge';
  ok(cli(['obsidian', 'init', '--dir', KNOW], root));
  assert.equal(parseYaml(await read(root, '.agentos/project.yaml')).knowledge.obsidian.vault, KNOW, 'workspace-relative, portable: stays shared');
  assert.equal(await exists(join(root, '.agentos/local.yaml')), false);
  await mkdir(join(root, KNOW, '.obsidian'));
  await writeFile(join(root, KNOW, '.obsidian/workspace.json'), '{"sentinel":true}\n');
  await writeFile(join(root, KNOW, 'My idea.md'), '# My idea\n\nKeep me.\n');
  const keep = async () => Object.fromEntries(Object.entries(await snapshot(join(root, KNOW))).filter(([key]) => key !== 'index.md'));
  const before = await keep();
  ok(cli(['brain', 'register', 'docs/adr/0001-db.md', '--kind', 'adr'], root));
  assert.match(await read(root, `${KNOW}/index.md`), /0001-db\.md>\)/, 'index refreshed');
  await unlink(join(root, KNOW, 'index.md'));
  ok(cli(['brain', 'index'], root));
  assert.deepEqual(await keep(), before, 'settings and user notes byte- and mtime-identical');
  const index = await snapshot(join(root, KNOW));
  assert.match(cli(['brain', 'index'], root).stdout, /Unchanged: index note/);
  assert.deepEqual(await snapshot(join(root, KNOW)), index);
});

test('A12: Obsidian app availability is detected and only advised; setup succeeds without it', async (t) => {
  const dir = await base(t);
  const root = await project(dir);
  const noApp = cli(['obsidian', 'init'], root, { PATH: dirname(process.execPath) });
  ok(noApp);
  assert.match(noApp.stdout, /Obsidian app: not found on PATH \(optional/);
  const bin = join(dir, 'bin');
  await mkdir(bin);
  const app = process.platform === 'win32' ? 'Obsidian.exe' : 'obsidian'; // the executable name looked up on PATH
  await writeFile(join(bin, app), '#!/bin/sh\nexit 0\n');
  await chmod(join(bin, app), 0o755);
  const root2 = await project(dir, 'ws2');
  const withApp = cli(['obsidian', 'init'], root2, { PATH: `${bin}${delimiter}${dirname(process.execPath)}` });
  ok(withApp);
  assert.match(withApp.stdout, /Obsidian app: found/);
});

// --- startup loop across engines --------------------------------------------------------------------

test('bootloaders stay short and carry the startup loop for their engine; one task id from checkpoint to resume across engines', async (t) => {
  const root = await project(await base(t));
  for (const [file, engine] of [['AGENTS.md', 'codex'], ['CLAUDE.md', 'claude-code'], ['.hermes.md', 'hermes']]) {
    const text = await read(root, file);
    assert.ok(text.length <= 1600, `${file} is ${text.length} bytes`);
    assert.match(text, new RegExp(`\`agentos status\` → \`agentos context [a-z|-]*${engine}[a-z|-]* --task <id>\` → work → \`agentos checkpoint --task <id>`), file);
    assert.match(text, /`agentos resume --task <id>`/, file);
    assert.match(text, /\.agentos\/guide\.md/, file);
  }
  // No checkpoint yet: a clean start (exit 0) that invents nothing.
  const fresh = cli(['resume', '--task', 'demo', '--engine', 'codex'], root);
  ok(fresh);
  assert.match(fresh.stdout, /clean start — no checkpoint for task demo.*No prior work is assumed; start with `agentos context codex --task demo`/s);
  assert.doesNotMatch(fresh.stdout, /Progress:/);
  ok(cli(['checkpoint', '--task', 'demo', '--engine', 'claude-code', '--progress', 'PROGRESS-SENTINEL', '--next', 'NEXT-SENTINEL'], root));
  const resumed = cli(['resume', '--task', 'demo', '--engine', 'codex'], root);
  ok(resumed);
  assert.match(resumed.stdout, /PROGRESS-SENTINEL/);
  assert.match(resumed.stdout, /NEXT-SENTINEL/);
  assert.match(cli(['context', 'hermes', '--task', 'demo'], root).stdout, /## Checkpoint[\s\S]*NEXT-SENTINEL/);
});

// --- packaged instructions ---------------------------------------------------------------------------

test('A11: setup instructions ship in the package: the guide (generated by init) and the setup docs', async (t) => {
  const root = await project(await base(t));
  const guide = await read(root, '.agentos/guide.md');
  for (const needle of ['## Setup and project knowledge', '`agentos obsidian init`', '.agentos/local.yaml', 'bounded overview']) assert.ok(guide.includes(needle), needle);
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  for (const doc of ['docs/quickstart.md', 'docs/brain.md', 'docs/obsidian.md', 'docs/engines.md', 'docs/migration-project-brain.md']) assert.ok(pkg.files.includes(doc), `${doc} in package.json files`);
});
