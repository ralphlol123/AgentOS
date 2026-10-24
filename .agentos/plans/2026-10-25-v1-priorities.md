# AgentOS v1 priorities — progress record

Started 2026-10-25 from `main` = `3c03372` (0.9.0). Branch `feat/v1-cleanup`. Philosophy: Build First → Validate Always → Improve Later: smallest end-to-end version that works, real checks, defects fixed now, refinements to the backlog below.

## Goal

Deliver a working v1 of the five AgentOS priorities — context builder, checkpoints, managed Project Brain, agent management, optional Obsidian — plus the correctness/cleanup fixes found in review.

## Slices

| # | Slice | Status |
|---|---|---|
| 1 | Baseline, review findings, correctness fixes + cleanup (section A) | Done; reviewed, pushed to `origin/feat/v1-cleanup` (`78638c0`), PR #46 open, not merged |
| 2 | Context builder (`agentos context`, section B) | Done; reviewed, pushed to `origin/feat/v1-context` (`ca527fb`), PR #47 (stacked on #46), not merged |
| 3 | Checkpoints and resume (section C) | Done; reviewed, pushed to `origin/feat/v1-checkpoint` (`2e3374b`), PR #48 (stacked on #47), not merged |
| 4 | Managed Project Brain (section D) | Done on `feat/v1-brain` (stacked on `feat/v1-checkpoint`), awaiting review; not pushed |
| 5 | Agent management | Not started |
| 6 | Optional Obsidian | Not started |
| 7 | v1 end-to-end validation (title assumed; confirm against the slice 7 card) | Not started |

**Next exact action: review slice 4, then slice 5 (agent management).** Slice 2 left `buildContextBundle()` / `assertContextBundle()` (`src/context-builder.ts`); slice 3 left `assertCheckpoint()`, `loadCurrent()` and `workspaceState()` (`src/checkpoint.ts`); slice 4 left `loadBrain()`, `parseRecord()`, `patchFrontmatter()`, `brainContextRecords()` (`src/brain.ts`) and the shared matcher `taskTerms()` / `termHits()` / `subjectOf()` (`src/context-builder.ts`). Slice 6 (Obsidian) can build on `loadBrain`/`patchFrontmatter`: storage is plain Markdown + frontmatter with workspace-relative paths, no engine-specific code.

## Slice 4 — managed Project Brain

`agentos brain init|register|list|show|search|propose|preview|validate|apply|check|verify`. Module `src/brain.ts`; `core.ts` gained only wiring (`brainAgentOS`, `BRAIN_USAGE`, `brainScopes`, Brain records into `contextInputFor`, the doctor check) and an export of `removeTracked`. `context-builder.ts` exports its matcher (`taskTerms`, `termHits`, `subjectOf`) instead of having `brain search` fork it, and accepts `brain` records as candidates. `checkpoint.ts` lists included Brain records as `knowledge_refs`. Contract and limits: `docs/brain.md`.

Decisions taken in this slice (assumptions, revisit in review):

