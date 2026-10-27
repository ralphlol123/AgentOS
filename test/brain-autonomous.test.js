import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parse, stringify } from 'yaml';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const CHECK = `"${process.execPath}" -e "process.exit(0)"`;
const FAIL = `"${process.execPath}" -e "process.exit(1)"`;
const ENV = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid', AGENTOS_ENGINE: '' };
const cli = (root, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', env: ENV });
const ok = (r) => { assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const json = (root, ...args) => { const r = cli(root, ...args, '--json'); assert.ok(r.stdout, r.stderr); return { r, data: JSON.parse(r.stdout) }; };
const read = (root, path) => readFile(join(root, path), 'utf8');
const git = (root, ...args) => ok(spawnSync('git', args, { cwd: root, encoding: 'utf8', env: ENV }));
const sha = (text) => createHash('sha256').update(text).digest('hex');
const body = (text) => text.slice(text.indexOf('\n---\n', 4) + 5);
const AUTO = { mode: 'autonomous', actors: ['claude-code', 'codex'] };
const ARCH = '.agentos/brain/architecture.md';
const PATHS = { 'brain:architecture': ARCH, 'brain:conventions': '.agentos/brain/conventions.md', 'brain:glossary': '.agentos/brain/glossary.md', 'brain:decisions': '.agentos/decisions.md', 'brain:feature': '.agentos/brain/feature.md' };

async function configure(root, policy) {
  const project = parse(await read(root, '.agentos/project.yaml'));
  if (policy === null) delete project.knowledge?.brain; else project.knowledge = { ...project.knowledge, brain: { approval: policy } };
  await writeFile(join(root, '.agentos/project.yaml'), stringify(project));
}
async function workspace(t, policy = AUTO) {
  const base = await mkdtemp(join(tmpdir(), 'agentos autonomous '));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'project');
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src/value.js'), 'export const value = 1;\n');
  await initAgentOS({ cwd: root, mode: 'existing', agents: 'minimal', yes: true });
  const project = parse(await read(root, '.agentos/project.yaml'));
  project.repos = { demo: { path: '.', type: 'cli-package', test_command: CHECK } };
  await writeFile(join(root, '.agentos/project.yaml'), stringify(project));
  if (policy !== null) await configure(root, policy);
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nDocument the value helper.\n');
  await writeFile(join(root, PATHS['brain:feature']), '# Value feature\n\nReturns a value.\n');
  ok(cli(root, 'brain', 'register', PATHS['brain:feature'], '--kind', 'feature', '--status', 'accepted'));
  git(root, 'init', '-q', '-b', 'main'); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'fixture');
  await writeFile(join(root, 'src/value.js'), 'export const value = 2;\n');
  return { root, base };
}
const checkpoint = (root, checks = [CHECK]) => ok(cli(root, 'checkpoint', '--task', 'value-helper', '--progress', 'Documented', '--next', 'review', ...checks.flatMap((c) => ['--check', c])));
let n = 0;
async function stage(fx, id, text, { by = 'claude-code', append = false, extra = [] } = {}) {
  const from = join(fx.base, `update-${n++}.md`);
  await writeFile(from, text);
  const { r, data } = json(fx.root, 'brain', 'propose', id, '--from', from, '--task', 'value-helper', '--by', by, ...(append ? ['--append'] : []), ...extra);
  ok(r); return data.path;
}
async function tree(root, dir = '.agentos/brain') {
  const entries = [];
  for (const e of await readdir(join(root, dir), { withFileTypes: true }).catch(() => [])) {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) entries.push(...await tree(root, path)); else entries.push([path, await read(root, path)]);
  }
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}
const state = async (root) => [...await tree(root), ['decisions', await read(root, '.agentos/decisions.md')]];
async function refused(root, proposal, pattern, actor = 'claude-code') {
  const before = await state(root);
  const { r, data } = json(root, 'brain', 'apply', proposal, '--auto', '--by', actor);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(data.review_required, true, r.stdout);
  assert.match(data.approval.reasons.join('\n'), pattern);
  assert.deepEqual(await state(root), before, 'refusal writes nothing');
}
const applyAuto = (root, proposal, actor = 'claude-code') => { const res = json(root, 'brain', 'apply', proposal, '--auto', '--by', actor); ok(res.r); return res.data; };
const snapshotPath = (id, hash) => `.agentos/brain/history/${id.slice('brain:'.length)}/${hash}.md`;

