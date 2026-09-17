import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCompactRewrite } from '../dist/compact-rewrite.js';

const TASKS = ['# Tasks', '', '## Now', '', '- [ ] Ship the nested-history slice.', ''].join('\n');

/**
 * The real shape this slice exists for: an earlier build classified a level-2
 * section as unclassified and re-emitted it as a level-3 block under
 * `## Preserved context`, where section scanning (level 2 only) could never
 * reclassify it again.
 */
function fixture({ nested = [], preamble = '', crlf = false } = {}) {
  const parts = [
    '# Handoff', '',
    '## Current objective — 2026-09-15', '', 'Live objective body.', '',
    '## Scope', '', '- Workspace kind: multi-repo', '',
    '## Next exact action', '', 'Continue.', '',
    '## Preserved context', '',
  ];
  if (preamble) parts.push(preamble, '');
  for (const [heading, body] of nested) parts.push(heading.startsWith('#') ? heading : `### ${heading}`, '', body, '');
  const text = parts.join('\n');
  return crlf ? text.replace(/\n/g, '\r\n') : text;
}

function archivedOf(plan) {
  return plan.classification.handoff.filter((section) => section.decision === 'archived');
}

test('history nested under a preserved container is archived on a later run', () => {
  const narrative = 'Long historical narrative. '.repeat(40);
  const handoff = fixture({
    preamble: 'Hand-written preamble that must survive.',
    nested: [
      ['Previous objective (superseded) — 2026-09-13: AUM production-hardening pass', narrative],
      ['Files changed', '- src/core.ts\n- src/cli.ts'],
    ],
  });
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.handoff.includes('Long historical narrative.'), false, 'nested history leaves live context');
  assert.ok(plan.handoff.includes('- src/core.ts'), 'non-history nested content stays live');
  assert.ok(plan.handoff.includes('Hand-written preamble that must survive.'), 'container preamble is preserved');
  assert.match(plan.handoff, /^## Preserved context$/m, 'the container survives while it still holds live content');
  assert.match(plan.handoff, /^### Files changed$/m, 'kept blocks keep their level-3 heading');

  const archived = archivedOf(plan);
  assert.equal(archived.length, 1, JSON.stringify(plan.classification.handoff, null, 1));
  assert.equal(archived[0].heading, 'Previous objective (superseded) — 2026-09-13: AUM production-hardening pass');
  assert.match(archived[0].reason, /nested/);
  assert.match(plan.handoff, /- Archived `Previous objective \(superseded\)/, 'the archive entry is recorded in History');
});

test('nested history with unresolved work or constraints is never silently dropped', () => {
  const unresolved = planCompactRewrite({
    handoff: fixture({
      nested: [['Prior objective', 'Old narrative.\n\n- [ ] Unfinished obligation.']],
    }),
    tasks: TASKS,
  });
  assert.equal(unresolved.ok, true);
  assert.ok(unresolved.handoff.includes('Unfinished obligation.'), 'unresolved nested work stays live');
  assert.equal(unresolved.handoff.includes('Old narrative.'), true, 'the whole block stays live, not just the checkbox');
  assert.deepEqual(archivedOf(unresolved), []);

  const constrained = planCompactRewrite({
    handoff: fixture({
      nested: [['Previous objective — 2026-08-01', 'Old narrative.\n\nNever deploy without owner approval.']],
    }),
    tasks: TASKS,
  });
  assert.equal(constrained.ok, true);
  assert.equal(constrained.handoff.includes('Old narrative.'), false);
  assert.ok(constrained.handoff.includes('Never deploy without owner approval.'), 'constraint lines are carried forward');
  assert.deepEqual(constrained.carriedForward, ['Never deploy without owner approval.']);
  assert.equal(constrained.handoff.match(/^### Constraints carried forward from archived history$/gm).length, 1, 'exactly one generated constraints block');
});

test('the container is dropped when everything inside it qualified for archival', () => {
  const plan = planCompactRewrite({
    handoff: fixture({ nested: [['Previous objective (superseded) — 2026-09-13: only history', 'Old narrative.']] }),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.handoff.includes('## Preserved context'), false, 'no empty container is emitted');
  assert.equal(plan.handoff.includes('Old narrative.'), false);
  assert.equal(archivedOf(plan).length, 1);
});

test('constraints from nested history extend the existing generated block instead of duplicating it', () => {
  const handoff = fixture({
    nested: [
      ['Files changed', '- src/core.ts'],
      ['Constraints carried forward from archived history', '- Do not touch protected branches.'],
      ['Previous objective — 2026-08-01', 'Old narrative.\n\nNever deploy without owner approval.'],
    ],
  });
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.handoff.match(/^### Constraints carried forward from archived history$/gm).length, 1, 'exactly one generated constraints block');
  assert.ok(plan.handoff.includes('- Do not touch protected branches.'), 'the pre-existing carried line survives');
  assert.ok(plan.handoff.includes('- Never deploy without owner approval.'), 'the new line is merged into the same block');
  assert.deepEqual(plan.carriedForward, ['Never deploy without owner approval.']);
  const second = planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks });
  assert.equal(second.handoff, plan.handoff, 'the merged block is stable across runs');
});

test('unresolved work deeper than a history block keeps the whole block live', () => {
  const handoff = fixture({
    nested: [['Previous objective — 2026-08-01', ['Old narrative.', '', '#### Follow-up', '', '- [ ] Unfinished nested obligation.'].join('\n')]],
  });
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true);
  assert.ok(plan.handoff.includes('- [ ] Unfinished nested obligation.'), 'nested work stays live');
  assert.ok(plan.handoff.includes('Old narrative.'), 'a parent history block is never archived out from under a live descendant');
  assert.ok(plan.handoff.includes('#### Follow-up'), 'no sub-heading is orphaned from the block that owned it');
  assert.deepEqual(archivedOf(plan), []);
});

test('nested history holding an uncertain obligation carries it live and archives the block', () => {
  // The carry contract, one level down: an uncertain obligation that can be lifted is
  // carried forward verbatim as a live bullet, so the nested history block around it
  // archives and the container reports that.
  const block = 'Old narrative marker QZ-NESTED.\n\nnever push to main';
  const plan = planCompactRewrite({
    handoff: fixture({ nested: [['Previous objective — 2026-08-02', block], ['Files changed', '- src/core.ts']] }),
    tasks: TASKS,
  });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.handoff.includes(block), false, 'the nested history block leaves live context');
  assert.equal(plan.handoff.includes('QZ-NESTED.'), false, 'and its narrative archives with it');
  assert.match(plan.handoff, /^- never push to main$/m, 'the obligation is carried out of it and stays live');
  assert.ok(plan.carriedForward.includes('never push to main'), 'and is reported as carried forward');
  assert.ok(plan.handoff.includes('- src/core.ts'), 'non-history nested content stays live');
  const entry = plan.classification.handoff.find((section) => section.heading === 'Previous objective — 2026-08-02');
  assert.equal(entry.decision, 'archived');
  assert.match(entry.reason, /uncertain obligation\(s\) carried forward verbatim/);
  assert.match(
    plan.classification.handoff.find((section) => section.role === 'preserved').reason,
    /nested history archived/,
    JSON.stringify(plan.classification.handoff, null, 1),
  );
  const second = planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks });
  assert.equal(second.handoff, plan.handoff, 'the rewritten container is stable across runs');
});

test('nested history in the tasks container gets the same treatment', () => {
  const block = 'Archived tasks marker QZ-TASKS-NESTED.\n\n`migration.sql` must never be edited after being applied';
  const tasks = [TASKS, '## Preserved context', '', '### Previous objective — 2026-08-03', '', block, ''].join('\n');
  const plan = planCompactRewrite({ handoff: fixture({ nested: [['Files changed', '- src/cli.ts']] }), tasks });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.equal(plan.tasks.includes(block), false, 'the tasks-side nested block leaves live context');
  assert.equal(plan.tasks.includes('QZ-TASKS-NESTED.'), false, 'and its narrative archives with it');
  assert.match(plan.tasks, /^- `migration\.sql` must never be edited after being applied$/m, 'the obligation is carried out of it and stays live');
  assert.ok(plan.carriedForward.includes('`migration.sql` must never be edited after being applied'), 'and is reported as carried forward');
  const entry = plan.classification.tasks.find((section) => section.heading === 'Previous objective — 2026-08-03');
  assert.equal(entry.decision, 'archived');
  assert.match(entry.reason, /uncertain obligation\(s\) carried forward verbatim/);
  assert.match(
    plan.classification.tasks.find((section) => section.role === 'preserved').reason,
    /nested history archived/,
    JSON.stringify(plan.classification.tasks, null, 1),
  );
});

test('fenced samples inside a container are still never treated as that block', () => {
  const fenced = ['```md', '### Constraints carried forward from archived history', '', '- Must not commit production dumps.', '```'].join('\n');
  // A sample that would not qualify is not re-filtered either: re-filtering is
  // fence-aware, so a fenced example is reproduced byte-for-byte.
  const narrative = ['```md', '### Constraints carried forward from archived history', '', '- narrative that merely mentions never', '```'].join('\n');
  const handoff = fixture({
    nested: [
      ['Files changed', fenced],
      ['Notes', narrative],
      ['Previous objective — 2026-08-01', 'Old narrative.\n\nNever deploy without owner approval.'],
    ],
  });
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true);
  assert.ok(plan.handoff.includes(fenced), 'the fenced sample is byte-identical');
  assert.ok(plan.handoff.includes(narrative), 'a fenced sample is never re-filtered or rewritten');
  assert.ok(
    plan.handoff.includes('```\n\n### Constraints carried forward from archived history\n\n- Never deploy without owner approval.'),
    'the carried line lands in a real block after the closed fence, not inside the sample',
  );
  assert.equal(plan.handoff.match(/### Constraints carried forward from archived history/g).length, 3, 'two samples plus the real block');
});

test('a deeper heading before the first sibling block is never dropped', () => {
  const handoff = fixture({
    nested: [
      ['#### Follow-up notes', 'Deep notes that must survive.\n\n- [ ] Unfinished nested obligation.'],
      ['Previous objective (superseded) — 2026-09-13: old work', 'Old narrative.'],
      ['Files changed', '- src/core.ts'],
    ],
  });
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true);
  assert.ok(plan.handoff.includes('#### Follow-up notes'), 'the deeper block before the first sibling is not orphaned away');
  assert.ok(plan.handoff.includes('Deep notes that must survive.'), 'lead-in content before the first sibling is kept');
  assert.ok(plan.handoff.includes('- [ ] Unfinished nested obligation.'), 'an unchecked task in that lead-in stays live');
  assert.equal(plan.handoff.includes('Old narrative.'), false, 'the sibling history block is still archived');
  assert.equal(archivedOf(plan).length, 1);
  const second = planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks });
  assert.equal(second.handoff, plan.handoff, 'the mixed-level container is stable');
});

