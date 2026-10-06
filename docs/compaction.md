# Compaction

AgentOS keeps live context in `.agentos/handoff.md` and `.agentos/tasks.md`. The normal command
structurally compacts those files; the older archive-and-link workflow now requires an explicit
flag.

| Command | Role | Live-state behavior |
| --- | --- | --- |
| `agentos compact` | **Default structural compaction** | Rebuilds canonical live context and applies only when the combined character count strictly decreases. |
| `agentos compact --rewrite` | Compatibility alias | Uses exactly the same planner, safety checks, and apply behavior as normal compact; it is not a separate or safer mode. |
| `agentos compact --checkpoint` | Legacy checkpoint | Retains all live text, appends archive links, and may grow live state. |

## Default structural compaction

```bash
agentos compact --dry-run                         # concise preview; writes nothing
agentos compact --dry-run --diff                  # detailed patch; writes nothing
agentos compact                                   # apply only a safe reduction
agentos compact --objective <id>                  # ambiguity or intentional override
agentos compact --expect-state <sha256>           # optional preview binding
```

Preview and apply use the same planner. Dry runs report mode, sizes, classification counts,
missing-section counts, and intended paths without printing complete proposed file bodies; library
callers still receive exact proposals and structured classification. `--diff` adds a unified diff
with stable LF output while preserving Unicode and CRLF inputs in the comparison. It is valid only
with `--dry-run`; `--diff=false` leaves concise output active, and unchanged proposals emit no empty
patch headers. Every dry-run form is read-only across the entire workspace tree.

A diff also prints the source-state hash and matching `--expect-state` apply command. That binding
is optional: ordinary apply replans current disk state, then replans again under the writer lock
before writing. If ambiguity blocks compaction, the concise candidate list remains available but no
proposed body or patch header is emitted.

One valid current objective is selected automatically. `--objective` is needed only when candidates
are ambiguous or the user intentionally overrides the automatic selection. Dates and labels such as
“latest” are content, never selection rules.

## Explicit checkpoint mode

```bash
agentos compact --checkpoint --dry-run
agentos compact --checkpoint
```

Checkpoint mode archives the exact before/after text under
`.agentos/runs/compact-archive-<sha256>.md`, appends a relative link in each live file to its
`previous-handoff` / `previous-tasks` anchor, and changes nothing else. It never removes live prose
and may increase live size. Unchanged repeats are write-free no-ops verified against the referenced
archive.

### What stays live, always

- The **selected objective**, with its original heading (including any date suffix).
- Scope, current state, next exact action, protected paths and constraints, known
  failures/warnings, and open decisions — under their canonical headings.
- **Every unfinished task**, with nested acceptance details, continuation paragraphs,
  code blocks, and links. A checked parent with an unchecked descendant keeps the whole
  block live.
- Every section the planner could not classify, under `## Preserved context` — kept except for
  nested history blocks, which are re-read on each run (see below). Archiving a block archives
  whatever is nested inside it, exactly as archiving a level-2 history section always has.
- Standing constraints found inside archived history (`do not`, `never`,
  `must not`, `requires approval`, `before merging`, …), carried forward verbatim with a
  `## Preserved context` block that names their origin. The committed shape and boundary cases in
  `test/compact-rewrite-carry-fragments.test.js` pin the configured limits: a line qualifies only
  when it is short (≤ 200 characters) or opens on the directive itself (≤ 600 characters):
  narrative paragraphs that merely mention a keyword are history, not constraints, and stay in the
  archive.
  Qualifying is also a matter of **shape**, because reclaiming a history block hands this rule
  every soft-wrapped line of it — a line that merely *starts* with `never` because the previous
  line ended mid-sentence is prose, not an instruction. So a carried line must open on an
  uppercase character; must be either an explicit obligation or a sentence ending in `.`/`!`/`?`;
  and must not trail off on a function word (`… and the note said the`) or an unclosed
  parenthesis. An explicit obligation is a line that opens on the directive, or that states a
  subject followed within seven words (the first word plus up to six more) by `must`, `must not`, `must never`, `do not`, `don't`,
  `requires`, `is required`, `are required`, `without approval` or `only with approval` — as in
  `Migrations must not be edited in place` or `The production database in staging must never be
  synced from dumps`. That window is a heuristic, not a parser, and it only decides lines with no terminal
  punctuation: a line ending in `.`, `!` or `?` qualifies at any subject length. An obligation
  phrased after its subject is capped at the prose length rather than the directive length, and a line that opens
  as an obligation and then continues as reported speech (`Guards must not be relied on here,
  the ticket explained …`) will be carried. A line that ends on a conjunction is read as
  truncated and stays in the archive. A line a following blank line continues is refused too: it is
  the first half of a longer sentence, so the confident rule leaves it for the statement-shaped tier
  below rather than putting a fragment into live context. The committed 22-line real-workspace
  fixture in `test/compact-rewrite-carry-fragments.test.js` goes from 22 carried lines to the 3
  genuine directives. Extracting
  nothing from a line is not the same as losing it: a line this rule cannot take is covered by the
  uncertain-obligation rule below, which carries the statement forward when it stands on its own and
  keeps its whole block live when it cannot.
  The generated block is re-evaluated on every rewrite — lines that no longer
  qualify are dropped from live context (their originals remain in the archive), and an
  emptied block is removed. Constraint lines carried out of newly archived nested history
  extend that block rather than creating a second one, and the merge ignores fenced samples.
  Re-filtering is fence-aware: a fenced sample quoting that heading is content, is never taken
  for the block, and is reproduced byte-for-byte. A line the confident rule cannot take is not
  erased either when the statement it carries still reads as a possible obligation (below).
