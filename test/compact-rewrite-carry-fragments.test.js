import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCompactRewrite } from '../dist/compact-rewrite.js';

const TASKS = '# Tasks\n\n## Now\n\n- [ ] Work.\n';
const PROSE = 'detail '.repeat(40);

function doc(sections) {
  return ['# Handoff', '', ...sections.flatMap(([heading, body]) => [`## ${heading}`, '', body, ''])].join('\n');
}

/** A preserved-context container holding the given lines as one archived history block. */
function withHistory(sectionHeading, lines) {
  return doc([
    ['Current objective', 'Current work.'],
    [sectionHeading, lines.map((line) => `- ${line}`).join('\n')],
  ]);
}

// The 22 lines the real workspace (/home/app/www/kargax/new) actually carried on 2026-09-16.
// Only the first three are standing directives; the rest are soft-wrapped prose fragments.
const DIRECTIVES = [
  'Before stopping implementation, lifecycle/correction APIs, assignment context, integrations and UI had been added but final verification was incomplete (concurrency verification found a PostgreSQL UUID aggregate issue, then code was adjusted; final rerun was not completed before cancellation). Do not treat those changes as production-ready.',
  'Restore utility: /tmp/restore-kargax-v6.ts; private generated SQL: /tmp/kargax-restore-1789277975396.sql (0600). Dumps and SQL contain production-derived data and must not be committed.',
  'Verification script: `/tmp/aum-verify-db.ts`; recovery SQL/dump in /tmp contains production-derived data and must not be committed. No commits/pushes.',
];
const FRAGMENTS = [
  'never actually rendered. Possibly `UDivider` got renamed in the installed Nuxt UI version (e.g.',
  'Cancel discards the edit refs; it never needed to "restore" anything since read mode reads',
  'straight from `request`, which the edit refs never touch until Save.',
  'deliberately included so the counter never claims "complete" while submit would still reject for',
  'a real gap: ACCOUNT_MANAGER/ADMIN/SUPER_ADMIN could never actually call it despite being in the',
  'point at a Location that exists independently of the request and must not be rewritten through',
  'extracted out of `findAll` so the two can never disagree on which vehicles a filter',
  "`trip.service.ts`'s shared `TRIP_VEHICLE_REF_SELECT`. `VehicleService.merge()` never",
  'responses do not gain the new classification"). No migration has been committed/pushed;',
  "either. `AccountLocationRequest` (this codebase's fullest actor-tracking model) never indexes",
  'Since the migration that added it was created this same session and never shared, edited that',
  '`createdById` is never part of that update payload at all (this is the one assertion that',
  'was never written to the row before); `LocationService.update()` now takes a `user` param and',
  'stamps `updatedById` with the reviewer on its `tx.location.update()`, and never touches',
  'never constructs the payload shapes that trigger them:',
  'enforced there, never membership. Verified live: a custom "Metro Cebu" province round-trips',
  'The equivalent gap exists in `OperatorService.update()` (never had this second check either) but',
  'throwaway Playwright script to read the real ARIA tree before touching the actual spec. Region',
  "a slot vehicle swap now only affects trips created after the swap, never an already-ACTIVE trip's",
];

