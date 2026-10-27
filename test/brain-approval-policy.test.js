import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parse, stringify } from 'yaml';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const CHECK = `"${process.execPath}" -e "process.exit(0)"`;
const ENV = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid', AGENTOS_ENGINE: '' };
const cli = (root, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', env: ENV });
const ok = (r) => { assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const json = (root, ...args) => { const r = cli(root, ...args, '--json'); assert.ok(r.stdout, r.stderr); return { r, data: JSON.parse(r.stdout) }; };
const read = (root, path) => readFile(join(root, path), 'utf8');
const git = (root, ...args) => ok(spawnSync('git', args, { cwd: root, encoding: 'utf8', env: ENV }));
const POLICY = { mode: 'auto-append', actors: ['choco'], records: ['brain:implementation'] };
const RECORD = '.agentos/brain/implementation.md';

async function configure(root, policy) {
  const project = parse(await read(root, '.agentos/project.yaml'));
  project.knowledge = { ...project.knowledge, brain: { approval: policy } };
  await writeFile(join(root, '.agentos/project.yaml'), stringify(project));
}
async function workspace(t, policy = POLICY) {
  const base = await mkdtemp(join(tmpdir(), 'agentos approval '));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'project');
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src/value.js'), 'export const value = 1;\n');
  await initAgentOS({ cwd: root, mode: 'existing', agents: 'minimal', yes: true });
  const project = parse(await read(root, '.agentos/project.yaml'));
  project.repos = { demo: { path: '.', type: 'cli-package', test_command: CHECK } };
  await writeFile(join(root, '.agentos/project.yaml'), stringify(project));
  if (policy !== null) await configure(root, policy);
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nImplement the value helper.\n');
  await writeFile(join(root, RECORD), '# Implementation observations\n\nOwner-maintained starting note.\n');
  ok(cli(root, 'brain', 'register', RECORD, '--kind', 'note', '--status', 'accepted'));
  git(root, 'init', '-q', '-b', 'main'); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'fixture');
  await writeFile(join(root, 'src/value.js'), 'export const value = 2;\n');
  const from = join(base, 'update.md');
  await writeFile(from, 'The value helper implementation now returns 2 (src/value.js).\n');
  return { root, from };
}
function checkpoint(root, extra = [], checks = [CHECK]) {
  return ok(cli(root, 'checkpoint', '--task', 'value-helper', '--engine', 'codex', '--progress', 'Implemented the helper', '--next', 'review', ...checks.flatMap(c => ['--check', c]), ...extra));
}
function stage(root, from, args = []) {
  const { r, data } = json(root, 'brain', 'propose', 'brain:implementation', '--from', from, '--task', 'value-helper', '--append', '--by', 'choco', ...args);
  ok(r); return data.path;
}
async function snapshot(root, dir = '.agentos/brain') {
  const entries = [];
  for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) entries.push(...await snapshot(root, path));
    else entries.push([path, await read(root, path)]);
  }
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}
async function refused(root, proposal, pattern, actor = 'choco') {
  const before = await snapshot(root);
  const { r, data } = json(root, 'brain', 'apply', proposal, '--auto', '--by', actor);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(data.review_required, true);
  assert.match(data.approval.reasons.join('\n'), pattern);
  assert.deepEqual(await snapshot(root), before, 'refusal preserves records, proposals, indexes and history');
}

test('manual remains the default; --auto refuses without writes and explicit owner application still works', async t => {
  const { root, from } = await workspace(t, null);
  const policy = json(root, 'brain', 'policy'); ok(policy.r);
  assert.equal(policy.data.policy.mode, 'manual'); assert.equal(policy.data.authentication, false);
  checkpoint(root); const proposal = stage(root, from);
  await refused(root, proposal, /disabled/);
  assert.equal(cli(root, 'brain', 'apply', proposal).status, 1);
  ok(cli(root, 'brain', 'apply', proposal, '--by', 'ralph'));
  assert.match(await read(root, RECORD), /by ralph \(proposed by choco\)/);
});

