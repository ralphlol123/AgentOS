// Risk B: a clone without .agentos/local.yaml has no vault bound. With canonical: workspace the Brain records live in
// the project, so doctor must not fail; with canonical: vault the records are missing, so it still fails.
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const CLI = resolve('dist/cli.js');
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
const ok = (r) => { assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const DECISION = '# Decision 0001: Persimmon rounding\n\n- Status: accepted\n\nLedger amounts use persimmon rounding.\n';

async function unboundClone(t, canonical) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-unbound-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws'), vault = join(base, 'vault');
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(join(vault, '.obsidian'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"demo"}');
  await writeFile(join(root, 'docs/0001-persimmon.md'), DECISION);
  ok(spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root }));
  ok(cli(['init', '--existing', '--yes', '--agents', 'minimal'], root));
  ok(cli(['obsidian', 'link', '--vault', vault, '--dest', 'Demo', '--canonical', canonical, '--create'], root));
  if (canonical === 'vault') {
    ok(cli(['brain', 'init', '--location', 'vault'], root));
    await copyFile(join(root, 'docs/0001-persimmon.md'), join(vault, 'Demo/0001 Persimmon.md'));
    ok(cli(['brain', 'register', join(vault, 'Demo/0001 Persimmon.md'), '--kind', 'decision', '--status', 'accepted', '--by', 'owner'], root));
  } else {
    ok(cli(['brain', 'register', 'docs/0001-persimmon.md', '--kind', 'decision', '--status', 'accepted', '--by', 'owner'], root));
  }
  await unlink(join(root, '.agentos/local.yaml')); // what a fresh clone has: local.yaml is git-ignored
  return root;
}

test('doctor: an unbound optional vault with canonical: workspace is a warning with a bind hint, not a failure', async (t) => {
  const root = await unboundClone(t, 'workspace');
  const r = cli(['doctor'], root);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^AgentOS doctor: OK/);
  assert.doesNotMatch(r.stdout, /✗ Obsidian vault not bound/);
  assert.match(r.stdout, /- Obsidian vault not bound on this machine: .*agentos obsidian link.*canonical: workspace/);
  const j = JSON.parse(cli(['doctor', '--json'], root).stdout);
  assert.equal(j.ok, true);
  assert.ok(!j.problems.some((p) => /not bound/.test(p)));
  assert.ok(j.warnings.some((w) => /not bound/.test(w)));
  ok(cli(['brain', 'check'], root));
});

test('doctor: an unbound vault with canonical: vault still fails (its records are missing)', async (t) => {
  const root = await unboundClone(t, 'vault');
  const r = cli(['doctor'], root);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /✗ Obsidian vault not bound on this machine/);
});
