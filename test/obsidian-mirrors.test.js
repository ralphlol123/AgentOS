// Phase 4 fix: canonical: workspace + a vault => generated read-only mirrors under <note dir>/Records/, so the index note
// never links outside the vault (Obsidian could not open `../../../../project/...` links). One record stays authoritative.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parse as parseYaml } from 'yaml';

const CLI = resolve('dist/cli.js');
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV, AGENTOS_ENGINE: '' } });
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const json = (args, cwd) => {
  const r = cli([...args, '--json'], cwd);
  try { return { r, out: JSON.parse(r.stdout) }; } catch { throw new Error(`not JSON (exit ${r.status}): ${r.stdout}\n${r.stderr}`); }
};
const git = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const exists = (path) => lstat(path).then(() => true, () => false);
const split = (text) => { const m = text.match(/^---\n([\s\S]*?)\n---\n/); return m ? { fm: m[1], body: text.slice(m[0].length) } : { fm: '', body: text }; };
const DEST = 'Projects/TeaLedger/AgentOS';
const NOTE = `${DEST}/P1 Project AgentOS Index.md`;
const DECISION = 'docs/decisions/0001-tangerine-refund-window.md';
const DECISION_TEXT = '# Decision 0001: Tangerine refund window\n\nRefunds for tangerine orders are accepted for 14 days (rule TANGERINE-11).\n';

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

/** base/{p1-project (git, decision registered), existing-vault (unrelated notes + .obsidian/)} — Ralph's layout. */
async function fixture(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'agentos mirrors ')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'p1-project'), vault = join(base, 'existing-vault');
  await mkdir(join(root, 'docs/decisions'), { recursive: true });
  await writeFile(join(root, DECISION), DECISION_TEXT);
  ok(cli(['init', '--existing', '--yes', '--agents', 'minimal'], root));
  await writeFile(join(root, '.agentos/project.yaml'), (await readFile(join(root, '.agentos/project.yaml'), 'utf8')).replace(/^name: .*$/m, 'name: P1 Project'));
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nSettle the tangerine refund window.\n');
  ok(cli(['brain', 'register', DECISION, '--kind', 'decision'], root));
  for (const [rel, text] of [['.obsidian/app.json', '{"theme":"dark"}\n'], ['Inbox/Groceries.md', '# Groceries\n\nmilk\n'], ['Projects/Projects.md', '# Projects\n']]) {
    await mkdir(dirname(join(vault, rel)), { recursive: true });
    await writeFile(join(vault, rel), text);
  }
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  return { base, root, vault };
}
const link = (root, vault, extra = []) => cli(['obsidian', 'link', '--vault', vault, '--dest', DEST, '--create', ...extra], root);
const records = (root) => json(['brain', 'list'], root).out.records;
const slugOf = (id) => id.slice('brain:'.length);
const targets = (note) => [...note.matchAll(/\]\(<([^>]*)>\)/g)].map((m) => m[1]);

/** Every link target in the note resolves to an existing file inside the vault root (Ralph's desktop failure). */
async function assertLinksInsideVault(noteAbs, vault) {
  const note = await readFile(noteAbs, 'utf8');
  const found = targets(note);
  assert.ok(found.length >= 5, note);
  for (const target of found) {
    const abs = resolve(dirname(noteAbs), target);
    const rel = relative(vault, abs);
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), `link leaves the vault: ${target}\n${note}`);
    assert.ok(await exists(abs), `link target missing: ${target}`);
  }
  return note;
}

// --- 1. links stay inside the vault, both flows ----------------------------------------------------

test('1: obsidian link (existing vault, canonical: workspace): every index link resolves inside the vault', async (t) => {
  const { root, vault } = await fixture(t);
  ok(link(root, vault));
  const note = await assertLinksInsideVault(join(vault, NOTE), vault);
  assert.match(note, /\[Decision 0001: Tangerine refund window\]\(<Records\/0001-tangerine-refund-window\.md>\) — `brain:0001-tangerine-refund-window` \(decision, accepted\) — read-only copy; the record is `docs\/decisions\/0001-tangerine-refund-window\.md` in the project/);
  assert.doesNotMatch(note, /outside this vault: edit in your editor|Navigation only|never copies/);
});