test('allowed agent appends without owner intervention; preview and dry-run agree; audit and idempotency survive', async t => {
  const { root, from } = await workspace(t);
  checkpoint(root); const proposal = stage(root, from);
  const before = await snapshot(root);
  for (const command of ['preview', 'apply']) {
    const { r, data } = json(root, 'brain', command, proposal, '--auto', '--by', 'choco', ...(command === 'apply' ? ['--dry-run'] : []));
    ok(r); assert.equal(data.approval.eligible, true);
    assert.deepEqual(await snapshot(root), before, `${command} preview writes nothing`);
  }
  const applied = json(root, 'brain', 'apply', proposal, '--auto', '--by', 'choco'); ok(applied.r);
  assert.match(applied.data.approval.policy_hash, /^[a-f0-9]{64}$/);
  const record = await read(root, RECORD);
  assert.match(record, /Owner-maintained starting note/);
  assert.match(record, /now returns 2/);
  assert.match(record, /by choco \(proposed by choco\).*approval auto-append/);
  const archived = await read(root, applied.data.applied_path);
  assert.match(archived, /approval_mode: auto-append/);
  assert.match(archived, /approval_policy_hash: [a-f0-9]{64}/);
  const after = await snapshot(root);
  const again = json(root, 'brain', 'apply', proposal, '--auto', '--by', 'choco'); ok(again.r);
  assert.equal(again.data.noop, true); assert.deepEqual(await snapshot(root), after);
  for (const engine of ['codex', 'claude', 'hermes']) assert.match(ok(cli(root, 'context', engine, '--task', 'implementation')).stdout, /Brain approval: auto-append/);
});

test('pending proposals cannot supply application history fields on either approval path', async t => {
  const { root, from } = await workspace(t); checkpoint(root); const proposal = stage(root, from);
  const original = await read(root, proposal);
  for (const key of ['applied_at', 'applied_by', 'approval_mode', 'approval_policy_hash']) {
    await writeFile(join(root, proposal), original.replace('status: proposed', `status: proposed\n${key}: fabricated`));
    await refused(root, proposal, /Validation/);
    const before = await snapshot(root);
    const manual = json(root, 'brain', 'apply', proposal, '--by', 'ralph');
    assert.equal(manual.r.status, 1);
    assert.match(manual.data.rejections.map(item => item.message).join('\n'), /written only when a proposal is applied/);
    assert.deepEqual(await snapshot(root), before);
  }
});

test('malformed policies fail closed; actor/record allowlists and current policy revocation are honored', async t => {
  const { root, from } = await workspace(t); checkpoint(root); const proposal = stage(root, from);
  for (const policy of [null, {}, { ...POLICY, mode: 'automatic' }, { ...POLICY, actors: '*' }, { ...POLICY, records: ['*'] }, { ...POLICY, extra: true }, { ...POLICY, actors: [] }]) {
    await configure(root, policy);
    assert.equal(cli(root, 'brain', 'policy').status, 1);
    await refused(root, proposal, /knowledge\.brain\.approval/);
  }
  await configure(root, POLICY); await refused(root, proposal, /actor|proposer/, 'ralph');
  await configure(root, { ...POLICY, actors: ['twixie'] }); await refused(root, proposal, /actor/);
  await configure(root, { ...POLICY, records: ['brain:other'] }); await refused(root, proposal, /target record/);
  await configure(root, { mode: 'manual' }); await refused(root, proposal, /disabled/);
});

test('architecture, decisions, ADRs, conventions, proposed and superseded notes remain manual even if allowlisted', async t => {
  const { root, from } = await workspace(t); checkpoint(root); const proposal = stage(root, from);
  const initial = await read(root, RECORD);
  for (const kind of ['architecture', 'decision', 'adr', 'convention']) {
    await writeFile(join(root, RECORD), initial.replace('kind: note', `kind: ${kind}`));
    await refused(root, proposal, /architecture, decisions/);
  }
  for (const status of ['proposed', 'superseded']) {
    await writeFile(join(root, RECORD), initial.replace('status: accepted', `status: ${status}`));
    await refused(root, proposal, /accepted\/verified/);
  }
});

test('replacement, supersession, size limits and detected conflicts cannot auto-apply', async t => {
  const { root, from } = await workspace(t); checkpoint(root); const proposal = stage(root, from);
  const original = await read(root, proposal);
  await writeFile(join(root, proposal), original.replace('mode: append', 'mode: replace'));
  await refused(root, proposal, /Only append/);
  await writeFile(join(root, proposal), original.replace('mode: append', 'mode: append\nsupersedes: []'));
  await refused(root, proposal, /Only append/);
  await writeFile(join(root, proposal), original + 'x'.repeat(4001)); await refused(root, proposal, /4000/);
  await writeFile(join(root, proposal), original);
  await writeFile(join(root, '.agentos/brain/other.md'), '# Implementation observations\n\nA conflicting owner note.\n');
  ok(cli(root, 'brain', 'register', '.agentos/brain/other.md', '--kind', 'note', '--status', 'accepted'));
  await refused(root, proposal, /conflict/);
});

