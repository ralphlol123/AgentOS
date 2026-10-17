import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS, doctorAgentOS, statusAgentOS } from '../dist/core.js';
import { tasksShapeWarnings } from '../dist/state-size.js';

// tasks.md shape warnings.
//
// Observed in a real workspace: tasks.md grew 26.6K -> 40.3K chars in 9 days after a cleanup.
// 36.6K of it sat in checkbox items ABOVE the first `##` section, the file had two `# Tasks`
// headings, and 11 unchecked `- [ ]` items said in their bold lead that they were DONE/MERGED/
// DELIVERED, so cleanup keyed on `[x]` missed them. Contract pinned here:
//   * doctor warns (never a problem) for items above the first ## section, for more than one
//     level-1 heading, and for unchecked items whose lead claims completion in an uppercase word;
//   * fenced code blocks are ignored; lowercase "merge the PR" never triggers;
//   * a well-shaped tasks.md gets no new warning; status is not affected; nothing is written.

const CLI = resolve('dist/cli.js');
const runCli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-shape-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'web'));
  await writeFile(join(root, 'web', 'package.json'), JSON.stringify({ name: 'web', scripts: { build: 'echo b', test: 'echo t' } }));
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'detected' });
  return root;
}

// Synthetic shape of the reported file: items above `## Now`, a second `# Tasks`, unchecked items
// whose bold lead says they finished, a fenced example that must be ignored, and a lowercase
// "merge the PR" that must not count.
const MALFORMED = [
  '# Tasks',                                                                    // 1
  '',                                                                           // 2
  '- [ ] **Module alpha phases 3 to 6 REBUILT 2026-10-13 and MERGED by owner** tok-a1 tok-a2', // 3
  '  detail line for alpha',                                                    // 4
  '- [x] Module beta finished tok-b1',                                          // 5
  '- [ ] **Module gamma DONE and merged** tok-c1',                              // 6
  '- [ ] merge the PR for module delta tok-d1',                                 // 7
  '',                                                                           // 8
  '```md',                                                                      // 9
  '# Tasks',                                                                    // 10
  '- [ ] **Fenced example DELIVERED** tok-e1',                                  // 11
  '```',                                                                        // 12
  '',                                                                           // 13
  '# Tasks',                                                                    // 14
  '',                                                                           // 15
  '- [ ] **Audit epsilon DELIVERED 2026-10-12** tok-f1',                        // 16
  '',                                                                           // 17
  '## Now',                                                                     // 18
  '',                                                                           // 19
  '- [ ] Verify the checkout form.',                                            // 20
  '- [ ] **Release zeta SHIPPED** tok-g1',                                      // 21
  '',                                                                           // 22
  '## Next',                                                                    // 23
  '',                                                                           // 24
  '- [ ] Polish.',                                                              // 25
  '',                                                                           // 26
].join('\n');

const WELL_SHAPED = '# Tasks\n\nIntro prose.\n\n## Now\n\n- [ ] Verify the checkout form; merge the PR when done.\n- [x] **Old thing DONE**\n\n## Next\n\n- [ ] Polish.\n\n## Later\n\n- [ ] Docs.\n';

