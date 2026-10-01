import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS, doctorAgentOS, statusAgentOS } from '../dist/core.js';
import { STATE_SIZE_WARN_CHARS, sectionSizes, largestSections } from '../dist/state-size.js';

// State-file size visibility.
//
// Observed in a real workspace: handoff.md 385,274 chars and tasks.md 300,898 chars, both modified
// that day, every engine told to read them first, and `agentos compact --dry-run` answering only
// "No safe reduction found" - no section names, no sizes, no reason. The files sat in 8 and 5
// sections, so the compactor had nothing it could classify as history.
//
// This slice only makes that visible. Contract pinned here:
//   * `compact` (dry run or apply) that finds no safe reduction lists the largest sections with
//     size, decision and reason, and counts sections kept only because their heading is unrecognised.
//   * `doctor` and `status` warn when a live state file is over STATE_SIZE_WARN_CHARS and name the
//     biggest section and the next command. It is a warning only: problems, exit status and
//     `status` OK/NEEDS ATTENTION are unchanged, and nothing is written.
//   * Output for workspaces under the threshold is byte-identical to before.

const CLI = resolve('dist/cli.js');

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-size-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'web'));
  await writeFile(join(root, 'web', 'package.json'), JSON.stringify({ name: 'web', scripts: { build: 'echo b', test: 'echo t' } }));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'detected' });
  return root;
}

const line = (tag, i) => `- ${tag} ${i}: verified build and tests, reviewed by tester, no regressions found in the checkout flow.`;
const lines = (tag, n) => Array.from({ length: n }, (_, i) => line(tag, i)).join('\n');
const TASKS_OK = '# Tasks\n\n## Now\n\n- [ ] Verify the checkout form.\n\n## Next\n\n- [ ] Polish.\n\n## Later\n\n- [ ] Docs.\n';

function handoffWith(sections) {
  return `# Handoff\n\n## Current objective\n\nShip the checkout.\n\n${sections}\n\n## Next exact action\n\nVerify the form.\n`;
}
// ~ 60K chars in one canonical section: nothing the compactor can archive.
const HUGE_CURRENT_STATE = `## Current state\n\n${lines('shipped', 600)}`;

const runCli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

async function snapshot(root) {
  const out = {};
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.name === '.git') continue;
      if (entry.isDirectory()) await walk(abs);
      else out[relative(root, abs)] = await readFile(abs, 'utf8');
    }
  }
  await walk(root);
  return out;
}

// --- the pure helper ---------------------------------------------------------------------------------

test('sectionSizes reports every level-2 section with its line, title and size, fence-aware', () => {
  const text = ['# Doc', '', '## A', 'aaa', '', '```md', '## not a heading', '```', '', '## B', 'b', ''].join('\n');
  const sections = sectionSizes(text);
  assert.deepEqual(sections.map((s) => [s.title, s.line]), [['A', 3], ['B', 10]]);
  assert.ok(sections[0].chars > sections[1].chars, 'A contains the fenced block, so it is the larger one');
  assert.equal(sections[0].chars + sections[1].chars, text.length - text.indexOf('## A'), 'sizes cover the text from the first section on, with no gaps or overlap');
});

test('largestSections returns the biggest first and respects the limit', () => {
  const text = `## small\nx\n\n## big\n${'y'.repeat(500)}\n\n## medium\n${'z'.repeat(50)}\n`;
  assert.deepEqual(largestSections(text, 2).map((s) => s.title), ['big', 'medium']);
});

// --- compact: say what is big and why it was kept -------------------------------------------------------

test('compact --dry-run with no safe reduction lists the largest sections with size, decision and reason', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/handoff.md'), handoffWith(HUGE_CURRENT_STATE));
  await writeFile(join(root, '.agentos/tasks.md'), TASKS_OK);
  const r = runCli(['compact', '--dry-run'], root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /No safe reduction found; files unchanged\./);
  const block = r.stdout.slice(r.stdout.indexOf('Largest sections'));
  assert.ok(block.startsWith('Largest sections'), 'the listing is present');
  const firstEntry = block.split('\n').find((l) => l.includes('Current state'));
  assert.ok(firstEntry, 'the biggest section is named');
  assert.match(firstEntry, /handoff\.md/);
  assert.match(firstEntry, new RegExp(`${sectionSizes(await readFile(join(root, '.agentos/handoff.md'), 'utf8')).find((s) => s.title === 'Current state').chars} chars`), 'with its exact size');
  assert.match(firstEntry, /live/, 'and its decision');
  assert.match(firstEntry, /canonical live section/, 'and its reason');
});

test('compact reports sections kept only because their heading is not recognised', async (t) => {
  const root = await workspace(t);
  const reports = Array.from({ length: 12 }, (_, i) => `## 2026-09-${String(i + 1).padStart(2, '0')} sprint report\n\n${lines('report', 40)}`).join('\n\n');
  await writeFile(join(root, '.agentos/handoff.md'), handoffWith(`## Current state\n\nGreen.\n\n${reports}`));
  await writeFile(join(root, '.agentos/tasks.md'), TASKS_OK);
  const r = runCli(['compact', '--dry-run'], root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /No safe reduction found/);
  assert.match(r.stdout, /12 section\(s\) kept because their heading is not a recognised role or history heading/);
  assert.match(r.stdout, /unclassified section preserved verbatim/);
});