test('1: obsidian init --dir <new vault outside the workspace>: every index link resolves inside the vault', async (t) => {
  const { base, root } = await fixture(t);
  const vault = join(base, 'new-vault');
  ok(cli(['obsidian', 'init', '--dir', vault], root));
  await assertLinksInsideVault(join(vault, 'index.md'), vault);
  assert.ok(await exists(join(vault, 'Records/0001-tangerine-refund-window.md')));
});

// --- 2. mirror content -------------------------------------------------------------------------------

test('2: each out-of-vault record has a read-only mirror: frontmatter, no id, banner, body verbatim, hashes', async (t) => {
  const { root, vault } = await fixture(t);
  ok(link(root, vault));
  const list = records(root);
  assert.ok(list.length >= 5);
  assert.deepEqual((await readdir(join(vault, DEST, 'Records'))).sort(), list.map((r) => `${slugOf(r.id)}.md`).sort());
  for (const record of list) {
    const recordBody = split(await readFile(join(root, record.path), 'utf8')).body;
    const mirror = await readFile(join(vault, DEST, 'Records', `${slugOf(record.id)}.md`), 'utf8');
    const { fm, body } = split(mirror);
    const data = parseYaml(fm);
    assert.deepEqual(Object.keys(data).sort(), ['agentos_mirror_of', 'mirror_hash', 'source', 'source_hash', 'tags']);
    assert.doesNotMatch(fm, /^id\s*:/m, 'no id: a mirror is never a Brain record');
    assert.equal(data.agentos_mirror_of, record.id);
    assert.equal(data.source, record.path);
    assert.equal(data.source_hash, sha256(recordBody));
    assert.equal(data.mirror_hash, sha256(body));
    assert.deepEqual(data.tags, ['agentos-mirror']);
    assert.ok(body.startsWith('> [!warning] '), body);
    assert.ok(body.split('\n\n')[0].includes(`read-only copy; the record is \`${record.path}\` in the project`), body);
    assert.ok(body.endsWith(recordBody), 'record body verbatim');
  }
});

// --- 3. mirrors are never records --------------------------------------------------------------------

test('3: mirrors are not records: the same record count under canonical: workspace and canonical: vault', async (t) => {
  const { root, vault } = await fixture(t);
  ok(link(root, vault));
  const before = json(['brain', 'check'], root).out.records;
  const yaml = join(root, '.agentos/project.yaml');
  await writeFile(yaml, (await readFile(yaml, 'utf8')).replace('canonical: workspace', 'canonical: vault'));
  const after = json(['brain', 'check'], root);
  ok(after.r);
  assert.equal(after.out.records.length, before.length);
  assert.ok(after.out.records.every((r) => r.state !== 'invalid' && !r.path.includes('Records/')), JSON.stringify(after.out.records));
});

// --- 4. idempotent -----------------------------------------------------------------------------------

test('4: a second brain index leaves the vault byte- and mtime-identical', async (t) => {
  const { base, root, vault } = await fixture(t);
  ok(link(root, vault));
  ok(cli(['brain', 'index'], root));
  const snap = await snapshot(base);
  const again = cli(['brain', 'index'], root);
  ok(again);
  assert.match(again.stdout, /Unchanged: index note/);
  assert.deepEqual(await snapshot(base), snap);
});

// --- 5. stale mirror refreshed -----------------------------------------------------------------------

test('5: a workspace record edit refreshes its mirror on brain index; the index line is unchanged', async (t) => {
  const { root, vault } = await fixture(t);
  ok(link(root, vault));
  const noteBefore = await readFile(join(vault, NOTE), 'utf8');
  await writeFile(join(root, DECISION), (await readFile(join(root, DECISION), 'utf8')).replace('14 days', '21 days'));
  ok(cli(['brain', 'index'], root));
  const mirror = await readFile(join(vault, DEST, 'Records/0001-tangerine-refund-window.md'), 'utf8');
  assert.match(mirror, /21 days/);
  assert.equal(parseYaml(split(mirror).fm).source_hash, sha256(split(await readFile(join(root, DECISION), 'utf8')).body));
  assert.equal(await readFile(join(vault, NOTE), 'utf8'), noteBefore);
});

