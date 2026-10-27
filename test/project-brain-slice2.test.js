// Project Brain slice 2: index refresh, nested status, unreadable storage, missing-index recovery (F7–F10, A05–A08).
import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
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
const START = '<!-- agentos:brain-index:start';
const END = '<!-- agentos:brain-index:end -->';
const count = (text, needle) => text.split(needle).length - 1;
const NOTE = 'knowledge/index.md';
const DEST = 'Projects/Demo';
const asRoot = process.getuid?.() === 0; // root ignores chmod 000

/** Make the index note unwritable. POSIX: a read-only folder, so no temp file can be created next to the note.
 *  Windows ignores directory mode bits; there the note's read-only attribute makes the atomic rename over it fail. */
const blockNote = (root, blocked) => process.platform === 'win32'
  ? chmod(join(root, 'knowledge', 'index.md'), blocked ? 0o444 : 0o644)
  : chmod(join(root, 'knowledge'), blocked ? 0o555 : 0o755);

/** Every file under dir (path → bytes + mtime); dot-git excluded. */
async function snapshot(dir) {
  const result = {};
  async function walk(path, rel = '') {
    for (const name of (await readdir(path)).sort()) {
      const abs = join(path, name), key = rel ? `${rel}/${name}` : name, info = await lstat(abs);
      if (info.isDirectory()) { result[key] = 'dir'; await walk(abs, key); } else result[key] = [(await readFile(abs)).toString('base64'), info.mtimeMs];
    }
  }
  await walk(dir);
  return result;
}

/** A workspace (path with a space) with a local Brain (4 records) and an `obsidian init` folder. */
async function workspace(t, { obsidian = true } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'agentos pb2 '));
  t.after(async () => { await chmodAll(base); await rm(base, { recursive: true, force: true }); });
  const root = join(base, 'my ws');
  await mkdir(root);
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nShip the demo.\n');
  if (obsidian) ok(cli(['obsidian', 'init'], root));
  ok(cli(['init', '--existing', '--yes'], root)); // `brain init` (workspace) was removed in 3.0.0; init runs the same Brain setup
  return { base, root };
}
async function chmodAll(dir) {
  await chmod(dir, 0o755).catch(() => {});
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) if (entry.isDirectory()) await chmodAll(join(dir, entry.name));
}
const block = (text) => text.slice(text.indexOf(START), text.indexOf(END) + END.length);

// --- A05 / F7: index refresh ------------------------------------------------------------------------

test('F7/A05: Brain writes refresh the generated block of the index note; unchanged input is byte-identical', async (t) => {
  const { root } = await workspace(t);
  const note = await read(root, NOTE);
  assert.equal(count(note, START), 1, note);
  assert.equal(count(note, END), 1);
  for (const id of ['architecture', 'conventions', 'glossary', 'decisions']) assert.match(block(note), new RegExp(`\`brain:${id}\``), `links ${id}`);
  assert.match(block(note), /\]\(<\.\.\/\.agentos\/brain\/architecture\.md>\)/, 'relative link, never a copy');

  const before = await snapshot(root);
  const again = cli(['brain', 'index'], root);
  ok(again);
  assert.match(again.stdout, /Unchanged: index note knowledge\/index.md/);
  assert.deepEqual(await snapshot(root), before, 'repeat: no bytes and no mtimes change');
  ok(cli(['brain', 'verify', 'brain:glossary', '--by', 'ralph'], root));
  ok(cli(['brain', 'index'], root));
  const after = await read(root, NOTE);
  assert.match(block(after), /`brain:glossary` \(note, verified\)/);
  assert.equal(count(after, START), 1, 'no duplicate sections');
});

test('A05: human prose around the generated block survives refresh; edits inside the block are replaced', async (t) => {
  const { root } = await workspace(t);
  const note = await read(root, NOTE);
  const edited = `PROSE-TOP: why this project exists.\n\n${note.replace(END, `- my hand edit inside the block\n${END}`)}\n## My notes\n\nPROSE-BOTTOM kept.\n`;
  await writeFile(join(root, NOTE), edited);
  await writeFile(join(root, 'notes.md'), '# Notes\n\nLocal.\n');
  ok(cli(['brain', 'register', 'notes.md'], root));
  const after = await read(root, NOTE);
  assert.ok(after.startsWith('PROSE-TOP: why this project exists.\n\n'), after);
  assert.ok(after.endsWith('\n## My notes\n\nPROSE-BOTTOM kept.\n'), after);
  assert.match(block(after), /`brain:notes`/);
  assert.doesNotMatch(after, /my hand edit inside the block/);
  assert.equal(count(after, START), 1);
  assert.equal(after.replace(block(after), ''), edited.replace(block(edited), ''), 'every byte outside the block is kept');
  const snap = await snapshot(root);
  ok(cli(['brain', 'index'], root));
  assert.deepEqual(await snapshot(root), snap, 'repeat: no churn');
});

