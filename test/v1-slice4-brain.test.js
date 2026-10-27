// v1 slice 4: managed Project Brain (`agentos brain …`).
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const cli = (args, cwd, opts = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', input: opts.input, env: { ...process.env, AGENTOS_ENGINE: '', ...opts.env } });
const json = (args, cwd, opts) => {
  const r = cli([...args, '--json'], cwd, opts);
  let out;
  try { out = JSON.parse(r.stdout); } catch { throw new Error(`not JSON (exit ${r.status}): ${r.stdout}\n${r.stderr}`); }
  return { r, out };
};

const HANDOFF = '# Handoff\n\n## Current objective\n\nPick the primary database.\n\n## Protected files / do not touch\n\n- .env files\n';
const ADR = '# ADR 0003: Use Postgres for storage\n\nWe store tenant data in Postgres.\n\n- Context: managed hosting.\n';
const OLD_ADR = '# ADR 0001: Use SQLite for storage\n\nEarly prototype used SQLite.\n';

async function workspace(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-v1s4-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  await mkdir(join(root, 'docs/adr'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'echo t' } }));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), HANDOFF);
  await writeFile(join(root, 'docs/adr/0003-use-postgres.md'), ADR);
  await writeFile(join(root, 'docs/adr/0001-use-sqlite.md'), OLD_ADR);
  await writeFile(join(base, 'outside.md'), '# Outside\n');
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

const read = (root, rel) => readFile(join(root, rel), 'utf8');
const bodyOf = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '');
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const fails = (r) => assert.equal(r.status, 1, r.stdout + r.stderr);

async function registered(t) {
  const ws = await workspace(t);
  ok(cli(['brain', 'register', 'docs/adr/0003-use-postgres.md', '--kind', 'adr'], ws.root));
  return ws;
}
async function propose(root, target, body, extra = []) {
  await writeFile(join(root, '..', 'proposal.md'), body);
  const { r, out } = json(['brain', 'propose', target, '--from', join(root, '..', 'proposal.md'), ...extra], root);
  return { r, out };
}

// --- register -------------------------------------------------------------------------------------

test('register: an existing ADR gets only a frontmatter block, its body is byte-identical, re-register is a no-op', async (t) => {
  const { root } = await workspace(t);
  const before = await snapshot(root);
  ok(cli(['brain', 'register', 'docs/adr/0003-use-postgres.md', '--kind', 'adr', '--dry-run'], root));
  assert.deepEqual(await snapshot(root), before, '--dry-run writes nothing');

  const { r, out } = json(['brain', 'register', 'docs/adr/0003-use-postgres.md', '--kind', 'adr'], root);
  ok(r);
  assert.equal(out.record.id, 'brain:0003-use-postgres');
  const text = await read(root, 'docs/adr/0003-use-postgres.md');
  assert.equal(bodyOf(text), ADR, 'body byte-identical');
  assert.match(text, /^---\nid: brain:0003-use-postgres\nkind: adr\nscope: \.\nstatus: accepted\nsources:\n {2}- docs\/adr\/0003-use-postgres\.md\nsource_hash: [a-f0-9]{64}\n/);
  assert.ok(JSON.parse(await read(root, '.agentos/brain/index.json')).records.some((record) => record.id === 'brain:0003-use-postgres'), 'index derived');

  const after = await snapshot(root);
  const again = cli(['brain', 'register', 'docs/adr/0003-use-postgres.md', '--kind', 'adr'], root);
  ok(again);
  assert.match(again.stdout, /already registered|no-op/i);
  assert.deepEqual(await snapshot(root), after, 're-register writes nothing');
});

