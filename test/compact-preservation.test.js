import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCompactRewrite } from '../dist/compact-rewrite.js';

const TASKS = '# Tasks\n\n## Now\n\n- [ ] Continue the current slice.\n';

function handoffWithHistory(blocks, newline = '\n') {
  return [
    '# Handoff', '',
    '## Current objective', '', 'Harden preservation.', '',
    ...blocks.flatMap(([heading, body]) => [`## ${heading}`, '', body, '']),
  ].join(newline);
}

/** A `## Preserved context` container holding the given level-3 blocks. */
function handoffWithContainer(nested, { container = 'Preserved context', extra = [] } = {}) {
  return [
    '# Handoff', '',
    '## Current objective', '', 'Harden preservation.', '',
    ...extra.flatMap(([heading, body]) => [`## ${heading}`, '', body, '']),
    `## ${container}`, '',
    ...nested.flatMap(([heading, body]) => [`### ${heading}`, '', body, '']),
  ].join('\n');
}

function historyPlans(plan) {
  return plan.classification.handoff.filter((entry) => entry.role === 'history');
}

function preservedHistoryPlans(plan) {
  return historyPlans(plan).filter((entry) => entry.decision === 'preserved');
}

test('presentation variants of genuine obligations stay live, extracted from the blocks that archive', () => {
  const fixtures = [
    ['Previous objective — 2026-09-01', 'Context marker QZ-LOWER.\n\nnever push to main'],
    ['Previous objective — 2026-09-02', 'Context marker QZ-CODE.\n\n`migration.sql` must never be edited after being applied'],
    ['Previous objective — 2026-09-03', 'Context marker QZ-LONG.\n\nAccounts, locations and trips in the production database must not be modified without approval'],
  ];
  const handoff = handoffWithHistory(fixtures);
  const plan = planCompactRewrite({ handoff, tasks: TASKS });

  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  for (const [, body] of fixtures) {
    const obligation = body.split('\n\n')[1];
    assert.ok(plan.handoff.includes(`- ${obligation}`), `the obligation must stay live as a carried line:\n${obligation}`);
    assert.equal(plan.carriedForward.includes(obligation), true, `and be reported as carried: ${obligation}`);
  }
  assert.equal((plan.handoff.match(/QZ-LOWER\.|QZ-CODE\.|QZ-LONG\./g) ?? []).length, 0, 'the narrative around each obligation still archives');
  assert.deepEqual(historyPlans(plan).map((entry) => entry.decision), ['archived', 'archived', 'archived']);
  for (const entry of historyPlans(plan)) assert.match(entry.reason, /uncertain obligation/i);
});