/** The index note exactly as `obsidian init` wrote it before slice 2 (no markers), plus a human edit. */
const legacyNote = (records) => ['# My Ws AgentOS Index', '', 'Written once by `agentos obsidian init|link`; AgentOS never overwrites it. Edit it freely.', '', 'HUMAN-EDIT: keep me.', '', '## Brain records', '', ...records, ''].join('\n');

test('A05: an older unmarked index note is never overwritten without a preview; --adopt keeps the human text', async (t) => {
  const { root } = await workspace(t);
  const legacy = legacyNote(['- None registered yet (`agentos brain init`, `agentos brain register <path>`).']);
  await writeFile(join(root, NOTE), legacy);
  await writeFile(join(root, 'notes.md'), '# Notes\n\nLocal.\n');
  const write = cli(['brain', 'register', 'notes.md'], root);
  ok(write);
  assert.match(write.stdout, /index note .*no agentos:brain-index markers.*agentos brain index --adopt/s);
  assert.equal(await read(root, NOTE), legacy, 'a Brain write leaves the unmarked note alone');
  assert.match(await read(root, 'notes.md'), /^---\nid: brain:notes/, 'the record write is kept');

  const preview = cli(['brain', 'index'], root);
  ok(preview);
  assert.match(preview.stdout, /Preview of --adopt/);
  assert.match(preview.stdout, /^\+.*`brain:notes`/m);
  assert.equal(await read(root, NOTE), legacy, 'preview writes nothing to the note');
  ok(cli(['brain', 'index', '--adopt', '--dry-run'], root));
  assert.equal(await read(root, NOTE), legacy, '--dry-run writes nothing');

  ok(cli(['brain', 'index', '--adopt'], root));
  const adopted = await read(root, NOTE);
  assert.match(adopted, /HUMAN-EDIT: keep me\./);
  assert.match(adopted, /^# My Ws AgentOS Index/);
  assert.doesNotMatch(adopted, /None registered yet/, 'the old generated list is replaced');
  assert.doesNotMatch(adopted, /AgentOS never overwrites it/, 'the outdated promise is replaced');
  assert.equal(count(adopted, '## Brain records'), 1);
  assert.equal(count(adopted, START), 1);
  assert.match(block(adopted), /`brain:notes`/);
  const snap = await snapshot(root);
  ok(cli(['brain', 'index', '--adopt'], root));
  assert.deepEqual(await snapshot(root), snap, 'adopting twice is a no-op');
});

test('A05: a hand-written Brain records section is not discarded on adoption, and broken markers are refused', async (t) => {
  const { root } = await workspace(t);
  const hand = '- [Architecture](<../.agentos/brain/architecture.md>) — my own words about it';
  await writeFile(join(root, NOTE), legacyNote([hand]));
  ok(cli(['brain', 'index', '--adopt'], root));
  const adopted = await read(root, NOTE);
  assert.ok(adopted.includes(`HUMAN-EDIT: keep me.\n\n## Brain records\n\n${hand}\n`), 'hand-written section kept as-is');
  assert.ok(adopted.indexOf(hand) < adopted.indexOf(START), 'the generated block is appended after it');
  assert.equal(count(adopted, START), 1);

  const broken = `${adopted}\n${START} -->\n`;
  await writeFile(join(root, NOTE), broken);
  const r = cli(['brain', 'index', '--adopt'], root);
  fails(r);
  assert.match(r.stdout, /markers .*fix .*by hand/i);
  assert.equal(await read(root, NOTE), broken);
});

test('A05/A20: an index note write failure keeps the Brain write and reports the note stale', async (t) => {
  if (asRoot) return t.skip('running as root');
  const { root } = await workspace(t);
  await writeFile(join(root, 'notes.md'), '# Notes\n\nLocal.\n');
  await blockNote(root, true);
  const r = json(['brain', 'register', 'notes.md'], root);
  ok(r.r);
  assert.equal(r.out.note_stale, true, r.r.stdout);
  assert.equal(r.out.index_stale, undefined, 'index.json itself was refreshed');
  assert.match(await read(root, 'notes.md'), /^---\nid: brain:notes/);
  assert.match(await read(root, '.agentos/brain/index.json'), /brain:notes/);
  assert.match(cli(['brain', 'verify', 'brain:notes'], root).stdout, /index note .* is stale/);
  await blockNote(root, false);
  ok(cli(['brain', 'index'], root));
  assert.match(await read(root, NOTE), /`brain:notes`/, 'the next run catches up');
});

// --- A06 / F8: nested invocation ---------------------------------------------------------------------

test('F8/A06: root and nested invocations resolve the same binding', async (t) => {
  const { root } = await workspace(t);
  const deep = join(root, 'sub/deeper');
  await mkdir(deep, { recursive: true });
  const top = cli(['obsidian', 'status'], root), nested = cli(['obsidian', 'status'], deep);
  ok(top);
  ok(nested);
  assert.equal(nested.stdout, top.stdout);
  assert.match(top.stdout, new RegExp(`Workspace path: ${join(realpathSync(root), 'knowledge').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), 'resolved against the workspace root');
  assert.deepEqual(json(['brain', 'list'], deep).out, json(['brain', 'list'], root).out);
  assert.deepEqual(json(['brain', 'check'], deep).out, json(['brain', 'check'], root).out);
  await rm(join(root, NOTE));
  ok(cli(['brain', 'index'], deep));
  assert.ok(await exists(join(root, NOTE)), 'recreated at the root binding');
  assert.equal(await exists(join(deep, 'knowledge')), false, 'nothing created under the cwd');
});

// --- A07 / F9: unreadable vs empty vs absent ---------------------------------------------------------

test('F9/A07: an unreadable directory holding records is not reported complete; its last-known records are kept', { skip: process.platform === 'win32' && 'POSIX-only fault: chmod 0o000 cannot make a directory unreadable on Windows (only the read-only attribute exists; Node has no ACL API). The product treats any non-ENOENT read error (EACCES/EPERM) the same way' }, async (t) => {
  if (asRoot) return t.skip('running as root');
  const { root } = await workspace(t, { obsidian: false });
  await mkdir(join(root, 'docs/adr'), { recursive: true });
  await writeFile(join(root, 'docs/adr/0001.md'), '# ADR 1\n\nUse Bun.\n');
  ok(cli(['brain', 'register', 'docs/adr/0001.md'], root));
  await chmod(join(root, 'docs/adr'), 0o000);

  const list = json(['brain', 'list'], root);
  ok(list.r);
  const adr = list.out.records.find((r) => r.id === 'brain:0001');
  assert.equal(adr?.state, 'unreadable', JSON.stringify(list.out));
  const listed = cli(['brain', 'list'], root).stdout;
  assert.match(listed, /brain:0001 \[unreadable\] \S+ docs\/adr\/0001\.md: docs\/adr is unreadable \(EACCES: permission denied\) — /);
  assert.doesNotMatch(listed, /\(\(|\)\)/, 'no doubled parentheses');
  const check = cli(['brain', 'check'], root);
  fails(check);
  assert.match(check.stdout, /1 unreadable/);
  assert.match(check.stdout, /unreadable brain:0001 \(docs\/adr\/0001\.md\): docs\/adr is unreadable \(EACCES: permission denied\)/);
  const context = json(['context', 'claude', '--task', 'adr', '--require-complete'], root);
  fails(context.r);
  assert.ok(context.out.missing.some((m) => /^brain:0001 .*EACCES/.test(m)), JSON.stringify(context.out.missing));
  const doctor = json(['doctor'], root);
  assert.ok(doctor.out.warnings.some((w) => /docs\/adr is unreadable/.test(w)), doctor.out.warnings.join('\n'));

  await writeFile(join(root, 'notes.md'), '# Notes\n\nLocal.\n');
  ok(cli(['brain', 'register', 'notes.md'], root)); // regenerates index.json while docs/adr is unreadable
  assert.match(await read(root, '.agentos/brain/index.json'), /brain:0001/, 'last-known identity survives a Brain write');
  fails(cli(['context', 'claude', '--task', 'adr', '--require-complete'], root));

  await chmod(join(root, 'docs/adr'), 0o755);
  ok(cli(['brain', 'check'], root));
  ok(cli(['context', 'claude', '--task', 'adr', '--require-complete'], root));
});

test('A07: an unreadable directory with no known records is a warning, not missing knowledge', { skip: process.platform === 'win32' && 'POSIX-only fault: chmod 0o000 cannot make a directory unreadable on Windows (only the read-only attribute exists; Node has no ACL API). The product treats any non-ENOENT read error (EACCES/EPERM) the same way' }, async (t) => {
  if (asRoot) return t.skip('running as root');
  const { root } = await workspace(t, { obsidian: false });
  await mkdir(join(root, 'pgdata'));
  await chmod(join(root, 'pgdata'), 0o000);
  const check = cli(['brain', 'check'], root);
  ok(check);
  assert.match(check.stdout, /pgdata is unreadable \(EACCES: permission denied\); no records known there/);
  ok(cli(['context', 'claude', '--task', 'demo', '--require-complete'], root));
});

/** canonical: vault with one record in the linked folder. */
async function vaultWorkspace(t) {
  const { base, root } = await workspace(t, { obsidian: false });
  const vault = join(base, 'my vault');
  await mkdir(vault);
  ok(cli(['obsidian', 'link', '--vault', vault, '--dest', DEST, '--canonical', 'vault', '--create'], root));
  await writeFile(join(vault, DEST, 'design.md'), '# Design\n\nThe API is versioned.\n');
  ok(cli(['brain', 'register', join(vault, DEST, 'design.md')], root));
  return { base, root, vault, dir: join(vault, DEST) };
}

test('A07: vault folder unreadable vs absent vs empty are reported differently; required records stay Missing', async (t) => {
  if (asRoot) return t.skip('running as root');
  const { base, root, dir } = await vaultWorkspace(t);
  const missing = () => { const c = json(['context', 'claude', '--task', 'design', '--require-complete'], root); fails(c.r); return c.out.missing; };

  if (process.platform !== 'win32') { // unreadable: POSIX-only fault (chmod 0o000 cannot deny reads on Windows); absent/empty run everywhere
    await chmod(dir, 0o000);
    assert.ok(missing().some((m) => m.startsWith('brain:design') && /vault unreadable: .*EACCES: permission denied/.test(m)));
    assert.equal(json(['brain', 'list'], root).out.records.find((r) => r.id === 'brain:design')?.state, 'unavailable');
    const status = cli(['obsidian', 'status'], root);
    fails(status);
    assert.match(status.stdout, /Workspace folder unreadable: .*EACCES/);
    await chmod(dir, 0o755);
  }

  await rename(dir, join(base, 'moved'));
  assert.ok(missing().includes(`vault unavailable: ${dir}`));
  assert.match(cli(['obsidian', 'status'], root).stdout, /Workspace folder missing: /);

  await mkdir(dir);
  assert.ok(missing().some((m) => m.startsWith('brain:design') && /vault folder empty: .*1 record\(s\) last known there/.test(m)));
  await rm(dir, { recursive: true });
  await rename(join(base, 'moved'), dir);
  ok(cli(['context', 'claude', '--task', 'design', '--require-complete'], root));
});

// --- A08 / F10 (recovery): deleted derived index -----------------------------------------------------

test('F10/A08: deleted index note and index.json are recreated from the records; config, records and history untouched', async (t) => {
  const { root } = await workspace(t);
  ok(cli(['brain', 'verify', 'brain:glossary', '--by', 'ralph'], root)); // a history entry
  ok(cli(['checkpoint', '--task', 'demo', '--progress', 'p', '--next', 'n'], root));
  const note = await read(root, NOTE);
  const index = await read(root, '.agentos/brain/index.json');
  await rm(join(root, NOTE));
  await rm(join(root, '.agentos/brain/index.json'));
  const kept = await snapshot(root);

  const status = cli(['obsidian', 'status'], root);
  fails(status);
  assert.match(status.stdout, /no index note.*agentos brain index/s);
  for (const args of [['brain', 'list'], ['brain', 'check'], ['obsidian', 'status'], ['context', 'claude', '--task', 'demo'], ['doctor']]) cli(args, root);
  assert.deepEqual(await snapshot(root), kept, 'status/read commands stay read-only');

  const dry = cli(['brain', 'index', '--dry-run'], root);
  ok(dry);
  assert.match(dry.stdout, /Would create/);
  assert.deepEqual(await snapshot(root), kept, '--dry-run writes nothing');

  const r = cli(['brain', 'index'], root);
  ok(r);
  assert.equal(await read(root, NOTE), note, 'index note recreated byte-identical');
  assert.equal(await read(root, '.agentos/brain/index.json'), index, 'index.json recreated byte-identical');
  const now = await snapshot(root);
  for (const [key, value] of Object.entries(kept)) assert.deepEqual(now[key], value, `${key} untouched`);
  assert.match(await read(root, '.agentos/brain/glossary.md'), /verified by ralph/, 'history kept');
  ok(cli(['obsidian', 'status'], root));
  ok(cli(['brain', 'index'], root));
  assert.deepEqual(await snapshot(root), now, 'repeatable: a second run changes nothing');
  const again = cli(['obsidian', 'init'], root);
  fails(again);
  assert.match(again.stdout, /agentos brain index/, 'obsidian init points at the recovery command');
});