test('register: existing frontmatter keeps its values, only missing keys are added, differing values are reported', async (t) => {
  const { root } = await workspace(t);
  await writeFile(join(root, 'docs/adr/0003-use-postgres.md'), `---\ntitle: Use Postgres\nkind: decision # keep me\n---\n${ADR}`);
  const { r, out } = json(['brain', 'register', 'docs/adr/0003-use-postgres.md', '--kind', 'adr'], root);
  ok(r);
  assert.deepEqual(out.conflicts.map((c) => c.key), ['kind']);
  const text = await read(root, 'docs/adr/0003-use-postgres.md');
  assert.match(text, /^---\ntitle: Use Postgres\nkind: decision # keep me\n/, 'existing lines untouched');
  assert.match(text, /\nid: brain:0003-use-postgres\n/);
  assert.equal(bodyOf(text), ADR);
});

test('register: refuses outside, .git, non-Markdown, symlinked and task_scope/rules frontmatter with zero writes', async (t) => {
  const { base, root } = await workspace(t);
  await mkdir(join(root, '.git'));
  await writeFile(join(root, '.git/notes.md'), '# git\n');
  await writeFile(join(root, 'notes.txt'), 'x\n');
  await symlink(join(base, 'outside.md'), join(root, 'docs/link.md'));
  await writeFile(join(root, 'docs/rules.md'), '---\ntask_scope:\n  edit: [.]\nrules: obey\n---\n# Rules\n');
  const before = await snapshot(base);
  for (const path of ['../outside.md', join(base, 'outside.md'), '.git/notes.md', 'notes.txt', 'docs/link.md', 'docs/missing.md']) {
    fails(cli(['brain', 'register', path], root));
  }
  const r = cli(['brain', 'register', 'docs/rules.md'], root);
  fails(r);
  assert.match(r.stdout + r.stderr, /task_scope/);
  assert.match(r.stdout + r.stderr, /allowed keys: .*source_hash/i);
  assert.deepEqual(await snapshot(base), before);
});

// --- init -----------------------------------------------------------------------------------------

test('init: creates templates with unknown markers, registers the existing decisions.md, refuses to overwrite', async (t) => {
  const { root } = await workspace(t); // `agentos init` already set the Brain up (Project Brain F5)
  const decisionsBefore = '# Decisions\n\nDurable decisions go here with date, reason, alternatives, and status.\n';
  const before = await snapshot(root);
  ok(cli(['init', '--existing', '--yes', '--dry-run'], root));
  assert.deepEqual(await snapshot(root), before);

  ok(cli(['init', '--existing', '--yes'], root)); // `brain init` (workspace) was removed in 3.0.0; init runs the same Brain setup
  assert.deepEqual(await snapshot(root), before, 'an already set-up Brain: brain init writes nothing');
  for (const name of ['architecture', 'conventions', 'glossary']) {
    const text = await read(root, `.agentos/brain/${name}.md`);
    assert.match(text, new RegExp(`^---\\nid: brain:${name}\\n`));
    assert.match(text, /\(unknown — fill in\)/);
    assert.match(text, /\nstatus: proposed\n/);
  }
  await assert.rejects(readFile(join(root, '.agentos/brain/decisions.md')), /ENOENT/, 'decisions.md not duplicated');
  const decisions = await read(root, '.agentos/decisions.md');
  assert.match(decisions, /^---\nid: brain:decisions\nkind: decision\n/);
  assert.equal(bodyOf(decisions), decisionsBefore);

  await writeFile(join(root, '.agentos/brain/glossary.md'), 'my own glossary\n');
  const after = await snapshot(root);
  const again = cli(['init', '--existing', '--yes'], root);
  assert.match(again.stdout + again.stderr, /glossary\.md.*exists/i);
  assert.deepEqual(await snapshot(root), after, 'refusal writes nothing');
});

// --- propose / preview / validate / apply ---------------------------------------------------------

const NEW_BODY = '# ADR 0003: Use Postgres for storage\n\nWe store tenant data in Postgres 16 with row-level security.\n';

test('lifecycle: propose -> preview (no writes) -> apply updates target and index; apply twice is a no-op', async (t) => {
  const { root } = await registered(t);
  const hash0 = (await read(root, 'docs/adr/0003-use-postgres.md')).match(/source_hash: (\w+)/)[1];
  let snap = await snapshot(root);
  const dry = await propose(root, 'brain:0003-use-postgres', NEW_BODY, ['--summary', 'pin version', '--dry-run']);
  ok(dry.r);
  assert.deepEqual(await snapshot(root), snap, 'propose --dry-run writes nothing');

  const { r, out } = await propose(root, 'brain:0003-use-postgres', NEW_BODY, ['--summary', 'pin version', '--by', 'codex']);
  ok(r);
  const proposal = out.path;
  assert.match(proposal, /^\.agentos\/brain\/proposals\/.+-0003-use-postgres\.md$/);
  const ptext = await read(root, proposal);
  assert.match(ptext, /\ntarget: brain:0003-use-postgres\n/);
  assert.match(ptext, new RegExp(`\\nbase_hash: ${hash0}\\n`));
  assert.match(ptext, /\nproposed_by: codex\n/);
  assert.match(ptext, /\nstatus: proposed\n/);
  assert.ok(ptext.endsWith(NEW_BODY));

  snap = await snapshot(root);
  const preview = cli(['brain', 'preview', proposal], root);
  ok(preview);
  assert.match(preview.stdout, /docs\/adr\/0003-use-postgres\.md/);
  assert.match(preview.stdout, /replace body/i);
  assert.match(preview.stdout, /\+We store tenant data in Postgres 16/);
  ok(cli(['brain', 'preview', proposal], root)); // `brain validate` was removed in 3.0.0
  ok(cli(['brain', 'apply', proposal, '--dry-run'], root));
  assert.deepEqual(await snapshot(root), snap, 'preview/validate/apply --dry-run write nothing');

  // D6: a real apply needs an explicit applier; it never defaults to the proposer.
  const refused = cli(['brain', 'apply', proposal], root);
  fails(refused);
  assert.match(refused.stderr, /needs --by <owner>[\s\S]*Nothing was written/);
  for (const by of [['--by', ''], ['--by']]) fails(cli(['brain', 'apply', proposal, ...by], root));
  assert.deepEqual(await snapshot(root), snap, 'apply without --by writes nothing');

  ok(cli(['brain', 'apply', proposal, '--by', 'owner'], root));
  const text = await read(root, 'docs/adr/0003-use-postgres.md');
  assert.match(text, new RegExp(`\\n {2}- \\S+ applied ${proposal.replace(/[.]/g, '\\.')} by owner \\(proposed by codex\\): ${hash0.slice(0, 7)}`));
  assert.equal(bodyOf(text), NEW_BODY);
  assert.match(text, /\nstatus: accepted\n/);
  const hash1 = text.match(/source_hash: (\w+)/)[1];
  assert.notEqual(hash1, hash0);
  assert.match(text, /\nupdated_at: /);
  assert.match(text, /\nhistory:\n {2}- .*0003-use-postgres\.md/);
  await assert.rejects(readFile(join(root, proposal)), /ENOENT/);
  const applied = proposal.replace('proposals/', 'proposals/applied/');
  assert.match(await read(root, applied), /\nstatus: applied\n/);
  assert.match(await read(root, applied), /\napplied_by: owner\n/);
  assert.match(await read(root, applied), /\nproposed_by: codex\n/);
  const index = JSON.parse(await read(root, '.agentos/brain/index.json'));
  assert.equal(index.records.find((rec) => rec.id === 'brain:0003-use-postgres').source_hash, hash1);

  snap = await snapshot(root);
  for (const ref of [proposal, applied]) {
    const again = cli(['brain', 'apply', ref, '--by', 'owner'], root);
    ok(again);
    assert.match(again.stdout, /already applied/i);
  }
  assert.deepEqual(await snapshot(root), snap, 'second apply writes nothing');
});

test('stale write: a second proposal on the old base_hash is rejected after the first applied, with zero writes', async (t) => {
  const { root } = await registered(t);
  const first = (await propose(root, 'brain:0003-use-postgres', NEW_BODY)).out.path;
  const second = (await propose(root, 'docs/adr/0003-use-postgres.md', `${ADR}\nAlso cache in Redis.\n`)).out.path;
  ok(cli(['brain', 'apply', first, '--by', 'owner'], root));
  const current = (await read(root, 'docs/adr/0003-use-postgres.md')).match(/source_hash: (\w+)/)[1];
  const base = (await read(root, second)).match(/base_hash: (\w+)/)[1];
  const snap = await snapshot(root);
  const { r, out } = json(['brain', 'preview', second], root);
  fails(r);
  const stale = out.rejections.find((item) => item.check === 'stale');
  assert.ok(stale, JSON.stringify(out));
  assert.match(stale.message, new RegExp(base));
  assert.match(stale.message, new RegExp(current));
  assert.match(stale.message, /re-verified after this proposal was written/);
  assert.doesNotMatch(stale.message, /edited since verification/, 'the body was not edited; do not blame it');
  const apply = cli(['brain', 'apply', second, '--by', 'owner'], root);
  fails(apply);
  assert.match(apply.stdout, /stale/i);
  assert.deepEqual(await snapshot(root), snap, 'rejected apply writes nothing');
});

test('stale write: a human body edit after the proposal also rejects the apply (no silent overwrite)', async (t) => {
  const { root } = await registered(t);
  const proposal = (await propose(root, 'brain:0003-use-postgres', NEW_BODY)).out.path;
  const path = join(root, 'docs/adr/0003-use-postgres.md');
  await writeFile(path, `${await readFile(path, 'utf8')}\nHuman note.\n`);
  const snap = await snapshot(root);
  const { r, out } = json(['brain', 'preview', proposal], root);
  fails(r);
  const stale = out.rejections.find((item) => item.check === 'stale');
  assert.ok(stale, JSON.stringify(out));
  // The cause is body drift (current_hash), not the base: never print `base_hash X != source_hash X`.
  assert.match(stale.message, /target body was edited since verification \(verified source_hash (\w+), body now hashes to (\w+)\)/);
  const [, verified, now] = stale.message.match(/verified source_hash (\w+), body now hashes to (\w+)/);
  assert.notEqual(verified, now);
  assert.doesNotMatch(stale.message, /re-verified|!=/);
  fails(cli(['brain', 'apply', proposal, '--by', 'owner'], root));
  assert.deepEqual(await snapshot(root), snap);
});

test('duplicate: an exact (whitespace-normalized) duplicate body is rejected and no proposal is written', async (t) => {
  const { root } = await registered(t);
  ok(cli(['brain', 'register', 'docs/adr/0001-use-sqlite.md', '--kind', 'adr'], root));
  const snap = await snapshot(root);
  for (const body of [ADR.replace('We store', 'We   store'), OLD_ADR]) {
    const { r, out } = await propose(root, 'brain:0003-use-postgres', body);
    fails(r);
    assert.ok(out.rejections.some((item) => item.check === 'duplicate'), JSON.stringify(out));
  }
  assert.deepEqual(await snapshot(root), snap);
});

test('proposal content with its own frontmatter is refused', async (t) => {
  const { root } = await registered(t);
  const snap = await snapshot(root);
  await writeFile(join(root, '..', 'fm.md'), '---\ntask_scope: x\n---\n# hi\n');
  const r = cli(['brain', 'propose', 'brain:0003-use-postgres', '--from', join(root, '..', 'fm.md')], root);
  fails(r);
  assert.match(r.stderr, /without frontmatter/);
  assert.deepEqual(await snapshot(root), snap);
});

test('propose reads stdin with --from - and defaults proposed_by to $AGENTOS_ENGINE', async (t) => {
  const { root } = await registered(t);
  const r = cli(['brain', 'propose', 'brain:0003-use-postgres', '--from', '-', '--append', '--json'], root, { input: '## Backups\n\nNightly.\n', env: { AGENTOS_ENGINE: 'claude-code' } });
  ok(r);
  const text = await read(root, JSON.parse(r.stdout).path);
  assert.match(text, /\nproposed_by: claude-code\n/);
  assert.match(text, /\nmode: append\n/);
  ok(cli(['brain', 'apply', JSON.parse(r.stdout).path, '--by', 'owner'], root));
  assert.equal(bodyOf(await read(root, 'docs/adr/0003-use-postgres.md')), `${ADR}\n## Backups\n\nNightly.\n`);
});

// --- supersession and context ---------------------------------------------------------------------

test('supersedes: the old record becomes superseded; context omits it by default, show still displays it', async (t) => {
  const { root } = await registered(t);
  ok(cli(['brain', 'register', 'docs/adr/0001-use-sqlite.md', '--kind', 'adr'], root));
  const before = json(['context', 'claude', '--task', 'storage database sqlite postgres'], root).out;
  assert.ok(before.included.some((item) => item.id === 'brain:0001-use-sqlite'));

  const proposal = (await propose(root, 'brain:0003-use-postgres', NEW_BODY, ['--supersedes', 'brain:0001-use-sqlite'])).out.path;
  const preview = cli(['brain', 'preview', proposal], root);
  assert.match(preview.stdout, /brain:0001-use-sqlite.*superseded/);
  ok(cli(['brain', 'apply', proposal, '--by', 'owner'], root));
  const old = await read(root, 'docs/adr/0001-use-sqlite.md');
  assert.match(old, /\nstatus: superseded\n/);
  assert.match(old, /\nsuperseded_by: brain:0003-use-postgres\n/);
  assert.equal(bodyOf(old), OLD_ADR, 'superseded body untouched');

  const after = json(['context', 'claude', '--task', 'storage database sqlite postgres'], root).out;
  assert.ok(!after.included.some((item) => item.id === 'brain:0001-use-sqlite'));
  assert.deepEqual(after.omitted.find((item) => item.id === 'brain:0001-use-sqlite')?.reason, 'superseded');
  const shown = json(['brain', 'show', 'brain:0001-use-sqlite'], root);
  ok(shown.r);
  assert.equal(shown.out.record.status, 'superseded');
  assert.equal(shown.out.record.superseded_by, 'brain:0003-use-postgres');
});

test('context: includes an accepted record for a matching task, labels a proposed one and ranks it lower', async (t) => {
  const { root } = await registered(t);
  ok(cli(['brain', 'register', 'docs/adr/0001-use-sqlite.md', '--kind', 'adr', '--status', 'proposed'], root));
  const { r, out } = json(['context', 'claude', '--task', 'storage choice'], root);
  ok(r);
  const ids = out.included.map((item) => item.id);
  assert.ok(ids.includes('brain:0003-use-postgres'));
  assert.ok(ids.indexOf('brain:0001-use-sqlite') > ids.indexOf('brain:0003-use-postgres'), ids.join(','));
  assert.match(out.text, /## Brain \(adr, accepted\): ADR 0003: Use Postgres for storage\nSource: docs\/adr\/0003-use-postgres\.md\n/);
  assert.match(out.text, /ADR 0001: Use SQLite for storage \[proposed\]/);
  assert.doesNotMatch(out.text, /We store tenant data/, 'by reference, not inlined as instructions');
});

// --- human edits, check, verify, invalid ----------------------------------------------------------

test('check: a human body edit is reported as changed, the file is not rewritten; verify refreshes explicitly', async (t) => {
  const { root } = await registered(t);
  const path = join(root, 'docs/adr/0003-use-postgres.md');
  const edited = `${await readFile(path, 'utf8')}\nHuman addendum.\n`;
  await writeFile(path, edited);
  const snap = await snapshot(root);
  const { r, out } = json(['brain', 'check'], root);
  ok(r);
  assert.equal(out.records.find((rec) => rec.id === 'brain:0003-use-postgres').state, 'changed');
  assert.match(cli(['brain', 'check'], root).stdout, /source changed since verification/);
  const doctor = json(['doctor'], root);
  assert.ok(doctor.out.warnings.some((w) => /brain:0003-use-postgres.*source changed since verification/.test(w)), doctor.out.warnings.join('\n'));
  ok(cli(['brain', 'verify', 'brain:0003-use-postgres', '--by', 'ralph', '--dry-run'], root));
  assert.deepEqual(await snapshot(root), snap, 'check/doctor/verify --dry-run write nothing');
  assert.equal(await readFile(path, 'utf8'), edited);

  ok(cli(['brain', 'verify', 'brain:0003-use-postgres', '--by', 'ralph'], root));
  const text = await readFile(path, 'utf8');
  assert.match(text, /\nstatus: verified\n/);
  assert.match(text, /\nverified_by: ralph\n/);
  assert.match(text, /\nverified_at: /);
  assert.equal(bodyOf(text), bodyOf(edited));
  assert.equal(json(['brain', 'check'], root).out.records[0].state, 'ok');
});

test('check: invalid frontmatter is reported with file:line, listed as invalid, file untouched; doctor fails', async (t) => {
  const { root } = await registered(t);
  const broken = '---\nid: brain:broken\nkind: adr\nstatus: [unclosed\n---\n# Broken\n';
  const rules = '---\nid: brain:ruled\nkind: note\nscope: .\nstatus: accepted\nsources:\n  - docs/ruled.md\nsource_hash: abc\nallowed_tools: [bash]\n---\n# Ruled\n';
  await writeFile(join(root, 'docs/broken.md'), broken);
  await writeFile(join(root, 'docs/ruled.md'), rules);
  const snap = await snapshot(root);
  const { r, out } = json(['brain', 'check'], root);
  fails(r);
  const bad = out.records.find((rec) => rec.path === 'docs/broken.md');
  assert.equal(bad.state, 'invalid');
  assert.match(bad.problems.join('\n'), /docs\/broken\.md:\d+/);
  const ruled = out.records.find((rec) => rec.path === 'docs/ruled.md');
  assert.equal(ruled.state, 'invalid');
  assert.match(ruled.problems.join('\n'), /docs\/ruled\.md:9: unknown key allowed_tools/);
  const list = json(['brain', 'list'], root).out;
  assert.equal(list.records.find((rec) => rec.path === 'docs/broken.md').status, 'invalid');
  const doctor = json(['doctor'], root);
  assert.equal(doctor.r.status, 1);
  assert.ok(doctor.out.problems.some((p) => /docs\/broken\.md:\d+/.test(p)), doctor.out.problems.join('\n'));
  assert.deepEqual(await snapshot(root), snap, 'nothing rewritten or dropped');
  assert.equal(await read(root, 'docs/broken.md'), broken);
});

// --- read-only commands ---------------------------------------------------------------------------

test('read-only: list/show/search/check/preview leave the tree unchanged; search reuses context term matching', async (t) => {
  const { root } = await registered(t);
  ok(cli(['init', '--existing', '--yes'], root)); // `brain init` (workspace) was removed in 3.0.0; init runs the same Brain setup
  const proposal = (await propose(root, 'brain:0003-use-postgres', NEW_BODY)).out.path;
  const snap = await snapshot(root);
  const search = json(['brain', 'search', 'postgres', 'storages'], root);
  ok(search.r);
  assert.deepEqual(search.out.records.map((rec) => rec.id), ['brain:0003-use-postgres']);
  assert.deepEqual(search.out.records[0].matched, ['postgre', 'storage']);
  ok(cli(['brain', 'list'], root));
  ok(cli(['brain', 'list', '--status', 'proposed', '--kind', 'architecture'], root));
  assert.deepEqual(json(['brain', 'list', '--status', 'proposed', '--kind', 'architecture'], root).out.records.map((rec) => rec.id), ['brain:architecture']);
  ok(cli(['brain', 'show', 'brain:0003-use-postgres'], root));
  fails(cli(['brain', 'show', 'brain:nope'], root));
  ok(cli(['brain', 'check'], root));
  ok(cli(['brain', 'preview', proposal], root));
  ok(cli(['brain', 'preview', proposal], root)); // `brain validate` was removed in 3.0.0
  assert.deepEqual(await snapshot(root), snap);
});

test('preview flags (but does not reject) an ambiguous conflict with another accepted record of the same subject', async (t) => {
  const { root } = await registered(t);
  await writeFile(join(root, 'docs/adr/0004-storage.md'), '# 2026-10-01 — ADR 0003: Use Postgres for storage\n\nDuplicate subject, different text.\n');
  ok(cli(['brain', 'register', 'docs/adr/0004-storage.md', '--kind', 'adr'], root));
  const proposal = (await propose(root, 'brain:0003-use-postgres', NEW_BODY)).out.path;
  const { r, out } = json(['brain', 'preview', proposal], root);
  ok(r);
  assert.ok(out.flags.some((item) => item.check === 'conflict' && item.ids.includes('brain:0004-storage')), JSON.stringify(out));
});
