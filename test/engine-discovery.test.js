import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS, doctorAgentOS, adaptersAgentOS } from '../dist/core.js';

// Engine discovery: whichever coding engine opens a workspace (Claude Code, OpenCode, Codex,
// Hermes) must be told that the `agentos` CLI exists, when to run which command, and how to
// reach the workspace from inside a child repository - from one generated, engine-agnostic guide.
//
// Contract pinned here:
//   * `.agentos/guide.md` is a managed adapter target (create / stale-update / custom-append /
//     `adapters explain`) so it can be refreshed by `doctor --fix` like the bootloaders.
//   * Root bootloaders point at the guide in ONE short line; child pointers point at the parent
//     guide AND carry the CLI fallback for engines that cannot read outside their start directory.
//   * Every `agentos ...` command the guide recommends must exist in the installed CLI's help.
//   * The guide stays small enough to load on demand.

const CLI = resolve('dist/cli.js');
const MANAGED_START = '<!-- agentos:managed:start -->';
const GUIDE = '.agentos/guide.md';
const ROOT_ADAPTERS = ['AGENTS.md', 'CLAUDE.md', '.hermes.md'];
const CHILD_ADAPTERS = ['web/AGENTS.md', 'web/CLAUDE.md', 'api/AGENTS.md', 'api/CLAUDE.md'];

// Multi-repo workspace with two DIRECT child repos (nested layouts are not detected by repo scan).
async function multiRepo(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const repo of ['web', 'api']) {
    await mkdir(join(root, repo));
    await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo, scripts: { build: 'echo b', test: 'echo t' } }));
  }
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'detected' });
  return root;
}

async function exists(path) { try { await stat(path); return true; } catch { return false; } }
const read = (root, rel) => readFile(join(root, rel), 'utf8');

async function snapshot(root) {
  const out = {};
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else out[relative(root, abs)] = await readFile(abs, 'utf8');
    }
  }
  await walk(root);
  return out;
}

function helpText() {
  const r = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

// --- the guide itself -------------------------------------------------------------------------

test('init creates .agentos/guide.md inside exactly one managed block', async (t) => {
  const root = await multiRepo(t);
  assert.ok(await exists(join(root, GUIDE)), `${GUIDE} must be created by init`);
  const guide = await read(root, GUIDE);
  assert.equal(guide.split(MANAGED_START).length - 1, 1, 'one managed block');
});

test('the guide tells an engine which command to run for which job, with the safety gates', async (t) => {
  const root = await multiRepo(t);
  const guide = await read(root, GUIDE);
  for (const [label, pattern] of [
    ['status check', /agentos status/],
    ['health check', /agentos doctor/],
    ['compaction preview', /agentos compact --dry-run/],
    ['skill install', /agentos skills add/],
    ['skill listing', /agentos skills list/],
    ['agent listing', /agentos agents list/],
    ['template inspection', /agentos templates (show|list)/],
    ['dry-run-first rule', /--dry-run/],
    ['never hand-edit generated state rule', /(do not|never) (hand-)?edit/i],
    ['no commit or push unless asked', /(commit|push)/i],
    ['declare role and repo scope', /(declare|state).{0,40}(role|scope)/i],
    ['update handoff before stopping', /handoff/],
  ]) assert.match(guide, pattern, `guide must cover: ${label}`);
});

test('the guide says what to do when started inside a child repository', async (t) => {
  const root = await multiRepo(t);
  const guide = await read(root, GUIDE);
  assert.match(guide, /child repo/i, 'has a child-repo section');
  assert.match(guide, /agentos status/, 'names the CLI as the first step from a child repo');
  assert.match(guide, /(cannot|can't|unable|refus|denied|outside).{0,80}(read|access)|(read|access).{0,80}(cannot|can't|refus|denied|outside)/i, 'covers the case where reads outside the start directory are refused');
});

test('every agentos command the guide recommends exists in the CLI help (no drift)', async (t) => {
  const root = await multiRepo(t);
  const guide = await read(root, GUIDE);
  const help = helpText();
  const helpCommands = new Set([...help.matchAll(/^\s+agentos ([a-z][a-z-]*)/gm)].map((m) => m[1]));
  const recommended = [...guide.matchAll(/`(agentos [^`]+)`/g)].map((m) => m[1]);
  assert.ok(recommended.length >= 6, `expected the guide to recommend several commands, found ${recommended.length}`);
  for (const command of recommended) {
    const tokens = command.split(/\s+/).slice(1).filter((tok) => !/^[<\[]/.test(tok));
    // `agentos --help` / `--version` are global flags handled before dispatch, not subcommands.
    if (tokens[0] === '--help' || tokens[0] === '--version') continue;
    assert.ok(helpCommands.has(tokens[0]), `\`${command}\`: unknown CLI command '${tokens[0]}'`);
    for (const flag of tokens.filter((tok) => tok.startsWith('--'))) {
      assert.ok(help.includes(flag), `\`${command}\`: flag ${flag} is not in the CLI help`);
    }
  }
});

