import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCompactRewrite } from '../dist/compact-rewrite.js';

const TASKS = ['# Tasks', '', '## Now', '', '- [ ] Ship the heading matcher.', ''].join('\n');

function handoffWith(sections) {
  const parts = ['# Handoff', '', '## Current objective — 2026-09-15', '', 'Live objective body.', '', '## Scope', '', '- Workspace kind: multi-repo', '', '## Next exact action', '', 'Continue.', ''];
  for (const [heading, body] of sections) parts.push(heading, '', body, '');
  return parts.join('\n');
}

/** A container whose nested blocks are the shapes the real workspace actually contains. */
function containerWith(nested) {
  const parts = ['# Handoff', '', '## Current objective — 2026-09-15', '', 'Live objective body.', '', '## Scope', '', '- Workspace kind: multi-repo', '', '## Next exact action', '', 'Continue.', '', '## Preserved context', ''];
  for (const [heading, body] of nested) parts.push(heading.startsWith('#') ? heading : `### ${heading}`, '', body, '');
  return parts.join('\n');
}

const archivedOf = (plan) => plan.classification.handoff.filter((section) => section.decision === 'archived');

test('a history heading still qualifies when its qualifier is a parenthetical or a synonym', () => {
  const headings = [
    'Previous objective — 2026-08-01',
    'Previous objective (superseded) — 2026-09-13: old work',
    'Previous objective (2026-09-11, now merged, superseded by the entry above)',
    'Prior objective',
    'Prior objective (2026-09-11, superseded by the entry above)',
    'Prior objective (2026-09-10)',
    'Superseded state — old',
    'Previous work (archived)',
  ];
  for (const heading of headings) {
    const plan = planCompactRewrite({ handoff: handoffWith([[`## ${heading}`, 'Archived narrative body.']]), tasks: TASKS });
    assert.equal(plan.ok, true, `${heading}: ${plan.blockedReasons.join('; ')}`);
    assert.equal(archivedOf(plan).length, 1, `${heading} must be archived; archived=${JSON.stringify(archivedOf(plan).map((section) => section.heading))}`);
    assert.equal(plan.handoff.includes('Archived narrative body.'), false, `${heading} body must leave live context`);
    assert.match(plan.handoff, /^## History$/m, `${heading} must be recorded in History`);
  }
});

test('a backlog is still not history, qualifier or not', () => {
  const headings = [
    'Previous objective backlog',
    'Previous objectives roadmap',
    'Current objectives backlog',
    'Prior objectives backlog',
    'Notes about Current objective',
  ];
  for (const heading of headings) {
    const plan = planCompactRewrite({ handoff: handoffWith([[`## ${heading}`, 'This is a live planning list, not history.']]), tasks: TASKS });
    assert.equal(plan.ok, true, `${heading}: ${plan.blockedReasons.join('; ')}`);
    assert.deepEqual(archivedOf(plan), [], `${heading} must stay live`);
    assert.ok(plan.handoff.includes('This is a live planning list, not history.'), `${heading} content must stay in live context`);
  }
});

test('the recorded real workspace heading shapes are reclaimed from the container', () => {
  const plan = planCompactRewrite({
    handoff: containerWith([
      ['Prior objective', 'A'.repeat(498)],
      ['Prior objective (2026-09-11, now merged, superseded by the entry above)', 'B'.repeat(1929)],
      ['Prior objective (2026-09-11, superseded by the entry above)', 'C'.repeat(2025)],
      ['Prior objective (2026-09-10, superseded by the entry above)', 'D'.repeat(23408)],
      ['Update — 2026-09-16: Staging deploy blocker resolved', 'Still live: an update, not history.'],
      ['Files changed', '- src/core.ts'],
    ]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('; '));
  assert.equal(archivedOf(plan).length, 4, JSON.stringify(archivedOf(plan).map((section) => section.heading), null, 1));
  assert.ok(plan.handoff.includes('Still live: an update, not history.'), 'an Update block stays live');
  assert.ok(plan.handoff.includes('- src/core.ts'), 'a Files changed block stays live');
  assert.equal(plan.handoff.includes('D'.repeat(200)), false, 'the 23,408-char narrative is reclaimed');
  assert.ok(plan.handoff.length < 3000, `container should shrink hard: ${plan.handoff.length}`);

  const second = planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks });
  assert.equal(second.ok, true, second.blockedReasons.join('; '));
  assert.equal(second.handoff, plan.handoff, 'the reclaimed container is stable');
  assert.deepEqual(archivedOf(second), [], 'a second run has nothing left to archive');
});

test('a history heading inside fenced code is still not a heading', () => {
  const fenced = ['```md', '## Previous objective (2026-09-11, superseded by the entry above)', '```'].join('\n');
  const plan = planCompactRewrite({ handoff: handoffWith([['Notes', fenced]]), tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('; '));
  assert.deepEqual(archivedOf(plan), []);
  assert.ok(plan.handoff.includes(fenced), 'the fenced sample is untouched');
});
