# Compaction

AgentOS keeps live context in two files: `.agentos/handoff.md` and `.agentos/tasks.md`.
Both grow without bound in a long-lived workspace, because every session appends a new
objective, state block, or history entry. There are two ways to deal with that, and they
have different guarantees.

| | `agentos compact` | `agentos compact --rewrite` |
| --- | --- | --- |
| Kind | archival checkpoint | structural rewrite |
| Live bytes | retained verbatim, plus one archive link per file | rebuilt in canonical form |
| Reduces live size | no (it can grow it) | yes, when history exists |
| Requires review | no | yes (`--dry-run`, optionally `--diff`, then apply) |
| Reversible | n/a | archive holds the originals byte-for-byte |

## Conservative checkpoint (default)

```bash
agentos compact --dry-run
agentos compact --dry-run --diff   # include the proposed patch; still writes nothing
agentos compact
```

Archives the exact before/after text under `.agentos/runs/compact-archive-<sha256>.md`,
appends a relative link in each live file to its `previous-handoff` / `previous-tasks`
anchor, and changes nothing else. Unchanged repeats are write-free no-ops verified against
the full referenced archive. This mode never removes live prose: it cannot distinguish
historical narrative from a standing instruction, so it keeps everything and says so.

## Structural rewrite (`--rewrite`)

```bash
agentos compact --rewrite --dry-run                      # concise review; writes nothing
agentos compact --rewrite --dry-run --diff               # detailed patch; writes nothing
agentos compact --rewrite --objective <id>               # apply
agentos compact --rewrite --objective <id> --expect-state <sha256>
```

Dry runs are concise by default: they report mode, sizes, classification counts, missing-section
counts, and the files that would be archived or rewritten, but do not print complete proposed
file bodies. Library callers still receive the exact proposals and structured classification in
the result object. Add `--diff` to either compact mode for a unified diff with stable LF output;
Unicode content and CRLF inputs are preserved in the comparison. `--diff` is preview-only: it is
accepted only with `compact --dry-run` (with or without `--rewrite`), and `--diff=false` leaves the
concise default active. An unchanged proposal says so without emitting empty patch headers.

A rewrite diff also prints the source-state hash and the matching `--expect-state` apply command.
If ambiguity blocks the rewrite, the concise candidate list is still shown, no proposed bodies or
patch headers are emitted, and the output states that the detailed diff is unavailable because
compaction is blocked. Every dry-run form is read-only across the whole workspace tree.

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
  `## Preserved context` block that names their origin. A line qualifies only when it is short
  (≤ 200 characters) or opens on the directive itself (≤ 600 characters): narrative paragraphs
  that merely mention a keyword are history, not constraints, and stay in the archive.
  Qualifying is also a matter of **shape**, because reclaiming a history block hands this rule
  every soft-wrapped line of it — a line that merely *starts* with `never` because the previous
  line ended mid-sentence is prose, not an instruction. So a carried line must open on an
  uppercase character; must be either an explicit obligation or a sentence ending in `.`/`!`/`?`;
  and must not trail off on a function word (`… and the note said the`) or an unclosed
  parenthesis. An explicit obligation is a line that opens on the directive, or that states a
  subject followed within six words by `must`, `must not`, `must never`, `do not`, `don't`,
  `requires`, `is required`, `are required`, `without approval` or `only with approval` — as in
  `Migrations must not be edited in place` or `The production database in staging must never be
  synced from dumps`. That window is a heuristic, not a parser: an obligation phrased after its
  subject is capped at the prose length rather than the directive length, and a line that opens
  as an obligation and then continues as reported speech (`Guards must not be relied on here,
  the ticket explained …`) will be carried. Two further limits are deliberate, and such a line
  stays in the archive rather than being re-injected: a line that opens on a code span is read as
  a continuation of the previous line, and a line ending on a conjunction is read as truncated.
  On the real workspace that produced this rule, one archived block went from 22 carried lines
  to the 3 genuine directives.
  The generated block is re-evaluated on every rewrite — lines that no longer
  qualify are dropped from live context (their originals remain in the archive), and an
  emptied block is removed. Constraint lines carried out of newly archived nested history
  extend that block rather than creating a second one, and the merge ignores fenced samples.
  (Re-filtering a block that is already in the file is still not fence-aware — a fenced sample
  quoting that heading is a known follow-up, not a guarantee.)
- The existing `## Preserved context` and `## History` containers. The container's own body is
  re-read on every run — a nested history block that an earlier build demoted to a `###`
  heading there is classified again and becomes archivable — while every block not nested
  inside an archived one is re-emitted unchanged (block separators are normalized to a single
  blank line). The rewrite never re-wraps its own output, and a container with nothing left in
  it is dropped rather than emitted empty. A repeat run rewrites nothing once no further block
  becomes archivable — but in a hand-edited container whose shallowest nested block is not
  itself archivable (a deeper block above a later sibling, or a machine-generated
  `### Constraints carried forward from archived history` block that re-filtering removes),
  blocks beneath it can become the shallowest heading, and archivable, only on a later pass;
  or they can simply stay live. Nothing is lost either way: every pass is planned, reported and
  archived.

### What moves to the archive

- Superseded objectives — only after an explicit objective selection resolves which one
  is live.
- Explicit history sections: `Previous …`, `Superseded …`, `Past …`, `Old …`,
  `Historic …`, `Archived …`, `Done`, `History`, `Run log`. Only when they contain no
  unchecked task block.
- Completed task sections (`## Done`).
- History nested inside `## Preserved context` — the shape an earlier build produced when it
  demoted an unclassified section to `###`. A nested block is archivable only when its heading
  is explicit history and neither it nor any deeper block beneath it holds an unchecked task.

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

A blocked rewrite proposes no live files at all — it is a refusal, not a partial plan.

### Heading variants

`## Current objective — 2026-09-15 (latest): AUM work merged` is recognized as the
objective section, and its inline text counts as objective content. Recognition requires a
documented delimiter (em dash, en dash, spaced hyphen, or colon), so `## Previous
objective`, `## Current objectives backlog`, and `## Notes about Current objective` are
never matched. Content inside fenced code blocks is never treated as a heading. `doctor`
reports missing, empty, and duplicate objective headings separately, always with line
numbers, and never rewrites state from a diagnostic.

### Doctor after a rewrite

```bash
agentos doctor
agentos doctor --json
```

Diagnostics run read-only after a changed apply. In a concise preview, canonical sections for
which the source had no material are reported as a count; library callers can inspect the exact
names in the structured `missing` field. Missing sections are omitted from the files rather than
filled with invented text.

### Size reporting

The command prints before/after per file plus a total, and states growth as growth
(`… chars added`) instead of presenting negative savings. If nothing qualified for
archival it says so and calls the result a structural normalization. A repeated rewrite
of unchanged state writes nothing and adds no archive or link — unless a later pass exposes a
block that then becomes archivable (see the container rule above; every such removal is planned,
reported and archived).

### Rollback limits

Archive creation and both live replacements run inside the existing in-process mutation
transaction: a write failure restores original bytes, mode, and existence, and removes the
new archive bundle. This is best-effort rollback plus per-file atomic rename — not a
crash-safe multi-file transaction and not protection against concurrent writers. Do not
run two writers against one workspace.