test('the guide stays small enough to load on demand', async (t) => {
  const root = await multiRepo(t);
  const guide = await read(root, GUIDE);
  assert.ok(guide.length > 800, 'a guide this short cannot cover the commands');
  assert.ok(guide.length <= 6000, `guide is ${guide.length} chars; keep it under 6000`);
});

// --- pointers ---------------------------------------------------------------------------------

test('root bootloaders point at the guide in a short added line', async (t) => {
  const root = await multiRepo(t);
  for (const file of ROOT_ADAPTERS) {
    const text = await read(root, file);
    assert.match(text, /\.agentos\/guide\.md/, `${file} must point at the guide`);
    assert.ok(text.length <= 1800, `${file} is ${text.length} chars; the pointer must stay terse`);
  }
});

test('child pointers point at the parent guide and carry the CLI fallback', async (t) => {
  const root = await multiRepo(t);
  for (const file of CHILD_ADAPTERS) {
    const text = await read(root, file);
    assert.match(text, /\.\.\/\.agentos\/guide\.md/, `${file} must point at the parent guide`);
    assert.match(text, /agentos status/, `${file} must name \`agentos status\` as the fallback`);
    assert.match(text, /(cannot|can't|unable|refus|denied).{0,60}(read|access)|(read|access).{0,60}(cannot|can't|refus|denied)/i, `${file} must say when to use the fallback`);
  }
});

test('agentos prompt output mentions the guide for every engine', async (t) => {
  const root = await multiRepo(t);
  for (const engine of ['claude', 'codex', 'opencode', 'hermes']) {
    const r = spawnSync(process.execPath, [CLI, 'prompt', engine], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\.agentos\/guide\.md/, `prompt ${engine} must mention the guide`);
  }
});

// --- lifecycle: the guide behaves like every other managed adapter -------------------------------

test('a workspace made by the previous generator is reported stale, repaired by doctor --fix, and then stable', async (t) => {
  const root = await multiRepo(t);
  // Simulate pre-guide output: drop every guide reference from the adapters and delete the guide.
  for (const file of [...ROOT_ADAPTERS, ...CHILD_ADAPTERS]) {
    const text = await read(root, file);
    const stripped = text.split('\n').filter((line) => !/guide\.md/.test(line) && !/agentos status/.test(line)).join('\n');
    await writeFile(join(root, file), stripped);
  }
  await rm(join(root, GUIDE), { force: true });

  const before = await doctorAgentOS({ cwd: root });
  assert.ok(before.problems.some((p) => /AGENTS\.md/.test(p) && /stale/i.test(p)), `doctor must report the stale bootloader: ${JSON.stringify(before.problems)}`);
  assert.ok([...before.problems, ...before.warnings].some((p) => /guide\.md/.test(p)), `doctor must mention the missing guide: ${JSON.stringify([...before.problems, ...before.warnings])}`);

  await doctorAgentOS({ cwd: root, fix: true });
  assert.ok(await exists(join(root, GUIDE)), 'doctor --fix recreates the guide');
  for (const file of [...ROOT_ADAPTERS, ...CHILD_ADAPTERS]) assert.match(await read(root, file), /guide\.md/, `${file} repaired`);
  const clean = await doctorAgentOS({ cwd: root });
  assert.deepEqual(clean.problems, [], 'no problems after repair');

  const settled = await snapshot(root);
  await doctorAgentOS({ cwd: root, fix: true });
  assert.deepEqual(await snapshot(root), settled, 'a second doctor --fix is a byte-for-byte no-op');
});