- **Uncertain obligations — carried when they can be, kept whole when they cannot.** A history
  block's obligations are judged as sentences. A statement the confident rule above cannot extract
  but that still reads as a possible obligation is an **uncertain obligation**, and it decides the
  block's fate:
  - a **liftable** uncertain obligation — one that stands on its own as a complete statement — is
    **carried forward verbatim** as a live bullet, through the same path as the confident carry
    rule (bullet markers and wrapping emphasis stripped, deduped against the lines that rule
    already carries, and re-filtered on every rewrite), and **its block is archived**. The
    classification reason says how many statements were carried;
  - an **un-liftable** candidate keeps its **whole block live** and nothing is extracted from it,
    because a statement that cannot be lifted on its own would lose its other half if it were. The
    classification reason names the statement that stopped it.
  The unit of evidence is the **statement** — a sentence, assembled across the soft-wrapped lines
  that carry it, outside any fenced region — and the shape is applied to *every* statement a block
  contains, not to the block's opening and tail. The shape decides, not a keyword: an earlier
  keyword-anywhere rule re-injected narrative into live context, and soft-wrapped prose mentions
  `never` constantly. A statement counts as an uncertain obligation only when all of
  these hold:
  - it is **bounded** — at most 200 characters; longer is a paragraph, not an instruction;
  - it is not something the confident rule **already extracts** verbatim (`Do not deploy on a
    Friday.` is carried forward as a constraint, not duplicated here);
  - it **opens a statement** rather than continuing the line above (`and then …`, `This is why …`
    and a lowercase prose opener continue; `never …` and `` `migration.sql` … `` open);
  - it **states an obligation** rather than describing one. `must not`, `must never` and
    `must only` are deontic on their own, *except* as an **epistemic perfect** — `must not have been
    warm`, `must never have been re-run`, `must only have been lifted` report how a state came
    about, so a lookahead on `have <participle>` excludes them and such a sentence is description;
    `must be` needs a participial predicate (`must be approved`, `must be kept` — the stative
    `must be stale` describes a state, not an instruction); `require(s)`/`required` need a
    permission or review complement (`requires approval`, `required before merging`), and the
    `before <gerund>` gate is anchored to the action-verb set the confident rule already trusts —
    `touching`, `merging`, `deploying`, `committing`, `pushing`, `releasing` — so a mechanical report
    of what a pipeline does (`requires a restart before running the new migration`) is not read as a
    gate; `without approval` and `only with approval` are negated permissions already. A prohibition
    that *opens* the statement (`do not`, `don't`) is recognized as one; mid-sentence it is narration
    (`I don't recall which branch carried that change`), and a bare `never` or `must` is not enough
    on its own. This tier judges the shape of the statement only: a keyword-bearing line that ends a
    sentence is taken verbatim by the confident rule above, whichever modal it mentions (see the
    second residual below);
  - it is **complete**: it does not trail off on a function word or an unclosed parenthesis, and a
    statement without terminal punctuation does not end on a colon, semicolon or comma.
  Liftability is a separate question from shape, and it is what decides between carrying and
  preserving. A candidate is **liftable** when it is a complete unit on its own: it ends a sentence,
  or it is unterminated but nothing follows it that continues it. The whole-block fallback is
  reserved for the shapes that cannot be lifted — a statement a blank line split and whose halves do
  not rejoin into a finished sentence (`… must not be modified without` / blank / `approval`
  assembles, but is still unterminated), a statement a following list item carries on (pasting the
  item's own text into the sentence above would write a sentence nobody wrote), and a statement that
  only became too long to read as an instruction by crossing a blank line. This is also why the
  confident rule refuses a line a following blank line continues: the fragment falls through to this
  tier, which lifts the **complete joined statement** instead of carrying half of it.
  This is what keeps the presentation variants the confident rule cannot take — a lowercase
  directive (`never push to main`), a code-span subject (`` `migration.sql` must never be edited
  after being applied ``), wrapping emphasis (`**never push to main**`), an unterminated line whose
  subject is longer than the seven-word window (`Accounts, locations and trips in the production
  database must not be modified without approval`: an eight-word subject), a soft-wrapped obligation (the sentence continued on the next line, with no
  blank line between: `… must not be modified without` / `approval`), and an obligation with no
  terminal punctuation. Each of those is a bounded, complete statement that states a modal, so the
  same obligation survives with or without emphasis, a bullet marker, or a line break in the middle
  of it. It is **not** a claim that every code-span or long-subject obligation is covered: a
  statement longer than the prose limit, one that continues the line above, or one that trails off
  is not carried — while a statement this tier does not take is still not lost, since an un-liftable
  candidate keeps its block whole. A statement whose only obligation word is `never` or `must` alone
  is prose (`createdById is never part of that update payload at all`), and the block that holds it
  archives.
  Over-retention is deliberate, and measured rather than asserted. The committed real-fragment
  fixture in `test/compact-rewrite-carry-fragments.test.js` contains 22 lines: three standing
  directives and nineteen soft-wrapped narrative fragments. The three directives are carried and
  **0/19** fragments stay live **in either generated layout**: 2,574 → 1,143 characters with single
  newlines (55.59%), and 2,601 → 1,149 with blank lines (55.82%). The committed generators and
  assertions in `test/compact-preservation.test.js` provide the remaining suite-derived figures:
  the 150-block density corpus, with one two-line narrative paragraph per block broken immediately
  before `never`, is **253,385 → 18,208 (92.81%)**; its no-break control is **251,395 → 18,206
  (92.76%)**. On the 200-block obligation corpus, each block's middle paragraph alternates between
  `never push to main.` and `` `migration.sql` must never be edited after being applied. ``;
  **200/200 blocks archive, 0 are preserved, and the reduction is 327,985 → 34,816 — 293,169
  characters removed, 89.38%**. Replacing that middle paragraph with narrative produces the paired
  control, **348,275 → 24,256 (93.04%)**. These are different generated inputs; 24,256 is the
  control's output, not a baseline output for the obligation corpus.

  The same committed suite pins two residual corpora:
  - reported requirements phrased `must be <participle>` or `must only` reach the statement tier and
    are carried even though they do not instruct: **150/150 blocks archived, 0 preserved, 300 lines
    carried, 39,225 → 58,738 (−49.75%)**;
  - keyword-bearing narrative lines that end a sentence are carried by the confident rule:
    **150/150 blocks archived, 0 preserved, 300 lines carried, 43,725 → 62,488 (−42.91%)**. A replay
    against HEAD gives the same 43,725 → 62,488, so this residual predates the statement tier.

  A separate ad hoc probe (not part of the suite) found a third residual in the confident rule's
  seven-word `SUBJECT_MODAL` window. It generated 150 history blocks, each with two unterminated
  bullets shaped like `The staging migration log from March must not have been updated …` and
  `The production audit snapshot from deployment must never have been copied …`, plus unique marker
  text. Both the current `/tmp` build and HEAD archived **150/150** blocks, preserved **0**, carried
  all **300** lines, and measured **39,375 → 57,991 (−47.28%)**. In an instrumented `/tmp` copy with
  only `SUBJECT_MODAL` neutralized, the same corpus measured **39,375 → 18,083 (54.07%)** with no
  carried lines. That isolates the over-carry to the confident rule: the uncertain statement tier's
  `must (not|never|only) have <participle>` exclusion does not get a chance to reject a line already
  admitted by the subject-modal window.

  A requirement phrased with a noun the complement list does not carry and no anchored
  `before <gerund>` clause (`requires manual inspection`) is archived, and a wrapped passage longer
  than the prose limit is treated as narrative and archived.
  Aggregate over-retention is real and bounded. An ad hoc seeded 400-handoff probe, not part of the
  suite, gave each handoff
  canonical live sections, two to four history blocks of narrative, and — in a fixed seeded mix — a
  genuine obligation, an un-liftable obligation, a wrapped narrative fragment, or an unchecked task,
  with roughly a third of history blocks holding an obligation. Measured as HEAD baseline → current
  artifact, it produced **581,259 → 664,673 live
  characters, +83,414 (+14.35%)**, 287 of 400 cases growing and **125 of 400 exceeding 20% growth**.
  The growth is entirely this tier's: with the statement tier neutralized (no carry, no
  preservation) the same probe lands at **569,908, 11,351 characters below HEAD
  (−1.95%)**, so the confident rule's new refusal to carry a continued line makes live context
  *smaller*, not larger. Had every uncertain candidate fallen back to whole-block preservation
  instead of being lifted and carried, the battery would be **775,091 (+193,832, +33.35%)**: the
  lift-and-carry path is worth 110,418 characters against that fallback. And the growth is
  concentrated where the evidence is: the 113 cases whose history holds no uncertain obligation are
  byte-identical to HEAD, the 82 that carry an uncertain line without preserving a
  block grow 16.61% (36 of them above 20%), and the 205 that keep a block whole grow 21.57% (89
  above 20%). Over-retention can therefore make a rewrite *add* bytes rather than shrink — the
  measured residual corpora above do — which is why the size report states growth as growth and
  normal compact refuses the proposal without creating an archive or changing live files. The raw
  source remains live in that case; an explicit checkpoint is available when an archive-and-link
  snapshot is wanted without reduction.