// --- 6. an edited mirror is kept and reported --------------------------------------------------------

test('6: an edited mirror is never overwritten: brain index and apply warn with the record path, doctor and check warn, exit codes unchanged', async (t) => {
  const { base, root, vault } = await fixture(t);
  ok(link(root, vault));
  const mirrorAbs = join(vault, DEST, 'Records/0001-tangerine-refund-window.md');
  const edited = `${await readFile(mirrorAbs, 'utf8')}\nRalph: make it 30 days.\n`;
  await writeFile(mirrorAbs, edited);
  const warning = /Records[\\/]0001-tangerine-refund-window\.md was edited in Obsidian; the record is docs\/decisions\/0001-tangerine-refund-window\.md[\s\S]*agentos brain propose brain:0001-tangerine-refund-window --from/;

  const index = cli(['brain', 'index'], root);
  ok(index);
  assert.match(index.stdout, warning);
  assert.equal(await readFile(mirrorAbs, 'utf8'), edited);

  await writeFile(join(base, 'p.md'), DECISION_TEXT.replace('14 days', '30 days'));
  ok(cli(['brain', 'propose', 'brain:0001-tangerine-refund-window', '--from', join(base, 'p.md')], root));
  const proposal = (await readdir(join(root, '.agentos/brain/proposals'))).find((name) => name.endsWith('.md'));
  const apply = cli(['brain', 'apply', proposal, '--by', 'ralph'], root);
  ok(apply);
  assert.match(apply.stdout, warning);
  assert.equal(await readFile(mirrorAbs, 'utf8'), edited, 'still kept after the record changed');

  const check = cli(['brain', 'check'], root);
  ok(check);
  assert.match(check.stdout, warning);
  const doctor = json(['doctor'], root);
  assert.equal(doctor.r.status, 0, doctor.r.stdout);
  assert.ok(doctor.out.warnings.some((w) => warning.test(w)), doctor.out.warnings.join('\n'));
});

test('6: editing only the mirror frontmatter is not an edit; it is refreshed silently', async (t) => {
  const { root, vault } = await fixture(t);
  ok(link(root, vault));
  const mirrorAbs = join(vault, DEST, 'Records/0001-tangerine-refund-window.md');
  const original = await readFile(mirrorAbs, 'utf8');
  await writeFile(mirrorAbs, original.replace('tags: [agentos-mirror]', 'tags:\n  - agentos-mirror'));
  const index = cli(['brain', 'index'], root);
  ok(index);
  assert.doesNotMatch(index.stdout, /edited in Obsidian/);
  assert.doesNotMatch(cli(['brain', 'check'], root).stdout, /edited in Obsidian/);
});

// --- 7. orphans ----------------------------------------------------------------------------------------

test('7: a record that is gone loses its unedited mirror; an edited orphan is kept with a warning', async (t) => {
  const { root, vault } = await fixture(t);
  ok(link(root, vault));
  const list = records(root).filter((r) => r.path.startsWith('.agentos/brain/'));
  assert.ok(list.length >= 2, JSON.stringify(list));
  const [plain, edited] = list;
  const editedAbs = join(vault, DEST, 'Records', `${slugOf(edited.id)}.md`);
  const editedText = `${await readFile(editedAbs, 'utf8')}\nmy note\n`;
  await writeFile(editedAbs, editedText);
  await rm(join(root, plain.path));
  await rm(join(root, edited.path));
  const index = cli(['brain', 'index'], root);
  ok(index);
  assert.equal(await exists(join(vault, DEST, 'Records', `${slugOf(plain.id)}.md`)), false, 'unedited orphan removed');
  assert.equal(await readFile(editedAbs, 'utf8'), editedText, 'edited orphan kept');
  assert.match(index.stdout, new RegExp(`Records[\\\\/]${slugOf(edited.id)}\\.md was edited in Obsidian`));
});

// --- 8. boundary ---------------------------------------------------------------------------------------