- Records are discovered by a bounded workspace walk for `.md` files whose frontmatter has `id: brain:…`; the frontmatter is authoritative and `index.json` is derived (regenerated on every brain write, never read). No separate registry file.
- `source_hash` = sha256 of the body only (bytes after the closing `---`), so frontmatter edits never change it; an unclosed or unparsable block makes the record `invalid`.
- Allowed frontmatter keys: the metadata set plus `title`, `date`, `tags`, `aliases` (descriptive, common in ADR/Obsidian notes). Everything else is refused (register) or `invalid` (check).
- `id` = `brain:<file-name slug>`, falling back to the path slug on a clash; an existing `id` is kept. `sources` must include the file itself (a moved/copied file is `invalid`).
- `register` default status `accepted` (an existing project-owned file), `--status proposed` or `--by <name>` (→ `verified`). Conflicts are reported only for values given explicitly or for `sources`/`source_hash`; existing values are always kept and the command exits 0.
- `init` refuses (exit 1, zero writes) when any template file exists; templates are `status: proposed`; glossary uses kind `note`.
- Proposals: `mode: replace|append` (`--append`), content without frontmatter, `--supersedes` takes one or more ids. `propose` runs `validate` and does not write a rejected proposal. Proposal files are `<ISO-ts>-<slug>.md`, written exclusively.
- Stale = `base_hash` ≠ target `source_hash`, **or** target body ≠ its `source_hash` (a human edit since verification) — otherwise apply would silently overwrite the human edit.
- Duplicate = whitespace-normalized proposal text equals the target body (replace) / is contained in it (append) / equals another record's body.
- Conflict flag = another `accepted`/`verified` record of the same kind with the same `subjectOf(title)`; title = frontmatter `title`, else first H1, else file name.
- Context renders Brain records by reference (no body text) with `Source: <path>`; proposed records get a 0.5 rank penalty so they sort below accepted/verified records with the same matches.
- `doctor`: `changed` → warning, `invalid` → problem. `brain check` exits 1 only on `invalid`.
- `verify` sets `status: verified` unless the record is superseded; `apply` leaves an earlier `verified_at/by` in place (history shows the newer apply).

## Slice 4 — acceptance evidence

| Command | Where | Exit | Result |
|---|---|---|---|
| `npm test` | `feat/v1-brain` start (= `2e3374b`) | 0 | 664 / 664 (slice 3 final) |
| `node --test test/v1-slice4-brain.test.js` (RED, no `brain` command) | before implementation | 1 | 16 tests, 0 pass, 16 fail (`Unknown command: brain` / `Unknown option: --kind`) |
| same, stale check disabled in dist | fault injection | 1 | 2 fail: stale after first apply, stale after human edit |
| same, duplicate check disabled in dist | fault injection | 1 | 1 fail: duplicate test |
| same, `apply` ignoring rejections in dist (no-write-on-invalid) | fault injection | 1 | 2 fail: both stale tests (tree snapshot changed) |
| `test/boundaries.test.js` with two `.agentos/brain` cases (init, register), boundary check removed from dist | fault injection | 1 | 1 fail |
| `npm run check` | final | 0 | |
| `npm test` | final | 0 | 680 / 680 (664 + 16 in `test/v1-slice4-brain.test.js`; two boundary cases added to an existing test) |
| `npm run smoke` | final | 0 | |
| `node dist/cli.js doctor --json` | final | 0 | `"ok": true`, `problems: []` |
| dogfood on a fresh fixture (`/tmp/s4-dogfood`): init, register ×2, propose ×2, preview, apply, re-apply, validate/apply the stale one, duplicate propose, check, list, context, status, compact --dry-run, doctor | `/tmp/s4-dogfood` | 0 / 1 as expected | re-register and re-apply print no-op; stale validate/apply exit 1 printing both hashes, "Nothing was written."; duplicate propose exit 1; context lists `## Brain (adr, accepted): …` with `Source: docs/adr/…`; frontmatter on `.agentos/decisions.md` leaves status/compact/context working; doctor ok |

## Slice 3 — checkpoints and resume

`agentos checkpoint [--task] [--engine] [--role] [--progress] [--blocker] [--next] [--check "<cmd>" [--cwd <dir>]]... [--claim]... [--json] [--dry-run]`, `checkpoint --recover`, `checkpoint list|show`, `agentos resume [--task] [--engine] [--json]`. Module `src/checkpoint.ts`; `core.ts` gained wiring (`checkpointAgentOS`, `resumeAgentOS`, `checkpointContextFor`, the doctor check), exports of four existing write/marker helpers, and `contextInputFor` extracted from `contextAgentOS` (context output unchanged except the new checkpoint record). Contract and limits: `docs/checkpoints.md`.

Decisions taken in this slice (assumptions, revisit in review):