test('the recorded real workspace carries its directives and none of its wrapped prose', () => {
  const plan = planCompactRewrite({ handoff: withHistory('Previous objective — 2026-09-14 (earlier)', [...DIRECTIVES, ...FRAGMENTS]), tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(
    plan.classification.handoff.find((section) => section.role === 'history').decision,
    'archived',
    'the 22-line run is prose, so no uncertain-obligation retention fires on it',
  );
  assert.deepEqual(plan.carriedForward, DIRECTIVES, 'exactly the three standing directives');
  for (const fragment of FRAGMENTS) {
    assert.equal(plan.handoff.includes(fragment), false, `fragment must not reach live context: ${fragment.slice(0, 60)}`);
  }
  for (const directive of DIRECTIVES) assert.ok(plan.handoff.includes(directive), 'directives are carried verbatim');
  assert.equal(plan.handoff.match(/^### Constraints carried forward from archived history$/gm).length, 1);
  const block = (plan.handoff.split('### Constraints carried forward from archived history')[1] ?? '').split(/\n(?=#)/)[0];
  assert.equal(block.split('\n').filter((line) => line.trim().startsWith('- ')).length, 3, `the generated block holds three bullets:\n${block}`);
  const second = planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks });
  assert.equal(second.handoff, plan.handoff, 're-filtering the same block is stable');
  assert.deepEqual(second.carriedForward, []);
});

test('the recorded fragments stay archived however the layout separates them', () => {
  // NEGATIVE control for the layout-sensitive regression: the same 22 lines used to
  // be archived as one long run, but separating them with blank lines made each
  // fragment its own short run, and a short run that opens a statement and merely
  // contains a keyword was retained — so the whole block went live (19/19 fragments).
  // Prose does not become an instruction because someone re-flowed the paragraph.
  const layouts = {
    'single newline': [...DIRECTIVES, ...FRAGMENTS].map((line) => `- ${line}`).join('\n'),
    'blank-line separated': [...DIRECTIVES, ...FRAGMENTS].map((line) => `- ${line}`).join('\n\n'),
  };
  for (const [name, body] of Object.entries(layouts)) {
    const handoff = doc([
      ['Current objective', 'Current work.'],
      [`Previous objective — 2026-09-14 (${name})`, body],
    ]);
    const plan = planCompactRewrite({ handoff, tasks: TASKS });
    assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
    const entry = plan.classification.handoff.find((section) => section.role === 'history');
    assert.equal(entry.decision, 'archived', `${name}: the fragments are prose in either layout`);
    const live = FRAGMENTS.filter((fragment) => plan.handoff.includes(fragment));
    assert.deepEqual(live, [], `${name}: ${live.length}/19 fragments reached live context`);
    assert.deepEqual(plan.carriedForward, DIRECTIVES, `${name}: exactly the three standing directives`);
  }
});

test('a carried line must read as an instruction, not as a wrapped fragment', () => {
  // `expected` is whether the statement is live as a carried line — taken verbatim by the
  // confident rule, or lifted out of its block by the uncertain-obligation tier. A line
  // that is neither is archived with its block and must not reach live context.
  const cases = [
    ['Do not deploy on a Friday.', true, 'sentence-final directive'],
    ['Never push to main.', true, 'sentence-final directive'],
    ['Requires explicit approval', true, 'opens on the directive itself'],
    ['No secrets in the repo', true, 'opens on the directive itself'],
    ['**Never push to main**', true, 'bold-wrapped directive'],
    ['Migrations and deployment remain separately protected.', true, 'uppercase sentence'],
    ['never deploy without asking anyone first', true, 'a lowercase directive opens the statement, so the uncertain tier carries it'],
    ['and then it was protected by the old guard all along', false, 'opens on a continuation connective'],
    ['`/tmp/dump.sql` must not be committed anywhere', true, 'opens on a code span, so the confident rule refuses it and the uncertain tier carries it'],
    ['Cancel discards the edit refs; it never needed to "restore" anything since read mode reads', false, 'trails off without ending a sentence'],
    ['Since the migration that added it was created this same session and never shared, edited that', false, 'dangling connective'],
    ['The equivalent gap exists in `OperatorService.update()` (never had this check either) but', false, 'dangling conjunction'],
    ['Before the rewrite, everything was protected by the old guard and the note said the', false, 'trails off, no directive opening'],
  ];
  for (const [line, expected, why] of cases) {
    const plan = planCompactRewrite({ handoff: withHistory('Previous objective — 2026-08-01', [line]), tasks: TASKS });
    assert.equal(plan.ok, true);
    assert.equal(plan.carriedForward.length === 1, expected, `${why}: ${line.slice(0, 60)}`);
    if (expected) continue;
    // A line neither rule takes is prose: it stays out of live context entirely, and the
    // block it sat in is the one that archives.
    assert.equal(plan.handoff.includes(line), false, `prose must not reach live context: ${why}`);
    assert.equal(plan.classification.handoff.find((section) => section.role === 'history').decision, 'archived', why);
  }
});

test('a fragment-bearing block is archived without re-injecting its prose', () => {
  const handoff = doc([
    ['Current objective', 'Current work.'],
    ['Previous objective — 2026-08-01', [`- ${FRAGMENTS[0]}`, `- ${FRAGMENTS[5]}`, `- ${DIRECTIVES[1]}`].join('\n')],
    ['Scope', '- Workspace kind: single-repo'],
  ]);
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true);
  assert.equal(plan.handoff.includes(FRAGMENTS[0]), false);
  assert.equal(plan.handoff.includes(FRAGMENTS[5]), false);
  assert.ok(plan.handoff.includes(DIRECTIVES[1]));
  const block = (plan.handoff.split('### Constraints carried forward from archived history')[1] ?? '').split(/\n(?=#)/)[0];
  assert.equal(block.split('\n').filter((line) => line.trim().startsWith('- ')).length, 1, `one bullet survives from three lines:\n${block}`);
});

test('an obligation phrased after its subject is still carried', () => {
  // Review constructs: real instructions that the keyword+length rule carried and the
  // first cut of the shape rule dropped. Dropping a genuine obligation is the failure
  // mode that matters, so these are pinned.
  const kept = [
    'Migrations must not be edited in place',
    'Secrets must never be committed',
    'The dev database must never be touched',
    'Production data must not be committed or shared',
    'The protected paths must not be touched',
    'Approval from the owner is required before merging',
    'Owner approval is required before pushing',
    'Owner approval must be obtained before merging',
    'Requires explicit approval for production only',
    'Never run migrations on production, staging only',
    'Protected paths apply to the enterprise repo only',
    'The production database in staging must never be synced from dumps',
    'The kargax-be and kargax-fe repositories must not be committed together',
    'Approval from the platform owner for migrations must be obtained before merging',
    '*Never push to main*',
    '***Never push to main***',
    '**Never push to main**',
  ];
  for (const line of kept) {
    const plan = planCompactRewrite({ handoff: withHistory('Previous objective — 2026-08-01', [line]), tasks: TASKS });
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.carriedForward, [line], `must be carried: ${line}`);
  }
});

test('a late obligation phrase does not turn a fragment into a constraint', () => {
  // The modal must sit with its subject, near the start; anywhere-position matching is
  // exactly the keyword-anywhere rule this heuristic exists to avoid.
  const dropped = [
    'The equivalent gap exists in `OperatorService.update()` (never had this second check either) but',
    'This is why the note said that the guard must not be removed from that path at all',
    'responses do not gain the new classification and the row was left exactly as it was',
    'point at a Location that exists independently of the request and must not be rewritten through',
  ];
  for (const line of dropped) {
    const plan = planCompactRewrite({ handoff: withHistory('Previous objective — 2026-08-01', [line]), tasks: TASKS });
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.carriedForward, [], `must not be carried: ${line}`);
  }
});

test("the confident rule's limits are covered by the uncertain-obligation tier", () => {
  // These are the presentation variants the confident rule cannot extract. They are not
  // left to the whole-block fallback: the statement is lifted out of its block as a
  // complete statement, carried forward verbatim, and the block archives and is reported.
  // The obligation stays live without the narrative that surrounded it.
  const carriedLines = [
    '`/tmp/dump.sql` must not be committed anywhere',
    '`migration.sql` must never be edited after being applied',
    'Accounts, locations and trips in the production database must not be modified without approval',
  ];
  for (const line of carriedLines) {
    const plan = planCompactRewrite({ handoff: withHistory('Previous objective — 2026-08-01', [line]), tasks: TASKS });
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.carriedForward, [line], `carried verbatim by the uncertain tier: ${line}`);
    assert.ok(plan.handoff.split('\n').some((text) => text.trim() === `- ${line}`), `kept live as a carried bullet: ${line}`);
    const entry = plan.classification.handoff.find((section) => section.role === 'history');
    assert.equal(entry.decision, 'archived', line);
    assert.match(entry.reason, /uncertain obligation\(s\) carried forward verbatim/, line);
    assert.match(plan.handoff, /- Archived `Previous objective — 2026-08-01` \(line \d+\): .*uncertain obligation/, 'the removed block is reported');
  }

  // A line that opens as an obligation and then trails off is still read as
  // truncated narrative rather than as an obligation: it stays in the archive,
  // and the block around it still shrinks.
  const truncated = 'Do not push before the release is tagged and';
  const plan = planCompactRewrite({ handoff: withHistory('Previous objective — 2026-08-01', [truncated]), tasks: TASKS });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.carriedForward, [], 'documented limit: a line ending on a conjunction is truncated');
  assert.equal(plan.handoff.includes(truncated), false, 'a truncated line is prose, not an obligation');
  assert.equal(plan.classification.handoff.find((section) => section.role === 'history').decision, 'archived');
});

test('a bounded run of obligation-looking lines is carried line by line, an unbounded one archives as prose', () => {
  const boundedPlan = planCompactRewrite({
    handoff: withHistory('Previous objective — 2026-08-02', ['never push to main', '`migration.sql` must never be edited after being applied']),
    tasks: TASKS,
  });
  assert.equal(boundedPlan.ok, true, boundedPlan.blockedReasons.join('\n'));
  const bounded = ['- never push to main', '- `migration.sql` must never be edited after being applied'].join('\n');
  assert.ok(boundedPlan.handoff.includes(bounded), 'a short list of obligations stays live bullet by bullet');
  assert.deepEqual(boundedPlan.carriedForward, ['never push to main', '`migration.sql` must never be edited after being applied']);
  const boundedEntry = boundedPlan.classification.handoff.find((section) => section.role === 'history');
  assert.equal(boundedEntry.decision, 'archived', 'the block around the list archives');
  assert.match(boundedEntry.reason, /2 uncertain obligation\(s\) carried forward verbatim/);
  assert.match(boundedPlan.handoff, /- Archived `Previous objective — 2026-08-02` \(line \d+\)/, 'and it is reported');

  // The same shape, long enough to be narrative: the 22-line recorded block.
  const unboundedPlan = planCompactRewrite({ handoff: withHistory('Previous objective — 2026-08-03', [...DIRECTIVES, ...FRAGMENTS]), tasks: TASKS });
  assert.equal(unboundedPlan.ok, true);
  assert.equal(unboundedPlan.classification.handoff.find((section) => section.role === 'history').decision, 'archived', 'a run this long is prose');
  for (const fragment of FRAGMENTS) assert.equal(unboundedPlan.handoff.includes(fragment), false, fragment.slice(0, 50));
  assert.deepEqual(unboundedPlan.carriedForward, DIRECTIVES);
});

test('a bloated block from an earlier build is re-filtered down on the next run', () => {
  const bloated = ['### Constraints carried forward from archived history', '', ...[...DIRECTIVES, ...FRAGMENTS].map((line) => `- ${line}`)].join('\n');
  const handoff = doc([
    ['Current objective', 'Current work.'],
    ['Preserved context', bloated],
  ]);
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true);
  for (const fragment of FRAGMENTS) assert.equal(plan.handoff.includes(fragment), false, 're-filtering drops prose from an existing block');
  for (const directive of DIRECTIVES) assert.ok(plan.handoff.includes(directive));
  assert.equal(plan.carriedForward.length, 0, 're-filtering creates no new carried lines');
  assert.equal(planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks }).handoff, plan.handoff);
});

test('fenced samples are still never treated as constraints', () => {
  const body = ['Some prose about the old guard.', '', '```text', 'never deploy without approval', 'Do not push to main.', '```', '', `- ${DIRECTIVES[2]}`].join('\n');
  const plan = planCompactRewrite({
    handoff: doc([
      ['Current objective', 'Current work.'],
      ['Previous objective — 2026-08-01', body],
    ]),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.carriedForward, [DIRECTIVES[2]], 'only the real directive is carried');
  assert.equal(plan.handoff.includes('never deploy without approval'), false, 'fenced text is not carried');
});