test('autonomous: an allowed actor applies replace and append to every record kind, with audit and snapshots', async (t) => {
  const fx = await workspace(t);
  checkpoint(fx.root);
  for (const id of ['brain:architecture', 'brain:conventions', 'brain:decisions', 'brain:glossary', 'brain:feature']) {
    const before = await read(fx.root, PATHS[id]);
    const proposal = await stage(fx, id, `# ${id} replaced\n\nFacts about ${id} from src/value.js.\n`);
    for (const command of ['preview', 'validate']) { const res = json(fx.root, 'brain', command, proposal, '--auto', '--by', 'claude-code'); ok(res.r); assert.equal(res.data.approval.eligible, true); assert.equal(res.data.approval.mode, 'autonomous'); }
    const dry = json(fx.root, 'brain', 'apply', proposal, '--auto', '--by', 'claude-code', '--dry-run'); ok(dry.r);
    assert.equal(await read(fx.root, PATHS[id]), before, 'dry run writes nothing');
    const applied = applyAuto(fx.root, proposal);
    assert.match(applied.approval.policy_hash, /^[a-f0-9]{64}$/);
    const record = await read(fx.root, PATHS[id]);
    assert.match(record, new RegExp(`Facts about ${id}`));
    assert.match(record, /by claude-code \(proposed by claude-code\).*approval autonomous/);
    const archived = await read(fx.root, applied.applied_path);
    assert.match(archived, /approval_mode: autonomous/); assert.match(archived, /approval_policy_hash: [a-f0-9]{64}/);
    const snap = snapshotPath(id, sha(body(before)));
    assert.match(snap, /^\.agentos\/brain\/history\/[a-z0-9-]+\/[a-f0-9]{64}\.md$/);
    assert.equal(await read(fx.root, snap), before, 'previous full file saved');
    const appended = await stage(fx, id, `Appended detail for ${id}.\n`, { append: true });
    applyAuto(fx.root, appended);
    assert.match(await read(fx.root, PATHS[id]), new RegExp(`Appended detail for ${id}`));
  }
  const listed = json(fx.root, 'brain', 'list'); ok(listed.r);
  assert.ok(!listed.data.records.some((record) => record.path.includes('/history/')), 'snapshots are never records');
  ok(cli(fx.root, 'brain', 'check'));
});

test('autonomous: supersession is allowed; a checkpoint with only unrun/no checks is enough', async (t) => {
  const fx = await workspace(t);
  checkpoint(fx.root, []);
  const proposal = await stage(fx, 'brain:architecture', '# Architecture\n\nOne module: src/value.js.\n', { extra: ['--supersedes', 'brain:glossary'] });
  applyAuto(fx.root, proposal);
  assert.match(await read(fx.root, PATHS['brain:glossary']), /status: superseded/);
});