test('a same-length code edit invalidates receipt evidence, even though Git line counts stay the same', async t => {
  const { root, from } = await workspace(t); checkpoint(root); const proposal = stage(root, from);
  await writeFile(join(root, 'src/value.js'), 'export const value = 3;\n');
  await refused(root, proposal, /changed since|current state/);
});

test('a human edit to the target remains untouched and requires review', async t => {
  const { root, from } = await workspace(t); checkpoint(root); const proposal = stage(root, from);
  await writeFile(join(root, RECORD), (await read(root, RECORD)) + '\nHuman clarification.\n');
  await refused(root, proposal, /Validation/);
});

test('a missing known Brain record keeps automatic application pending', async t => {
  const { root, from } = await workspace(t); checkpoint(root); const proposal = stage(root, from);
  const listing = json(root, 'brain', 'list'); ok(listing.r);
  const other = listing.data.records.find(record => record.id !== 'brain:implementation');
  assert.ok(other);
  await rm(join(root, other.path));
  await refused(root, proposal, /Missing, unreadable or invalid/);
});

test('feature records can opt in; oversized accumulated bodies still require curation', async t => {
  const { root, from } = await workspace(t);
  await writeFile(join(root, RECORD), (await read(root, RECORD)).replace('kind: note', 'kind: feature'));
  checkpoint(root); const proposal = stage(root, from);
  ok(cli(root, 'brain', 'apply', proposal, '--auto', '--by', 'choco'));
  await writeFile(join(root, RECORD), (await read(root, RECORD)) + 'x'.repeat(32001));
  ok(cli(root, 'brain', 'verify', 'brain:implementation', '--by', 'ralph'));
  await writeFile(from, 'A second implementation observation.\n');
  checkpoint(root); await refused(root, stage(root, from), /32000/);
});

test('bounded or excluded repository evidence cannot be treated as a current pass', async t => {
  const { root, from } = await workspace(t);
  await writeFile(join(root, 'large.txt'), 'x'.repeat(1024 * 1024 + 1));
  checkpoint(root); const proposal = stage(root, from);
  await refused(root, proposal, /incomplete/);
  const resume = json(root, 'resume', '--task', 'value-helper'); ok(resume.r);
  assert.equal(resume.data.accomplished.receipts.length, 0);
  assert.ok(resume.data.remaining.receipts.some(r => r.status === 'observed-pass' && r.stale));
});

test('new checkpoints, claim-only or failed/unrun checks and unresolved blockers prevent automatic application', async t => {
  const { root, from } = await workspace(t); checkpoint(root); const old = stage(root, from);
  checkpoint(root, ['--progress', 'New checkpoint']); await refused(root, old, /current, readable checkpoint/);
  for (const extra of [['--claim', 'Looks good'], ['--blocker', 'Needs review']]) {
    checkpoint(root, extra); await refused(root, stage(root, from), /blocker|recorded check/);
  }
  checkpoint(root, [], []); await refused(root, stage(root, from), /recorded check/);
  checkpoint(root, [], [`"${process.execPath}" -e "process.exit(1)"`]); await refused(root, stage(root, from), /recorded check/);
});

test('missing or changed receipt logs, unavailable repositories and absent checkpoint ties require review', async t => {
  const { root, from } = await workspace(t); checkpoint(root); const proposal = stage(root, from);
  const pointer = JSON.parse(await read(root, '.agentos/checkpoints/value-helper/current.json'));
  const saved = JSON.parse(await read(root, `.agentos/checkpoints/value-helper/${pointer.id}.json`));
  const path = saved.receipts[0].evidence;
  await writeFile(join(root, path), 'tampered log'); await refused(root, proposal, /evidence hash changed/);
  await rm(join(root, path)); await refused(root, proposal, /cannot be verified/);
  await rm(join(root, '.git'), { recursive: true, force: true }); await refused(root, proposal, /unavailable/);
  await writeFile(join(root, proposal), (await read(root, proposal)).replace(/^task:.*\n/m, ''));
  await refused(root, proposal, /tied to a checkpoint/);
});

test('--auto is rejected on unrelated subcommands; generated guidance explains the owner policy', async t => {
  const { root } = await workspace(t);
  const before = await snapshot(root);
  assert.equal(cli(root, 'brain', 'verify', 'brain:implementation', '--auto', '--by', 'choco').status, 1);
  assert.deepEqual(await snapshot(root), before);
  for (const path of ['AGENTS.md', 'CLAUDE.md', '.hermes.md', '.agentos/guide.md']) {
    const text = await read(root, path);
    assert.match(text, /brain policy/); assert.match(text, /--auto --by <self>/);
  }
});
