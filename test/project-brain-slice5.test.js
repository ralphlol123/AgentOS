// Project Brain slice 5 (goal "Slice 5"): checkpoint-driven knowledge proposals (A18–A20) and the resume clean start.
import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
let ENV = {};
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV, AGENTOS_ENGINE: '', ...ENV } });
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const fails = (r) => assert.equal(r.status, 1, r.stdout + r.stderr);
const json = (args, cwd) => {
  const r = cli([...args, '--json'], cwd);
  try { return { r, out: JSON.parse(r.stdout) }; } catch { throw new Error(`not JSON (exit ${r.status}): ${r.stdout}\n${r.stderr}`); }
};
const git = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } }); assert.equal(r.status, 0, r.stderr); };
const read = (root, rel) => readFile(join(root, rel), 'utf8');
const exists = (path) => lstat(path).then(() => true, () => false);
const asRoot = process.getuid?.() === 0;

/** Make the index note unwritable. POSIX: a read-only folder, so no temp file can be created next to the note.
 *  Windows ignores directory mode bits; there the note's read-only attribute makes the atomic rename over it fail. */
const blockNote = (root, blocked) => process.platform === 'win32'
  ? chmod(join(root, 'knowledge', 'index.md'), blocked ? 0o444 : 0o644)
  : chmod(join(root, 'knowledge'), blocked ? 0o555 : 0o755);
const PROPOSALS = '.agentos/brain/proposals';
const ADR_PATH = 'docs/adr/0003-use-postgres.md';
const ADR = '# ADR 0003: Use Postgres for storage\n\nWe store tenant data in Postgres.\n';
const NEW_BODY = '# ADR 0003: Use Postgres 16 for storage\n\nWe store tenant data in Postgres 16 (pinned in src/db.js).\n';
const TASK = 'storage';

/** A git workspace (path with a space) with an `obsidian init` folder and one registered ADR, all committed. */
async function workspace(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos pb5 '));
  t.after(async () => { await chmod(join(base, 'my ws', 'knowledge'), 0o755).catch(() => {}); await rm(base, { recursive: true, force: true }); });
  const root = join(base, 'my ws');
  await mkdir(join(root, 'docs/adr'), { recursive: true });
  await mkdir(join(root, 'src'));
  await mkdir(join(base, 'tmp'));
  ENV = { TMPDIR: join(base, 'tmp') };
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'echo t' } }));
  await writeFile(join(root, 'src/db.js'), 'export const db = "postgres";\n');
  await writeFile(join(root, ADR_PATH), ADR);
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nPin the storage version.\n');
  ok(cli(['obsidian', 'init'], root));
  ok(cli(['brain', 'register', ADR_PATH, '--kind', 'adr'], root));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  await writeFile(join(base, 'proposal.md'), NEW_BODY);
  return { base, root, proposal: join(base, 'proposal.md') };
}
const pending = async (root) => (await readdir(join(root, PROPOSALS)).catch(() => [])).filter((name) => name.endsWith('.md'));
const applied = async (root) => readdir(join(root, PROPOSALS, 'applied')).catch(() => []);

/** Meaningful completion: a code change plus an observed passing check, then the checkpoint. */
async function complete(root) {
  await writeFile(join(root, 'src/db.js'), 'export const db = "postgres@16";\n');
  const r = cli(['checkpoint', '--task', TASK, '--progress', 'Pinned Postgres 16', '--next', 'none', '--check', `${process.execPath} -e 0`], root);
  ok(r);
  return r;
}
const stage = (root, from, extra = []) => json(['brain', 'propose', 'brain:0003-use-postgres', '--from', from, '--task', TASK, ...extra], root);

// --- A18 (CLI/fixture): the instruction and the staging step ----------------------------------------