- Task id = slug of `--task`, else slug of the first line of the resolved objective (the heading suffix when it carries text). Without either, `checkpoint` exits 1 and asks for `--task`.
- The record id is `<ISO-ts>-<sha256(record body)[:8]>`: same content at the same millisecond is the same record and is refused. Records are linked into place from a temp file (`writeFileExclusiveAtomic`, link = no-clobber rename); `current.json` and `handoff.md` use `writeFileAtomic`; all inside one mutation transaction.
- Fingerprint = sha256 over porcelain status (no branch line), changed names and `git diff --numstat HEAD`; `.agentos/` paths are excluded because the checkpoint writes there (a single-repo workspace that tracks `.agentos/` would otherwise always be drifted; regression test added).
- `not-run` receipts come from declared `*build*|*test*|*check*|*lint*` commands of in-scope repos that no `--check` ran (and every check under `--dry-run`, which runs nothing).
- `--check` runs via `execFile` without a shell (quoted argv split); spawn errors are `unavailable`, non-zero exits and timeouts (10 min) are `observed-fail`. Output is kept as a content-addressed log, last 32 KiB per stream.
- Stale receipts (tested state ≠ current state) are listed under Remaining as `stale (recheck)`, even passes; only current passes count as accomplished.
- Overall resume status: drifted > unavailable > clean. `incomplete` and `none` exit 1; `recovered` (no record, but run notes or changed files) exits 0 and writes nothing.
- The handoff section uses its own markers (`<!-- agentos:checkpoint:start/end -->`) with the adapters' `locateManagedBlock` rules; it is inserted once at the end of the file and replaced in place afterwards.
- `run_id` is `$AGENTOS_RUN_ID` or null (AgentOS has no run concept yet).

## Slice 3 — acceptance evidence

| Command | Where | Exit | Result |
|---|---|---|---|
| `npm test` | `feat/v1-checkpoint` start (= `ca527fb`) | 0 | 647 / 647 (slice 2 final) |
| `node --test test/v1-slice3-checkpoint.test.js` (RED, no `checkpoint` command) | before implementation | 1 | 16 tests, 0 pass, 16 fail (`Unknown option: --progress`) |
| same, record overwrite allowed in dist (item 3) | fault injection | 1 | 1 fail: immutability test |
| same, missing `current.json` treated as "no checkpoint" (item 3) | fault injection | 1 | 1 fail: interruption test |
| same, block appended instead of replaced (item 4) | fault injection | 1 | 1 fail: five-checkpoints section-size test |
| same, stale flag disabled (item 5) | fault injection | 1 | 1 fail: drift test |
| same, untracked files ignored by the fingerprint (item 5) | fault injection | 1 | 3 fail: record shape, recovery, drift |
| same, `.agentos/` counted as drift (item 5) | fault injection | 1 | 1 fail: single-repo clean test |
| `test/boundaries.test.js` symlinked-managed-target table with `.agentos/checkpoints` case, boundary check removed from dist | fault injection | 1 | 1 fail |
| `npm run check` | final | 0 | |
| `npm test` | final | 0 | 664 / 664 (647 + 17 in `test/v1-slice3-checkpoint.test.js`; boundaries case added to an existing test) |
| `npm run smoke` | final | 0 | |
| `node dist/cli.js doctor --json` | final | 0 | `"ok": true`, `problems: []` |
| dogfood in a throwaway clone of this repo (`/tmp`): checkpoint with 2 checks + 1 claim, resume, edit README, resume, `compact`, checkpoint, doctor | `/tmp/cp-dogfood2` | 0 | clean → drifted (`new changed paths: README.md`, pass marked stale); 3 declared `bun run` commands listed `not-run`; after `compact` the next checkpoint still found and restored its block; doctor OK |

## Slice 2 — context builder

`agentos context <engine> [--task] [--role] [--scope] [--budget] [--json] [--include-superseded]`, read-only. Builder in `src/context-builder.ts`; `core.ts` only gained `contextAgentOS` wiring plus two extractions that keep `prompt` byte-identical (`PROMPT_RULES`, `promptHeaderLines`). Contract, selection signals and budget numbers: `docs/context-builder.md`.