test('a missing guide on otherwise current adapters is a doctor finding and doctor --fix recreates it', async (t) => {
  const root = await multiRepo(t);
  await rm(join(root, GUIDE), { force: true });
  const result = await doctorAgentOS({ cwd: root });
  assert.ok([...result.problems, ...result.warnings].some((p) => /guide\.md/.test(p)), 'missing guide must be reported');
  await doctorAgentOS({ cwd: root, fix: true });
  assert.ok(await exists(join(root, GUIDE)));
});

test('a hand-written guide.md is preserved: managed block appended, one backup, custom bytes intact', async (t) => {
  const root = await multiRepo(t);
  const custom = '# Our own guide\n\nKeep this text.\n';
  await writeFile(join(root, GUIDE), custom);
  await doctorAgentOS({ cwd: root, fix: true });
  const after = await read(root, GUIDE);
  assert.ok(after.startsWith(custom), 'custom bytes untouched at the start');
  assert.equal(after.split(MANAGED_START).length - 1, 1, 'exactly one managed block appended');
  assert.equal(await read(root, `${GUIDE}.agentos.bak`), custom, 'original preserved in the backup');
});

test('adapters explain classifies the guide like any other managed adapter', async (t) => {
  const root = await multiRepo(t);
  const result = await adaptersAgentOS({ cwd: root, explain: GUIDE });
  assert.equal(result.ok, true, `explain must accept the guide as a target: ${result.text}`);
  assert.doesNotMatch(result.text, /not an AgentOS adapter target/i);
  assert.match(result.text, /\(root adapter\)/, 'the guide belongs to the workspace root, not a child repo');
  assert.match(result.text, /Classification: noop/, 'a freshly generated guide classifies as current');
});

test('doctor stays read-only: the guide check writes nothing', async (t) => {
  const root = await multiRepo(t);
  const before = await snapshot(root);
  await doctorAgentOS({ cwd: root });
  assert.deepEqual(await snapshot(root), before);
});

// --- CLI-first discovery for engines that cannot read outside their start directory -----------------
//
// Observed with OpenCode 1.18.3 run non-interactively from inside a child repo: reads of `../...` are
// refused, and a refused tool call ends the whole turn (experimental.continue_loop_on_deny defaults to
// off). A "fall back if refused" instruction therefore never gets read. The CLI has to come first, and
// it has to be able to deliver the guide itself.

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}
function managedInner(text) {
  const start = text.indexOf(MANAGED_START);
  const end = text.indexOf('<!-- agentos:managed:end -->');
  return text.slice(start + MANAGED_START.length, end).trim();
}

// --- there is no `agentos guide` command ---------------------------------------------------------------
//
// Ablation (PREREG.md in the sandbox): removing the command changed nested grounded answers from 8/12 to
// 8/12, below the bar of +2, while removing `.agentos/guide.md` and its pointer dropped root right-tool
// outcomes from 6/8 to 2/8. So the file earns its place and the command does not.

test('`agentos guide` is not a command, and nothing generated or printed recommends it', async (t) => {
  const root = await multiRepo(t);
  const r = runCli(['guide'], root);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Unknown command: guide/);
  assert.doesNotMatch(helpText(), /^\s+agentos guide\b/m, 'the CLI help must not list guide');
  for (const file of [...ROOT_ADAPTERS, ...CHILD_ADAPTERS, GUIDE]) {
    assert.doesNotMatch(await read(root, file), /agentos guide/, `${file} must not mention \`agentos guide\``);
  }
  for (const cwd of [root, join(root, 'web')]) {
    for (const command of [['status'], ['handoff']]) {
      assert.doesNotMatch(runCli(command, cwd).stdout, /agentos guide/, `agentos ${command[0]} from ${relative(root, cwd) || '.'}`);
    }
  }
});