test('A18: the checkpoint output and the generated loop ask for the knowledge review; a meaningful completion stages one focused proposal tied to the checkpoint', async (t) => {
  const { root, proposal } = await workspace(t);
  const done = await complete(root);
  assert.match(done.stdout, /Knowledge: .*durable project knowledge.*`agentos brain propose <record-id> --from <file> --task storage`.*stage nothing/);
  assert.deepEqual(await pending(root), [], 'a checkpoint never stages a proposal by itself');
  assert.match(await read(root, '.agentos/guide.md'), /agentos brain propose <id-or-path> --from <file\|-> --task <id>/);
  for (const file of ['AGENTS.md', 'CLAUDE.md', '.hermes.md']) assert.match(await read(root, file), /agentos brain propose <record> --from <file> --task <id>/, file);

  const { r, out } = stage(root, proposal, ['--summary', 'pin Postgres 16', '--by', 'codex']);
  ok(r);
  const current = JSON.parse(await read(root, `.agentos/checkpoints/${TASK}/current.json`));
  assert.equal(out.proposal.task, TASK);
  assert.equal(out.proposal.checkpoint, current.id);
  assert.deepEqual(await pending(root), [out.path.split('/').at(-1)], 'one proposal');
  const text = await read(root, out.path);
  assert.match(text, /\ntarget: brain:0003-use-postgres\n/);
  assert.match(text, /\nbase_hash: [a-f0-9]{64}\n/);
  assert.match(text, new RegExp(`\\ntask: ${TASK}\\n`));
  assert.match(text, new RegExp(`\\ncheckpoint: ${current.id}\\n`));
  assert.match(text, /\nevidence:\n {2}- "?changed: src\/db\.js"?\n/);
  assert.match(text, /\n {2}- "?observed-pass: .* -e 0 \(cwd \.\)"?\n/);
  assert.ok(text.endsWith(NEW_BODY), 'the body is the engine-written text');
  const preview = cli(['brain', 'preview', out.path], root);
  ok(preview);
  assert.match(preview.stdout, new RegExp(`Checkpoint: ${current.id} \\(task ${TASK}\\)`));
  assert.match(preview.stdout, /Evidence: changed: src\/db\.js/);
  ok(cli(['brain', 'validate', out.path], root));
});

// --- A19: no-op, progress-only and repeated events ----------------------------------------------------

test('A19: a progress-only or no-op checkpoint stages nothing; no checkpoint at all stages nothing', async (t) => {
  const { root, proposal } = await workspace(t);
  const none = stage(root, proposal);
  fails(none.r);
  assert.match(none.r.stdout, /No checkpoint for task storage/);
  ok(cli(['checkpoint', '--task', TASK, '--progress', 'Read the code', '--claim', 'looked fine'], root));
  const progressOnly = stage(root, proposal);
  fails(progressOnly.r);
  assert.match(progressOnly.out.reason, /no changed file and no observed-pass check \(progress only\)/);
  assert.match(cli(['brain', 'propose', 'brain:0003-use-postgres', '--from', proposal, '--task', TASK], root).stdout, /NOTHING STAGED[\s\S]*Nothing was written/);
  assert.equal(await exists(join(root, PROPOSALS)), false, 'nothing created');
});