Decisions taken in this slice (assumptions, revisit in review):

- `--scope` replaces the read scope and keeps only the `task_scope.edit` entries it still covers; with no scope at all, read is the whole workspace and edit is empty (warning). Edit is never widened.
- A path inside a repo (e.g. `api/contracts/openapi.yaml`) is included as a `read:<path>` reference but does not bring that repo's note or verification commands into scope.
- `--role` not in `agents.enabled` is an error (exit 1); an enabled role whose card file is missing is a `missing` warning. Default role: `agents.capabilities.implementation`.
- "Generated rules block" = the `prompt` rules line + engine-specific rule lines + the Obsidian link-only line.
- Budget default 24000 for every engine; overhead constants claude-code/hermes 2000, codex/opencode 1500, other 1000 — unmeasured assumptions.
- Optional records stop at the first that does not fit (predictable, not bin-packed).
- Skills, linked notes and read paths are rendered by reference; skill cards and the vault are not read.
- Dogfood found that the word "decision" in a task matched every decision through its `decision:` id prefix; the prefix is now excluded from matching (regression in the first test).

## Slice 2 — acceptance evidence

| Command | Where | Exit | Result |
|---|---|---|---|
| `npm test` | `feat/v1-context` start (= `78638c0`) | 0 | 631 / 631 |
| prompt golden capture (`claude`, `codex`, `opencode`, `hermes`, `generic` × 3 slice-1 fixtures) | `78638c0` dist | 0 | 15 outputs → `test/fixtures/prompt-golden-v1-slice1.json` |
| `node --test test/v1-slice2-context.test.js` (RED, no `context` command) | before implementation | 1 | 16 tests, 1 pass (prompt golden guard), 15 fail (`Unknown option: --task`) |
| same, scope filter disabled in dist (item 3) | fault injection | 1 | 2 fail (out-of-scope test, `--scope` narrowing test) |
| same, overflow check disabled in dist (item 5) | fault injection | 1 | 2 fail (overflow test, no-mutation test's overflow mode) |
| same, a `writeFile` injected into the builder (item 7) | fault injection | 1 | 1 fail: tree diff shows `ws/.agentos/.context-cache` |
| same, `decision:` prefix matching (dogfood bug) | before fix | 1 | 1 fail |
| `node --test --test-name-pattern="docs state" test/v1-slice1.test.js` with the old memory.md | before docs update | 1 | `context` missing from the command list |
| `npm run check` | final | 0 | |
| `npm test` | final | 0 | 647 / 647 (631 + 16 in `test/v1-slice2-context.test.js`) |
| `npm run smoke` | final | 0 | |
| `node dist/cli.js doctor --json` | final | 0 | `"ok": true`; warnings: uncommitted changes (before commit), no upstream |
| `node dist/cli.js context claude --task "obsidian link-only knowledge decision"` | this repo | 0 | 11 included (4 mandatory, the Obsidian decision ranked first), 20 omitted, estimate 3980 of 24000 |

## Slice 1 — findings

| # | Finding | Result | Evidence |
|---|---|---|---|
| 1 | `prompt` read the objective with `extractSection(handoff,'Current objective')`, not `resolveObjective()` | Reproduced, fixed | On `3c03372`, a `## Current objective — 2026-09-15 (latest): …` heading printed `Current objective: (none)` while `status`/`doctor` exited 0. Now prints `Current objective: 2026-09-15 (latest): ship the parser Merge the AUM work.` |
| 2 | Missing / empty / duplicate objective headings | Reproduced for `prompt` only; `status` and `doctor` already exited 1 with the resolver diagnostic on `3c03372` | On `3c03372`: prompt exit 0 with `(none)` for all three. Now prompt exits 1, prints `AgentOS prompt: NEEDS ATTENTION` + the same diagnostic as status/doctor, and no paste-ready prompt |
| 3 | No separation between repo inventory, read scope and edit scope | Reproduced (no such contract existed), added | `src/task-scope.ts` `validateTaskScope()`; optional `task_scope: {read, edit}` in project.yaml; `prompt` prints `Repos (inventory, not permission)`, `Read scope`, `Edit scope`; `prompt`/`doctor` fail on malformed scope. No `task_scope` = unchanged prompt |
| 4 | `doctor --fix` appended `opencode` to a user-limited `engines.allowed` | Reproduced, fixed | On `3c03372`, `engines.allowed: [claude-code]` became `[claude-code, opencode]` after `doctor --fix`; now byte-identical. `ensureProjectYamlEngine` removed; the doctor warning stays informational. Three existing tests that encoded the old behaviour were rewritten (core, no-engine-stubs, project-yaml-fidelity) |
| 5 | Dead code | Confirmed unused, removed | `sectionLines`, `appendUniqueTask`, `clipText`, `escapeRegex` (only their definitions matched grep), unused `writeFile` import, unused params `id` (agentTemplateContent), `abs` (checkUntrackedAdapters), `workspaceKind`/`repos` (plannedFiles). `tsc --noUnusedLocals --noUnusedParameters` reported 9 errors before, 0 after; both flags are now on in `tsconfig.json` |
| 6 | Skill `summary`/`full`, agent `minimal`/`detected` | Already equivalent; pinned | Built-in skills differ only in the `mode:` frontmatter line (`renderSkillTemplate`, pinned by `catalog-parity.test.js`). `detectedSpecialistIds()` returns `[]`, so `detected` enables the same team as `minimal`; new test proves the generated project.yaml differs only in the `profile:` label. Docs already state both. Imported-source modes untouched |
| 7 | Docs truth | Fixed + tested | `docs/release-readiness.md` said `version: 0.3.0` (now tested against package.json); `.agentos/memory.md` listed 7 commands (now the 16 `cli.ts` handles, tested against `cli.ts`); README documents `task_scope` and that `doctor --fix` never edits `engines.allowed`. No role count is stated in README/docs, so none to test |
| 8 | Deprecated migration writers | **GATED** — not touched | Gate (old handoff "Open decisions" / "Next exact action" 1, copied to `.agentos/runs/2026-10-25-v1-slice1-history.md`): delete in 0.10.0 only after 0.9.0 has been out a few weeks, the npm download split is re-checked, the read-only `migration` inventory is kept, and the owner decides. Not met: 0.10.0 is not scheduled and no owner decision exists. Paths: pre-managed-block adapters + `--adopt-custom-adapters`, retired pre-0.4.0 cards + `--prune-retired`, `--normalize-repo-ids`, `agentos migrate claude` |

## Slice 1 — acceptance evidence

The developer sandbox has no `bun` on PATH (bun is installed on the host); every `bun run X` gate was run as `npm run X` (identical package.json scripts; none of them invoke bun).

| Command | Where | Exit | Result |
|---|---|---|---|
| `npm run check` | `3c03372` | 0 | |
| `npm test` | `3c03372` | 0 | 620 tests, 620 pass |
| `npm run smoke` | `3c03372` | 0 | |
| `node dist/cli.js doctor --json` | `3c03372` | 0 | `"ok": true`, 1 warning (no upstream) |
| `node --test test/v1-slice1.test.js` against `3c03372` dist (RED) | `3c03372` | 1 | 9 tests, 1 pass, 8 fail (items 1, 2×3, 3×3, 4; the pass is the "no task_scope → no scope lines" guard) |
| `tsc --noEmit --noUnusedLocals --noUnusedParameters` | `3c03372` | 1 | 9 errors |
| `npm run check` | final | 0 | flags on, 0 unused |
| `npm test` | final | 0 | 631 tests, 631 pass (620 + 11 in `test/v1-slice1.test.js`) |
| `npm run smoke` | final | 0 | |
| `node dist/cli.js doctor --json` | final | 0 | see handoff |

## Improve Later backlog

- The doctor warning `engines.allowed does not list opencode` is informational noise for owners who limited engines on purpose; consider dropping it or phrasing it as a note.
- `task_scope` is read from project.yaml (one task at a time). Slice 2 added a per-invocation narrowing (`agentos context --scope`); enforcement is still prompt-level only, nothing blocks an engine from editing outside it.
- `task_scope` entries are not checked for existence by `doctor` (a path or repo ID that does not exist is accepted); `agentos context` lists a missing scope path under `missing`. Add a doctor warning if it bites.
- Skill `--mode summary|full` and agent profile `minimal|detected` are equivalent aliases; a later release could deprecate one name of each pair (one-release notice first).
- `bun` is not on the Hermes developer sandbox PATH (it is installed on the host); gates run via the identical `npm run` scripts in the sandbox.
- Context builder relevance ranking refinements: plain term overlap today (trailing-`s` stemming only, headings/IDs/paths, no body text, no synonyms); consider weighting, body matches and role-aware skill selection once real tasks show misses.
- Context builder semantic dedup: records that repeat each other (repo note vs verification commands, handoff state vs objective) are both included.
- Context builder per-engine overhead measurement: the 2000/1500/1000 overhead constants are assumptions; measure real engine bootloader/system-prompt cost and replace them.
- Context builder: `.agentos/guide.md` (generated) does not mention `agentos context` yet; adding it changes the adapter generator and requires `doctor --fix` in every workspace, so it waits for a release slice.
- Context builder: repo-in-scope is "a read entry covers the whole repo" (root repo special-cased); nested child repos would need a repo tree.
- Deprecated migration writers: GATED (see finding 8).
- `core.ts` is ~4.9k lines; extract only along slice boundaries as later slices touch it.
- Checkpoints: concurrent writers are not supported (one writer lock per workspace; two engines checkpointing the same workspace serialize or fail on the lock).
- Checkpoints: no crash-safe multi-file transaction. Per-file atomic writes plus in-process rollback only; a crash between the record and `current.json` is reported by `resume` as `incomplete`, not repaired.
- Checkpoints: receipt evidence retention policy. Records and evidence logs accumulate under `.agentos/checkpoints/`; nothing prunes or archives them, and they are not gitignored by default.
- Checkpoints: the fingerprint misses an edit that keeps a file's status and its added/removed line counts identical; hashing diff content would close it at a cost.
- Checkpoints: `agentos compact` treats `## Checkpoint (managed)` as an unclassified section and demotes it under `## Preserved context` (markers kept); the next checkpoint restores it. Teach compact to leave the managed block alone.
- Checkpoints: the start marker line sits at the end of the previous handoff section's body, so that section's text (e.g. in `agentos context`) ends with the marker comment. Cosmetic.
- Checkpoints: `--check` has no shell (no pipes/`&&`); `execFile` of `npm` on Windows needs `npm.cmd`. Untested on Windows.
- Checkpoints: `.agentos/guide.md` does not list `checkpoint`/`resume` yet (same generator constraint as `context`).
- Brain: semantic dedup and conflict detection (today exact normalized text and the heading-subject heuristic).
- Brain: cross-file refactor of `.agentos/decisions.md` into per-record files (today it is one record; the context builder still reads it per heading).
- Brain: automatic proposals (e.g. from checkpoints or run notes); today an engine writes every proposal by hand.
- Brain: every read walks the workspace; use `index.json` as a validated cache if large monorepos make it slow.
- Brain: `apply` keeps an earlier `verified_at/by` after new content is accepted; consider clearing them (history already shows the order).
- Brain: `.agentos/guide.md` does not list `brain` yet (same generator constraint as `context`).
- Brain: record files are discovered only directly by frontmatter; a Markdown file with `id: brain:` copied from elsewhere becomes a record (reported `invalid` if its `sources` does not list it).