const above = (ws) => ws.find((w) => /above the first ## section/.test(w));
const level1 = (ws) => ws.find((w) => /level-1 headings/.test(w));
const claims = (ws) => ws.find((w) => /unchecked/.test(w) && /completion word/.test(w));

test('items above the first ## section are counted with their chars and the fix is named', () => {
  const w = above(tasksShapeWarnings(MALFORMED));
  assert.ok(w, 'warning present');
  // Items at lines 3, 5, 6, 7, 16 (line 11 is fenced). Their chars run up to the next item or heading.
  const lines = MALFORMED.split('\n');
  const span = (from, to) => lines.slice(from - 1, to - 1).map((l) => l + '\n').join('').length;
  const chars = span(3, 5) + span(5, 6) + span(6, 7) + span(7, 14) + span(16, 18);
  assert.match(w, /has 5 task item\(s\) \(/);
  assert.match(w, new RegExp(`\\(${chars} chars\\)`));
  assert.match(w, /## Now\/Next\/Later/);
  assert.match(w, /\.agentos\/runs\//);
});

test('more than one level-1 heading is reported with line numbers, fenced ones ignored', () => {
  const w = level1(tasksShapeWarnings(MALFORMED));
  assert.ok(w);
  assert.match(w, /2 level-1 headings/);
  assert.match(w, /lines 1, 14\b/);
});

test('unchecked items whose lead claims completion are reported; lowercase and fenced do not count', () => {
  const w = claims(tasksShapeWarnings(MALFORMED));
  assert.ok(w);
  // Lines 3 (MERGED), 6 (DONE), 16 (DELIVERED), 21 (SHIPPED). Not 7 (lowercase), not 11 (fenced), not 5 ([x]).
  assert.match(w, /has 4 unchecked/);
  assert.match(w, /lines 3, 6, 16\b/, 'first three line numbers');
  assert.doesNotMatch(w, /\b21\b/);
  assert.match(w, /\d+ chars/);
});

test('completion words are case-sensitive whole words and only in the lead', () => {
  const t = (item) => claims(tasksShapeWarnings(`# Tasks\n\n## Now\n\n${item}\n`));
  assert.equal(t('- [ ] merge the PR and mark it done'), undefined);
  assert.equal(t('- [ ] UNDONE work and DONEISH'), undefined);
  assert.equal(t(`- [ ] **Short lead** ${'x'.repeat(200)} DONE`), undefined, 'outside the bold lead');
  assert.equal(t(`- [ ] ${'x '.repeat(70)} COMPLETED`), undefined, 'past the first 120 chars');
  assert.ok(t('- [ ] Ticket CLOSED by owner'), 'no bold: first 120 chars');
  assert.ok(t('* [ ] **Thing COMPLETED**'), 'other bullet markers');
});

test('a well-shaped tasks.md and an empty one get no shape warning', () => {
  assert.deepEqual(tasksShapeWarnings(WELL_SHAPED), []);
  assert.deepEqual(tasksShapeWarnings(''), []);
});

test('doctor reports all three as warnings only; ok, problems and exit status are unchanged', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/tasks.md'), WELL_SHAPED);
  const before = await doctorAgentOS({ cwd: root });
  const beforeCli = runCli(['doctor', '--json'], root);
  await writeFile(join(root, '.agentos/tasks.md'), MALFORMED);
  const after = await doctorAgentOS({ cwd: root });
  const afterCli = runCli(['doctor', '--json'], root);
  assert.ok(above(after.warnings) && level1(after.warnings) && claims(after.warnings), JSON.stringify(after.warnings));
  assert.equal(after.ok, before.ok);
  assert.deepEqual(after.problems, before.problems);
  assert.equal(afterCli.status, beforeCli.status);
  const json = JSON.parse(afterCli.stdout);
  assert.ok(json.warnings.some((w) => /above the first ## section/.test(w)), 'strings in the existing warnings array');
  assert.equal(after.warnings.length, before.warnings.length + 3, 'additive: exactly three new warnings');
});

test('status does not show the shape warnings', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/tasks.md'), MALFORMED);
  const text = (await statusAgentOS({ cwd: root })).text;
  assert.doesNotMatch(text, /above the first ## section|level-1 headings|completion word/);
});

async function treeSnapshot(root) {
  const out = {};
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const info = await stat(abs);
      if (entry.isDirectory()) { out[relative(root, abs) + '/'] = info.mode; await walk(abs); }
      else out[relative(root, abs)] = `${info.mode}:${createHash('sha256').update(await readFile(abs)).digest('hex')}`;
    }
  }
  await walk(root);
  return out;
}

test('doctor and doctor --json are read-only on a tasks.md with all three shapes', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.agentos/tasks.md'), MALFORMED);
  const before = await treeSnapshot(root);
  await doctorAgentOS({ cwd: root });
  runCli(['doctor'], root);
  runCli(['doctor', '--json'], root);
  const after = await treeSnapshot(root);
  assert.deepEqual(after, before);
  assert.ok(!Object.keys(after).some((p) => p.endsWith('.agentos.bak') || /lock/i.test(p)));
});
