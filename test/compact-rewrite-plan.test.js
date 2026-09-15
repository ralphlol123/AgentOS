import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCompactRewrite } from '../dist/compact-rewrite.js';

function handoffFixture({ objectives = [], extra = [], history = true } = {}) {
  const parts = ['# Handoff', ''];
  for (const [heading, body] of objectives) parts.push(`## ${heading}`, '', body, '');
  for (const [heading, body] of extra) parts.push(`## ${heading}`, '', body, '');
  if (history) parts.push('## Previous objective — 2026-08-01', '', 'Old narrative work that is finished.', '');
  return parts.join('\n');
}
const SCOPE = ['Scope', '- Workspace kind: single-repo\n- Repos in scope: agentos-for-projects'];
const NEXT = ['Next exact action', 'Ship the rewrite slice.'];
const TASKS = [
  '# Tasks', '',
  '## Now', '', '- [ ] Ship the rewrite slice.', '  - Acceptance: archive is byte-exact.', '',
  '## Next', '', '- [ ] Wire the CLI flag.', '',
  '## Later', '', '- [ ] Publish the release.', '',
  '## Done', '', '- [x] Slice 1 heading recognition.', '',
].join('\n');

test('planner blocks when the live objective cannot be established', () => {
  const missing = planCompactRewrite({ handoff: '# Handoff\n\n## Scope\n\n- x\n', tasks: TASKS });
  assert.equal(missing.ok, false);
  assert.match(missing.blockedReasons.join('\n'), /no recognized ## Current objective/);
  assert.match(missing.blockedReasons.join('\n'), /--rewrite requires an explicit objective selection/);
  assert.equal(missing.handoff, '');
  assert.equal(missing.tasks, '');

  const ambiguous = planCompactRewrite({
    handoff: handoffFixture({ objectives: [['Current objective — 2026-09-15', 'Newest work.'], ['Current objective — 2026-09-01', 'Older work.']] }),
    tasks: TASKS,
  });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.objectiveCandidates.length, 2);
  assert.equal(ambiguous.selectedObjectiveId, undefined);
  assert.match(ambiguous.blockedReasons.join('\n'), /2 current-objective headings/);
  for (const candidate of ambiguous.objectiveCandidates) {
    assert.match(candidate.id, /^obj-[a-f0-9]{10}$/);
    for (const other of ambiguous.objectiveCandidates) if (other !== candidate) assert.notEqual(candidate.id, other.id);
  }
  assert.equal(ambiguous.handoff, '', 'a blocked plan proposes no live files');

  const badId = planCompactRewrite({
    handoff: handoffFixture({ objectives: [['Current objective — 2026-09-15', 'Newest work.'], ['Current objective — 2026-09-01', 'Older work.']] }),
    tasks: TASKS,
    objectiveId: 'obj-0000000000',
  });
  assert.equal(badId.ok, false);
  assert.match(badId.blockedReasons.join('\n'), /unknown --objective/);

  const empty = planCompactRewrite({ handoff: '# Handoff\n\n## Current objective\n\n', tasks: TASKS });
  assert.equal(empty.ok, false);
  assert.match(empty.blockedReasons.join('\n'), /## Current objective is empty/);

  const blank = planCompactRewrite({ handoff: '', tasks: '' });
  assert.equal(blank.ok, false);
  assert.match(blank.blockedReasons.join('\n'), /handoff\.md is empty/);
  assert.match(blank.blockedReasons.join('\n'), /tasks\.md is empty/);

  const unclosed = planCompactRewrite({
    handoff: handoffFixture({ objectives: [['Current objective', 'Work.']] }) + '\n```text\nunfinished example\n',
    tasks: TASKS,
  });
  assert.equal(unclosed.ok, false);
  assert.match(unclosed.blockedReasons.join('\n'), /unclosed Markdown fence/);
  assert.equal(unclosed.handoff, '');
});

test('objective candidate ids bind to source content, not ordinal position', () => {
  const base = handoffFixture({ objectives: [['Current objective — 2026-09-15', 'Newest work.'], ['Current objective — 2026-09-01', 'Older work.']] });
  const first = planCompactRewrite({ handoff: base, tasks: TASKS }).objectiveCandidates[0].id;
  const edited = base.replace('Newest work.', 'Newest work, edited.');
  const after = planCompactRewrite({ handoff: edited, tasks: TASKS }).objectiveCandidates[0].id;
  assert.notEqual(first, after, 'editing source content must change the candidate id');
  assert.equal(planCompactRewrite({ handoff: base, tasks: TASKS }).objectiveCandidates[0].id, first, 'ids are deterministic');
});

test('rewrite keeps live obligations and archives superseded history', () => {
  const handoff = handoffFixture({
    objectives: [['Current objective — 2026-09-15 (latest): AUM work merged', 'Finish the compaction rewrite.'], ['Current objective — 2026-09-01', 'Older objective narrative.'], ['Previous objective — 2026-08-15', 'Much older narrative.']],
    extra: [SCOPE, NEXT, ['Known failures', '- Flaky CI must never be treated as passing.'], ['Custom escalation', 'Call the owner before migration.']],
  });
  const tasks = TASKS + '\n## History\n\n- [x] Old task.\n';
  const preview = planCompactRewrite({ handoff, tasks });
  assert.equal(preview.ok, false, 'two current-objective headings must not be auto-resolved');
  const plan = planCompactRewrite({ handoff, tasks, objectiveId: preview.objectiveCandidates[0].id, archiveRelPath: '.agentos/runs/compact-rewrite-abc' });
  assert.equal(plan.selectedObjectiveId, preview.objectiveCandidates[0].id, 'explicit selection resolves the block');
  assert.equal(plan.ok, true);
  assert.equal(plan.handoff.includes('Older objective narrative.'), false, 'superseded objectives move out of live context');
  assert.equal(plan.handoff.includes('Much older narrative.'), false);
  assert.ok(plan.handoff.includes('## Current objective — 2026-09-15 (latest): AUM work merged'), 'selected objective keeps its original heading');
  assert.ok(plan.handoff.includes('Finish the compaction rewrite.'));
  assert.ok(plan.handoff.includes('- Workspace kind: single-repo'));
  assert.ok(plan.handoff.includes('Ship the rewrite slice.'));
  assert.ok(plan.handoff.includes('## Known failures'), 'known failures stay live');
  assert.equal(/^## Custom escalation$/m.test(plan.handoff), false, 'unknown sections are not promoted to top-level sections');
  assert.match(plan.handoff, /^### Custom escalation$/m);
  assert.ok(plan.handoff.includes('## Preserved context'));
  assert.ok(plan.handoff.includes('Call the owner before migration.'), 'unknown content is preserved verbatim');
  assert.ok(plan.tasks.includes('- [ ] Ship the rewrite slice.'));
  assert.ok(plan.tasks.includes('Acceptance: archive is byte-exact.'), 'nested acceptance details survive');
  assert.ok(plan.tasks.includes('## Later'));
  assert.equal(plan.tasks.includes('Slice 1 heading recognition.'), false, 'completed work moves out of live context');
  assert.ok(plan.tasks.includes('## History'));
  assert.ok(plan.tasks.includes('## Done') === false, 'Done is history, not a canonical live section');
  const archived = [...plan.classification.handoff, ...plan.classification.tasks].filter((section) => section.decision === 'archived');
  assert.ok(archived.length >= 3, JSON.stringify(plan.classification, null, 1));
  // Direction is not asserted for this tiny fixture: canonical structure plus the
  // History/Preserved sections can grow a small file. Reduction is covered by the
  // large history-heavy case; the CLI reports growth honestly instead of "savings".
  assert.equal(plan.sizes.delta, plan.sizes.after - plan.sizes.before);
  assert.deepEqual(plan.missing, ['Current state (handoff.md)', 'Protected paths and constraints (handoff.md)', 'Open decisions (handoff.md)', 'Blocked (tasks.md)']);
});

test('planner is deterministic and idempotent on its own output', () => {
  const handoff = handoffFixture({
    objectives: [['Current objective — 2026-09-15', 'Work A.'], ['Previous objective — 2026-08-01', 'Old A.']],
    extra: [SCOPE, NEXT, ['Files changed', '- src/core.ts'], ['Known failures', '- Do not treat flaky CI as passing.']],
  });
  const tasks = TASKS;
  const first = planCompactRewrite({ handoff, tasks, archiveRelPath: '.agentos/runs/compact-rewrite-x' });
  const repeat = planCompactRewrite({ handoff, tasks, archiveRelPath: '.agentos/runs/compact-rewrite-x' });
  assert.deepEqual(repeat, first, 'plans are deterministic for identical input');
  assert.ok(first.handoff.includes('- src/core.ts'), 'sections without a canonical slot stay live');
  const second = planCompactRewrite({ handoff: first.handoff, tasks: first.tasks, archiveRelPath: '.agentos/runs/compact-rewrite-y' });
  assert.equal(second.ok, true, second.blockedReasons.join('\n'));
  assert.equal(second.handoff, first.handoff, 'second rewrite of canonical output is byte-identical');
  assert.equal(second.tasks, first.tasks);
  assert.deepEqual([...second.classification.handoff, ...second.classification.tasks].filter((s) => s.decision === 'archived'), []);
});

test('history sections with unresolved work or standing constraints are never silently dropped', () => {
  const handoff = handoffFixture({
    objectives: [['Current objective', 'Current work.'], ['Previous objective — 2026-08-01', 'Old work.\n\n- [ ] This obligation was never finished.']],
    extra: [SCOPE, NEXT],
  });
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true);
  assert.ok(plan.handoff.includes('This obligation was never finished.'), 'unfinished history stays live');
  const kept = plan.classification.handoff.find((section) => /Previous objective/.test(section.heading));
  assert.equal(kept.decision, 'preserved');
  assert.match(kept.reason, /unresolved/);

  const constrained = handoffFixture({
    objectives: [['Current objective', 'Current work.'], ['Previous objective — 2026-08-01', 'Old narrative.\n\nNever deploy without owner approval.']],
    extra: [SCOPE, NEXT],
  });
  const constrainedPlan = planCompactRewrite({ handoff: constrained, tasks: TASKS });
  assert.equal(constrainedPlan.handoff.includes('Old narrative.'), false);
  assert.ok(constrainedPlan.handoff.includes('Never deploy without owner approval.'), 'constraint lines carried forward verbatim');
  assert.deepEqual(constrainedPlan.carriedForward, ['Never deploy without owner approval.']);
});

test('unchecked descendants under a checked parent keep the whole task block live', () => {
  const tasks = [
    '# Tasks', '',
    '## Now', '', '- [x] Implement release workflow', '  - [ ] Obtain deployment approval', '  Preserve staging rollback instructions.', '',
    '## Done', '', '- [x] Closed item.', '',
  ].join('\n');
  const plan = planCompactRewrite({ handoff: handoffFixture({ objectives: [['Current objective', 'Work.']], extra: [SCOPE, NEXT] }), tasks });
  assert.equal(plan.ok, true);
  assert.ok(plan.tasks.includes('- [x] Implement release workflow'));
  assert.ok(plan.tasks.includes('- [ ] Obtain deployment approval'));
  assert.ok(plan.tasks.includes('Preserve staging rollback instructions.'));
});

test('rewrite preserves CRLF, nested details, and marks sections it could not classify', () => {
  const handoff = handoffFixture({ objectives: [['Current objective', 'Work.']], extra: [SCOPE, NEXT] }).replace(/\n/g, '\r\n');
  const tasks = TASKS.replace(/\n/g, '\r\n');
  const plan = planCompactRewrite({ handoff, tasks });
  assert.equal(plan.ok, true);
  assert.ok(!(plan.handoff + plan.tasks).replaceAll('\r\n', '').includes('\n'), 'CRLF preserved');
  assert.ok(plan.classification.handoff.some((section) => section.decision === 'archived'));
});

test('duplicate canonical sections merge deterministically instead of duplicating headings', () => {
  const tasks = [
    '# Tasks', '',
    '## Now', '', '- [ ] First.', '',
    '## Now', '', '- [ ] Second.', '',
    '## Done', '', '- [x] Closed.', '',
  ].join('\n');
  const plan = planCompactRewrite({ handoff: handoffFixture({ objectives: [['Current objective', 'Work.']], extra: [SCOPE, NEXT] }), tasks });
  assert.equal(plan.ok, true);
  assert.equal(plan.tasks.match(/^## Now$/gm).length, 1);
  assert.ok(plan.tasks.includes('- [ ] First.') && plan.tasks.includes('- [ ] Second.'));
});

test('large history-heavy state shrinks substantially without truncating live obligations', () => {
  const objectives = [['Current objective — 2026-09-15', 'The only live objective.']];
  for (let i = 0; i < 40; i++) objectives.push([`Previous objective — 2026-07-${String((i % 28) + 1).padStart(2, '0')} (run ${i})`, `Historical narrative ${i}: ${'detail '.repeat(220)}`]);
  const handoff = handoffFixture({ objectives, extra: [SCOPE, NEXT] });
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true);
  assert.ok(plan.sizes.after < plan.sizes.before / 4, `expected large reduction: ${plan.sizes.before} -> ${plan.sizes.after}`);
  assert.ok(plan.handoff.includes('The only live objective.'));
  assert.equal(plan.handoff.includes('Historical narrative 7'), false);
});