test('compact does not add the listing when a reduction exists, and its output is otherwise unchanged', async (t) => {
  const root = await workspace(t);
  const history = Array.from({ length: 6 }, (_, i) => `## Previous objective — 2026-08-0${i + 1} (run ${i})\n\n${lines('old', 30)}`).join('\n\n');
  await writeFile(join(root, '.agentos/handoff.md'), handoffWith(`## Current state\n\nGreen.\n\n${history}`));
  await writeFile(join(root, '.agentos/tasks.md'), TASKS_OK);
  const r = runCli(['compact', '--dry-run'], root);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /No safe reduction/);
  assert.doesNotMatch(r.stdout, /Largest sections/);
  assert.match(r.stdout, /Would archive:/);
});

test('compact --dry-run stays write-free when it lists sections', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/handoff.md'), handoffWith(HUGE_CURRENT_STATE));
  await writeFile(join(root, '.agentos/tasks.md'), TASKS_OK);
  const before = await snapshot(root);
  runCli(['compact', '--dry-run'], root);
  assert.deepEqual(await snapshot(root), before);
});

// --- doctor / status: warn before the file is unreadable ------------------------------------------------

test('doctor warns when handoff.md is over the threshold, naming the biggest section and the next command', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/handoff.md'), handoffWith(HUGE_CURRENT_STATE));
  await writeFile(join(root, '.agentos/tasks.md'), TASKS_OK);
  const result = await doctorAgentOS({ cwd: root });
  const warning = result.warnings.find((w) => /handoff\.md/.test(w) && /chars/.test(w));
  assert.ok(warning, `expected a size warning, got ${JSON.stringify(result.warnings)}`);
  assert.match(warning, /Current state/, 'names the biggest section');
  assert.match(warning, /agentos compact --dry-run/, 'names the next command');
  assert.match(warning, /tokens/i, 'gives a token estimate');
  assert.deepEqual(result.problems, [], 'a size warning is never a problem');
  assert.equal(result.ok, true, 'doctor status is unchanged');
});

test('doctor warns for tasks.md too, with that file named', async (t) => {
  const root = await workspace(t);
  const tasks = `# Tasks\n\n## Now\n\n- [ ] Verify the checkout form.\n${lines('[x] done', 700).replace(/^- /gm, '- [x] ')}\n\n## Next\n\n- [ ] Polish.\n\n## Later\n\n- [ ] Docs.\n`;
  await writeFile(join(root, '.agentos/tasks.md'), tasks);
  const warning = (await doctorAgentOS({ cwd: root })).warnings.find((w) => /tasks\.md/.test(w) && /chars/.test(w));
  assert.ok(warning);
  assert.match(warning, /\bNow\b/);
});

test('the threshold is exact: at the limit there is no warning, one char over there is', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/tasks.md'), TASKS_OK);
  const pad = (n) => handoffWith('## Current state\n\n' + 'x'.repeat(1)).replace('x', 'x'.repeat(n));
  const base = pad(1).length;
  await writeFile(join(root, '.agentos/handoff.md'), pad(1 + STATE_SIZE_WARN_CHARS - base));
  assert.equal((await readFile(join(root, '.agentos/handoff.md'), 'utf8')).length, STATE_SIZE_WARN_CHARS);
  assert.equal((await doctorAgentOS({ cwd: root })).warnings.filter((w) => /chars/.test(w)).length, 0, 'exactly at the limit: no warning');
  await writeFile(join(root, '.agentos/handoff.md'), pad(2 + STATE_SIZE_WARN_CHARS - base));
  assert.equal((await doctorAgentOS({ cwd: root })).warnings.filter((w) => /chars/.test(w)).length, 1, 'one char over: one warning');
});

test('a normal workspace gets no size warning from doctor or status', async (t) => {
  const root = await workspace(t);
  assert.equal((await doctorAgentOS({ cwd: root })).warnings.filter((w) => /chars/.test(w)).length, 0);
  assert.doesNotMatch((await statusAgentOS({ cwd: root })).text, /chars/);
});

test('status shows the warning for an oversized state file but stays OK and keeps its first line', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/handoff.md'), handoffWith(HUGE_CURRENT_STATE));
  await writeFile(join(root, '.agentos/tasks.md'), TASKS_OK);
  const result = await statusAgentOS({ cwd: root });
  assert.equal(result.ok, true);
  assert.match(result.text, /^AgentOS status: OK/);
  assert.match(result.text, /handoff\.md is \d+ chars/);
  assert.match(result.text, /agentos compact --dry-run/);
});

test('doctor --json carries the warning in `warnings` and exit status stays 0', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/handoff.md'), handoffWith(HUGE_CURRENT_STATE));
  await writeFile(join(root, '.agentos/tasks.md'), TASKS_OK);
  const r = runCli(['doctor', '--json'], root);
  assert.equal(r.status, 0, r.stdout.slice(0, 400));
  const data = JSON.parse(r.stdout);
  assert.ok(data.warnings.some((w) => /handoff\.md is \d+ chars/.test(w)));
  assert.deepEqual(data.problems, []);
});

test('doctor and status stay read-only with an oversized state file', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/handoff.md'), handoffWith(HUGE_CURRENT_STATE));
  await writeFile(join(root, '.agentos/tasks.md'), TASKS_OK);
  const before = await snapshot(root);
  await doctorAgentOS({ cwd: root });
  await statusAgentOS({ cwd: root });
  runCli(['doctor', '--json'], root);
  assert.deepEqual(await snapshot(root), before);
});
