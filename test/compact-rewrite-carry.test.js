import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCompactRewrite } from '../dist/compact-rewrite.js';

const PROSE = 'detail '.repeat(40);

function doc(sections) {
  return ['# Handoff', '', ...sections.flatMap(([heading, body]) => [`## ${heading}`, '', body, ''])].join('\n');
}
const TASKS = '# Tasks\n\n## Now\n\n- [ ] Work.\n\n## Done\n\n- [x] Old.\n';

test('only directive lines are carried forward, not prose that mentions a keyword', () => {
  const directive = 'Do not silently start fixing application code from this documentation request.';
  const standing = 'Migrations and deployment remain separately protected.';
  const longDirective = `Do not push ${'without approval '.repeat(20)}`.trim();
  const handoff = doc([
    ['Current objective', 'Current work.'],
    ['Previous objective — 2026-08-01', [
      `- **Missing indexes**: Postgres never auto-indexes a foreign key; ${PROSE}`,
      `Historical note: this was protected by an old guard, now removed. ${PROSE}`,
      `- ${directive}`,
      standing,
      `- ${'x'.repeat(700)} must never be pushed without owner approval.`,
      `- ${longDirective}`,
      '- [x] Finished step.',
    ].join('\n')],
  ]);
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.deepEqual(plan.carriedForward, [directive, standing, longDirective]);
  const section = plan.classification.handoff.find((entry) => /Previous objective/.test(entry.heading));
  assert.equal(section.decision, 'archived');
  assert.match(section.reason, /3 constraint line\(s\) carried forward/);
  assert.equal(plan.handoff.includes('Postgres never auto-indexes'), false, 'prose must not be re-injected into live context');
  assert.equal(plan.handoff.includes('now removed'), false, 'narrative sentences are not constraints');
  assert.match(plan.handoff, /^- Do not silently start fixing/m, 'carried lines are single bullets');
  assert.equal(/\n- - /.test(plan.handoff), false, 'carried bullets are never doubled');
  assert.equal(plan.carriedForward.some((line) => line.startsWith('- ')), false, 'carried lines are stored as plain text');
});

test('qualified history headings are recognized as history', () => {
  const handoff = doc([
    ['Current objective', 'Current work.'],
    ['Previous objective (superseded) — 2026-09-13: V2 implemented', 'Old work, finished.'],
    ['Previous (superseded) objective — 2026-09-12', 'Older work, finished.'],
    ['Previous objective backlog', 'This is not history: it is a backlog list.'],
    ['Current objectives backlog', 'Also not an objective section.'],
  ]);
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.handoff.includes('Old work, finished.'), false, 'qualifier must not stop history recognition');
  assert.equal(plan.handoff.includes('Older work, finished.'), false);
  assert.ok(plan.handoff.includes('This is not history: it is a backlog list.'), 'unqualified non-history sections stay live');
  assert.ok(plan.handoff.includes('Also not an objective section.'));
  assert.equal(plan.handoff.includes('## Current objective\n\nCurrent work.'), true);
});

test('a confident directive and an uncertain obligation are both carried while their blocks archive', () => {
  // Slice 3 carries a liftable uncertain obligation down the same path as the confident
  // rule: the statement stays live as a bullet, and the block around it archives byte-exact
  // and is reported with that reason. Keeping the whole block live is now the fallback for a
  // candidate that cannot be lifted on its own (see compact-preservation.test.js).
  const handoff = doc([
    ['Current objective', 'Current work.'],
    ['Previous objective — 2026-08-01', ['Archived narrative marker QZ-CARRIED.', '', 'Do not deploy on a Friday.'].join('\n')],
    ['Previous objective — 2026-08-02', ['Archived narrative marker QZ-UNCERTAIN.', '', 'never push to main'].join('\n')],
  ]);
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.deepEqual(plan.carriedForward, ['Do not deploy on a Friday.', 'never push to main']);

  const [confident, uncertain] = plan.classification.handoff.filter((section) => /Previous objective/.test(section.heading));
  assert.equal(confident.decision, 'archived');
  assert.equal(plan.handoff.includes('Archived narrative marker QZ-CARRIED.'), false, 'the block around a carried directive still archives');
  assert.equal(uncertain.decision, 'archived');
  assert.equal(plan.handoff.includes('Archived narrative marker QZ-UNCERTAIN.'), false, 'and the block around a carried obligation archives with it');
  assert.match(confident.reason, /1 constraint line\(s\) carried forward/);
  assert.match(uncertain.reason, /uncertain obligation\(s\) carried forward verbatim/);
  assert.match(plan.handoff, /^- Do not deploy on a Friday\.$/m, 'the confident directive is live as a bullet');
  assert.match(plan.handoff, /^- never push to main$/m, 'and so is the uncertain obligation');
  for (const heading of ['Previous objective — 2026-08-01', 'Previous objective — 2026-08-02']) {
    assert.match(plan.handoff, new RegExp(`- Archived \\\`${heading}\\\` \\(line \\d+\\)`), `${heading} is reported in History`);
  }

  const second = planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks });
  assert.equal(second.handoff, plan.handoff, 'the carried obligations are a fixed point');
  assert.deepEqual(second.carriedForward, []);
});