test('autonomous refusals: actor, proposer, exclude, records, superseded, failed check, stale, size', async (t) => {
  const fx = await workspace(t);
  checkpoint(fx.root);
  await refused(fx.root, await stage(fx, 'brain:architecture', '# A\n\nUnknown actor.\n', { by: 'opencode' }), /actor/, 'opencode');
  await refused(fx.root, await stage(fx, 'brain:architecture', '# A\n\nOther proposer.\n', { by: 'codex' }), /proposer/);
  await configure(fx.root, { ...AUTO, exclude: ['brain:decisions'] });
  await refused(fx.root, await stage(fx, 'brain:decisions', '# D\n\nExcluded.\n'), /excluded/);
  await refused(fx.root, await stage(fx, 'brain:architecture', '# A\n\nSupersede excluded.\n', { extra: ['--supersedes', 'brain:decisions'] }), /excluded/);
  await configure(fx.root, { ...AUTO, records: ['brain:architecture'] });
  await refused(fx.root, await stage(fx, 'brain:glossary', '# G\n\nOutside records.\n'), /records/);
  await configure(fx.root, AUTO);
  const feature = await read(fx.root, PATHS['brain:feature']);
  await writeFile(join(fx.root, PATHS['brain:feature']), feature.replace('status: accepted', 'status: superseded'));
  await refused(fx.root, await stage(fx, 'brain:feature', '# F\n\nSuperseded target.\n'), /superseded/);
  await writeFile(join(fx.root, PATHS['brain:feature']), feature);
  const big = await stage(fx, 'brain:architecture', `# A\n\n${'x'.repeat(64001)}\n`);
  await refused(fx.root, big, /64000/);
  const stale = await stage(fx, 'brain:architecture', '# A\n\nStale.\n');
  const arch = await read(fx.root, ARCH);
  await writeFile(join(fx.root, ARCH), `${arch}\nHuman edit.\n`);
  await refused(fx.root, stale, /Validation/);
  await writeFile(join(fx.root, ARCH), arch);
  checkpoint(fx.root, [FAIL]);
  await refused(fx.root, await stage(fx, 'brain:architecture', '# A\n\nAfter a failed check.\n'), /observed-fail/);
});

test('autonomous: invalid policies fail closed to manual; owner apply still works', async (t) => {
  const fx = await workspace(t);
  checkpoint(fx.root);
  const proposal = await stage(fx, 'brain:architecture', '# Architecture\n\nInvalid policy case.\n');
  for (const policy of [{ mode: 'autonomous' }, { mode: 'autonomous', actors: [] }, { ...AUTO, exclude: 'brain:decisions' }, { ...AUTO, exclude: ['*'] }]) {
    await configure(fx.root, policy);
    assert.equal(cli(fx.root, 'brain', 'policy').status, 1, JSON.stringify(policy));
    await refused(fx.root, proposal, /knowledge\.brain\.approval/);
  }
  ok(cli(fx.root, 'brain', 'apply', proposal, '--by', 'ralph'));
  assert.match(await read(fx.root, ARCH), /by ralph \(proposed by claude-code\).*approval manual/);
});

test('2.1: an exclude list under manual or auto-append is ignored with a warning; the policy stays valid and keeps its hash', async (t) => {
  const fx = await workspace(t);
  const appendPolicy = { mode: 'auto-append', actors: ['codex'], records: ['brain:glossary'] };
  for (const policy of [{ mode: 'manual' }, appendPolicy]) {
    await configure(fx.root, policy);
    const plain = json(fx.root, 'brain', 'policy');
    ok(plain.r);
    await configure(fx.root, { ...policy, exclude: ['brain:decisions'] });
    const withExclude = json(fx.root, 'brain', 'policy');
    ok(withExclude.r);
    assert.deepEqual(withExclude.data.errors, []);
    assert.deepEqual(withExclude.data.warnings, ['knowledge.brain.approval.exclude is ignored: it applies only to mode autonomous']);
    assert.deepEqual(withExclude.data.policy, plain.data.policy, 'exclude is dropped from the effective policy');
    assert.equal(withExclude.data.policy_hash, plain.data.policy_hash, 'hash of the effective policy is unchanged');
    assert.match(cli(fx.root, 'brain', 'policy').stdout, /Warning: knowledge\.brain\.approval\.exclude is ignored/);
  }
});

test('autonomous: vault-canonical records need owner review', async (t) => {
  const fx = await workspace(t);
  const vault = join(fx.base, 'the vault');
  await mkdir(join(vault, 'Projects'), { recursive: true });
  ok(cli(fx.root, 'obsidian', 'link', '--vault', vault, '--dest', 'Projects/demo', '--canonical', 'vault', '--create'));
  await writeFile(join(vault, 'Projects/demo/design.md'), '# Design\n\nThe API is versioned.\n');
  ok(cli(fx.root, 'brain', 'register', join(vault, 'Projects/demo/design.md'), '--status', 'accepted'));
  checkpoint(fx.root);
  await refused(fx.root, await stage(fx, 'brain:design', '# Design\n\nThe API is v2.\n'), /vault/);
});

