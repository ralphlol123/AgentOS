import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS, doctorAgentOS } from '../dist/core.js';
import {
  discoverObjectives,
  isEmptySection,
  matchSectionTitle,
  recognizeSections,
  resolveObjective,
  sectionText,
} from '../dist/context-sections.js';

const OBJECTIVE = [{ role: 'current-objective', canonical: 'Current objective' }];

test('section titles recognize documented variants without prefix over-matching', () => {
  const accepted = [
    'Current objective',
    'Current objective — 2026-09-15',
    'Current objective — 2026-09-15 (latest): AUM work merged',
    'Current objective – 2026-09-14',
    'Current objective - 2026-09-13',
    'Current objective: ship the rewrite',
    'current objective',
    'Current   objective',
    'Current objective   ',
    'Current objective —',
  ];
  for (const title of accepted) assert.ok(matchSectionTitle(title, 'Current objective'), `should recognize: ${title}`);
  const rejected = [
    'Previous objective',
    'Next objective',
    'Current objectives backlog',
    'Notes about Current objective',
    'Current objectiveX',
    'Current- objective',
    'Objectives',
  ];
  for (const title of rejected) assert.equal(matchSectionTitle(title, 'Current objective'), null, `must not recognize: ${title}`);
  assert.equal(matchSectionTitle('Next exact action — 2026-09-15', 'Next exact action').suffix, '2026-09-15');
  assert.equal(matchSectionTitle('Current objective', 'Current objective').suffix, '');
});

test('shared objective discovery recognizes real heading variants and preserves candidate ids', () => {
  const handoff = [
    '# Handoff',
    '',
    '## Current objective — 2026-09-15',
    '',
    'Newest work.',
    '',
    '```md',
    '## Current objective — fenced example must not count',
    '```',
    '',
    '## Current objective: ship the rewrite',
    '',
  ].join('\r\n');

  const candidates = discoverObjectives(handoff);
  assert.deepEqual(candidates.map(({ id, heading, line, text }) => ({ id, heading, line, text })), [
    { id: 'obj-d19abe0afd', heading: 'Current objective — 2026-09-15', line: 3, text: '2026-09-15\n\nNewest work.\r\n\r\n```md\r\n## Current objective — fenced example must not count\r\n```' },
    { id: 'obj-c10ee08a07', heading: 'Current objective: ship the rewrite', line: 11, text: 'ship the rewrite' },
  ]);
  assert.equal(resolveObjective(handoff).kind, 'ambiguous');
});

test('section recognition keeps original text, line numbers and suffix as data', () => {
  const text = [
    '# Handoff',
    '',
    '## Scope',
    '- Workspace kind: single-repo',
    '',
    '## Current objective — 2026-09-15 (latest): AUM work merged',
    'Inline objective text lives in the heading.',
    '',
    'Body detail.',
    '',
    '## Previous objective — 2026-09-01',
    'Old work.',
    '',
    '```md',
    '## Current objective — fenced example must not count',
    '```',
    '',
    '## Current objective',
    '',
  ].join('\n');
  const sections = recognizeSections(text, OBJECTIVE);
  assert.equal(sections.length, 2, 'fenced headings and Previous objective are excluded');
  assert.equal(sections[0].line, 6);
  assert.equal(sections[0].suffix, '2026-09-15 (latest): AUM work merged');
  assert.match(sectionText(sections[0]), /Inline objective text lives in the heading\./);
  assert.match(sectionText(sections[0]), /Body detail\./);
  assert.equal(isEmptySection(sections[0]), false);
  assert.equal(sections[1].line, 18);
  assert.equal(isEmptySection(sections[1]), true, 'a heading with no inline or body text is empty, not missing');
  assert.equal(sectionText(sections[1]), '');
  assert.equal(recognizeSections(text, [{ role: 'next-exact-action', canonical: 'Next exact action' }]).length, 0);
});

