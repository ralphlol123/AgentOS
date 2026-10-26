// Project Brain trial defects D1–D4 (docs/evidence/project-brain-trials.md): subcommand --help, absolute --check
// --cwd from a nested dir, Brain records outside the Obsidian vault folder, WSL → Windows vault paths.
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const CLI = resolve('dist/cli.js');
const cli = (args, cwd, env = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTOS_ENGINE: '', ...env } });
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const fails = (r) => assert.equal(r.status, 1, r.stdout + r.stderr);
const exists = (path) => lstat(path).then(() => true, () => false);

async function base(t) {
  const dir = await mkdtemp(join(tmpdir(), 'agentos d1-4 '));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function project(t) {
  const root = join(await base(t), 'my ws');
  await mkdir(join(root, 'tools/nested dir'), { recursive: true });
  ok(cli(['init', '--existing', '--yes', '--agents', 'minimal'], root));
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nShip the demo.\n');
  return { root, nested: join(root, 'tools/nested dir') };
}

// --- D1: `<command> --help` --------------------------------------------------------------------------

const COMMANDS = ['init', 'status', 'handoff', 'run', 'doctor', 'adapters', 'compact', 'link-obsidian', 'obsidian', 'skills', 'agents', 'engines',
  'templates', 'migrate', 'prompt', 'context', 'checkpoint', 'resume', 'brain'];

test('D1: --help and -h on every command (and on a subcommand) print that command\'s usage, exit 0, and run nothing', async (t) => {
  const dir = await base(t);
  for (const command of COMMANDS) {
    for (const flag of ['--help', '-h']) {
      const r = cli([command, flag], dir);
      ok(r);
      assert.match(r.stdout, new RegExp(`agentos ${command}\\b`), `${command} ${flag}`);
      assert.doesNotMatch(r.stdout + r.stderr, /Unknown option/);
    }
  }
  for (const args of [['brain', 'propose', '--help'], ['checkpoint', '--task', 'x', '--help'], ['obsidian', 'init', '-h']]) {
    const r = cli(args, dir);
    ok(r);
    assert.match(r.stdout, new RegExp(`agentos ${args[0]} ${args[0] === 'brain' ? 'propose' : ''}`));
  }
  assert.deepEqual(await readdir(dir), [], 'init --help (and the rest) wrote nothing');
  fails(cli(['checkpoint', '--bogus'], dir));
});

// --- D2: --check --cwd from a nested dir ------------------------------------------------------------

const receipts = (r) => JSON.parse(r.stdout).record.receipts.filter((receipt) => receipt.status !== 'not-run');
const CHECK = `${process.execPath} -e "require('fs').accessSync('.agentos')"`; // passes only at the workspace root

test('D2: from a nested dir, an absolute --cwd inside the workspace is normalized; outside is refused; no --cwd = workspace root', async (t) => {
  const { root, nested } = await project(t);
  const real = await realpath(root);
  for (const [cwd, expected] of [[root, '.'], [`${root}/`, '.'], [real, '.']]) {
    const r = cli(['checkpoint', '--task', 'd2', '--progress', 'p', '--check', CHECK, '--cwd', cwd, '--json'], nested);
    ok(r);
    assert.deepEqual(receipts(r).map((x) => [x.status, x.cwd]), [['observed-pass', expected]], cwd);
  }
  const sub = cli(['checkpoint', '--task', 'd2', '--progress', 'p', '--check', `${process.execPath} -e 0`, '--cwd', join(root, 'tools'), '--json'], nested);
  ok(sub);
  assert.deepEqual(receipts(sub).map((x) => [x.status, x.cwd]), [['observed-pass', 'tools']]);
  const bare = cli(['checkpoint', '--task', 'd2', '--progress', 'p', '--check', CHECK, '--json'], nested);
  ok(bare);
  assert.deepEqual(receipts(bare).map((x) => [x.status, x.cwd]), [['observed-pass', '.']], 'no --cwd: the check runs at the workspace root');
  const rel = cli(['checkpoint', '--task', 'd2', '--progress', 'p', '--check', CHECK, '--cwd', '.', '--json'], nested);
  ok(rel);
  assert.deepEqual(receipts(rel).map((x) => [x.status, x.cwd]), [['observed-pass', '.']], 'a relative --cwd is workspace-root-relative, not cwd-relative');
  for (const extra of [[], ['--dry-run']]) {
    const outside = cli(['checkpoint', '--task', 'd2', '--progress', 'p', '--check', CHECK, '--cwd', resolve(root, '..'), ...extra], nested);
    fails(outside);
    assert.match(outside.stderr, /outside the workspace/, extra.join(' '));
    fails(cli(['checkpoint', '--task', 'd2', '--progress', 'p', '--check', CHECK, '--cwd', '../x', ...extra], nested));
  }
});

test('D2 (A14): an absolute --cwd is compared canonically, so a root reached through an alias of it is still inside', async (t) => {
  // The Windows runner reaches the workspace through an 8.3 short name (C:\\Users\\RUNNER~1) while realpath gives
  // the long one; a directory link is the same alias on every platform ('junction' needs no privilege on Windows).
  const { root } = await project(t);
  const alias = join(root, '..', 'alias ws');
  await symlink(root, alias, 'junction');
  const { checkpointAgentOS } = await import('../dist/core.js');
  const r = await checkpointAgentOS({ cwd: alias, task: 'd2-alias', progress: 'p', dryRun: true, checks: [{ command: CHECK, cwd: root }, { command: CHECK, cwd: alias }] });
  assert.equal(r.ok, true, r.text);
  assert.deepEqual(r.record.receipts.filter((x) => x.note === 'dry run').map((x) => x.cwd), ['.', '.'], 'real and alias spellings both normalize to the root');
  const outside = checkpointAgentOS({ cwd: alias, task: 'd2-alias', progress: 'p', dryRun: true, checks: [{ command: CHECK, cwd: resolve(root, '..') }] });
  await assert.rejects(outside, /outside the workspace/);
});

// --- D3: records outside the Obsidian vault folder ----------------------------------------------------

test('D3: the vault index marks records outside the vault folder; a record registered inside it is not marked; no copies', async (t) => {
  const { root } = await project(t);
  ok(cli(['brain', 'init'], root));
  ok(cli(['obsidian', 'init'], root));
  await writeFile(join(root, 'knowledge/design.md'), '# Design\n\nIn the vault.\n');
  ok(cli(['brain', 'register', 'knowledge/design.md'], root));
  const note = await readFile(join(root, 'knowledge/index.md'), 'utf8');
  const lines = note.split('\n').filter((line) => line.startsWith('- ['));
  assert.ok(lines.length >= 2, note);
  for (const line of lines) {
    if (line.includes('`brain:design`')) assert.doesNotMatch(line, /outside this vault/, line);
    else assert.match(line, /\(<\.\.\/\.agentos\/.*>\) — `brain:[a-z0-9-]+` \([a-z]+, [a-z]+\) — outside this vault: edit in your editor$/, line);
  }
  assert.match(note, /Obsidian shows only records stored inside this vault folder/);
  assert.deepEqual((await readdir(join(root, 'knowledge'))).sort(), ['design.md', 'index.md'], 'no copies or symlinks in the vault');
  assert.match(cli(['brain', 'index'], root).stdout, /Unchanged: index note/, 'deterministic');
});

// --- D4: WSL → Windows path mapping --------------------------------------------------------------------

test('D4: wslWindowsPath maps /mnt/<drive> to a drive path and Linux-side paths to \\\\wsl$\\<distro>', async () => {
  const { wslWindowsPath } = await import('../dist/core.js');
  assert.equal(wslWindowsPath('/mnt/c/_/agentos-trial/obs project/knowledge', 'Ubuntu'), 'C:\\_\\agentos-trial\\obs project\\knowledge');
  assert.equal(wslWindowsPath('/mnt/d', 'Ubuntu'), 'D:\\');
  assert.equal(wslWindowsPath('/mnt/d/', undefined), 'D:\\');
  assert.equal(wslWindowsPath('/mnt/c/x', undefined), 'C:\\x', 'drive paths need no distro');
  assert.equal(wslWindowsPath('/home/u/my ws/knowledge', 'Ubuntu-24.04'), '\\\\wsl$\\Ubuntu-24.04\\home\\u\\my ws\\knowledge');
  assert.equal(wslWindowsPath('/mnt/wsl/x', 'Ubuntu'), '\\\\wsl$\\Ubuntu\\mnt\\wsl\\x', '/mnt/wsl is not a drive');
  assert.equal(wslWindowsPath('/home/u', undefined), null, 'Linux-side path without a distro name: unknown');
  assert.equal(wslWindowsPath('', 'Ubuntu'), null);
});

test('D4: under WSL, obsidian init, link and status also print the Windows path of the vault', { skip: process.platform === 'win32' && 'WSL-only: the WSL → Windows path line is for Linux paths under WSL; on native Windows the vault path printed is already a Windows path' }, async (t) => {
  const { root } = await project(t);
  const env = { WSL_DISTRO_NAME: 'Ubuntu' };
  const win = (path) => `\\\\wsl$\\Ubuntu${path.replaceAll('/', '\\')}`;
  const knowledge = join(await realpath(root), 'knowledge');
  const init = cli(['obsidian', 'init'], root, env);
  ok(init);
  assert.ok(init.stdout.includes(`Windows path (WSL): ${win(knowledge)}`), init.stdout);
  const status = cli(['obsidian', 'status'], join(root, 'tools'), env);
  ok(status);
  assert.ok(status.stdout.includes(`Vault Windows path (WSL): ${win(knowledge)}`), status.stdout);
  const vault = join(await realpath(resolve(root, '..')), 'My Vault');
  await mkdir(join(vault, '.obsidian'), { recursive: true });
  const { root: other } = await project(t);
  const link = cli(['obsidian', 'link', '--vault', vault, '--dest', 'Projects/Demo', '--create'], other, env);
  ok(link);
  assert.ok(link.stdout.includes(`Windows path (WSL): ${win(vault)}`), link.stdout);
  assert.equal(await exists(join(root, 'Windows')), false);
});

// --- D5: no task_scope -> the Edit scope line says "not set" and what to do; a declared scope is unchanged --

test('D5: without task_scope, context says edit scope is not set and names the owner step; JSON edit stays []; a declared scope is unchanged', async (t) => {
  const { root } = await project(t);
  for (const args of [['context', 'claude', '--task', 'demo'], ['context', 'claude', '--task', 'demo', '--scope', '.']]) {
    const r = cli(args, root);
    ok(r);
    assert.match(r.stdout, /^Edit scope: not set \(no task_scope in \.agentos\/project\.yaml\)\. Edit only the files the owner's task names; ask the owner to set task_scope\.$/m, args.join(' '));
    assert.doesNotMatch(r.stdout, /read-only task/);
  }
  const json = cli(['context', 'claude', '--task', 'demo', '--json'], root);
  ok(json);
  assert.deepEqual(JSON.parse(json.stdout).scope.edit, [], 'no default scope is invented');
  const path = join(root, '.agentos/project.yaml');
  await writeFile(path, `${await readFile(path, 'utf8')}task_scope:\n  read: [tools]\n  edit: []\n`);
  const declared = cli(['context', 'claude', '--task', 'demo'], root);
  ok(declared);
  assert.match(declared.stdout, /^Edit scope: \(none; read-only task\)\. Do not edit anything outside it\.$/m);
  assert.doesNotMatch(declared.stdout, /not set/);
});