- The existing `## Preserved context` and `## History` containers. The container's own body is
  re-read on every run — a nested history block that an earlier build demoted to a `###`
  heading there is classified again and becomes archivable, unless it still holds an unchecked
  task or an uncertain obligation that cannot be lifted out of it, which keep it whole and live (an
  uncertain obligation that can be lifted is carried forward and its block archives, like any
  other); a nested block is kept,
  reported or archived, never silently unaccounted for — while every block not nested
  inside an archived one is re-emitted unchanged (block separators are normalized to a single
  blank line). When this build demotes a preserved level-2 section to `###`, it shifts descendant
  ATX headings down with it (outside fenced code), so a nested child remains owned by its parent;
  a level-6 descendant becomes seven-hash plain preserved text rather than escaping as a sibling.
  Existing containers written by older builds may already have flattened that hierarchy. For that
  compatibility shape, a nested block is judged on its own body **plus every following
  non-history sibling heading until the next history-shaped one**, so an obligation or unchecked
  task flattened beside its former parent still protects that parent. History-shaped siblings stop
  the widened span because they are judged on their own evidence. Reading only the block's own span
  archived the parent on a later pass while its evidence stayed live in the sibling — a decision
  flip is not a fixed point. The parent decision and its safety basis (unchecked work or an
  un-liftable obligation) now survive repeated passes; the contextual reason prefix changes from
  `history section` to `nested history` after demotion. The
  committed 240-handoff seeded generator in `test/compact-preservation.test.js` asserts that no
  preserved block flips to archived and that every generated fixture is byte-identical after its
  first pass (the third pass is byte-identical too). A
  separate probe replaying that generator against HEAD found **112** preserved-to-archived flips on
  HEAD across the same 240 handoffs; current and HEAD each preserved 284 blocks on their first pass.
  History-shaped siblings are excluded, because they are judged on their own evidence.
  The rewrite never re-wraps its own output, and a container with nothing left in it is dropped
  rather than emitted empty. A repeat run rewrites nothing once no further block becomes
  archivable, but there is no universal pass count. In an ad hoc current-artifact probe, a generated
  `### Constraints carried forward from archived history` block above a deeper history block was
  removed on the first pass, exposing the deeper block to archive on the second; source and the
  first three rewrite outputs measured **174 → 295 → 295 → 295 characters**, and the third output
  was byte-identical to the second. In the companion probe, replacing that generated block with a
  non-archivable non-history sibling left the deeper history block live through all three passes.
  More generally, in a hand-edited container whose shallowest nested block is not itself archivable,
  blocks beneath it become eligible only if a later pass exposes them; otherwise they stay live.
  Nothing is lost either way: every pass is planned, reported and archived.