test('the container plan reason reflects what actually happened to it', () => {
  const rewritten = planCompactRewrite({
    handoff: fixture({ nested: [['Previous objective (superseded) — 2026-09-13: old', 'Narrative.'], ['Files changed', '- src/core.ts']] }),
    tasks: TASKS,
  });
  assert.match(rewritten.classification.handoff.find((section) => section.role === 'preserved').reason, /nested history archived/);

  const untouched = planCompactRewrite({
    handoff: fixture({ nested: [['Files changed', '- src/core.ts']] }),
    tasks: TASKS,
  });
  assert.match(untouched.classification.handoff.find((section) => section.role === 'preserved').reason, /re-read; nothing nested was archivable/);
});

test('every nested block is kept, reported, or archived with its owner — never dropped silently', () => {
  // Guards the whole removal class: a block may leave live context only if it is
  // reported, or if an archived owner's span carries it. Markers must not contain a
  // constraint keyword (`never`, `do not`, …) or a removed one would be re-emitted
  // as a carried-forward bullet and mask the removal.
  let seed = 20260916;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const levels = [3, 4, 5, 6];
  let archivedIterations = 0;
  for (let iteration = 0; iteration < 200; iteration++) {
    const count = 2 + Math.floor(rand() * 4);
    const blocks = [];
    for (let index = 0; index < count; index++) {
      blocks.push({
        level: levels[Math.floor(rand() * levels.length)],
        // History titles need their delimiter, and markers must not contain a
        // constraint keyword, or the generator itself decides the outcome.
        title: `${rand() < 0.5 ? 'Previous objective — 2026-08-0' : 'Sub notes '}${iteration}-${index}`,
        token: `Token QZ-${iteration}-${index}.`,
      });
    }
    const plan = planCompactRewrite({ handoff: fixture({ nested: blocks.map((block) => [`${'#'.repeat(block.level)} ${block.title}`, block.token]) }), tasks: TASKS });
    assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
    const archived = new Set(plan.classification.handoff.filter((section) => section.decision === 'archived').map((section) => section.heading));
    if (archived.size) archivedIterations++;
    // Only the shallowest nested headings own a span (the planner splits siblings at
    // the minimum level). A deeper block is covered by the nearest preceding span
    // owner; a deeper block before the first owner is lead-in and must stay live.
    const minLevel = Math.min(...blocks.map((block) => block.level));
    blocks.forEach((block, index) => {
      let coveredByOwner = false;
      if (block.level > minLevel) {
        for (let candidate = index - 1; candidate >= 0; candidate--) {
          if (blocks[candidate].level !== minLevel) continue;
          coveredByOwner = archived.has(blocks[candidate].title);
          break;
        }
      }
      const accounted = plan.handoff.includes(block.token) || archived.has(block.title) || coveredByOwner;
      assert.ok(accounted, `iteration ${iteration}: block ${index} (${'#'.repeat(block.level)} ${block.title}) left live context with no archived plan covering it`);
    });
  }
  // Guard against the generator going vacuous: if nothing is ever archivable the
  // accounting assertions above prove nothing.
  assert.ok(archivedIterations >= 20, `generator only produced ${archivedIterations} archivable iterations`);
});