test('doctor recognizes dated objective headings and reports duplicates with source lines', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'agentos-sections-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const handoffPath = join(root, '.agentos/handoff.md');
  const tasksPath = join(root, '.agentos/tasks.md');
  await writeFile(handoffPath, [
    '# Handoff', '',
    '## Current objective — 2026-09-15 (latest): AUM work merged', 'Ship the rewrite slice.', '',
    '## Next exact action — 2026-09-15', 'Ship the rewrite slice now.', '',
    '## Scope', '- Repos in scope: agentos-for-projects',
  ].join('\n'));
  await writeFile(tasksPath, '# Tasks\n\n## Now\n\n- [ ] Ship the rewrite slice now.\n\n## Next\n\n## Later\n\n## Done\n\n- [x] Prior work.\n');
  const dated = await doctorAgentOS({ cwd: root });
  assert.ok(!dated.text.includes('has no ## Current objective'), `dated heading must be recognized:\n${dated.text}`);
  assert.ok(!dated.text.includes('has no actionable ## Now checkbox'), dated.text);
  assert.ok(!/may not match .*current objective/.test(dated.text), dated.text);

  await writeFile(handoffPath, [
    '# Handoff', '',
    '## Current objective — 2026-09-15', 'Newest objective.', '',
    '## Current objective — 2026-09-01', 'Older objective.', '',
    '## Current objective: undated', 'Third objective.', '',
    '## Scope', '- Repos in scope: agentos-for-projects',
  ].join('\n'));
  const duplicate = await doctorAgentOS({ cwd: root });
  assert.match(duplicate.text, /3 current-objective headings/);
  assert.match(duplicate.text, /lines 3, 6, 9/);
  assert.match(duplicate.text, /explicit objective selection is required/);

  await writeFile(handoffPath, [
    '# Handoff', '',
    '## Current objective', '',
    '## Scope', '- Repos in scope: agentos-for-projects',
  ].join('\n'));
  const empty = await doctorAgentOS({ cwd: root });
  assert.ok(!empty.text.includes('has no ## Current objective'), 'present-but-empty is not missing');
  assert.match(empty.text, /## Current objective is empty/);

  await writeFile(handoffPath, '# Handoff\n\n## Scope\n- Repos in scope: agentos-for-projects\n');
  const missing = await doctorAgentOS({ cwd: root });
  assert.match(missing.text, /has no recognized ## Current objective section/);

  await writeFile(handoffPath, [
    '# Handoff', '',
    '```md',
    '## Current objective — a fenced example',
    '```', '',
    '## Scope', '- Repos in scope: agentos-for-projects',
  ].join('\n'));
  const fenced = await doctorAgentOS({ cwd: root });
  assert.match(fenced.text, /has no recognized ## Current objective section/, 'fenced examples do not satisfy the objective check');
});

test('doctor json reports objective ambiguity as a failing health check and stays parseable', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'agentos-sections-json-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), [
    '# Handoff', '',
    '## Current objective — 2026-09-15', 'Newest.', '',
    '## Current objective — 2026-09-01', 'Older.',
  ].join('\n'));
  const cli = spawnSync(process.execPath, [join(process.cwd(), 'dist/cli.js'), 'doctor', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stderr);
  const parsed = JSON.parse(cli.stdout);
  assert.ok(parsed.problems.some((problem) => /2 current-objective headings/.test(problem)), cli.stdout);
  assert.deepEqual(parsed.problems.filter((problem) => /has no recognized ## Current objective/.test(problem)), []);
  const before = await readFile(join(root, '.agentos/handoff.md'), 'utf8');
  assert.match(before, /Current objective — 2026-09-15/, 'read-only diagnostics must not rewrite state');
});

test('objective text in a heading suffix still drives the tasks/handoff consistency check', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'agentos-sections-overlap-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), [
    '# Handoff', '',
    '## Current objective — implement archive rewrite planner', '',
    '## Next exact action', 'Implement archive rewrite planner.',
  ].join('\n'));
  await writeFile(join(root, '.agentos/tasks.md'), '# Tasks\n\n## Now\n\n- [ ] Implement archive rewrite planner.\n');
  const ok = await doctorAgentOS({ cwd: root });
  assert.ok(!/may not match .*current objective/.test(ok.text), ok.text);

  await writeFile(join(root, '.agentos/tasks.md'), '# Tasks\n\n## Now\n\n- [ ] Buy groceries and water the plants.\n');
  const mismatch = await doctorAgentOS({ cwd: root });
  assert.match(mismatch.text, /may not match .*current objective/);
});