### What moves to the archive

- Superseded objectives — only after objective resolution determines which one is live,
  and only when the block holds no unchecked task and no **un-liftable** uncertain
  obligation. Liftable obligations are carried forward live before the block archives.
- Explicit history sections: `Previous …`, `Superseded …`, `Past …`, `Old …`,
  `Historic …`, `Archived …`, `Done`, `History`, `Run log`. They archive when they contain
  no unchecked task block and no un-liftable uncertain obligation; an unchecked task or an
  un-liftable candidate keeps the whole block live, while a liftable obligation is carried.
- Completed task sections (`## Done`), under the same unchecked-task and obligation guards.
- History nested inside `## Preserved context` — the shape an earlier build produced when it
  demoted an unclassified section to `###`. A nested block is archivable only when its heading
  is explicit history and neither its widened evidence span nor any deeper owned block holds an
  unchecked task or an un-liftable uncertain obligation. Liftable obligations are carried and
  reported rather than forcing the nested block to remain live.

Nothing else is removed. Every archived block is listed in `## History` with its source line and
its reason — a block nested inside an archived one goes with it, covered by that entry — and
nothing removed is lost: the archive holds the raw bytes.

### Archive layout

```text
.agentos/runs/compact-rewrite-<sha256>/
  handoff.md      # original bytes, verbatim
  tasks.md        # original bytes, verbatim
  manifest.json   # source/output hashes, mode, classification, selected objective
  README.md       # human-readable provenance
```