test('a lowercase directive, a code-led subject and a long subject are all kept, listed first', () => {
  // The three false negatives slice 3 exists for. Each block now archives and the
  // obligation itself is carried forward verbatim, so the instruction stays live
  // without the block around it.
  const plan = planCompactRewrite({
    handoff: handoffWithHistory([
      ['Previous objective — 2026-09-01', 'Marker QZ-A.\n\nnever push to main'],
      ['Previous objective — 2026-09-02', 'Marker QZ-B.\n\n`migration.sql` must never be edited after being applied'],
      ['Previous objective — 2026-09-03', 'Marker QZ-C.\n\nAccounts, locations and trips in the production database must not be modified without approval'],
    ]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.deepEqual(plan.carriedForward, [
    'never push to main',
    '`migration.sql` must never be edited after being applied',
    'Accounts, locations and trips in the production database must not be modified without approval',
  ], 'each presentation variant is extracted verbatim');
  for (const line of plan.carriedForward) assert.ok(plan.handoff.includes(`- ${line}`), line);
  for (const marker of ['Marker QZ-A.', 'Marker QZ-B.', 'Marker QZ-C.']) {
    assert.equal(plan.handoff.includes(marker), false, `${marker} archives with its block`);
  }
  for (const entry of preservedHistoryPlans(plan)) assert.match(entry.reason, /uncertain obligation/i);
  assert.deepEqual(preservedHistoryPlans(plan), [], 'nothing has to be preserved whole any more');
  for (const entry of historyPlans(plan)) assert.match(entry.reason, /uncertain obligation\(s\) carried forward/);
});

test('emphasis and list presentation never decide whether an obligation survives', () => {
  const lower = '**never push to main**';
  const lowerPlan = planCompactRewrite({
    handoff: handoffWithHistory([['Previous objective — 2026-09-05', `Marker QZ-EMPH-LOW.\n\n${lower}`]]),
    tasks: TASKS,
  });
  assert.equal(lowerPlan.ok, true, lowerPlan.blockedReasons.join('\n'));
  assert.deepEqual(lowerPlan.carriedForward, ['never push to main'], 'emphasis is presentation, not part of the statement');
  assert.match(lowerPlan.handoff, /^- never push to main$/m, 'the obligation is live with its markers stripped');
  assert.equal(lowerPlan.handoff.includes(lower), false, 'and the block around it archives');
  assert.match(historyPlans(lowerPlan)[0].reason, /uncertain obligation/i);

  const bulleted = '- `migration.sql` must never be edited after being applied';
  const bulletedPlan = planCompactRewrite({
    handoff: handoffWithHistory([['Previous objective — 2026-09-05', `Marker QZ-BULLET.\n\n${bulleted}`]]),
    tasks: TASKS,
  });
  assert.equal(bulletedPlan.ok, true);
  assert.deepEqual(bulletedPlan.carriedForward, ['`migration.sql` must never be edited after being applied'], 'the bullet marker is stripped, the statement is kept');
  assert.ok(bulletedPlan.handoff.includes('`migration.sql` must never be edited after being applied'));
  assert.match(historyPlans(bulletedPlan)[0].reason, /uncertain obligation/i);

  // `**Do not** push to main` opens on the directive, so the confident rule
  // already extracts it verbatim: the block archives and the line is carried
  // forward. Emphasis must not change that (slice 3 keeps this behavior).
  const upper = '**Do not** push to main';
  const upperPlan = planCompactRewrite({
    handoff: handoffWithHistory([['Previous objective — 2026-09-05', `Marker QZ-EMPH-UP.\n\n${upper}`]]),
    tasks: TASKS,
  });
  assert.equal(upperPlan.ok, true);
  assert.deepEqual(upperPlan.carriedForward, [upper]);
  assert.equal(historyPlans(upperPlan)[0].decision, 'archived');
  assert.match(upperPlan.handoff, /^- \*\*Do not\*\* push to main$/m, 'the obligation is still live at the top level');
  assert.equal(upperPlan.handoff.includes('Marker QZ-EMPH-UP.'), false, 'the narrative around it still archives');
});

test('missing terminal punctuation does not turn an obligation into narrative', () => {
  const plan = planCompactRewrite({
    handoff: handoffWithHistory([
      ['Previous objective — 2026-09-06', 'Marker QZ-NOPERIOD.\n\nnever push to main'],
      ['Previous objective — 2026-09-07', 'Marker QZ-NOPERIOD-CODE.\n\n`trip.service.ts` must never be edited without approval'],
    ]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.deepEqual(plan.carriedForward, [
    'never push to main',
    '`trip.service.ts` must never be edited without approval',
  ], 'an unterminated statement nothing continues is lifted verbatim');
  assert.match(plan.handoff, /^- never push to main$/m);
  assert.match(plan.handoff, /^- `trip\.service\.ts` must never be edited without approval$/m);
  assert.deepEqual(historyPlans(plan).map((entry) => entry.decision), ['archived', 'archived']);
});

test('an obligation the layout split across a blank line keeps its whole block live', () => {
  // The fallback. The sentence above the blank line is a fragment of the one below
  // it, so lifting it would put half a statement into live context and archive the
  // half that completes it: the block is preserved whole and nothing is extracted.
  const body = [
    'Marker QZ-SPAN.',
    '',
    'Accounts, locations and trips in the',
    'production database must not be modified without',
    '',
    'approval',
  ].join('\n');
  const plan = planCompactRewrite({
    handoff: handoffWithHistory([['Previous objective — 2026-09-08', body]]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.ok(plan.handoff.includes(body), 'the whole block stays live, both halves of the sentence with it');
  assert.deepEqual(plan.carriedForward, [], 'nothing is extracted from a statement that cannot be lifted');
  const entry = preservedHistoryPlans(plan)[0];
  assert.ok(entry, JSON.stringify(plan.classification.handoff, null, 1));
  assert.match(entry.reason, /uncertain obligation cannot be extracted safely/i);
  assert.match(entry.reason, /must not be modified without/, 'the reason names the statement that stopped it');

  // The same continuation without a blank line is one soft-wrapped statement: it
  // assembles, so it is lifted and the block around it archives. The blank line is
  // what makes extraction unsafe — not the line break.
  const wrapped = ['Marker QZ-WRAP.', '', 'Accounts, locations and trips in the', 'production database must not be modified without', 'approval'].join('\n');
  const wrappedPlan = planCompactRewrite({
    handoff: handoffWithHistory([['Previous objective — 2026-09-08', wrapped]]),
    tasks: TASKS,
  });
  assert.deepEqual(wrappedPlan.carriedForward, ['Accounts, locations and trips in the production database must not be modified without approval']);
  assert.equal(wrappedPlan.handoff.includes('Marker QZ-WRAP.'), false, 'the narrative archives with the block');
  assert.match(historyPlans(wrappedPlan)[0].reason, /uncertain obligation/i);

});

test('a line the confident rule would truncate falls through and is carried whole', () => {
  // The confident rule used to take `The staging guard must not be removed` on its own
  // (a subject-modal line inside its six-word window) while the blank line below carried
  // the sentence on, so live context gained half an obligation and the half that
  // completed it went to the archive with the block. A line that is not self-contained
  // because a following paragraph continues its sentence must fall through to the
  // uncertain tier, which lifts the COMPLETE joined sentence instead of a fragment.
  const complete = 'The staging guard must not be removed and the note was left in place for the next window.';
  const body = ['Marker QZ-CONTINUED-SPAN.', '', 'The staging guard must not be removed', '', 'and the note was left in place for the next window.'].join('\n');
  const plan = planCompactRewrite({
    handoff: handoffWithHistory([['Previous objective — 2026-09-09', body]]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.match(plan.handoff, /^- The staging guard must not be removed and the note was left in place for the next window\.$/m,
    `the complete obligation stays live, not the truncated fragment:\n${plan.handoff}`);
  assert.equal(plan.handoff.includes('- The staging guard must not be removed\n'), false, 'the truncated fragment is never a live bullet');
  assert.deepEqual(plan.carriedForward, [complete], 'the complete joined sentence is what is carried');
  assert.equal(plan.handoff.includes('Marker QZ-CONTINUED-SPAN.'), false, 'the block around it archives');
  const entry = historyPlans(plan)[0];
  assert.equal(entry.decision, 'archived', JSON.stringify(entry));
  assert.match(entry.reason, /1 uncertain obligation\(s\) carried forward verbatim/);

  // The same shape written with an item that carries the sentence on cannot be joined
  // into a sentence nobody wrote: the block is kept whole instead, and the fragment is
  // still never a live bullet on its own.
  const item = ['Marker QZ-ITEM-SPAN.', '', 'The staging guard must not be removed', '', '- approval from the release manager is required first.'].join('\n');
  const itemPlan = planCompactRewrite({
    handoff: handoffWithHistory([['Previous objective — 2026-09-10', item]]),
    tasks: TASKS,
  });
  assert.equal(itemPlan.ok, true, itemPlan.blockedReasons.join('\n'));
  assert.ok(itemPlan.handoff.includes(item), 'an item continuation keeps the whole block live');
  assert.equal(itemPlan.handoff.includes('- The staging guard must not be removed\n'), false, 'and the fragment is still not lifted on its own');
  assert.deepEqual(itemPlan.carriedForward, []);
  assert.match(preservedHistoryPlans(itemPlan)[0].reason, /uncertain obligation cannot be extracted safely/i);
});

test('a preserved parent keeps ownership of a nested history child with unchecked work', () => {
  const marker = 'PARENT-MARKER-UNCHECKED.';
  const childTask = '- [ ] Child task must remain live.';
  const handoff = handoffWithHistory([[
    'Previous objective — parent',
    [marker, '', '### Previous objective — child', '', childTask].join('\n'),
  ]]);

  const first = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(first.ok, true, first.blockedReasons.join('\n'));
  const firstParent = first.classification.handoff.find((entry) => entry.heading === 'Previous objective — parent');
  assert.equal(firstParent?.decision, 'preserved');
  assert.match(firstParent?.reason ?? '', /unresolved task blocks/);
  assert.ok(first.handoff.includes(marker), 'the parent marker remains live after pass 1');
  assert.ok(first.handoff.includes(childTask), 'the child task remains live after pass 1');

  const second = planCompactRewrite({ handoff: first.handoff, tasks: first.tasks });
  assert.equal(second.ok, true, second.blockedReasons.join('\n'));
  const secondParent = second.classification.handoff.find((entry) => entry.heading === 'Previous objective — parent');
  assert.equal(secondParent?.decision, 'preserved', 'the parent decision does not flip after demotion');
  assert.match(secondParent?.reason ?? '', /unresolved task blocks/, 'the same unresolved-work reason survives reclassification');
  assert.equal(second.handoff, first.handoff, 'pass 2 is byte-identical to pass 1');
  assert.ok(second.handoff.includes(marker), 'the parent marker remains live');
  assert.ok(second.handoff.includes(childTask), 'the child task remains live with its parent');
  assert.equal(
    second.classification.handoff.some((entry) => entry.heading === 'Previous objective — parent' && entry.decision === 'archived'),
    false,
    'no archive event is emitted for the parent',
  );
});

test('a preserved parent keeps ownership of a nested history child with an un-liftable obligation', () => {
  const marker = 'PARENT-MARKER-UNLIFTABLE.';
  const obligation = [
    'Accounts, locations and trips in the production database must not be modified without',
    '',
    '- approval from the release manager',
  ].join('\n');
  const handoff = handoffWithHistory([[
    'Previous objective — parent',
    [marker, '', '### Previous objective — child', '', obligation].join('\n'),
  ]]);

  const first = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(first.ok, true, first.blockedReasons.join('\n'));
  const firstParent = first.classification.handoff.find((entry) => entry.heading === 'Previous objective — parent');
  assert.equal(firstParent?.decision, 'preserved');
  assert.match(firstParent?.reason ?? '', /uncertain obligation cannot be extracted safely/i);
  assert.ok(first.handoff.includes(marker), 'the parent marker remains live after pass 1');
  assert.ok(first.handoff.includes(obligation), 'the child obligation remains live after pass 1');
  assert.deepEqual(first.carriedForward, [], 'no part of the child obligation is detached');

  const second = planCompactRewrite({ handoff: first.handoff, tasks: first.tasks });
  assert.equal(second.ok, true, second.blockedReasons.join('\n'));
  const secondParent = second.classification.handoff.find((entry) => entry.heading === 'Previous objective — parent');
  assert.equal(secondParent?.decision, 'preserved', 'the parent decision does not flip after demotion');
  assert.match(secondParent?.reason ?? '', /uncertain obligation cannot be extracted safely/i, 'the same unsafe-extraction reason survives reclassification');
  assert.equal(second.handoff, first.handoff, 'pass 2 is byte-identical to pass 1');
  assert.ok(second.handoff.includes(marker), 'the parent marker remains live');
  assert.ok(second.handoff.includes(obligation), 'the child obligation remains live with its parent');
  assert.deepEqual(second.carriedForward, [], 'nothing is carried as a detached fragment');
  assert.equal(
    second.classification.handoff.some((entry) => entry.heading === 'Previous objective — parent' && entry.decision === 'archived'),
    false,
    'no archive event is emitted for the parent',
  );
});

test('an embedded H1 keeps unchecked child evidence owned by its preserved parent across rewrites', () => {
  const marker = 'PARENT-MARKER-H1-UNCHECKED.';
  const h1 = '# Notes';
  const childTask = '- [ ] H1 child task must remain live.';
  const handoff = handoffWithHistory([[
    'Previous objective — parent',
    [marker, '', h1, '', childTask].join('\n'),
  ]]);

  const first = planCompactRewrite({ handoff, tasks: TASKS });
  const second = planCompactRewrite({ handoff: first.handoff, tasks: first.tasks });
  const third = planCompactRewrite({ handoff: second.handoff, tasks: second.tasks });
  const plans = [first, second, third];

  assert.deepEqual(plans.map((plan) => plan.ok), [true, true, true]);
  assert.deepEqual(
    plans.map((plan) => plan.classification.handoff.find((entry) => entry.heading === 'Previous objective — parent')?.decision),
    ['preserved', 'preserved', 'preserved'],
    'the embedded H1 never detaches the evidence that preserves its parent',
  );
  assert.deepEqual(plans.map((plan) => plan.handoff.includes(marker)), [true, true, true], 'the parent marker stays live on every pass');
  for (const plan of plans) {
    assert.match(plan.handoff, /^# Notes$/m, 'the embedded H1 remains byte-identical');
    assert.doesNotMatch(plan.handoff, /^## Notes$/m, 'the embedded H1 never becomes a level-2 section');
    assert.ok(plan.handoff.includes(childTask), 'the unchecked child evidence stays live with its parent');
    assert.deepEqual(plan.carriedForward, [], 'no child evidence is detached into carried context');
  }
  assert.equal(first.handoff, second.handoff, 'pass 1 and pass 2 are byte-identical');
  assert.equal(second.handoff, third.handoff, 'pass 2 and pass 3 are byte-identical');
  assert.equal(first.tasks, second.tasks);
  assert.equal(second.tasks, third.tasks);
});

test('an embedded H1 keeps an un-liftable obligation owned by its preserved parent across rewrites', () => {
  const marker = 'PARENT-MARKER-H1-UNLIFTABLE.';
  const h1 = '# Previous objective — child';
  const obligation = [
    'Accounts, locations and trips in the production database must not be modified without',
    '',
    '- approval from the release manager',
  ].join('\n');
  const handoff = handoffWithHistory([[
    'Previous objective — parent',
    [marker, '', h1, '', obligation].join('\n'),
  ]]);

  const first = planCompactRewrite({ handoff, tasks: TASKS });
  const second = planCompactRewrite({ handoff: first.handoff, tasks: first.tasks });
  const third = planCompactRewrite({ handoff: second.handoff, tasks: second.tasks });
  const plans = [first, second, third];

  assert.deepEqual(plans.map((plan) => plan.ok), [true, true, true]);
  assert.deepEqual(
    plans.map((plan) => plan.classification.handoff.find((entry) => entry.heading === 'Previous objective — parent')?.decision),
    ['preserved', 'preserved', 'preserved'],
    'the embedded H1 never detaches the unsafe-to-lift evidence that preserves its parent',
  );
  assert.deepEqual(plans.map((plan) => plan.handoff.includes(marker)), [true, true, true], 'the parent marker stays live on every pass');
  for (const plan of plans) {
    assert.match(plan.handoff, /^# Previous objective — child$/m, 'the embedded H1 remains byte-identical');
    assert.doesNotMatch(plan.handoff, /^## Previous objective — child$/m, 'the embedded H1 never becomes a level-2 section');
    assert.ok(plan.handoff.includes(obligation), 'the un-liftable child obligation stays live with its parent');
    assert.deepEqual(plan.carriedForward, [], 'no obligation fragment is detached into carried context');
  }
  assert.equal(first.handoff, second.handoff, 'pass 1 and pass 2 are byte-identical');
  assert.equal(second.handoff, third.handoff, 'pass 2 and pass 3 are byte-identical');
  assert.equal(first.tasks, second.tasks);
  assert.equal(second.tasks, third.tasks);
});

test('demotion shifts descendant headings outside fences and preserves CRLF bytes', () => {
  const nl = '\r\n';
  const fenced = ['```md', '### Sample child', '###### Sample level six', '```'].join(nl);
  const body = [
    'PARENT-MARKER-PRESENTATION.',
    '',
    '### Child',
    '',
    '#### Grandchild',
    '',
    '##### Great-grandchild',
    '',
    '###### Level six',
    '',
    fenced,
    '',
    '- [ ] Keep the parent live.',
  ].join(nl);
  const handoff = handoffWithHistory([['Previous objective — presentation', body]], nl);
  const plan = planCompactRewrite({ handoff, tasks: TASKS.replace(/\n/g, nl) });

  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.match(plan.handoff, /^### Previous objective — presentation\r$/m);
  assert.match(plan.handoff, /^#### Child\r$/m);
  assert.match(plan.handoff, /^##### Grandchild\r$/m);
  assert.match(plan.handoff, /^###### Great-grandchild\r$/m);
  assert.match(plan.handoff, /^####### Level six\r$/m, 'level 6 becomes plain seven-hash text rather than an escaping sibling');
  assert.ok(plan.handoff.includes(fenced), 'headings inside the fenced sample remain byte-identical');
  assert.ok(plan.handoff.includes(`PARENT-MARKER-PRESENTATION.${nl}`), 'non-heading content remains byte-identical');
  assert.ok(!plan.handoff.replaceAll(nl, '').includes('\n'), 'the CRLF convention survives the rewrite');
});

test('unchecked work with acceptance detail at any depth keeps its whole block live', () => {
  const body = [
    'Marker QZ-DEPTH.',
    '',
    '- [x] Finished parent QZ-PARENT',
    '  - [ ] Acceptance: QZ-ACCEPTANCE-1',
    '#### Deeper note',
    '',
    '- [ ] Deeper follow-up QZ-ACCEPTANCE-2',
  ].join('\n');
  const plan = planCompactRewrite({
    handoff: handoffWithHistory([['Previous objective — 2026-09-09', body]]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  for (const text of ['Marker QZ-DEPTH.', '- [x] Finished parent QZ-PARENT', '  - [ ] Acceptance: QZ-ACCEPTANCE-1', '- [ ] Deeper follow-up QZ-ACCEPTANCE-2']) {
    assert.ok(plan.handoff.includes(text), `the preserved block keeps ${text}`);
  }
  assert.match(plan.handoff, /^##### Deeper note$/m, 'the descendant heading shifts with its demoted owner');
  const entry = historyPlans(plan)[0];
  assert.equal(entry.decision, 'preserved');
  assert.match(entry.reason, /unresolved/);

  const taskBody = ['Marker QZ-TASKS-DEPTH.', '', '- [x] Finished parent QZ-TASK-PARENT', '  - [ ] Acceptance: QZ-TASK-ACCEPTANCE', '#### Deeper', '', '- [ ] Deeper follow-up QZ-TASK-DEEPER'].join('\n');
  const tasks = ['# Tasks', '', '## Now', '', '- [ ] Continue.', '', '## Done', '', taskBody, ''].join('\n');
  const tasksPlan = planCompactRewrite({ handoff: handoffWithHistory([['Previous objective — 2026-09-10', 'Marker QZ-PLAIN.']]), tasks });
  assert.equal(tasksPlan.ok, true, tasksPlan.blockedReasons.join('\n'));
  for (const text of ['Marker QZ-TASKS-DEPTH.', '- [x] Finished parent QZ-TASK-PARENT', '  - [ ] Acceptance: QZ-TASK-ACCEPTANCE', '- [ ] Deeper follow-up QZ-TASK-DEEPER']) {
    assert.ok(tasksPlan.tasks.includes(text), `the tasks-side preserved block keeps ${text}`);
  }
  assert.match(tasksPlan.tasks, /^##### Deeper$/m, 'tasks-side descendants shift with the demoted owner too');
  assert.match(tasksPlan.classification.tasks.find((entry) => entry.heading === 'Done').reason, /unresolved/);
});

test('an uncertain obligation in the tasks file is carried forward and its block archived', () => {
  const body = 'Marker QZ-TASKS-OBLIGATION.\n\nnever push to main';
  const tasks = ['# Tasks', '', '## Now', '', '- [ ] Continue.', '', '## Done', '', body, ''].join('\n');
  const plan = planCompactRewrite({
    handoff: handoffWithHistory([['Previous objective — 2026-09-11', 'Marker QZ-PLAIN-2.']]),
    tasks,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.tasks.includes(body), false, 'the tasks-side block is archived, not retained');
  assert.equal(plan.tasks.includes('Marker QZ-TASKS-OBLIGATION.'), false, 'and the narrative around the obligation archives with it');
  assert.match(plan.tasks, /^- never push to main$/m, 'the obligation itself is live as a carried bullet');
  assert.ok(plan.carriedForward.includes('never push to main'), 'and is reported as carried');
  const entry = plan.classification.tasks.find((section) => section.heading === 'Done');
  assert.equal(entry.decision, 'archived');
  assert.match(entry.reason, /uncertain obligation\(s\) carried forward verbatim/);
});

test('CRLF input is carried forward and the convention intact', () => {
  const body = 'Marker QZ-CRLF.\n\nnever push to main';
  const plan = planCompactRewrite({
    handoff: handoffWithHistory([['Previous objective — 2026-09-12', body]], '\n').replace(/\n/g, '\r\n'),
    tasks: TASKS.replace(/\n/g, '\r\n'),
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.handoff.includes(body.replace(/\n/g, '\r\n')), false, 'the block itself archives');
  assert.match(plan.handoff, /^- never push to main\r$/m, 'the obligation is live, on its own CRLF line');
  assert.ok(plan.carriedForward.includes('never push to main'));
  assert.ok(!plan.handoff.replaceAll('\r\n', '').includes('\n'), 'CRLF preserved');
  assert.match(plan.classification.handoff.find((section) => section.role === 'history').reason, /uncertain obligation\(s\) carried forward/);
});

test('fenced examples are never structure and never obligations', () => {
  const fenced = ['```text', 'never push to main', 'Do not deploy without approval.', '```'].join('\n');
  const plan = planCompactRewrite({
    handoff: handoffWithHistory([['Previous objective — 2026-09-13', `Marker QZ-FENCED.\n\n${fenced}`]]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.handoff.includes(fenced), false, 'a fenced sample is history, not a live obligation');
  assert.deepEqual(plan.carriedForward, [], 'fenced text is never carried forward');
  assert.equal(historyPlans(plan)[0].decision, 'archived');
  assert.equal(plan.handoff.includes('Marker QZ-FENCED.'), false);
});

test('a fenced sample quoting the generated heading is left byte-identical by re-filtering', () => {
  const fenced = ['```md', '### Constraints carried forward from archived history', '', '- narrative that merely mentions never', '```'].join('\n');
  const plan = planCompactRewrite({
    handoff: handoffWithContainer([['Files changed', fenced]]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.ok(plan.handoff.includes(fenced), 'nothing inside a fence is re-filtered or rewritten');
  assert.equal(plan.handoff.match(/### Constraints carried forward from archived history/g).length, 1, 'only the sampled heading exists');
});

test('a generated constraints block is re-filtered without erasing an uncertain obligation', () => {
  const bloated = [
    '### Constraints carried forward from archived history',
    '',
    '- `migration.sql` must never be edited after being applied',
    '- never push to main',
    '',
    '### Hand-written note',
    '',
    'Kept as written.',
  ].join('\n');
  const plan = planCompactRewrite({
    handoff: handoffWithContainer([['Files changed', bloated]]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.ok(plan.handoff.includes('- `migration.sql` must never be edited after being applied'), 'a code-led line survives re-filtering');
  assert.ok(plan.handoff.includes('- never push to main'), 'a lowercase line survives re-filtering');
  assert.equal(plan.handoff.match(/### Constraints carried forward from archived history/g).length, 1, 'one generated block');
  assert.ok(plan.handoff.includes('Kept as written.'));

  // A run too long to read as a bounded statement is prose and still goes.
  const narrative = `- **Old narrative**: Postgres never auto-indexes a foreign key; ${'detail '.repeat(40)}`;
  const filtered = planCompactRewrite({
    handoff: handoffWithContainer([['Files changed', ['### Constraints carried forward from archived history', '', narrative].join('\n')]]),
    tasks: TASKS,
  });
  assert.equal(filtered.handoff.includes('Old narrative'), false, 'unbounded narrative is still re-filtered out');
  assert.equal(filtered.handoff.includes('Constraints carried forward'), false, 'an emptied generated block is removed');
});

test('a generated constraints block re-filters each bullet instead of judging the whole short run', () => {
  const generatedRun = [
    '- Old note closed.',
    '- `migration.sql` must never be edited after being applied',
  ].join('\n');
  assert.ok(generatedRun.length <= 200, `the generated run must exercise the bounded whole-run mutation: ${generatedRun.length} chars`);
  const handoff = handoffWithContainer([['Files changed', [
    '### Constraints carried forward from archived history',
    '',
    generatedRun,
  ].join('\n')]]);

  const first = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(first.ok, true, first.blockedReasons.join('\n'));
  assert.equal(first.handoff.includes('Old note closed.'), false, 'the narrative bullet is dropped on its own merits');
  assert.equal(
    (first.handoff.match(/`migration\.sql` must never be edited after being applied/g) ?? []).length,
    1,
    'the uncertain obligation survives exactly once',
  );
  assert.equal(
    (first.handoff.match(/### Constraints carried forward from archived history/g) ?? []).length,
    1,
    'one generated heading remains',
  );

  const second = planCompactRewrite({ handoff: first.handoff, tasks: first.tasks });
  assert.equal(second.handoff, first.handoff, 'per-bullet re-filtering is idempotent');
  assert.equal(second.tasks, first.tasks);
});

test('history nested under a preserved container applies the same rule', () => {
  const narrative = 'Historical narrative that is finished. '.repeat(20);
  const plan = planCompactRewrite({
    handoff: handoffWithContainer([
      ['Previous objective (superseded) — 2026-09-13: old work', `${narrative}\n\nnever push to main`],
      ['Files changed', '- src/core.ts'],
    ]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.handoff.includes(narrative), false, 'the nested block archives, narrative and all');
  assert.match(plan.handoff, /^- never push to main$/m, 'the obligation is lifted out of it and stays live');
  assert.ok(plan.carriedForward.includes('never push to main'), 'and is reported as carried forward');
  assert.ok(plan.handoff.includes('- src/core.ts'));
  const entry = plan.classification.handoff.find((section) => section.heading === 'Previous objective (superseded) — 2026-09-13: old work');
  assert.equal(entry.decision, 'archived');
  assert.match(entry.reason, /history nested under a preserved container/);
  assert.match(entry.reason, /1 uncertain obligation\(s\) carried forward verbatim/);
  const container = plan.classification.handoff.find((section) => section.role === 'preserved');
  assert.match(container.reason, /nested history archived/);
});

test('a nested block holding an un-liftable obligation keeps its container whole', () => {
  // The fallback, one level down: the nested block's statement is split across a blank line
  // and its halves do not rejoin into a finished sentence, so it cannot be lifted. The block
  // stays whole and live inside the container rather than losing half a sentence.
  const body = ['Marker QZ-NESTED-FALLBACK.', '', 'Accounts, locations and trips in the', 'production database must not be modified without', '', 'approval'].join('\n');
  const plan = planCompactRewrite({
    handoff: handoffWithContainer([
      ['Previous objective (superseded) — 2026-09-14: split', body],
      ['Files changed', '- src/core.ts'],
    ]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.ok(plan.handoff.includes(body), 'the nested block stays whole and live');
  assert.deepEqual(plan.carriedForward, [], 'nothing is extracted from a statement that cannot be lifted');
  const entry = plan.classification.handoff.find((section) => section.heading === 'Previous objective (superseded) — 2026-09-14: split');
  assert.equal(entry.decision, 'preserved');
  assert.match(entry.reason, /uncertain obligation cannot be extracted safely/i);
  assert.match(plan.classification.handoff.find((section) => section.role === 'preserved').reason, /nested history preserved live \(1\)/);
  const second = planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks });
  assert.equal(second.handoff, plan.handoff, 'the kept container is stable across runs');
});

test('a nested block with no obligation and no unchecked work still archives', () => {
  const narrative = 'Historical narrative that is finished. '.repeat(20);
  const plan = planCompactRewrite({
    handoff: handoffWithContainer([
      ['Previous objective (superseded) — 2026-09-13: old work', narrative],
      ['Files changed', '- src/core.ts'],
    ]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.handoff.includes(narrative), false, 'plain nested history still archives');
  assert.ok(plan.handoff.includes('- src/core.ts'));
  assert.match(plan.classification.handoff.find((section) => section.role === 'preserved').reason, /nested history archived/);
});

test('duplicate preserved containers each have their nested block lifted and reported', () => {
  // Two real level-2 `## Preserved context` sections, each holding one nested history
  // block, one per presentation variant. Each container is re-read on its own: both
  // obligations are lifted into live constraints context and both blocks are reported.
  const handoff = [
    handoffWithContainer([['Previous objective — 2026-09-14', 'Marker QZ-DUP-ONE.\n\nnever push to main']]),
    '',
    '## Preserved context', '',
    '### Previous objective — 2026-09-15', '',
    'Marker QZ-DUP-TWO.', '',
    '`migration.sql` must never be edited after being applied', '',
  ].join('\n');
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.handoff.includes('Marker QZ-DUP-ONE.'), false, 'the first block archives');
  assert.equal(plan.handoff.includes('Marker QZ-DUP-TWO.'), false, 'the second block archives too');
  assert.ok(plan.carriedForward.includes('never push to main'), 'the first obligation is carried');
  assert.ok(plan.carriedForward.includes('`migration.sql` must never be edited after being applied'), 'and so is the second');
  assert.match(plan.handoff, /^- never push to main$/m);
  assert.match(plan.handoff, /^- `migration\.sql` must never be edited after being applied$/m);
  assert.equal(plan.handoff.match(/### Constraints carried forward from archived history/g).length, 1, 'both land in one generated block');
  assert.equal(plan.classification.handoff.filter((section) => section.role === 'preserved').length, 2);
  assert.equal(
    plan.classification.handoff.filter((section) => section.decision === 'archived' && /uncertain obligation\(s\) carried forward/.test(section.reason)).length,
    2,
    JSON.stringify(plan.classification.handoff, null, 1),
  );
  for (const container of plan.classification.handoff.filter((section) => section.role === 'preserved')) {
    assert.match(container.reason, /nested history archived/);
  }
  const second = planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks });
  assert.equal(second.handoff, plan.handoff, 'duplicate containers are stable across runs');
});

test('plans are deterministic and a repeat run of a preserved block is a no-op', () => {
  const handoff = handoffWithHistory([
    ['Previous objective — 2026-09-16', 'Marker QZ-STABLE.\n\nnever push to main'],
    ['Previous objective — 2026-09-17', `Old narrative. ${'narrative '.repeat(40)}`],
  ]);
  const first = planCompactRewrite({ handoff, tasks: TASKS });
  const repeat = planCompactRewrite({ handoff, tasks: TASKS });
  assert.deepEqual(repeat, first, 'identical input produces an identical plan');
  assert.equal(first.ok, true, first.blockedReasons.join('\n'));

  const second = planCompactRewrite({ handoff: first.handoff, tasks: first.tasks });
  assert.equal(second.ok, true, second.blockedReasons.join('\n'));
  assert.equal(second.handoff, first.handoff, 'a repeat run is byte-identical');
  assert.equal(second.tasks, first.tasks);
  assert.deepEqual(second.classification.handoff.filter((section) => section.decision === 'archived'), [], 'nothing left to archive');
  assert.ok(second.handoff.includes('never push to main'));
});

test('plain narrative history with no obligation still archives and shrinks', () => {
  const narrative = 'A completed run of work, recorded for the record. '.repeat(30);
  const plan = planCompactRewrite({
    handoff: handoffWithHistory([
      ['Previous objective — 2026-09-18', narrative],
      ['Previous objective — 2026-09-19', 'Another finished step, nothing outstanding.'],
    ]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.handoff.includes(narrative), false, 'narrative history leaves live context');
  assert.equal(plan.handoff.includes('Another finished step, nothing outstanding.'), false);
  assert.deepEqual(plan.carriedForward, []);
  assert.equal(plan.sizes.after < plan.sizes.before, true, `expected a reduction: ${plan.sizes.before} -> ${plan.sizes.after}`);
  assert.deepEqual(plan.classification.handoff.filter((section) => section.decision === 'archived').length, 2);
});

test('an obligation in the middle of a soft-wrapped paragraph is lifted out of it', () => {
  // The run is not the unit of evidence: the complete obligation on the middle line is a
  // statement of its own, so it is carried forward verbatim while the narrative around it
  // archives. Judging the run as a whole either retained the paragraph or dropped the
  // obligation with it.
  const body = [
    'The previous session recorded how the migration work in this repository was carried out in detail.',
    '`migration.sql` must never be edited after being applied.',
    'The rest of this block is ordinary narrative, kept for the record and mentioning nothing further.',
  ].join('\n');
  const plan = planCompactRewrite({
    handoff: handoffWithHistory([['Previous objective — 2026-02-01', body]]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.handoff.includes(body), false, 'the paragraph is not retained whole');
  assert.equal(plan.handoff.includes('The previous session recorded'), false, 'nor is the narrative around the obligation');
  assert.match(plan.handoff, /^- `migration\.sql` must never be edited after being applied\.$/m, 'the obligation itself stays live');
  assert.deepEqual(plan.carriedForward, ['`migration.sql` must never be edited after being applied.'], 'and is reachable in the carried list');
  const entry = historyPlans(plan)[0];
  assert.equal(entry.decision, 'archived', JSON.stringify(entry));
  assert.match(entry.reason, /1 uncertain obligation\(s\) carried forward verbatim/);
});

/** Large blocks: every paragraph is narrative except one two-line paragraph broken mid-clause before `never`. */
function narrativeCorpus(blocks = 150, paragraphs = 12) {
  const sections = [];
  for (let index = 0; index < blocks; index++) {
    const lines = [];
    for (let paragraph = 0; paragraph < paragraphs; paragraph++) {
      if (paragraph === Math.floor(paragraphs / 2)) {
        lines.push('Recorded detail about how the earlier pipeline used to behave, and the log said that');
        lines.push(`never was it restored in this workspace, marker QZ-DENSITY-${index}.`);
      } else {
        lines.push(`Recorded detail ${paragraph} about the previous run of the pipeline, kept for the record only so that this paragraph is ordinary narrative prose.`);
      }
      lines.push('');
    }
    sections.push([`Previous objective — 2026-01-01 (${index})`, lines.join('\n').trimEnd()]);
  }
  return handoffWithHistory(sections);
}

test('a narrative run broken mid-clause before `never` stays archived at scale', () => {
  // Every paragraph here is narrative. The one two-line paragraph per block is
  // deliberately broken immediately before the word `never`, which is the shape a
  // run-level keyword rule reads as an obligation: the run opens a statement and its
  // tail is a complete sentence, so before the sentence-shaped rule every block was
  // retained. Measured on this generator (150 blocks, 12 paragraphs each), before and
  // after the fix, against a plain-narrative control corpus of the same size:
  //   run-level rule (defective): 253,385 -> 253,557 chars, +172, -0.07%
  //   sentence-shaped rule (fixed): 253,385 -> 18,208 chars, 92.81%
  //   plain-narrative control: 92.76%

  const handoff = narrativeCorpus();
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal((plan.handoff.match(/QZ-DENSITY-/g) ?? []).length, 0, 'narrative paragraphs must not reach live context');
  assert.equal(plan.handoff.includes('never was it restored in this workspace'), false);
  assert.deepEqual(plan.carriedForward, []);
  assert.equal(plan.classification.handoff.filter((entry) => entry.decision === 'archived').length, 150);
  assert.equal(plan.sizes.before, 253385, `documented input is 253,385 characters; measured ${plan.sizes.before}`);
  assert.equal(plan.sizes.after, 18208, `documented output is 18,208 characters; measured ${plan.sizes.after}`);
  const reduction = (100 * (plan.sizes.before - plan.sizes.after)) / plan.sizes.before;
  assert.equal(reduction.toFixed(2), '92.81', `documented reduction is 92.81%; measured ${reduction.toFixed(2)}%`);
  assert.ok(
    reduction > 90,
    `expected the corpus to shrink like the plain narrative it is; measured ${reduction.toFixed(2)}% (${plan.sizes.before} -> ${plan.sizes.after})`,
  );
  assert.ok(reduction < 93, `and no further than the plain-narrative control: measured ${reduction.toFixed(2)}%`);
});

test('a re-serialized parent block is a fixed point: the obligation is carried, nothing flips', () => {
  // A level-2 history section that holds the obligation nested one level down used to be
  // *preserved* because the planner's own re-serialization demotes the heading, so on the
  // next pass the demoted heading and the nested `###` became siblings and the parent body
  // held no obligation any more — the decision and its reason flipped. The obligation is now
  // lifted out on the first pass and the block archives once, which is a fixed point.
  const handoff = [
    '# Handoff', '',
    '## Current objective', '', 'Harden preservation.', '',
    '## Previous objective — 2026-03-01', '',
    'plain narrative marker QZ-PARENT.', '',
    '### Notes', '',
    'never push to main', '',
  ].join('\n');
  const first = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(first.ok, true, first.blockedReasons.join('\n'));
  const firstEntry = first.classification.handoff.find((entry) => entry.heading === 'Previous objective — 2026-03-01');
  assert.equal(firstEntry.decision, 'archived', JSON.stringify(firstEntry));
  assert.match(firstEntry.reason, /1 uncertain obligation\(s\) carried forward verbatim/);
  assert.match(first.handoff, /^- never push to main$/m, 'the obligation is live, lifted out of the block');
  assert.equal(first.handoff.includes('plain narrative marker QZ-PARENT.'), false, 'the narrative around it archives');

  const second = planCompactRewrite({ handoff: first.handoff, tasks: first.tasks });
  assert.equal(second.ok, true, second.blockedReasons.join('\n'));
  assert.equal(second.handoff, first.handoff, 'a second pass over the preserved output rewrites nothing');
  assert.equal(second.tasks, first.tasks);
  assert.match(second.handoff, /^- never push to main$/m, 'and the obligation is still live');
  assert.deepEqual(second.classification.handoff.filter((entry) => entry.decision === 'archived'), [], 'nothing left to archive');

  const third = planCompactRewrite({ handoff: second.handoff, tasks: second.tasks });
  assert.equal(third.handoff, second.handoff, 'the carried decision is a fixed point');
  assert.equal(third.tasks, second.tasks);
});

test('a non-trivial nested container is idempotent with its report intact', () => {
  // A container holds a demoted history block whose obligation sits in the following
  // sibling heading, which is where demotion flattens it. The demoted block archives (its
  // own body is narrative) and the sibling keeps the obligation live — exactly once: a
  // statement that is still live with its own block is not also carried as a bullet.
  const handoff = handoffWithContainer([
    ['Previous objective — 2026-03-03', 'plain narrative marker QZ-DEMOTED.'],
    ['Notes', '`migration.sql` must never be edited after being applied'],
    ['Files changed', '- src/core.ts'],
  ]);
  const first = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(first.ok, true, first.blockedReasons.join('\n'));
  const entry = first.classification.handoff.find((section) => section.heading === 'Previous objective — 2026-03-03');
  assert.equal(entry.decision, 'archived', JSON.stringify(entry));
  assert.match(entry.reason, /history nested under a preserved container/);
  assert.equal(first.handoff.includes('plain narrative marker QZ-DEMOTED.'), false, 'the demoted block leaves live context');
  assert.deepEqual(first.carriedForward, [], 'a live sibling is not duplicated as a carried line');
  assert.equal(
    first.handoff.match(/`migration\.sql` must never be edited after being applied/g).length,
    1,
    'the obligation is live exactly once, in the sibling block that owns it',
  );

  const second = planCompactRewrite({ handoff: first.handoff, tasks: first.tasks });
  assert.equal(second.handoff, first.handoff, 'the container is byte-identical on a repeat run');
  assert.deepEqual(second.classification.handoff.filter((section) => section.decision === 'archived'), []);
});

test('seeded handoffs never flip a preserved block to archived on a later pass', () => {
  // 240 generated handoffs across the shapes this tier decides: history sections,
  // obligations nested under them, unresolved work, and unclassified sections whose
  // nested history only becomes archivable on a later pass (the documented limit).
  let seed = 20260917;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const obligations = [
    'never push to main',
    '`migration.sql` must never be edited after being applied',
    'Accounts, locations and trips in the production database must not be modified without approval',
  ];
  const narrative = [
    'plain narrative marker for this run.',
    'The recorded session ended without anything outstanding and the narrative closes here.',
    'A completed run of work, recorded for the record.',
  ];
  const decisions = (plan) => new Map(plan.classification.handoff.map((entry) => [entry.heading, entry.decision]));
  const archivedHeadings = (plan) => new Set(plan.classification.handoff.filter((entry) => entry.decision === 'archived').map((entry) => entry.heading));
  let flips = 0;
  let sizeDrift = 0;
  let changed = 0;
  let preservedFirstPass = 0;
  const notes = [];
  for (let iteration = 0; iteration < 240; iteration++) {
    const blocks = [];
    const anchors = [];
    const anchor = (heading, marker) => anchors.push([heading, marker]);
    for (let index = 0, count = 2 + Math.floor(rand() * 3); index < count; index++) {
      const heading = `Previous objective — 2026-04-01 (${iteration}-${index})`;
      const marker = `QZ-FUZZ-${iteration}-${index}`;
      const lines = [`${narrative[Math.floor(rand() * narrative.length)]} marker ${marker}.`];
      if (rand() < 0.5) lines.push('', '### Notes', '', obligations[Math.floor(rand() * obligations.length)]);
      if (rand() < 0.25) lines.push('', '- [ ] Unfinished follow-up.');
      blocks.push([heading, lines.join('\n')]);
      anchor(heading, marker);
    }
    if (rand() < 0.4) {
      const heading = `Run notes ${iteration}`;
      const nestedHeading = `Previous objective — 2026-04-02 (${iteration})`;
      const marker = `QZ-FUZZ-${iteration}-nested`;
      blocks.push([heading, `Unclassified run narrative for ${iteration}.\n\n### ${nestedHeading}\n\n${'recorded detail '.repeat(6)}marker ${marker}.`]);
      anchor(nestedHeading, marker);
    }
    const handoff = handoffWithHistory(blocks);
    const first = planCompactRewrite({ handoff, tasks: TASKS });
    assert.equal(first.ok, true, first.blockedReasons.join('\n'));
    const second = planCompactRewrite({ handoff: first.handoff, tasks: first.tasks });
    assert.equal(second.ok, true, second.blockedReasons.join('\n'));
    const third = planCompactRewrite({ handoff: second.handoff, tasks: second.tasks });

    const before = decisions(first);
    const after = decisions(second);
    const last = decisions(third);
    const check = (from, to) => {
      for (const [heading, decision] of from) if (decision === 'preserved' && to.get(heading) === 'archived') {
        flips++;
        if (notes.length < 3) notes.push(`${heading}: preserved -> archived`);
      }
    };
    check(before, after);
    check(after, last);
    // Nothing leaves live context unaccounted for: every marker is either still live
    // or its block was reported as archived by this pass or an earlier one.
    const everArchived = new Set();
    for (const plan of [first, second, third]) {
      const archived = archivedHeadings(plan);
      for (const [heading, marker] of anchors) {
        assert.ok(
          plan.handoff.includes(marker) || archived.has(heading) || everArchived.has(heading),
          `iteration ${iteration}: ${marker} (${heading}) left live context with no archived plan covering it`,
        );
      }
      for (const heading of archived) everArchived.add(heading);
    }
    if (third.handoff !== second.handoff || third.tasks !== second.tasks) sizeDrift++;
    if (first.handoff !== second.handoff) changed++;
    preservedFirstPass += [...before.values()].filter((decision) => decision === 'preserved').length;
  }
  assert.equal(flips, 0, `preserved -> archived flips: ${flips}\n${notes.join('\n')}`);
  assert.equal(sizeDrift, 0, `passes 2 and 3 disagreed on ${sizeDrift} handoffs`);
  // Guard against a generator that stopped producing the shapes under test: the
  // corpus must actually contain preserved blocks to flip. With structural ownership
  // retained during demotion, pass 1 is already the fixed point for every fixture.
  assert.ok(preservedFirstPass >= 100, `only ${preservedFirstPass} preserved blocks in the corpus`);
  assert.equal(changed, 0, `${changed} handoffs changed after pass 1`);
});

test('an obligation keyword alone does not keep narrative prose live', () => {
  // The regression the bounded-statement rule exists to prevent: a keyword inside
  // a long paragraph, inside a wrapped run, or continued from the line above is
  // prose, not an instruction.
  const paragraph = `The guard was never re-enabled and the migration was protected by an old branch; ${'detail '.repeat(30)}`;
  const wrapped = [
    'The recorded log says the pipeline must not be restarted before the',
    'owner approves it, and the note was left in place for the next run',
    'so the operator could compare the two outcomes side by side later,',
    'and the whole passage is prose about a decision that was made.',
  ].join('\n');
  const continued = [
    'Marker QZ-CONTINUED.',
    '',
    'and then the guard must not be removed before the release ships',
  ].join('\n');
  const demonstrative = [
    'Marker QZ-DEMONSTRATIVE.',
    '',
    'This is why the note said that the guard must not be removed from that path at all',
  ].join('\n');
  const plan = planCompactRewrite({
    handoff: handoffWithHistory([
      ['Previous objective — 2026-09-20', paragraph],
      ['Previous objective — 2026-09-21', wrapped],
      ['Previous objective — 2026-09-22', continued],
      ['Previous objective — 2026-09-23', demonstrative],
    ]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  for (const text of [paragraph, wrapped, continued, demonstrative]) {
    assert.equal(plan.handoff.includes(text), false, `prose must not be re-injected:\n${text.slice(0, 80)}`);
  }
  assert.deepEqual(plan.carriedForward, []);
  assert.deepEqual(plan.classification.handoff.filter((section) => section.decision === 'archived').length, 4);
});

// ---------------------------------------------------------------------------
// Over-retention control: narrative that merely MENTIONS a rule is not an
// obligation. A modal word anywhere in a bounded sentence used to keep its whole
// block live, so corpora of pure narrative — bullets about modals, reported speech
// and hypotheticals — stayed live and the reduction collapsed to zero. Each corpus
// below is a NEGATIVE control at scale, and the assertion is a measured reduction
// floor rather than a bare `archived` flag, so a rule that widens silently fails here.
// ---------------------------------------------------------------------------

function reductionOf(plan) {
  return (100 * (plan.sizes.before - plan.sizes.after)) / plan.sizes.before;
}

function narrativeParagraph(paragraph, index) {
  // The sentence must end on its own period: ending on `(${index})` left the
  // statement unterminated, so the obligation the next paragraph carried was
  // assembled onto it and the corpus no longer measured one obligation per block.
  return `Recorded detail ${paragraph} about the previous run of the pipeline, kept for the record only so that this paragraph is ordinary narrative prose (${index}).`;
}

/** Narrative bullets with no constraint keyword in any of them, used to size the blocks. */
const NARRATIVE_BULLETS = [
  '- The earlier session recorded the same behaviour and the notes were archived afterwards.',
  '- The pipeline was restarted twice during the rollout and the second run finished cleanly.',
  '- The operator compared the two logs and kept the longer one for the next session.',
  '- The report described the old release process and how it was retired last year.',
  '- The staging environment was rebuilt from the same image that had been used before.',
  '- The reviewer read the diff, found nothing unusual, and moved on to the next ticket.',
  '- The ticket was closed after the follow-up questions were answered by the team.',
  '- The dashboards showed the usual traffic shape and the alerting stayed quiet.',
  '- The team agreed that the old branch could be dropped once the release shipped.',
  '- The log rotated at midnight and the entries for the day were compressed.',
  '- The session ended with a short recap and a list of questions for the next run.',
  '- The migration history was exported and the export was filed with the run notes.',
];

/**
 * 150 history blocks of narrative bullets whose only modal words are descriptive:
 * a stative `must be`, a past `was required for`, a count `requires two passes`, and
 * plain narrative. None of them opens on a directive and none states a constraint on
 * its subject, so every block must archive — and shrink like the narrative it is,
 * which is why each block is a long one (the `## History` entry per archived block is
 * a fixed ~120-byte cost that a corpus of tiny blocks would over-weight).
 */
function modalNarrativeCorpus(blocks = 150) {
  const bullets = [
    '- The note said the cache must be stale after the rollout, and it was left in place.',
    '- The earlier run was required for the staging deploy, so the log was kept for reference.',
    '- The pipeline requires two passes over the recorded log before it prints a summary.',
    '- The reviewer said the earlier session did not record which branch carried the change.',
    ...NARRATIVE_BULLETS,
  ];
  return handoffWithHistory(
    Array.from({ length: blocks }, (_, index) => [
      `Previous objective — 2026-01-01 (${index})`,
      bullets.map((bullet, position) => `${bullet}${position ? '' : ` marker QZ-MODAL-${index}.`}`).join('\n'),
    ]),
  );
}

/** The same shape as reported speech and hypotheticals rather than direct instruction. */
function reportedSpeechCorpus(blocks = 150) {
  const bullets = [
    '- The ticket explained that the cache requires two passes before the summary appears.',
    '- The notes said the staging deploy was required for the release last month.',
    '- Had the table been required for that migration, the plan would have recorded it.',
    '- If the service were required for the smoke run, the notes would mention it somewhere.',
    '- The reviewer recalled a session in which the guard was checked twice and then dropped.',
    '- The earlier report described the cached copy as stale after the rollout, which was expected.',
    ...NARRATIVE_BULLETS,
  ];
  return handoffWithHistory(
    Array.from({ length: blocks }, (_, index) => [
      `Previous objective — 2026-01-02 (${index})`,
      bullets.map((bullet, position) => `${bullet}${position ? '' : ` marker QZ-REPORT-${index}.`}`).join('\n'),
    ]),
  );
}

/**
 * 150 blocks of twelve paragraphs where the middle paragraph is a narrative sentence
 * that reads obligation-shaped: it reports a past session and mentions `must be stale`
 * and `was required for`. It states no constraint, so nothing may hold the block live.
 */
function obligationShapedNarrativeCorpus(blocks = 150, paragraphs = 12) {
  return handoffWithHistory(
    Array.from({ length: blocks }, (_, index) => {
      const lines = [];
      for (let paragraph = 0; paragraph < paragraphs; paragraph++) {
        lines.push(
          paragraph === Math.floor(paragraphs / 2)
            ? `The report on the previous session said the cache must be stale after the rollout, and the earlier deploy was required for the staging release. QZ-SHAPED-${index}.`
            : narrativeParagraph(paragraph, index),
        );
        lines.push('');
      }
      return [`Previous objective — 2026-01-04 (${index})`, lines.join('\n').trimEnd()];
    }),
  );
}

test('narrative bullets that merely mention modal words stay archived at scale', () => {
  // Fixed build before the complement-shaped rule: 0/150 blocks archived, nothing
  // removed (-0.17% on this generator). With the rule: see the floor asserted below.
  const handoff = modalNarrativeCorpus();
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  const archived = plan.classification.handoff.filter((entry) => entry.decision === 'archived').length;
  const preserved = plan.classification.handoff.filter((entry) => entry.decision === 'preserved').length;
  assert.equal(preserved, 0, `${preserved} narrative blocks were kept live; a modal word in a description is not an obligation`);
  assert.equal(archived, 150);
  assert.equal((plan.handoff.match(/QZ-MODAL-/g) ?? []).length, 0, 'no narrative bullet may reach live context');
  assert.deepEqual(plan.carriedForward, [], 'nothing here is a constraint line either');
  const reduction = reductionOf(plan);
  assert.ok(reduction >= 90, `narrative must shrink like narrative; measured ${reduction.toFixed(2)}% (${plan.sizes.before} -> ${plan.sizes.after})`);
  assert.ok(reduction <= 94, `and not further than the plain narrative control: measured ${reduction.toFixed(2)}%`);
});

test('reported speech and hypotheticals stay archived at scale', () => {
  // "The ticket explained that the cache requires two passes …" reports a count, not a
  // requirement: before the complement-shaped rule this sentence held its block live
  // (0/150 archived, -0.17% on this generator).
  const handoff = reportedSpeechCorpus();
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  const preserved = plan.classification.handoff.filter((entry) => entry.decision === 'preserved').length;
  assert.equal(preserved, 0, `${preserved} blocks were kept live by reported speech`);
  assert.equal(plan.classification.handoff.filter((entry) => entry.decision === 'archived').length, 150);
  const reduction = reductionOf(plan);
  assert.ok(reduction >= 90, `reported speech must shrink like narrative; measured ${reduction.toFixed(2)}% (${plan.sizes.before} -> ${plan.sizes.after})`);
  assert.ok(reduction <= 94, `and not further than the plain narrative control: measured ${reduction.toFixed(2)}%`);
});

test('an obligation-shaped narrative sentence does not hold a twelve-paragraph block live', () => {
  // This is the shape that collapsed the reduction to -0.07% at scale: one sentence per
  // block that mentions `must be <adjective>` and `was required for <thing>`. It describes
  // a past session, so the block must archive and the reduction must not collapse.
  const handoff = obligationShapedNarrativeCorpus();
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  const preserved = plan.classification.handoff.filter((entry) => entry.decision === 'preserved').length;
  assert.equal(preserved, 0, `${preserved}/150 blocks were held live by a descriptive sentence`);
  assert.equal((plan.handoff.match(/QZ-SHAPED-/g) ?? []).length, 0);
  const reduction = reductionOf(plan);
  assert.ok(reduction >= 90, `the corpus must shrink like the narrative it is; measured ${reduction.toFixed(2)}% (${plan.sizes.before} -> ${plan.sizes.after})`);
});

/**
 * The two obligation shapes the confident rule cannot extract, so a block holding one
 * has no alternative but to stay live (the confident rule's verbatim-carry path only
 * takes lines that open on a directive or state a subject-modal within six words).
 */
const UNCERTAIN_OBLIGATION_SHAPES = [
  'never push to main.',
  '`migration.sql` must never be edited after being applied.',
];

/**
 * 200 history blocks of twelve paragraphs; the middle paragraph is one uncertain
 * obligation, alternating between the two shapes above. This is the corpus the cost
 * paragraph in docs/compaction.md is derived from.
 */
function obligationPerBlockCorpus(blocks = 200, paragraphs = 12, { obligate = true } = {}) {
  return handoffWithHistory(
    Array.from({ length: blocks }, (_, index) => {
      const lines = [];
      for (let paragraph = 0; paragraph < paragraphs; paragraph++) {
        lines.push(
          obligate && paragraph === Math.floor(paragraphs / 2)
            ? UNCERTAIN_OBLIGATION_SHAPES[(index + paragraph) % UNCERTAIN_OBLIGATION_SHAPES.length]
            : narrativeParagraph(paragraph, index),
        );
        lines.push('');
      }
      return [`Previous objective — 2026-01-03 (${index})`, lines.join('\n').trimEnd()];
    }),
  );
}

test('the documented cost of keeping a genuine obligation is derived, not asserted', () => {
  // docs/compaction.md states the measured cost of retaining a block that holds one
  // possible obligation, and names this test as its source. The corpus is fixed here:
  // 200 history blocks of twelve narrative paragraphs, where the middle paragraph is one
  // obligation the confident rule cannot extract (`never push to main.` and
  // `` `migration.sql` must never be edited after being applied. `` alternating). Now that
  // a liftable uncertain obligation is carried forward verbatim like any other constraint
  // line, every block archives and only the statement survives:
  // 327,985 -> 34,816 characters, -293,169, 89.38%, 200 blocks archived, none preserved.
  // The cost is one carried bullet plus its archive entry per block, and the two
  // statements are each carried exactly once, so 200 blocks cost nothing beyond that
  // entry. The control corpus is the same generator with that paragraph replaced by
  // narrative: 348,275 -> 24,256, 93.04%.
  const handoff = obligationPerBlockCorpus();
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.classification.handoff.filter((entry) => entry.decision === 'archived').length, 200, 'a block whose obligation is liftable archives');
  assert.equal(plan.classification.handoff.filter((entry) => entry.decision === 'preserved').length, 0);
  assert.deepEqual(plan.carriedForward, UNCERTAIN_OBLIGATION_SHAPES, 'the two obligation sentences, and nothing else, are carried');
  for (const line of UNCERTAIN_OBLIGATION_SHAPES) assert.ok(plan.handoff.includes(`- ${line}`), line);
  assert.equal(plan.handoff.includes('Recorded detail'), false, 'no narrative paragraph reaches live context');
  assert.equal(plan.sizes.before, 327985, `documented input is 327,985 characters; measured ${plan.sizes.before}`);
  assert.equal(plan.sizes.after, 34816, `documented output is 34,816 characters; measured ${plan.sizes.after}`);
  assert.equal(plan.sizes.after - plan.sizes.before, -293169, `documented delta is -293,169 characters; measured ${plan.sizes.after - plan.sizes.before}`);
  assert.equal(reductionOf(plan).toFixed(2), '89.38', `documented reduction is 89.38%; measured ${reductionOf(plan).toFixed(2)}%`);

  const control = planCompactRewrite({ handoff: obligationPerBlockCorpus(200, 12, { obligate: false }), tasks: TASKS });
  assert.equal(control.sizes.before, 348275);
  assert.equal(control.sizes.after, 24256);
  assert.equal(reductionOf(control).toFixed(2), '93.04', `documented control is 93.04%; measured ${reductionOf(control).toFixed(2)}%`);
});

test('the residual over-retention is pinned, so the documented limits stay true', () => {
  // Two residual classes, measured on fixed generators so the honest-limits paragraph in
  // docs/compaction.md cannot drift in either direction. Both are now line-level: an
  // obligation-shaped line is carried forward verbatim and the block around it archives.
  //
  // R1 (line level): a reported requirement phrased `must be <participle>` or `must only`
  // states no constraint on its subject, but it reads obligation-shaped, so the block
  // archives and the line itself is carried forward verbatim — live context keeps
  // narrative it did not need: 150/150 archived, 300 lines carried,
  // 39,225 -> 58,738, -49.75%.
  const participleLines = [
    '- The note said the migration must be reviewed by the release manager before the freeze.',
    '- The reviewers agreed that the freeze must only be lifted by the release manager.',
  ];
  // R2 (line level): a narrative line that contains a constraint keyword and ends a sentence
  // is carried forward verbatim by the confident rule, so its block archives but the line
  // itself stays live and the output grows: 150/150 archived, 300 lines carried,
  // 43,725 -> 62,488, -42.91%. This is the confident rule's own over-carry, unchanged by the
  // modal shape (HEAD measures the same -42.91% on this generator).
  const lineLevel = [
    '- The changelog records that the release branch was merged without approval in March and nobody noticed.',
    '- The ticket explained that the guards in the staging pipeline must not be relied on for safety.',
  ];
  const corpus = (bullets) =>
    handoffWithHistory(
      Array.from({ length: 150 }, (_, index) => [
        `Previous objective — 2026-01-05 (${index})`,
        bullets.map((bullet) => `${bullet} marker QZ-RESIDUAL-${index}.`).join('\n'),
      ]),
    );

  const kept = planCompactRewrite({ handoff: corpus(participleLines), tasks: TASKS });
  assert.equal(kept.ok, true, kept.blockedReasons.join('\n'));
  assert.equal(kept.classification.handoff.filter((entry) => entry.decision === 'archived').length, 150, 'a reported `must be <participle>` no longer holds its block live');
  assert.equal(kept.classification.handoff.filter((entry) => entry.decision === 'preserved').length, 0);
  assert.equal(kept.carriedForward.length, 300, 'both lines of every block are carried, constraint or not');
  assert.equal(kept.sizes.before, 39225, `documented input is 39,225 characters; measured ${kept.sizes.before}`);
  assert.equal(kept.sizes.after, 58738, `documented output is 58,738 characters; measured ${kept.sizes.after}`);
  assert.equal(reductionOf(kept).toFixed(2), '-49.75', `pinned residual R1: measured ${reductionOf(kept).toFixed(2)}%`);
  assert.equal((kept.handoff.match(/QZ-RESIDUAL-/g) ?? []).length, 300, 'and every carried line is visible in live context');

  const carried = planCompactRewrite({ handoff: corpus(lineLevel), tasks: TASKS });
  assert.equal(carried.ok, true, carried.blockedReasons.join('\n'));
  assert.equal(carried.classification.handoff.filter((entry) => entry.decision === 'archived').length, 150);
  assert.equal(carried.carriedForward.length, 300, 'the confident rule carries every keyword-bearing narrative line');
  assert.equal(carried.sizes.before, 43725, `documented input is 43,725 characters; measured ${carried.sizes.before}`);
  assert.equal(carried.sizes.after, 62488, `documented output is 62,488 characters; measured ${carried.sizes.after}`);
  assert.equal(reductionOf(carried).toFixed(2), '-42.91', `pinned residual R2: measured ${reductionOf(carried).toFixed(2)}%`);
  assert.equal((carried.handoff.match(/QZ-RESIDUAL-/g) ?? []).length, 300, 'and every carried line is visible in live context');
});

/**
 * Classify one statement placed alone in a history block.
 *
 * `decision` is what happened to the BLOCK; `live` is whether the obligation text itself
 * reaches live context — as a bullet the planner carried forward, or as part of a block
 * kept whole because the statement could not be lifted out of it. The user-facing property
 * is `live`.
 */
function statementDecision(statement, marker = 'QZ-VERDICT') {
  const plan = planCompactRewrite({
    handoff: handoffWithHistory([['Previous objective — 2026-02-01', `Marker ${marker}.\n\n${statement}`]]),
    tasks: TASKS,
  });
  const entry = historyPlans(plan)[0];
  // A statement carried out of a soft-wrapped paragraph is assembled into one line, with
  // the wrap collapsed; a bullet marker and wrapping emphasis are presentation, not text.
  const carriedText = statement
    .split('\n')
    .map((line) => line.trim().replace(/^(?:[-*+]|\d+\.)\s+/, '').trim().replace(/^[*_\s]+/, '').replace(/[*_\s]+$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const bullets = plan.handoff.split(/\r?\n/).map((line) => line.trim());
  return {
    plan,
    decision: entry?.decision,
    reason: entry?.reason ?? '',
    live: bullets.includes(`- ${carriedText}`) || plan.handoff.includes(statement),
    carried: plan.carriedForward.includes(carriedText),
  };
}

/**
 * The judgment the shape has to make, one statement at a time: a deontic instruction
 * carries its constraining complement, a description of one that happened does not.
 *
 * `carried` = the statement stays live as a line the planner carried forward verbatim,
 * and the block around it archives. `archived` = nothing about the statement is live.
 *
 * The positive cases are deliberately wrapped or re-phrased so the confident rule cannot
 * take them as they stand — a wrapped statement, a lowercase directive, a code-span
 * subject, a subject past its six-word window, a keyword split across lines, an epistemic
 * perfect excluded from the confident modal. That is exactly what the statement-shaped
 * tier exists for: it assembles the sentence and carries it, and the block archives.
 */
const MODAL_SHAPE_CASES = [
  // Obligations: every form must keep the instruction in live context.
  ['never push to main', 'carried', 'a lowercase directive opens the statement'],
  ['`migration.sql` must never be edited after being applied', 'carried', 'a code-span-led prohibition'],
  ['Accounts, locations and trips in the production database must not be modified without approval', 'carried', 'a prohibition after a subject past the six-word window'],
  ['Accounts, locations and trips in the\nproduction database must not be modified without\napproval', 'carried', 'a soft-wrapped obligation is judged on the joined sentence'],
  ['**never push to main**', 'carried', 'wrapping emphasis is presentation, not shape'],
  ['Every migration that touches a published table\nmust be approved before release.', 'carried', '`must be` plus a participial constraint predicate'],
  ['Everyone on the release rotation\nmust be kept informed about the freeze.', 'carried', '`must be kept`: an irregular participle is a constraint predicate too'],
  ['Deploying anything to production outside the freeze window requires\napproval from the release manager.', 'carried', '`requires approval`'],
  ['Any change to the published schema in this repository requires a review before merging,\nand the review is recorded in the run notes afterwards.', 'carried', '`requires a review before <gerund>`'],
  ['The release branch in this repository was required before\ndeploying to production.', 'carried', '`was required before <gerund>`'],
  ['The freeze must only be lifted by the release manager.', 'carried', '`must only` is deontic without a complement'],
  ['Do not deploy on a Friday.', 'carried', 'an opening directive the confident rule extracts'],
  ['Approval is required before merging.', 'carried', '`required before <gerund>` the confident rule extracts'],
  // Descriptions of obligations, reported or hypothetical: nothing may stay live.
  ['The cached copy must be stale before the run starts.', 'archived', '`must be` plus a stative adjective describes a state'],
  ['The report on the previous session said the cache must be stale after the rollout.', 'archived', 'a descriptive `must be <adjective>` in reported speech'],
  ['That step was required for the staging deploy.', 'archived', '`was required for <thing>` is a past event'],
  ['Had the index been required for the migration, the plan would have recorded it.', 'archived', 'a hypothetical `been required for <thing>`'],
  ['The pipeline requires two passes over the recorded log.', 'archived', '`requires <count>` is a description, not a constraint'],
  ['`deployment status` must not have been active on that path.', 'archived', 'an epistemic perfect describes a past state'],
  ['The pipeline requires a restart before running the new migration, which the team discovered last month.', 'archived', '`requires` before an anchored gerund remains narrative'],
  ["The notes I kept for the migration don't record\nwhich branch carried the change, and nobody followed it up.", 'archived', "a wrapped mid-sentence `don't` is not a directive"],
  ["I don't recall which branch carried that change, and nobody followed it up afterwards.", 'carried', "an unwrapped mid-sentence `don't` is carried as a line, never read as a directive"],
];

for (const [statement, expected, why] of MODAL_SHAPE_CASES) {
  test(`modal shape: ${why}`, () => {
    const { plan, decision, reason, live, carried } = statementDecision(statement);
    if (expected === 'archived') {
      assert.equal(live, false, `narrative must not stay live:\n${statement}\n(${decision}: ${reason})`);
      assert.equal(decision, 'archived', `${statement}\nexpected archived, got ${decision} (${reason})`);
      assert.equal(carried, false, `${statement}\ncarried=${carried}, expected narrative not to be carried`);
      assert.deepEqual(plan.carriedForward, [], `${statement}\nexpected nothing carried from this history block`);
      return;
    }
    assert.equal(live, true, `the obligation must stay live:\n${statement}\n(expected ${expected}, got ${decision}: ${reason})`);
    assert.equal(decision, 'archived', `the block around a lifted obligation archives:\n${statement}\n(got ${decision})`);
    assert.equal(carried, true, `${statement}\ncarried=${carried}, expected the statement itself to be carried`);
  });
}