test('child pointers put the CLI before any path under `..` and explain why', async (t) => {
  const root = await multiRepo(t);
  for (const file of CHILD_ADAPTERS) {
    const text = await read(root, file);
    const status = text.indexOf('agentos status');
    const firstParentPath = text.indexOf('`../');
    assert.ok(status >= 0, `${file} must name \`agentos status\``);
    assert.ok(status < firstParentPath, `${file}: \`agentos status\` must come before the first ../ path`);
    assert.match(text, /agentos handoff/, `${file} must name \`agentos handoff\` for the full handoff`);
    assert.match(text, /(refused|denied).{0,80}(end|stop|abort).{0,40}(session|turn|run)|(end|stop|abort).{0,40}(session|turn|run).{0,80}(refused|denied)/is, `${file} must say a refused read can end the session`);
  }
});

test('the guide explains that a refused read can end the session, so the CLI comes first', async (t) => {
  const root = await multiRepo(t);
  const guide = await read(root, GUIDE);
  assert.match(guide, /(refused|denied).{0,100}(end|stop|abort).{0,40}(session|turn|run)|(end|stop|abort).{0,40}(session|turn|run).{0,100}(refused|denied)/is);
  assert.match(guide, /agentos status/);
});

// --- `agentos status` is self-sufficient inside a child repo --------------------------------------------
//
// An engine whose reads outside its start directory are refused has only the CLI. The neutral
// "where am I" questions are: which repo, which repos are in scope, what are the open tasks, and how
// do I verify THIS repo. `status` must answer all of them from a child repo - and stay byte-identical
// at the workspace root, where existing consumers already parse it.

