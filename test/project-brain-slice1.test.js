// Project Brain slice 1: the Brain and continuity do not depend on the optional Obsidian integration (F1–F4, A01–A04).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
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
const DEST = 'Projects/Demo';
const appendYaml = async (root, text) => writeFile(join(root, '.agentos/project.yaml'), `${await readFile(join(root, '.agentos/project.yaml'), 'utf8')}${text}`);
const obsidianYaml = (lines) => `knowledge:\n  obsidian:\n${lines.map((line) => `    ${line}`).join('\n')}\n`;

/** A workspace (path with a space) with a local Brain; no Obsidian configuration. */
async function workspace(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos pb1 '));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'my ws');
  await mkdir(root);
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nShip the demo.\n');
  ok(cli(['init', '--existing', '--yes'], root)); // `brain init` (workspace) was removed in 3.0.0; init runs the same Brain setup
  return { base, root };
}

/** The local operations A01/A02 require: brain read, strict context, checkpoint (write + preview), resume. */
function assertLocalOpsWork(root, expectWarning) {
  ok(cli(['brain', 'list'], root));
  ok(cli(['brain', 'check'], root));
  const context = json(['context', 'claude', '--task', 'demo', '--require-complete'], root);
  ok(context.r);
  assert.deepEqual(context.out.missing, [], 'nothing required is missing');
  assert.equal(context.out.complete, true);
  assert.ok(context.out.included.some((item) => /brain:architecture/.test(JSON.stringify(item))) || context.out.text.includes('brain:architecture'), 'local Brain records reach the context');
  if (expectWarning) assert.ok(context.out.warnings.some((w) => expectWarning.test(w)), context.out.warnings.join('\n'));
  ok(cli(['checkpoint', '--task', 'demo', '--progress', 'p', '--next', 'n', '--dry-run'], root));
  ok(cli(['checkpoint', '--task', 'demo', '--progress', 'p', '--next', 'n'], root));
  const resume = cli(['resume', '--task', 'demo'], root);
  ok(resume);
  assert.match(resume.stdout, /Next: n|n$/m);
}

test('F1/A01: no Obsidian configuration — brain, strict context, checkpoint and resume work', async (t) => {
  const { root } = await workspace(t);
  assert.doesNotMatch(await readFile(join(root, '.agentos/project.yaml'), 'utf8'), /obsidian/);
  assertLocalOpsWork(root);
});

test('F2/A02: valid project YAML with an invalid integration setting does not block local operations', async (t) => {
  for (const bad of [['canonical: bogus'], ['destination: ../escape'], ['enabled: nope']]) {
    await t.test(bad[0], async (t) => {
      const { root } = await workspace(t);
      await appendYaml(root, obsidianYaml(['mode: workspace-folder', 'vault: knowledge', ...(bad[0].startsWith('destination') ? [] : ['destination: .']), ...bad]));
      assertLocalOpsWork(root, /Obsidian integration invalid, ignored/);
      const doctor = json(['doctor'], root);
      assert.ok(doctor.out.problems.some((p) => /Obsidian integration invalid/.test(p)), 'doctor still reports the bad setting');
    });
  }
});

test('A02: knowledge.obsidian.enabled: false switches the integration off without touching knowledge', async (t) => {
  const { root } = await workspace(t);
  ok(cli(['obsidian', 'init'], root));
  const index = await readFile(join(root, 'knowledge/index.md'), 'utf8');
  await writeFile(join(root, '.agentos/project.yaml'), (await readFile(join(root, '.agentos/project.yaml'), 'utf8')).replace('    canonical: workspace', '    canonical: workspace\n    enabled: false'));
  const status = cli(['obsidian', 'status'], root);
  ok(status);
  assert.match(status.stdout, /DISABLED/);
  assertLocalOpsWork(root);
  assert.doesNotMatch(cli(['context', 'claude', '--task', 'demo'], root).stdout, /Obsidian workspace:/, 'no Obsidian rule while disabled');
  assert.equal(await readFile(join(root, 'knowledge/index.md'), 'utf8'), index, 'knowledge folder untouched');
});