test('a generated constraints block keeps an uncertain obligation through re-filtering', () => {
  const handoff = doc([
    ['Current objective', 'Current work.'],
    ['Preserved context', [
      '### Constraints carried forward from archived history',
      '',
      '- `migration.sql` must never be edited after being applied',
      '- never push to main',
    ].join('\n')],
  ]);
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.ok(plan.handoff.includes('- `migration.sql` must never be edited after being applied'), 'a code-led obligation is not erased by re-filtering');
  assert.ok(plan.handoff.includes('- never push to main'), 'a lowercase obligation is not erased by re-filtering');
  assert.equal(plan.handoff.match(/### Constraints carried forward from archived history/g).length, 1);
  assert.equal(planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks }).handoff, plan.handoff, 'stable across runs');
});

test('stacked bullet markers in an earlier generated block are normalized', () => {
  const handoff = doc([
    ['Current objective', 'Current work.'],
    ['Preserved context', [
      '### Constraints carried forward from archived history',
      '',
      '- - Do not silently start fixing application code from this documentation request.',
      `- - **Old narrative**: Postgres never auto-indexes a foreign key; ${PROSE}`,
    ].join('\n')],
  ]);
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.match(plan.handoff, /^- Do not silently start fixing/m, 'one bullet, not two');
  assert.equal(/^- - /m.test(plan.handoff), false, 'stacked markers are collapsed');
  assert.equal(plan.handoff.includes('Old narrative'), false);
  assert.equal(planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks }).handoff, plan.handoff, 'normalization is idempotent');
});

test('a generated constraints block is re-filtered against the current rule', () => {
  const bloated = [
    '### Constraints carried forward from archived history',
    '',
    `- **Old narrative**: Postgres never auto-indexes a foreign key; ${PROSE}`,
    '- Do not silently start fixing application code from this documentation request.',
    '',
    '### Hand-written project note',
    '',
    `Something a human wrote that merely mentions never and ${PROSE}`,
  ].join('\n');
  const handoff = doc([
    ['Current objective', 'Current work.'],
    ['Preserved context', bloated],
  ]);
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.handoff.includes('Old narrative'), false, 'machine-generated carried lines are re-evaluated');
  assert.ok(plan.handoff.includes('Do not silently start fixing'), 'a still-qualifying directive stays');
  assert.ok(plan.handoff.includes('### Hand-written project note'), 'hand-written preserved content is untouched');
  assert.ok(plan.handoff.includes('Something a human wrote'), 'hand-written content is never re-filtered');
  assert.equal(plan.handoff.match(/### Constraints carried forward from archived history/g).length, 1);

  const again = planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks });
  assert.equal(again.handoff, plan.handoff, 're-filtering is idempotent');
  assert.equal(plan.carriedForward.length, 0, 're-filtering creates no new carried lines');
});

test('re-filter keeps the block honest when nothing qualifies any more', () => {
  const handoff = doc([
    ['Current objective', 'Current work.'],
    ['Preserved context', ['### Constraints carried forward from archived history', '', `- **Narrative**: was never an instruction; ${PROSE}`].join('\n')],
  ]);
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.handoff.includes('Constraints carried forward'), false, 'an emptied generated block is removed');
  assert.equal(plan.handoff.includes('Narrative'), false);
});