test('nested history in the tasks container is classified and archived too', () => {
  const tasks = [TASKS, '## Preserved context', '', '### Previous objective — 2026-08-01', '', 'Archived tasks narrative.', '', '### Files changed', '', '- src/core.ts', ''].join('\n');
  const plan = planCompactRewrite({ handoff: fixture({ nested: [['Files changed', '- src/cli.ts']] }), tasks });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  const archived = plan.classification.tasks.filter((section) => section.decision === 'archived');
  assert.equal(archived.length, 1, JSON.stringify(plan.classification.tasks, null, 1));
  assert.equal(archived[0].heading, 'Previous objective — 2026-08-01');
  assert.match(archived[0].reason, /nested/);
  assert.equal(plan.tasks.includes('Archived tasks narrative.'), false, 'tasks-side nested history leaves live context');
  assert.ok(plan.tasks.includes('- src/core.ts'), 'tasks-side non-history nested content stays live');
  assert.match(plan.tasks, /- Archived `Previous objective — 2026-08-01`/);
  const second = planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks });
  assert.equal(second.tasks, plan.tasks, 'the tasks container is stable across runs');
});

test('a deeper block inside an archived block goes with it, and unresolved work anywhere stops it', () => {
  // The documented section rule, applied one level down: archiving a block archives what
  // is nested inside it — but an unchecked task at ANY depth keeps the whole block live.
  const ridden = planCompactRewrite({
    handoff: fixture({
      nested: [['Previous objective — 2026-08-01', ['Old narrative.', '', '#### Detail', '', 'Nested detail prose.'].join('\n')], ['Files changed', '- src/core.ts']],
    }),
    tasks: TASKS,
  });
  assert.equal(ridden.ok, true);
  assert.equal(ridden.handoff.includes('Old narrative.'), false);
  assert.equal(ridden.handoff.includes('Nested detail prose.'), false, 'nested content is archived with its owner');
  assert.equal(archivedOf(ridden).length, 1, 'the owner is reported, not each descendant');
  assert.match(ridden.handoff, /- Archived `Previous objective — 2026-08-01`/);

  const blocked = planCompactRewrite({
    handoff: fixture({
      nested: [['Previous objective — 2026-08-01', ['Old narrative.', '', '#### Detail', '', '- [ ] Unfinished obligation.'].join('\n')]],
    }),
    tasks: TASKS,
  });
  assert.equal(blocked.ok, true);
  assert.deepEqual(archivedOf(blocked), [], 'an unchecked task at any depth keeps the owner and its content live');
  assert.ok(blocked.handoff.includes('Old narrative.'));
  assert.ok(blocked.handoff.includes('- [ ] Unfinished obligation.'));
});