test('F3/A03: canonical: workspace with the optional folder gone — strict context passes, warning only', async (t) => {
  const { root } = await workspace(t);
  ok(cli(['obsidian', 'init'], root));
  await rm(join(root, 'knowledge'), { recursive: true });
  assertLocalOpsWork(root, /optional Obsidian folder unavailable/);
});

/** canonical: vault (legacy external-canonical) with one record in the vault and one local record. */
async function vaultWorkspace(t) {
  const fx = await workspace(t);
  const vault = join(fx.base, 'the vault');
  await mkdir(join(vault, 'Projects'), { recursive: true });
  ok(cli(['obsidian', 'link', '--vault', vault, '--dest', DEST, '--canonical', 'vault', '--create'], fx.root));
  await writeFile(join(vault, DEST, 'design.md'), '# Design\n\nThe API is versioned.\n');
  ok(cli(['brain', 'register', join(vault, DEST, 'design.md')], fx.root));
  return { ...fx, vault };
}

function assertDesignMissing(root, reason) {
  const context = json(['context', 'claude', '--task', 'design', '--require-complete'], root);
  fails(context.r);
  assert.equal(context.out.complete, false);
  assert.ok(context.out.missing.some((m) => m.startsWith('brain:design') && reason.test(m)), JSON.stringify(context.out.missing));
  const list = json(['brain', 'list'], root);
  assert.equal(list.out.records.find((r) => r.id === 'brain:design')?.state, 'unavailable');
  assert.equal(list.out.records.find((r) => r.id === 'brain:architecture')?.state, 'ok', 'local records stay available');
  // Continuity still works; the missing record is not hidden.
  ok(cli(['checkpoint', '--task', 'design', '--progress', 'p', '--next', 'n'], root));
  ok(cli(['resume', '--task', 'design'], root));
}

test('F4/A04: a vault-canonical record whose vault is offline is missing knowledge, not a viewer warning', async (t) => {
  const { root, vault, base } = await vaultWorkspace(t);
  await rename(vault, join(base, 'offline'));
  assertDesignMissing(root, /vault unavailable/);
});

test('A04: disabling or breaking the integration does not hide a vault-only record, even after a Brain write', async (t) => {
  for (const [name, line, reason] of [['disabled', '    enabled: false', /integration disabled/], ['broken', '    canonical: bogus', /integration invalid/]]) {
    await t.test(name, async (t) => {
      const { root } = await vaultWorkspace(t);
      const yaml = await readFile(join(root, '.agentos/project.yaml'), 'utf8');
      await writeFile(join(root, '.agentos/project.yaml'), name === 'broken' ? yaml.replace('    canonical: vault', line) : yaml.replace('    canonical: vault', `    canonical: vault\n${line}`));
      assertDesignMissing(root, reason);
      await writeFile(join(root, 'notes.md'), '# Notes\n\nLocal.\n');
      ok(cli(['brain', 'register', 'notes.md'], root)); // regenerates index.json
      assertDesignMissing(root, reason);
    });
  }
});

test('A04: corrupted core project.yaml still fails honestly', async (t) => {
  const { root } = await workspace(t);
  await writeFile(join(root, '.agentos/project.yaml'), 'name: [unclosed\n');
  for (const args of [['brain', 'list'], ['context', 'claude', '--task', 'demo'], ['checkpoint', '--task', 'demo', '--progress', 'p', '--dry-run'], ['resume', '--task', 'demo']]) {
    const r = cli(args, root);
    fails(r);
    assert.match(r.stderr + r.stdout, /project\.yaml is not valid YAML/);
  }
});

test('a Brain write is kept when the derived index cannot be refreshed; the index is reported stale', async (t) => {
  const { root } = await workspace(t);
  await rm(join(root, '.agentos/brain/index.json'));
  await mkdir(join(root, '.agentos/brain/index.json')); // unwritable as a file
  await writeFile(join(root, 'notes.md'), '# Notes\n\nLocal.\n');
  const r = cli(['brain', 'register', 'notes.md'], root);
  ok(r);
  assert.match(r.stdout, /index\.json is stale/);
  assert.match(await readFile(join(root, 'notes.md'), 'utf8'), /^---\nid: brain:notes/);
  assert.ok(json(['brain', 'list'], root).out.records.some((rec) => rec.id === 'brain:notes'));
});