async function statusFrom(cwd) {
  const r = runCli(['status'], cwd);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('status from a child repo names the repo, the workspace scope, this repo\'s commands and the open tasks', async (t) => {
  const root = await multiRepo(t);
  await writeFile(join(root, '.agentos/tasks.md'), '# Tasks\n\n## Now\n\n- [ ] Verify the web checkout form\n\n## Next\n\n- [ ] Add api rate limiting\n\n## Done\n');
  const out = await statusFrom(join(root, 'web'));
  assert.match(out, /You are in repo: web \(\.\/web\)/);
  assert.match(out, /Repos in scope: api, web|Repos in scope: web, api/);
  assert.match(out, /build=npm run build/);
  assert.match(out, /test=npm run test/);
  assert.match(out, /Open tasks \(Now\)/);
  assert.match(out, /Verify the web checkout form/);
  assert.doesNotMatch(out, /Add api rate limiting/, 'only the Now section, not the whole task file');
});

test('status from the other child repo reports that repo\'s own commands', async (t) => {
  const root = await multiRepo(t);
  const out = await statusFrom(join(root, 'api'));
  assert.match(out, /You are in repo: api \(\.\/api\)/);
  assert.doesNotMatch(out, /You are in repo: web/);
});

test('status from a directory nested inside a child repo still identifies the child repo', async (t) => {
  const root = await multiRepo(t);
  await mkdir(join(root, 'web', 'src', 'components'), { recursive: true });
  const out = await statusFrom(join(root, 'web', 'src', 'components'));
  assert.match(out, /You are in repo: web \(\.\/web\)/);
});

test('status at the workspace root is unchanged: no child-repo section', async (t) => {
  const root = await multiRepo(t);
  const out = await statusFrom(root);
  assert.doesNotMatch(out, /You are in repo/);
  assert.doesNotMatch(out, /Repos in scope/);
  assert.match(out, /^AgentOS status: OK/);
});

test('status stays read-only from a child repo and honors the objective when tasks.md has no Now section', async (t) => {
  const root = await multiRepo(t);
  await writeFile(join(root, '.agentos/tasks.md'), '# Tasks\n\n## Next\n\n- [ ] Later thing\n');
  const before = await snapshot(root);
  const out = await statusFrom(join(root, 'web'));
  assert.deepEqual(await snapshot(root), before, 'status writes nothing');
  assert.match(out, /You are in repo: web/);
  assert.match(out, /Open tasks \(Now\): none/);
});

// --- the pointer's `..` file list must not outrank the CLI ------------------------------------------------

test('child pointers present the `..` file list as optional, after the CLI, and only when reads work', async (t) => {
  const root = await multiRepo(t);
  for (const file of CHILD_ADAPTERS) {
    const text = await read(root, file);
    const lead = text.search(/(only if|if reads? (work|succeed|are allowed)|when reads? (work|succeed))/i);
    const firstParentPath = text.indexOf('`../');
    // the CLAUDE.md / AGENTS.md self-references to the parent pointer files also use `../`, so measure
    // against the first bullet of the file list rather than the introductory prose
    const firstBullet = text.indexOf('- `../');
    assert.ok(lead >= 0, `${file} must say the file list is for engines whose reads work`);
    assert.ok(lead < firstBullet, `${file}: that condition must come before the file list`);
    assert.ok(firstParentPath >= 0);
    // the line that introduces the list carries the condition itself and is not the old unconditional phrasing
    const intro = text.slice(0, firstBullet).trimEnd().split('\n').pop();
    assert.match(intro, /only if/i, `${file}: the line introducing the list must be conditional, got: ${intro}`);
    assert.doesNotMatch(intro, /^Before acting/, `${file}: the list must not be introduced as mandatory`);
  }
});

// --- the CLI output must not send a read-restricted engine back to files it cannot read ------------------
//
// Observed (OpenCode, three free models, run from api/ and web/): every run executed `agentos guide`
// and `agentos handoff`, then read `.agentos/tasks.md` or `.agentos/repos/<repo>.md` - which the guide
// and the handoff reading list had just told it to read - and the refused read ended the session.

test('the guide does not tell the reader to read handoff/tasks before using the CLI output', async (t) => {
  const root = await multiRepo(t);
  const guide = await read(root, GUIDE);
  const intro = guide.split('\n').find((line) => /^How to operate/.test(line)) ?? '';
  assert.match(intro, /agentos status/, 'the intro leads with the CLI');
  assert.match(intro, /only when file reads work/i, 'file reads in the intro are explicitly conditional');
  assert.ok(intro.indexOf('agentos status') < intro.indexOf('.agentos/handoff.md'), 'the CLI is named before any file');
  assert.doesNotMatch(guide, /commands in `\.agentos\/repos\/<repo>\.md`/, 'repo commands come from `agentos status` first');
  assert.match(guide, /`agentos status`[^\n]*(open tasks|verif)/i, 'the guide says status already prints open tasks and verification commands');
  assert.match(guide, /only (if|when) (file )?reads? (work|succeed|are allowed)/i, 'any file-reading advice is conditional');
});

test('agentos handoff at the workspace root is unchanged', async (t) => {
  const root = await multiRepo(t);
  const out = runCli(['handoff'], root).stdout;
  assert.ok(out.startsWith('Read these before continuing:\n1. AGENTS.md\n'), 'root output keeps the original reading list first');
  assert.match(out, /Current handoff excerpt:/);
});

test('agentos handoff from a child repo prints the content first and makes the file list conditional', async (t) => {
  const root = await multiRepo(t);
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nShip the checkout.\n');
  const out = runCli(['handoff'], join(root, 'web')).stdout;
  assert.ok(!out.startsWith('Read these before continuing:'), 'a child repo must not be told to read first');
  assert.match(out, /You are in repo: web/);
  assert.match(out, /Ship the checkout\./, 'the handoff content is printed');
  const list = out.indexOf('1. AGENTS.md');
  assert.ok(list >= 0, 'the list is still available');
  assert.match(out.slice(0, list), /only if (file )?reads? .{0,40}(work|succeed)/i, 'the condition precedes the list');
  assert.ok(out.indexOf('Ship the checkout.') < list, 'content comes before the list');
});

test('agentos handoff stays read-only from a child repo', async (t) => {
  const root = await multiRepo(t);
  const before = await snapshot(root);
  runCli(['handoff'], join(root, 'api'));
  assert.deepEqual(await snapshot(root), before);
});
