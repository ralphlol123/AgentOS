import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

// A real workspace's handoff.md reached 404K chars and tasks.md 342K because engines read
// "update handoff/tasks before stopping" as "add an entry". Every text an engine reads first now
// says what "update" means: handoff.md is rewritten to the current state (never appended to),
// finished tasks are deleted, and history goes to a note under .agentos/runs/.

const CLI = resolve('dist/cli.js');

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-wording-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const repo of ['web', 'api']) {
    await mkdir(join(root, repo));
    await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo, scripts: { build: 'echo b', test: 'echo t' } }));
  }
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'detected' });
  return root;
}
const read = (root, rel) => readFile(join(root, rel), 'utf8');

// The three facts an engine needs, in any wording: replace-not-append, drop finished work, history elsewhere.
const REPLACE = /rewrite[^\n]{0,80}handoff\.md[^\n]{0,120}(do not|never|not)[^\n]{0,30}append/i;
const FINISHED = /(delete|remove|drop)[^\n]{0,40}finished[^\n]{0,30}tasks?/i;
const HISTORY = /\.agentos\/runs\//;
// History must be COPIED to a note before an entry leaves either file, and never discarded. The first wording only said
// "put history in a note", and in 2 of 4 Claude runs the old entries ended up nowhere.
const NO_LOSS = /(copy|move)[^\n]{0,160}\.agentos\/runs\/[^\n]{0,120}never (discard|delete|drop)[^\n]{0,30}(history|entr)/i;

const LIVE = ['AGENTS.md', 'CLAUDE.md', '.hermes.md', 'web/AGENTS.md', 'web/CLAUDE.md', 'api/AGENTS.md', 'api/CLAUDE.md'];

for (const file of LIVE) {
  test(`${file} says "update" means rewrite the handoff, drop finished tasks, move history to runs/`, async (t) => {
    const root = await workspace(t);
    const text = await read(root, file);
    assert.match(text, REPLACE, `${file}: replace, do not append`);
    assert.match(text, FINISHED, `${file}: delete finished tasks`);
    assert.match(text, HISTORY, `${file}: history goes under .agentos/runs/`);
    assert.match(text, NO_LOSS, `${file}: copy older entries to a runs/ note first, never discard history`);
  });
}

test('child pointers name the parent files, not paths relative to the child', async (t) => {
  const root = await workspace(t);
  const text = await read(root, 'web/AGENTS.md');
  assert.match(text, /\.\.\/\.agentos\/handoff\.md/);
  assert.doesNotMatch(text, /rewrite `\.agentos\/handoff\.md`/, 'a bare .agentos/ path would point at the child repo');
});

test('the guide gives the same rule and no longer forbids trimming these files by hand', async (t) => {
  const root = await workspace(t);
  const guide = await read(root, '.agentos/guide.md');
  assert.match(guide, REPLACE);
  assert.match(guide, FINISHED);
  assert.match(guide, NO_LOSS);
  assert.doesNotMatch(guide, /do not trim these files by hand/i, 'the old line told engines to leave a bloated file alone');
  assert.match(guide, /agentos compact --dry-run/, 'compaction is still the tool for archiving recognised history');
});

test('the always-read set stays small', async (t) => {
  const root = await workspace(t);
  let total = 0;
  for (const file of ['AGENTS.md', 'CLAUDE.md']) total += (await read(root, file)).length;
  assert.ok(total < 5200, `AGENTS.md + CLAUDE.md are ${total} chars; the wording must stay a few lines`);
});

test('an older generated block is plain stale: doctor --fix updates it with no conflict', async (t) => {
  const root = await workspace(t);
  const agents = await read(root, 'AGENTS.md');
  const old = agents.replace(/^Keep state current[^\n]*\n\n?/m, '').replace(/^.*rewrite `\.agentos\/handoff\.md`.*\n/m, '');
  assert.notEqual(old, agents, 'fixture check: the new line was present and removed');
  await writeFile(join(root, 'AGENTS.md'), old.replace(/(verify)[^\n]*\n/, '$1; update handoff/tasks before stopping.\n'));
  const check = spawnSync(process.execPath, [CLI, 'doctor', '--fix'], { cwd: root, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(await read(root, 'AGENTS.md'), REPLACE);
});

test('doctor --fix on a current workspace changes nothing', async (t) => {
  const root = await workspace(t);
  const before = await Promise.all(LIVE.map((f) => read(root, f)));
  const run = spawnSync(process.execPath, [CLI, 'doctor', '--fix'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.deepEqual(await Promise.all(LIVE.map((f) => read(root, f))), before);
});