test('a live container nested in the preserved container is never archived', () => {
  // Deleting this guard passes every other test, so it needs its own case.
  const handoff = fixture({
    nested: [
      ['History', '- Archived `old thing` (line 4): explicit history section.'],
      ['Preserved context', 'Hand-written note kept from an earlier run.'],
      ['Previous objective (superseded) — 2026-09-13: old', 'Narrative.'],
    ],
  });
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true, plan.blockedReasons.join('\n'));
  assert.ok(plan.handoff.includes('Hand-written note kept from an earlier run.'), 'a nested Preserved context stays whole');
  assert.ok(plan.handoff.includes('- Archived `old thing` (line 4): explicit history section.'), 'a nested History stays whole');
  assert.deepEqual(archivedOf(plan).map((section) => section.heading), ['Previous objective (superseded) — 2026-09-13: old']);
  assert.equal(plan.handoff.match(/^### Preserved context$/gm).length, 1, 'the nested container is not swallowed by its parent');
});

test('a container with no history-shaped blocks keeps every byte of its content', () => {
  const handoff = fixture({
    nested: [
      ['Files changed', '- src/core.ts\n- src/cli.ts'],
      ['Tests run', '- bun run test'],
      ['Last completed step', 'Finished the slice.'],
    ],
  });
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true);
  assert.deepEqual(archivedOf(plan), []);
  for (const text of ['- src/core.ts', '- src/cli.ts', '- bun run test', 'Finished the slice.']) {
    assert.ok(plan.handoff.includes(text), text);
  }
  assert.ok(plan.handoff.includes('## Preserved context'));
  const second = planCompactRewrite({ handoff: plan.handoff, tasks: plan.tasks });
  assert.equal(second.handoff, plan.handoff, 'an untouched container is byte-identical on a repeat run');
});