test('snapshots on manual and auto-append applies; revert --last/--to, revert of revert, index refresh, dry run', async (t) => {
  const fx = await workspace(t, null);
  checkpoint(fx.root);
  const original = await read(fx.root, ARCH);
  const h0 = sha(body(original));
  ok(cli(fx.root, 'brain', 'apply', await stage(fx, 'brain:architecture', '# Architecture\n\nManual replacement.\n'), '--by', 'ralph'));
  assert.equal(await read(fx.root, snapshotPath('brain:architecture', h0)), original);
  const h1 = sha(body(await read(fx.root, ARCH)));
  assert.equal(cli(fx.root, 'brain', 'revert', 'brain:architecture', '--last').status, 1, 'needs --by');
  const before = await state(fx.root);
  ok(cli(fx.root, 'brain', 'revert', 'brain:architecture', '--last', '--by', 'ralph', '--dry-run'));
  assert.deepEqual(await state(fx.root), before, 'dry run writes nothing');
  const reverted = json(fx.root, 'brain', 'revert', 'brain:architecture', '--last', '--by', 'ralph'); ok(reverted.r);
  let now = await read(fx.root, ARCH);
  assert.equal(sha(body(now)), h0);
  assert.match(now, new RegExp(`reverted to ${h0} by ralph`));
  assert.ok((await read(fx.root, snapshotPath('brain:architecture', h1))).includes('Manual replacement'), 'replaced state snapshotted');
  const index = JSON.parse(await read(fx.root, '.agentos/brain/index.json'));
  assert.equal(index.records.find((record) => record.id === 'brain:architecture').source_hash, h0);
  ok(cli(fx.root, 'brain', 'revert', 'brain:architecture', '--last', '--by', 'ralph'));
  assert.equal(sha(body(await read(fx.root, ARCH))), h1, 'a revert is itself revertible');
  ok(cli(fx.root, 'brain', 'revert', 'brain:architecture', '--to', h0.slice(0, 12), '--by', 'ralph'));
  assert.equal(sha(body(await read(fx.root, ARCH))), h0);
  ok(cli(fx.root, 'brain', 'check'));

  await configure(fx.root, { mode: 'auto-append', actors: ['claude-code'], records: ['brain:feature'] });
  const feature = await read(fx.root, PATHS['brain:feature']);
  checkpoint(fx.root);
  applyAuto(fx.root, await stage(fx, 'brain:feature', 'An appended observation.\n', { append: true }));
  assert.equal(await read(fx.root, snapshotPath('brain:feature', sha(body(feature)))), feature);
  assert.match(await read(fx.root, PATHS['brain:feature']), /approval auto-append/);
});

test('revert refusals: stale without --force, missing or tampered snapshot, --auto outside autonomous policy', async (t) => {
  const fx = await workspace(t);
  checkpoint(fx.root);
  const original = await read(fx.root, ARCH);
  const h0 = sha(body(original));
  applyAuto(fx.root, await stage(fx, 'brain:architecture', '# Architecture\n\nAgent replacement.\n'));
  const tryRevert = async (pattern, ...args) => {
    const before = await state(fx.root);
    const r = cli(fx.root, 'brain', 'revert', 'brain:architecture', ...args);
    assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout + r.stderr, pattern);
    assert.deepEqual(await state(fx.root), before);
  };
  await tryRevert(/actor/, '--last', '--auto', '--by', 'opencode');
  await tryRevert(/snapshot/, '--to', 'f'.repeat(64), '--by', 'ralph');
  const snap = snapshotPath('brain:architecture', h0);
  await writeFile(join(fx.root, snap), original.replace('## Overview', '## Tampered'));
  await tryRevert(/hash/, '--last', '--by', 'ralph');
  await writeFile(join(fx.root, snap), original);
  const edited = `${await read(fx.root, ARCH)}\nHand edit.\n`;
  await writeFile(join(fx.root, ARCH), edited);
  await tryRevert(/edited|stale/, '--last', '--by', 'ralph');
  ok(cli(fx.root, 'brain', 'revert', 'brain:architecture', '--last', '--by', 'ralph', '--force'));
  assert.equal(sha(body(await read(fx.root, ARCH))), h0);
  assert.equal(body(await read(fx.root, snapshotPath('brain:architecture', sha(body(edited)))) ), body(edited), 'forced revert keeps the hand edit');
  ok(cli(fx.root, 'brain', 'revert', 'brain:architecture', '--to', sha(body(edited)), '--auto', '--by', 'claude-code'));
  assert.equal(sha(body(await read(fx.root, ARCH))), sha(body(edited)));
  await configure(fx.root, null);
  await tryRevert(/autonomous/, '--last', '--auto', '--by', 'claude-code');
  await rm(join(fx.root, '.agentos/brain/history'), { recursive: true });
  await tryRevert(/No snapshot/, '--to', h0, '--by', 'ralph', '--force');
});