The directory name derives from both source files, not the clock. The archive is created
exclusively (no clobber), verified by hash, and read back **before** either live file is
replaced. An existing bundle is reused only when its manifest records the same source
hashes; otherwise a deterministic `-1`, `-2`, … suffix is used.

### Blocking rules (exit code 1, zero writes)

- No `## Current objective` heading at all.
- More than one current-objective heading and no `--objective`: every candidate is listed
  with a content-bound id (`obj-<hash>`), and the id changes when that section's text does.
- `--objective` value that matches no candidate.
- A present but empty objective.
- Empty `handoff.md` or `tasks.md`.
- An unclosed Markdown fence in either file.
- Invalid UTF-8, a non-regular file, or a symlinked live file (the workspace boundary
  preflight rejects the link first).
- An `--expect-state` hash that no longer matches the current sources.

A blocked compaction proposes no live files at all — it is a refusal, not a partial plan.

### Heading variants

`## Current objective — 2026-09-15 (latest): AUM work merged` is recognized as the
objective section, and its inline text counts as objective content. Recognition requires a
documented delimiter (em dash, en dash, spaced hyphen, or colon), so `## Previous
objective`, `## Current objectives backlog`, and `## Notes about Current objective` are
never matched. Content inside fenced code blocks is never treated as a heading. `doctor`
reports missing, empty, and duplicate objective headings separately, always with line
numbers, and never rewrites state from a diagnostic.

### Status and doctor after compaction

```bash
agentos doctor
agentos doctor --json
```

`status` and `doctor` use the same objective recognition and resolution rules as compaction.
Diagnostics run read-only after a changed apply. In a concise preview, canonical sections for
which the source had no material are reported as a count; library callers can inspect the exact
names in the structured `missing` field. Missing sections are omitted from the files rather than
filled with invented text.

### Size reporting

The command prints before/after per file plus a total, and states growth as growth (`… chars added`)
instead of presenting negative savings. Normal apply proceeds only when the **combined** live
character count strictly decreases. Equal, growing, and identical proposals say
`No safe reduction found; files unchanged.` and create no archive, writer lock, temporary file, or
live-state write. One live file may grow when the combined total still falls; both file deltas are
reported honestly. A repeat writes nothing once no safe reduction remains — unless a later pass
exposes a block that then becomes archivable (see the container rule above; every such removal is
planned, reported and archived).

### Rollback limits

On a safe reduction, the exact original files are archived, read back, and hash-verified before
replacement. Source state is rechecked, workspace boundaries are enforced, and planning is repeated
under the workspace writer lock. Archive creation and both live replacements run inside the existing
in-process mutation transaction: a write failure restores original bytes, mode, and existence and
removes the new archive bundle. This is best-effort rollback plus per-file atomic rename — not a
crash-safe multi-file transaction. Do not run two writers against one workspace.