test('8: only <dest>/Records/** and the index note are added to the vault; the workspace stays clean; a clone without local.yaml writes no mirrors', async (t) => {
  const { base, root, vault } = await fixture(t);
  const before = await snapshot(vault);
  ok(link(root, vault));
  const after = await snapshot(vault);
  for (const [key, value] of Object.entries(before)) assert.deepEqual(after[key], value, `${key} untouched`);
  const added = Object.keys(after).filter((key) => !(key in before));
  for (const key of added) assert.ok(['Projects/TeaLedger', DEST, NOTE, `${DEST}/Records`].includes(key) || key.startsWith(`${DEST}/Records/`), `unexpected vault entry ${key}`);
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all').split('\n').filter((l) => l && !/\.agentos\/(project\.yaml|knowledge\.md)$/.test(l)).join('\n'), '', 'mirrors write nothing into the workspace');

  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'link');
  const clone = join(base, 'clone');
  git(base, 'clone', '-q', root, clone);
  assert.equal(await exists(join(clone, '.agentos/local.yaml')), false);
  const vaultSnap = await snapshot(vault);
  const context = cli(['context', 'claude', '--task', 't', '--about', 'tangerine'], clone);
  ok(context);
  assert.match(context.stdout, /Decision 0001: Tangerine refund window/);
  ok(cli(['brain', 'index'], clone));
  ok(cli(['brain', 'check'], clone));
  assert.deepEqual(await snapshot(vault), vaultSnap, 'no mirrors written from the clone');
  // shortcut: pre-existing (d0b4160) — under core.autocrlf=true, brain index rewrites the CRLF index.json as LF (same content), so git lists it as modified.
  assert.equal(git(clone, 'status', '--porcelain').split('\n').filter((l) => l && l !== ' M .agentos/brain/index.json').join('\n'), '');
  assert.equal(git(clone, 'diff'), '', 'index.json content unchanged');
});

// --- 9. in-workspace knowledge/ ------------------------------------------------------------------------

test('9: obsidian init (knowledge/ inside the workspace) writes mirrors that never enter git', async (t) => {
  const { root } = await fixture(t);
  ok(cli(['obsidian', 'init'], root));
  await assertLinksInsideVault(join(root, 'knowledge/index.md'), join(root, 'knowledge'));
  assert.ok(await exists(join(root, 'knowledge/Records/0001-tangerine-refund-window.md')));
  assert.equal(await readFile(join(root, 'knowledge/Records/.gitignore'), 'utf8'), '*\n');
  const status = git(root, 'status', '--porcelain', '--untracked-files=all');
  assert.doesNotMatch(status, /Records/, status);
});

// --- fallbacks and unchanged behaviour ----------------------------------------------------------------

test('a copy that cannot be written falls back to plain text plus the path; no link leaves the vault', async (t) => {
  const { root, vault } = await fixture(t);
  await mkdir(join(vault, DEST), { recursive: true });
  await writeFile(join(vault, DEST, 'Records'), 'a file where the Records folder would go\n');
  ok(link(root, vault));
  const note = await readFile(join(vault, NOTE), 'utf8');
  assert.deepEqual(targets(note).filter((target) => target.startsWith('..')), [], note);
  assert.match(note, /^- Decision 0001: Tangerine refund window — `brain:0001-tangerine-refund-window` \(decision, accepted\) — the record is `docs\/decisions\/0001-tangerine-refund-window\.md` in the project \(no read-only copy could be written\)$/m);
  assert.match(cli(['brain', 'index'], root).stdout, /Records is not a folder, so read-only copies cannot be written there/);
  assert.equal(await readFile(join(vault, DEST, 'Records'), 'utf8'), 'a file where the Records folder would go\n', 'the user file is untouched');
});

test('canonical: vault keeps direct links and writes no copies', async (t) => {
  const { root, vault } = await fixture(t);
  ok(link(root, vault, ['--canonical', 'vault']));
  ok(cli(['brain', 'index'], root));
  assert.equal(await exists(join(vault, DEST, 'Records')), false);
  assert.match(await readFile(join(vault, NOTE), 'utf8'), /\(<\.\.\/\.\.\/\.\.\/\.\.\/p1-project\/docs\/decisions\/0001-tangerine-refund-window\.md>\) — `brain:0001-tangerine-refund-window` \(decision, accepted\) — outside this vault: edit in your editor$/m);
});