test('nested archival records the absolute source line and is not a live-context loss', () => {
  const handoff = fixture({
    nested: [
      ['Files changed', '- src/core.ts'],
      ['Previous objective (superseded) — 2026-09-13: reviewed', 'Narrative.'],
    ],
  });
  const expected = handoff.split('\n').findIndex((line) => /^### Previous objective \(superseded\)/.test(line)) + 1;
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  const [archived] = archivedOf(plan);
  assert.equal(archived.line, expected, 'the audit entry points at the real source line');
  assert.match(plan.handoff, new RegExp(`- Archived \`Previous objective \\(superseded\\) — 2026-09-13: reviewed\` \\(line ${expected}\\)`));
});

test('a demoted block whose obligation was flattened into a sibling is stable and reported', () => {
  // A promoted-then-demoted history block can end up as a `###` sibling of the heading
  // that used to sit inside it. Re-reading the container must keep looking at
  // the block plus the content that followed it, or the parent is archived on
  // the second pass and the uncertain-obligation report disappears.
  //
  // The fixture's obligation must be UN-LIFTABLE. This test is about a parent that stays
  // preserved live with the report naming the statement that stopped it; a statement that
  // CAN be lifted is carried out of the container, the parent archives, and the report is
  // a carried line instead — a different outcome, asserted in the liftable variant below.
  const unliftable = ['Accounts, locations and trips in the production database must not be modified without', '', '- approval from the release manager'].join('\n');
  const handoff = fixture({
    nested: [
      ['Previous objective (superseded) — 2026-09-13: flattened', 'plain narrative marker QZ-FLATTENED.'],
      ['Notes', unliftable],
    ],
  });
  const first = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(first.ok, true, first.blockedReasons.join('\n'));
  assert.ok(first.handoff.includes('plain narrative marker QZ-FLATTENED.'), 'the parent block stays whole and live');
  assert.ok(first.handoff.includes(unliftable), 'and the un-liftable statement stays live with it');
  assert.deepEqual(first.carriedForward, [], 'nothing is extracted from a statement that cannot be lifted');
  assert.deepEqual(archivedOf(first), []);
  const entry = first.classification.handoff.find((section) => section.heading === 'Previous objective (superseded) — 2026-09-13: flattened');
  assert.equal(entry.decision, 'preserved');
  assert.match(entry.reason, /uncertain obligation/i);
  assert.match(first.classification.handoff.find((section) => section.role === 'preserved').reason, /nested history preserved live \(1\)/);

  const second = planCompactRewrite({ handoff: first.handoff, tasks: first.tasks });
  assert.equal(second.handoff, first.handoff, 'the container is byte-identical on a repeat run');
  assert.equal(
    second.classification.handoff.find((section) => section.heading === 'Previous objective (superseded) — 2026-09-13: flattened').decision,
    'preserved',
    'the decision does not flip on the planner\'s own output',
  );
  assert.deepEqual(archivedOf(second), []);

  // The liftable variant of the same shape: the obligation is live in the sibling block
  // that owns it (not duplicated as a carried line), so the parent archives and the
  // second pass over the planner's own output rewrites nothing.
  const liftable = planCompactRewrite({
    handoff: fixture({
      nested: [
        ['Previous objective (superseded) — 2026-09-13: flattened', 'plain narrative marker QZ-FLATTENED.'],
        ['Notes', 'never push to main'],
      ],
    }),
    tasks: TASKS,
  });
  assert.equal(liftable.ok, true, liftable.blockedReasons.join('\n'));
  assert.ok(liftable.handoff.includes('never push to main'), 'the obligation is live in the sibling that owns it');
  assert.match(liftable.handoff, /^### Notes$/m);
  assert.deepEqual(liftable.carriedForward, [], 'a live sibling is not duplicated as a carried line');
  assert.equal(liftable.handoff.includes('plain narrative marker QZ-FLATTENED.'), false, 'the parent archives and takes its narrative with it');
  assert.equal(archivedOf(liftable).length, 1);
  const liftableSecond = planCompactRewrite({ handoff: liftable.handoff, tasks: liftable.tasks });
  assert.equal(liftableSecond.handoff, liftable.handoff, 'the liftable variant is byte-identical on a repeat run');
  assert.deepEqual(archivedOf(liftableSecond), []);
});

test('a second rewrite of the rewritten container is byte-identical', () => {
  const handoff = fixture({
    preamble: 'Preamble.',
    nested: [
      ['Update — 2026-09-16: blocker resolved', 'Resolved.'],
      ['Previous objective (superseded) — 2026-09-13: reviewed', 'Narrative.'],
      ['Files changed', '- src/core.ts'],
      ['Tests run', '- bun run test'],
    ],
  });
  const first = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(first.ok, true);
  assert.equal(archivedOf(first).length, 1);
  const second = planCompactRewrite({ handoff: first.handoff, tasks: first.tasks });
  assert.equal(second.ok, true, second.blockedReasons.join('\n'));
  assert.equal(second.handoff, first.handoff, 'the rewritten container is stable');
  assert.equal(second.tasks, first.tasks);
  assert.deepEqual(archivedOf(second), [], 'a second run has nothing left to archive');
});

test('CRLF containers are archived without losing the convention', () => {
  const handoff = fixture({ crlf: true, nested: [['Previous objective (superseded) — 2026-09-13: old', 'Narrative.'], ['Files changed', '- src/core.ts']] });
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true);
  assert.equal(archivedOf(plan).length, 1);
  assert.ok(!plan.handoff.replaceAll('\r\n', '').includes('\n'), 'CRLF preserved');
  assert.ok(plan.handoff.includes('- src/core.ts'));
});

test('the recorded real workspace shape reclaims its preserved narrative', () => {
  const handoff = fixture({
    nested: [
      ['Update — 2026-09-16: Staging deploy blocker resolved', 'Resolved.'],
      ['Previous objective (superseded) — 2026-09-13: Impeccable design/UX review of the AUM frontend work, plus CLAUDE.md default wiring', 'A'.repeat(5793)],
      ['Previous objective (superseded) — 2026-09-13: AUM production-hardening pass + Fleet Management quick action', 'B'.repeat(6209)],
      ['Previous objective (superseded) — 2026-09-13: AUM Management & Tagging V2 implemented, both repos, verified live', 'C'.repeat(7301)],
      ['Previous objective (superseded) — 2026-09-13 (earlier): AUM Management & Tagging epic re-checked', 'D'.repeat(722)],
      ['Previous objective (superseded) — 2026-09-13: local database restored; AUM implementation stopped', 'E'.repeat(2262)],
      ['Previous objective (superseded)', 'F'.repeat(1718)],
      ['2026-09-13: Impeccable initialization complete', 'G'.repeat(1435)],
      ['Last completed step', 'H'.repeat(1981)],
      ['Files changed', 'I'.repeat(3386)],
      ['Tests run', 'J'.repeat(3289)],
      ['Constraints carried forward from archived history', '- Do not touch protected branches.'],
    ],
  });
  const plan = planCompactRewrite({ handoff, tasks: TASKS });
  assert.equal(plan.ok, true);
  assert.equal(archivedOf(plan).length, 6, 'every superseded block is reclaimed');
  for (const text of ['G'.repeat(1435), 'H'.repeat(1981), 'I'.repeat(3386), 'J'.repeat(3289), 'Resolved.']) {
    assert.ok(plan.handoff.includes(text), 'scratch and update blocks stay live');
  }
  assert.ok(plan.handoff.includes('- Do not touch protected branches.'), 'the generated constraints block is re-filtered, not lost');
  assert.ok(plan.handoff.length < 25000, `reclaimed: ${handoff.length} -> ${plan.handoff.length}`);
});
