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
//   * The section listing accounts for the whole file: text before the first heading is reported as
//     "start of file", and each level-1 block as its own entry, so the sizes sum to the file length.
//     A real tasks.md was 341,843 chars: two `# Tasks` blocks (169,060 + 68,955) and `## Now`
//     (99,102). The old listing named "Now" as the largest section and never mentioned 70% of the file.

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

const total = (sections) => sections.reduce((n, s) => n + s.chars, 0);

// A block of exactly `chars` characters: the heading line, then filler list lines (never headings).
function sized(heading, chars) {
  const head = `${heading}\n\n`;
  const unit = '- carried over: verified build and tests, reviewed by tester, no regressions found.\n';
  return `${head}${unit.repeat(Math.ceil(chars / unit.length)).slice(0, chars - head.length - 1)}\n`;
}

// Shaped like the reported tasks.md: two stacked `# Tasks` level-1 blocks, one big `## Now`, and
// small sections. 169,060 + 68,955 + 99,102 + 4,726 = 341,843.
const REPORTED_TASKS = [
  sized('# Tasks', 169_060),
  sized('# Tasks', 68_955),
  sized('## Now', 99_102),
  sized('## Next', 2_000),
  sized('## Later', 2_726),
].join('');

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

test('sectionSizes reports every level-1 and level-2 block with its line, title and size, fence-aware', () => {
  const text = ['# Doc', '', '## A', 'aaa', '', '```md', '## not a heading', '```', '', '## B', 'b', ''].join('\n');
  const sections = sectionSizes(text);
  assert.deepEqual(sections.map((s) => [s.title, s.line]), [['Doc', 1], ['A', 3], ['B', 10]]);
  assert.ok(sections[1].chars > sections[2].chars, 'A contains the fenced block, so it is larger than B');
  assert.equal(total(sections), text.length, 'sizes cover the whole text, with no gaps or overlap');
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

// --- the listing accounts for the whole file --------------------------------------------------------------

test('sectionSizes accounts for every character of a tasks.md shaped like the reported one', () => {
  assert.equal(REPORTED_TASKS.length, 341_843);
  const sections = sectionSizes(REPORTED_TASKS);
  assert.deepEqual(
    sections.map((s) => [s.title, s.chars]),
    [['Tasks', 169_060], ['Tasks', 68_955], ['Now', 99_102], ['Next', 2_000], ['Later', 2_726]],
  );
  assert.equal(total(sections), REPORTED_TASKS.length, 'the listed sections sum to the file length');
  const rows = REPORTED_TASKS.split('\n');
  for (const s of sections) assert.match(rows[s.line - 1], /^#{1,2} (Tasks|Now|Next|Later)$/, `line ${s.line} is the heading of "${s.title}"`);
  assert.equal(sections[0].line, 1);
});

test('largestSections names the 169K level-1 block, not the 99K "Now", as the largest', () => {
  assert.deepEqual(
    largestSections(REPORTED_TASKS, 3).map((s) => [s.title, s.chars]),
    [['Tasks', 169_060], ['Now', 99_102], ['Tasks', 68_955]],
  );
});

test('sectionSizes keeps a huge handoff container whole and the entries still sum to the file', () => {
  const notes = (tag) => `### Notes ${tag}\n\n${lines(tag, 300)}\n\n`;
  const text = `# Handoff\n\n## Current objective\n\nShip it.\n\n## Current state\n\nGreen.\n\n## Preserved context\n\n${notes('a')}${notes('b')}## Next exact action\n\nVerify.\n`;
  const sections = sectionSizes(text);
  assert.deepEqual(sections.map((s) => s.title), ['Handoff', 'Current objective', 'Current state', 'Preserved context', 'Next exact action']);
  assert.equal(total(sections), text.length);
  const container = sections.find((s) => s.title === 'Preserved context');
  assert.equal(container.chars, text.indexOf('## Next exact action') - text.indexOf('## Preserved context'), 'level-3 headings stay inside the container');
  assert.equal(largestSections(text, 1)[0].title, 'Preserved context');
});

test('text before the first heading is reported as "start of file" so the sizes still sum', () => {
  const text = 'Intro written before any heading.\n\nMore intro.\n\n## A\nx\n\n## B\ny\n';
  const sections = sectionSizes(text);
  assert.deepEqual(sections.map((s) => [s.title, s.line]), [['start of file', 1], ['A', 5], ['B', 8]]);
  assert.equal(sections[0].chars, text.indexOf('## A'));
  assert.equal(total(sections), text.length);
});

test('a file with no headings is one "start of file" entry, an empty file has none, and a leading heading adds no entry', () => {
  assert.deepEqual(sectionSizes('just words\nand more\n').map((s) => [s.title, s.line, s.chars]), [['start of file', 1, 20]]);
  assert.deepEqual(sectionSizes(''), []);
  assert.ok(!sectionSizes('## A\nx\n').some((s) => s.title === 'start of file'), 'nothing precedes the first heading, so nothing is invented');
});

test('a level-1 block after level-2 sections ends the section before it, with no overlap', () => {
  const text = '## A\naaa\n\n# Appendix\nbbb\n\n## B\nc\n';
  const sections = sectionSizes(text);
  assert.deepEqual(sections.map((s) => [s.title, s.line]), [['A', 1], ['Appendix', 4], ['B', 7]]);
  assert.equal(sections[0].chars, text.indexOf('# Appendix'));
  assert.equal(total(sections), text.length);
});

test('sectionSizes sums to the file length with fenced pseudo-headings and CRLF line endings', () => {
  const text = ['# T', '', '```md', '# not a heading', '```', '', '## A', 'x', ''].join('\r\n');
  const sections = sectionSizes(text);
  assert.deepEqual(sections.map((s) => s.title), ['T', 'A']);
  assert.equal(total(sections), text.length);
});

test('doctor and status name the largest block even when it is a level-1 block', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/tasks.md'), REPORTED_TASKS);
  const warning = (await doctorAgentOS({ cwd: root })).warnings.find((w) => /tasks\.md is \d+ chars/.test(w));
  assert.ok(warning);
  assert.match(warning, /tasks\.md is 341843 chars/);
  assert.match(warning, /its largest section "Tasks" is 169060 chars/);
  assert.doesNotMatch(warning, /"Now"/);
  assert.match((await statusAgentOS({ cwd: root })).text, /its largest section "Tasks" is 169060 chars/);
});

test('doctor names "start of file" when the bulk sits before the first heading', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/tasks.md'), `${lines('preamble', 600)}\n\n${TASKS_OK}`);
  const warning = (await doctorAgentOS({ cwd: root })).warnings.find((w) => /tasks\.md is \d+ chars/.test(w));
  assert.ok(warning);
  assert.match(warning, /its largest section "start of file" is \d+ chars/);
});

test('compact --dry-run lists the level-1 blocks, keeps the level-2 decisions, and plans exactly what it planned before', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/tasks.md'), REPORTED_TASKS);
  const before = await snapshot(root);
  const r = runCli(['compact', '--dry-run'], root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /No safe reduction found; files unchanged\./);
  assert.match(r.stdout, /- tasks\.md: 0 archived, 3 live, 0 preserved/, 'the plan is unchanged: only reporting differs');
  const rows = r.stdout.slice(r.stdout.indexOf('Largest sections')).split('\n').filter((l) => /^- \w+\.md:\d+ /.test(l));
  assert.match(rows[0], /^- tasks\.md:1 "Tasks": 169060 chars/, 'the largest block is named first');
  assert.match(rows[1], /^- tasks\.md:\d+ "Now": 99102 chars, live \(canonical live section\)$/, 'level-2 rows keep their decision and reason');
  assert.match(rows[2], /^- tasks\.md:\d+ "Tasks": 68955 chars/);
  assert.deepEqual(await snapshot(root), before, 'still write-free');
});