test('A19: repeating the same event (same checkpoint, target and content) leaves one proposal; new content is a new one', async (t) => {
  const { root, proposal } = await workspace(t);
  await complete(root);
  const first = stage(root, proposal);
  ok(first.r);
  const before = await read(root, first.out.path);
  const again = stage(root, proposal);
  ok(again.r);
  assert.equal(again.out.duplicate, true);
  assert.equal(again.out.path, first.out.path);
  assert.match(cli(['brain', 'propose', 'brain:0003-use-postgres', '--from', proposal, '--task', TASK], root).stdout, /already staged.*nothing written/);
  assert.equal(await read(root, first.out.path), before, 'byte-identical');
  assert.equal((await pending(root)).length, 1);
  // after apply, the same event is still recognised: no new proposal
  ok(cli(['brain', 'apply', first.out.path, '--by', 'owner'], root));
  const late = stage(root, proposal);
  ok(late.r);
  assert.equal(late.out.duplicate, true);
  assert.match(late.out.path, /\/applied\//);
  assert.equal((await pending(root)).length, 0);
  // a different text for the same checkpoint is a different proposal
  await writeFile(proposal, `${NEW_BODY}\nAlso: connection pool of 10.\n`);
  ok(stage(root, proposal).r);
  assert.equal((await pending(root)).length, 1);
});

test('A19: a staged proposal whose base went stale after a human edit is rejected; the human text is untouched', async (t) => {
  const { root, proposal } = await workspace(t);
  await complete(root);
  const { out } = stage(root, proposal);
  const edited = `${await read(root, ADR_PATH)}\nHuman: we also keep nightly dumps.\n`;
  await writeFile(join(root, ADR_PATH), edited);
  const apply = cli(['brain', 'apply', out.path, '--by', 'owner'], root);
  fails(apply);
  assert.match(apply.stdout, /REJECTED \(stale\)/);
  assert.equal(await read(root, ADR_PATH), edited, 'human edit preserved byte for byte');
  assert.deepEqual(await pending(root), [out.path.split('/').at(-1)], 'the proposal stays pending, not applied');
  assert.deepEqual(await applied(root), []);
});

// --- A20: reviewed application --------------------------------------------------------------------

test('A20: apply (explicit) keeps history, does not verify, and refreshes index.json and the index note', async (t) => {
  const { root, proposal } = await workspace(t);
  await complete(root);
  const { out } = stage(root, proposal);
  assert.match(await read(root, ADR_PATH), /\nstatus: accepted\n/);
  assert.equal(await read(root, ADR_PATH).then((text) => text.includes('Postgres 16')), false, 'staging changed nothing');
  ok(cli(['brain', 'apply', out.path, '--by', 'owner'], root));
  const text = await read(root, ADR_PATH);
  assert.ok(text.endsWith(NEW_BODY));
  assert.match(text, /\nstatus: accepted\n/);
  assert.doesNotMatch(text, /verified_(at|by)/, 'a passing check is not verification');
  assert.match(text, new RegExp(`\\nhistory:\\n {2}- .* applied ${PROPOSALS.replace(/\//g, '\\/')}\\/storage-`));
  const name = out.path.split('/').at(-1);
  const kept = await read(root, `${PROPOSALS}/applied/${name}`);
  assert.match(kept, /\nstatus: applied\n/);
  assert.match(kept, /\ncheckpoint: /);
  assert.match(kept, /\nevidence:\n/);
  const index = JSON.parse(await read(root, '.agentos/brain/index.json'));
  assert.equal(index.records.find((r) => r.id === 'brain:0003-use-postgres').title, 'ADR 0003: Use Postgres 16 for storage');
  assert.match(await read(root, 'knowledge/index.md'), /\[ADR 0003: Use Postgres 16 for storage\]/);
});

test('A20: apply survives a broken optional index note: the record is accepted, the note reported stale', async (t) => {
  if (asRoot) return t.skip('running as root');
  const { root, proposal } = await workspace(t);
  await complete(root);
  const { out } = stage(root, proposal);
  await blockNote(root, true);
  const { r, out: res } = json(['brain', 'apply', out.path, '--by', 'owner'], root);
  ok(r);
  assert.equal(res.note_stale, true);
  assert.ok((await read(root, ADR_PATH)).endsWith(NEW_BODY), 'record accepted');
  assert.equal((await applied(root)).length, 1, 'history kept');
  assert.match(await read(root, '.agentos/brain/index.json'), /Postgres 16/);
  assert.doesNotMatch(await read(root, 'knowledge/index.md'), /Postgres 16/, 'note not written');
  await blockNote(root, false);
  ok(cli(['brain', 'index'], root));
  assert.match(await read(root, 'knowledge/index.md'), /Postgres 16/);
});

test('A20: the accepted record is readable by a different engine through context (claude stages, codex reads)', async (t) => {
  const { root, proposal } = await workspace(t);
  await complete(root);
  const { out } = stage(root, proposal, ['--by', 'claude-code']);
  ok(cli(['brain', 'apply', out.path, '--by', 'owner'], root));
  for (const engine of ['codex', 'claude']) {
    const { r, out: ctx } = json(['context', engine, '--task', 'storage choice'], root);
    ok(r);
    assert.ok(ctx.included.some((item) => item.id === 'brain:0003-use-postgres'), engine);
    assert.match(ctx.text, /## Brain \(adr, accepted\): ADR 0003: Use Postgres 16 for storage\nSource: docs\/adr\/0003-use-postgres\.md\n/, engine);
  }
});

// --- resume clean start ----------------------------------------------------------------------------

test('resume with no checkpoint is a clean start: exit 0, explicit, no prior work invented', async (t) => {
  const { root } = await workspace(t);
  const r = cli(['resume', '--task', 'fresh', '--engine', 'codex'], root);
  ok(r);
  assert.match(r.stdout, /Status: clean start — no checkpoint for task fresh/);
  assert.match(r.stdout, /agentos context codex --task fresh/);
  assert.doesNotMatch(r.stdout, /Progress:|Accomplished/);
  const { r: jr, out } = json(['resume', '--task', 'fresh'], root);
  ok(jr);
  assert.equal(out.status, 'none');
});
