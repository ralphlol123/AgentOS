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
| Requires review | no | yes (`--dry-run` then apply) |
| Reversible | n/a | archive holds the originals byte-for-byte |

## Conservative checkpoint (default)

```bash
agentos compact --dry-run
agentos compact
```

Archives the exact before/after text under `.agentos/runs/compact-archive-<sha256>.md`,
appends a relative link in each live file to its `previous-handoff` / `previous-tasks`
anchor, and changes nothing else. Unchanged repeats are write-free no-ops verified against
the full referenced archive. This mode never removes live prose: it cannot distinguish
historical narrative from a standing instruction, so it keeps everything and says so.

## Structural rewrite (`--rewrite`)

```bash
agentos compact --rewrite --dry-run                      # review; writes nothing
agentos compact --rewrite --objective <id>               # apply
agentos compact --rewrite --objective <id> --expect-state <sha256>
```

### What stays live, always

- The **selected objective**, with its original heading (including any date suffix).
- Scope, current state, next exact action, protected paths and constraints, known
  failures/warnings, and open decisions — under their canonical headings.
- **Every unfinished task**, with nested acceptance details, continuation paragraphs,
  code blocks, and links. A checked parent with an unchecked descendant keeps the whole
  block live.
- Every section the planner could not classify, verbatim, under `## Preserved context`.
- Standing constraints found inside archived history (`do not`, `never`,
  `must not`, `requires approval`, `before merging`, …), carried forward verbatim with a
  `## Preserved context` block that names their origin. A line qualifies only when it is a
  short directive (≤ 200 characters) or opens with the directive itself (≤ 600 characters):
  narrative paragraphs that merely mention a keyword are history, not constraints, and stay
  in the archive. The generated block is re-evaluated on every rewrite — lines that no longer
  qualify are dropped from live context (their originals remain in the archive), and an
  emptied block is removed.
- The existing `## Preserved context` and `## History` containers, re-emitted as-is
  (the rewrite never re-wraps its own output, so repeated runs are byte-stable).

### What moves to the archive

- Superseded objectives — only after an explicit objective selection resolves which one
  is live.
- Explicit history sections: `Previous …`, `Superseded …`, `Past …`, `Old …`,
  `Historic …`, `Archived …`, `Done`, `History`, `Run log`. Only when they contain no
  unchecked task block.
- Completed task sections (`## Done`).

Nothing else is removed, and nothing removed is lost: the archive holds the raw bytes.

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

Diagnostics run read-only after a changed apply. Canonical sections the source had no
material for are listed in the command output (`No live source section for: …`) and
omitted from the files rather than filled with invented text.

### Size reporting

The command prints before/after per file plus a total, and states growth as growth
(`… chars added`) instead of presenting negative savings. If nothing qualified for
archival it says so and calls the result a structural normalization. A repeated rewrite
of unchanged state writes nothing and adds no archive or link.

### Rollback limits

Archive creation and both live replacements run inside the existing in-process mutation
transaction: a write failure restores original bytes, mode, and existence, and removes the
new archive bundle. This is best-effort rollback plus per-file atomic rename — not a
crash-safe multi-file transaction and not protection against concurrent writers. Do not
run two writers against one workspace.
