# Checkpoints and resume

`agentos checkpoint` records where a task stands so that the same engine, another engine or a human can continue it. `agentos resume` reads the record back and reconciles it with the repos as they are now. Code: `src/checkpoint.ts` (wiring in `src/core.ts`).

```bash
agentos checkpoint --task token-rotation --engine claude --role developer \
  --progress "Rotation endpoint drafted" --blocker "Waiting on design" --next "Wire the settings page" \
  --check "npm run test" --cwd web --check "npm run build" --cwd web \
  --claim "manual login flow works"
agentos checkpoint --recover [--task <id>]      # engine stopped without a summary: git evidence only
agentos checkpoint list [--task <id>] [--json]  # read-only
agentos checkpoint show <id> [--json]           # read-only
agentos resume [--task <id>] [--engine <e>] [--json]   # read-only
```

`--dry-run` prints what would be recorded and writes nothing; it does not run `--check` commands (they are listed as `not-run`, note `dry run`).

## Task ids

Records are keyed by task id: the slug of `--task`, or, without `--task`, the slug of the first line of the current objective in `.agentos/handoff.md` (the output says which). `agentos context <engine> --task <id>` and `agentos resume --task <id>` find the same task.

## Files

```text
.agentos/checkpoints/<task>/<ISO-ts>-<hash8>.json   # one immutable record per checkpoint
.agentos/checkpoints/<task>/current.json            # pointer: {schema: "agentos.checkpoint-pointer/1", task, id, record, updated_at}
.agentos/checkpoints/<task>/evidence/<sha16>.log    # stdout/stderr of each --check, last 32 KiB per stream
.agentos/handoff.md                                  # one managed "## Checkpoint (managed)" section
```

The record id is `<created_at with : and . as ->-<first 8 hex of sha256 of the record body>`. Evidence logs are content-addressed. `tasks.md` is never touched.

## Record schema (`agentos.checkpoint/1`)

| Field | Content |
|---|---|
| `schema`, `id`, `created_at` | `"agentos.checkpoint/1"`, record id, ISO timestamp |
| `recovered` | `true` only for `--recover` records (and the read-only resume view) |
| `project` | `{name, root}` |
| `task` | `{id, source: "--task" \| "objective"}` |
| `run_id` | `$AGENTOS_RUN_ID` when set, else `null` |
| `engine`, `role` | normalized engine name or `null`; role from `--role` or `agents.capabilities.implementation` |
| `objective` | `{id, text}` from the same resolver as `status`/`doctor`/`context`, or `null` when it cannot be resolved |
| `acceptance` | `{source, text}` from `## Acceptance criteria` in tasks.md (else handoff.md), or `null` |
| `scope` | `{repos, read, edit}` as `agentos context` computes it (`task_scope`; no scope = read `.`, edit empty) |
| `repos[]` | `{name, path, worktree, available, reason?, branch, head, fingerprint, changed_paths, omitted_paths}` per repo in project.yaml |
| `state` | sha256 over every repo's name, availability, HEAD and fingerprint |
| `progress`, `blockers[]`, `next` | from `--progress`, `--blocker`, `--next` (`"(none recorded)"` when absent) |
| `knowledge_refs[]` | `{id, source}` of the decisions and linked notes `agentos context` selects for the task |
| `receipts[]` | see below |

`assertCheckpoint` (exported from `dist/checkpoint.js`) is the runtime contract; `resume`, `show`, `doctor` and `context` reject a record that fails it.

### Working-tree fingerprint

Per repo: sha256 over `git status --porcelain` (staged, unstaged and untracked, no branch line), the changed path names (`git diff --name-only`, `--cached`, and status), and `git diff --numstat HEAD` line counts. Git evidence comes from the same bounded collector as `agentos run handoff` (5 s and 1 MiB per git call), with its sensitive-path exclusions and `handoff.exclude_paths`: protected paths count in the fingerprint but are not listed in `changed_paths` (only `omitted_paths` counts them). Paths under `.agentos/` are AgentOS state, not engine work, and are left out, so a checkpoint's own writes are not drift. Limit: an edit that keeps a file's porcelain status and its added/removed line counts identical is not detected.

A repo path that is a directory inside an enclosing git work tree (for example `web/` and `api/` in a root repo — the layout of the 2026-10-25 engine trial) uses that work tree: `branch` and `head` are the enclosing repo's, every git call is limited to the directory by pathspec (`git status --porcelain -- web`, `git diff --name-only [--cached] -- web`, `git diff --numstat HEAD -- web`), `changed_paths` are relative to the directory, and the repo entry carries `state: "enclosing-worktree"` (the handoff line says `(enclosing work tree)`). Drift in `web/` therefore flags only `web`; a commit moves the shared HEAD, so every directory of that work tree reports `head_moved`. The sensitive-path exclusions and bounds are the same.

A repo whose path is missing, or is not inside any git work tree, is `available: false` with a `reason`.

## Receipts

`{status, command, cwd, exit_code, observed_at, evidence, state_tested, note?}`. The status vocabulary is exactly:

| Status | Meaning |
|---|---|
| `observed-pass` | AgentOS ran the `--check` and it exited 0 |
| `observed-fail` | AgentOS ran it and it exited non-zero, or was killed (10 min timeout) |
| `claimed` | `--claim "<text>"`: the engine says so; AgentOS observed nothing |
| `not-run` | a declared build/test/check/lint command of an in-scope repo that no `--check` ran (or any check under `--dry-run`) |
| `unavailable` | the check could not start (binary missing, not executable, `--cwd` missing) |

`--check` runs without a shell (`execFile`, quotes are honoured; no pipes, `&&`, globs or `$VARS`; wrap those in a script), in `--cwd` or the workspace root. `--cwd` is relative to the workspace root, never to the directory you run `agentos` from: from any subdirectory, no `--cwd` and `--cwd .` both mean the root, and `--cwd web` means `<root>/web`. An absolute `--cwd` inside the workspace is accepted and recorded workspace-relative (`--cwd "$PWD"` from `<root>/web` records `cwd: web`); one outside the workspace, or a relative one with `..`, is refused before anything runs, including with `--dry-run`. `state_tested` is the workspace `state` measured right before the check ran (for claims: at record time; `null` for `not-run`). `evidence` is the relative path of the saved output log.

## Writing and atomicity

`agentos checkpoint` takes the workspace writer lock (`.agentos-write.lock`); `--dry-run`, `list`, `show` and `resume` take no lock and write nothing. **One active writer per workspace; concurrent engines are not supported.**

Order inside one in-process mutation transaction: evidence logs, then the record (written to a temp file and linked into place, which refuses an existing name: records are immutable), then `current.json` (temp + rename via `writeFileAtomic`), then `handoff.md`. A record id that already exists is refused (exit 1, nothing written). An ambiguous handoff section (duplicate, reversed or embedded markers) is refused before any check runs.

What is NOT crash-safe: each file is replaced atomically, and an in-process failure rolls the earlier files back, but a crash or kill between files is not a transaction. It can leave a record without an updated pointer, a pointer to the previous record, or evidence logs without a record. `resume` reports such states as `incomplete` instead of guessing.

## handoff.md managed section

```text
<!-- agentos:checkpoint:start -->
## Checkpoint (managed)

- Task: …
- Record: `.agentos/checkpoints/<task>/<id>.json`
- Repos: web main@abc1234 (2 changed); api main@def5678 (0 changed)
- Progress: … (each text capped at 300 characters)
- Blockers: …
- Next: …
- Receipts: observed-pass N, observed-fail N, claimed N, not-run N, unavailable N
- Resume: `agentos resume --task …`
<!-- agentos:checkpoint:end -->
```

The block is replaced in place on every checkpoint (inserted once at the end of the file the first time); bytes outside it, the file's newline convention and a missing trailing newline are preserved. The marker lines follow the adapter managed-block rules (exact standalone lines, outside fences).

## Resume

`resume` loads `current.json`, recomputes every repo, and reports:

- **Status** `clean` (same HEAD, branch and fingerprint everywhere), `drifted` (per repo: `head_moved {from, to}`, `branch_changed`, `fingerprint_changed`, `new_changed_paths`, `resolved_paths`), or `unavailable` (a repo is missing or no longer a git work tree). Drift wins over unavailable for the overall status; each repo has its own.
- **Accomplished**: progress plus `observed-pass` receipts whose `state_tested` equals the current state.
- **Remaining**: next action, blockers, and every other receipt, explicitly: `observed-fail`, `claimed`, `not-run`, `unavailable`, and passes that are `stale (recheck)` because they tested a different state.
- **Next**: `agentos context <engine> --task <id>`.
- `incomplete` (exit 1): `current.json` missing while files exist, unreadable, pointing at a missing record, or a record that fails `assertCheckpoint`. The output lists the files present with sizes and the parse/contract error. Nothing is skipped silently.
- `recovered` (exit 0): no checkpoint yet, but `.agentos/runs/` has notes or a repo has changed files. The view is built from git evidence alone (`recovered: true`, progress `(unknown: engine stopped without a summary)`, next `(unknown)`, no receipts) and is not written; persist it with `agentos checkpoint --recover`.
- `none` (exit 0): no checkpoint and no evidence of work — a clean start (`Status: clean start — no checkpoint for task <id> …`). No prior work is invented; the output names the `context` command to start with.

`--json` prints the structured result only.

## Integrations

- Every non-recovered checkpoint output ends with the knowledge-review instruction (`Knowledge: did this work change durable project knowledge …? If yes, stage one focused proposal: \`agentos brain propose <record-id> --from <file> --task <id>\` … Progress only: stage nothing. Never run \`agentos brain apply\`: the owner applies with \`--by <owner>\`.`). It is an instruction the engine follows or not (an engine can still run `brain apply --by <name>`; the applier is then recorded in the record's `history`, see [`docs/brain.md`](brain.md)); the checkpoint itself never stages a proposal. Staging, evidence and dedupe: [`docs/brain.md`](brain.md#knowledge-upkeep-at-completion).
- `agentos context` adds the current checkpoint for its task (`--task`, else the objective slug) as an `always` record, source `.agentos/checkpoints/<task>/current.json`.
- `agentos doctor` reports a `current.json` that points at a missing or invalid record as a problem (exit 1).

## Not done (backlog)

Concurrent writers, a crash-safe multi-file transaction, and an evidence retention policy (records and logs accumulate; nothing prunes them).