test('brain log lists applies and reverts with actor, mode and hashes', async (t) => {
  const fx = await workspace(t);
  checkpoint(fx.root);
  applyAuto(fx.root, await stage(fx, 'brain:architecture', '# Architecture\n\nLogged replacement.\n'));
  ok(cli(fx.root, 'brain', 'revert', 'brain:architecture', '--last', '--auto', '--by', 'claude-code'));
  ok(cli(fx.root, 'brain', 'apply', await stage(fx, 'brain:glossary', '# Glossary\n\nTerms.\n'), '--by', 'ralph'));
  const all = json(fx.root, 'brain', 'log'); ok(all.r);
  assert.deepEqual(all.data.entries.map((e) => [e.id, e.action, e.actor, e.mode]), [
    ['brain:glossary', 'applied', 'ralph', 'manual'], ['brain:architecture', 'reverted', 'claude-code', 'autonomous'], ['brain:architecture', 'applied', 'claude-code', 'autonomous'],
  ]);
  assert.ok(all.data.entries.every((e) => /^[a-f0-9]{8}$/.test(e.from) && /^[a-f0-9]{8}$/.test(e.to)));
  const one = json(fx.root, 'brain', 'log', 'brain:architecture'); ok(one.r);
  assert.equal(one.data.entries.length, 2);
  assert.match(ok(cli(fx.root, 'brain', 'log')).stdout, /reverted.*claude-code.*autonomous/);
});

test('policy, guide, adapters, context and checkpoint footer switch to autonomous wording; manual wording unchanged', async (t) => {
  const manual = await workspace(t, null);
  const fx = await workspace(t);
  const policy = json(fx.root, 'brain', 'policy'); ok(policy.r);
  assert.equal(policy.data.policy.mode, 'autonomous');
  assert.match(ok(cli(fx.root, 'brain', 'policy')).stdout, /autonomous[\s\S]*every workspace record[\s\S]*brain revert/);
  await configure(fx.root, { ...AUTO, exclude: ['brain:decisions'] });
  assert.match(ok(cli(fx.root, 'brain', 'policy')).stdout, /except brain:decisions/);
  ok(cli(fx.root, 'doctor', '--fix'));
  for (const path of ['AGENTS.md', 'CLAUDE.md', '.hermes.md', '.agentos/guide.md']) {
    const text = await read(fx.root, path);
    assert.match(text, /autonomous/, path); assert.match(text, /brain apply <proposal> --auto --by <self>/, path);
    assert.doesNotMatch(await read(manual.root, path), /autonomous/, path);
  }
  assert.ok(Buffer.byteLength(await read(fx.root, '.agentos/guide.md')) <= 5376, 'guide budget');
  assert.match(checkpoint(fx.root).stdout, /Knowledge:.*autonomous.*brain apply <proposal> --auto --by <self>/);
  assert.doesNotMatch(checkpoint(manual.root).stdout, /autonomous/);
  assert.match(ok(cli(fx.root, 'context', 'codex', '--task', 'docs')).stdout, /Brain approval: autonomous/);
  ok(cli(fx.root, 'doctor'));
});
