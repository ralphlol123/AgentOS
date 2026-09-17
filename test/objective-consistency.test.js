import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { doctorAgentOS, initAgentOS, statusAgentOS } from '../dist/core.js';
import { planCompactRewrite } from '../dist/compact-rewrite.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-objective-consistency-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  return root;
}

const TASKS = '# Tasks\n\n## Now\n\n- [ ] Ship the objective parser.\n\n## Next\n\n## Later\n';

const variants = [
  { name: 'plain', handoff: '# Handoff\n\n## Current objective\n\nShip the objective parser.\n', expected: 'Ship the objective parser.' },
  { name: 'dated', handoff: '# Handoff\n\n## Current objective — 2026-09-17\n\nShip the objective parser.\n', expected: '2026-09-17' },
  { name: 'colon suffix', handoff: '# Handoff\n\n## Current objective: ship the objective parser\n', expected: 'ship the objective parser' },
  { name: 'CRLF', handoff: '# Handoff\r\n\r\n## Current objective — 2026-09-17\r\n\r\nShip the objective parser.\r\n', expected: 'Ship the objective parser.' },
  { name: 'suffix only', handoff: '# Handoff\n\n## Current objective — ship the objective parser\n', expected: 'ship the objective parser' },
];

test('status, doctor, and compact resolve every supported objective heading consistently', async (t) => {
  const root = await fixture(t);
  const handoffPath = join(root, '.agentos/handoff.md');
  const tasksPath = join(root, '.agentos/tasks.md');
  await writeFile(tasksPath, TASKS);

  for (const variant of variants) {
    await writeFile(handoffPath, variant.handoff);
    const before = await readFile(handoffPath, 'utf8');
    const plan = planCompactRewrite({ handoff: before, tasks: TASKS });
    const doctor = await doctorAgentOS({ cwd: root });
    const status = await statusAgentOS({ cwd: root });

    assert.equal(plan.ok, true, `${variant.name}: ${plan.blockedReasons.join('\n')}`);
    assert.doesNotMatch(doctor.text, /Current objective (?:section is empty|is empty)|no (?:recognized )?## Current objective|current-objective headings/i, variant.name);
    assert.equal(status.ok, true, `${variant.name}: ${status.text}`);
    assert.match(status.text, new RegExp(variant.expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), variant.name);
    assert.doesNotMatch(status.text, /No current objective found/, variant.name);
    assert.equal(await readFile(handoffPath, 'utf8'), before, `${variant.name}: diagnostics must not write`);
  }
});

test('missing, empty, and ambiguous objectives fail consistently without writes', async (t) => {
  const root = await fixture(t);
  const handoffPath = join(root, '.agentos/handoff.md');
  const tasksPath = join(root, '.agentos/tasks.md');
  await writeFile(tasksPath, TASKS);
  const cases = [
    {
      name: 'missing',
      handoff: '# Handoff\n\n```md\n## Current objective — fenced example\n```\n',
      diagnostic: /has no recognized ## Current objective section/,
    },
    {
      name: 'empty',
      handoff: '# Handoff\n\n## Current objective\n',
      diagnostic: /## Current objective is empty/,
    },
    {
      name: 'ambiguous',
      handoff: '# Handoff\n\n## Current objective — first\n\nOne.\n\n## Current objective — second\n\nTwo.\n',
      diagnostic: /contains 2 current-objective headings \(lines 3, 7\); explicit objective selection is required/,
    },
  ];

  for (const scenario of cases) {
    await writeFile(handoffPath, scenario.handoff);
    const before = {
      handoff: await readFile(handoffPath, 'utf8'),
      tasks: await readFile(tasksPath, 'utf8'),
    };
    const plan = planCompactRewrite({ handoff: before.handoff, tasks: before.tasks });
    const doctor = await doctorAgentOS({ cwd: root });
    const status = await statusAgentOS({ cwd: root });

    assert.equal(plan.ok, false, scenario.name);
    assert.match(plan.blockedReasons.join('\n'), scenario.diagnostic, scenario.name);
    assert.equal(doctor.ok, false, `${scenario.name}: ${doctor.text}`);
    assert.match(doctor.text, scenario.diagnostic, scenario.name);
    assert.equal(status.ok, false, `${scenario.name}: ${status.text}`);
    assert.match(status.text, scenario.diagnostic, scenario.name);
    assert.equal(await readFile(handoffPath, 'utf8'), before.handoff, `${scenario.name}: handoff changed`);
    assert.equal(await readFile(tasksPath, 'utf8'), before.tasks, `${scenario.name}: tasks changed`);
  }
});
