# AgentOS v1 priorities — progress record

Started 2026-10-25 from `main` = `3c03372` (0.9.0). Branch `feat/v1-cleanup`. Philosophy: Build First → Validate Always → Improve Later: smallest end-to-end version that works, real checks, defects fixed now, refinements to the backlog below.

## Goal

Deliver a working v1 of the five AgentOS priorities — context builder, checkpoints, managed Project Brain, agent management, optional Obsidian — plus the correctness/cleanup fixes found in review.

## Slices

| # | Slice | Status |
|---|---|---|
| 1 | Baseline, review findings, correctness fixes + cleanup (section A) | Done on `feat/v1-cleanup`, awaiting review; not pushed |
| 2 | Context builder | Next |
| 3 | Checkpoints | Not started |
| 4 | Managed Project Brain | Not started |
| 5 | Agent management | Not started |
| 6 | Optional Obsidian | Not started |
| 7 | v1 end-to-end validation (title assumed; confirm against the slice 7 card) | Not started |

**Next exact action: slice 2, context builder.** Start from the shared pieces slice 1 left in place: `resolveObjective()` (`src/context-sections.ts`) is now the only objective reader for `prompt`/`status`/`doctor`/`compact`, and `validateTaskScope()` (`src/task-scope.ts`) is the scope contract the builder should render.

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

Host has no `bun`; every `bun run X` gate was run as `npm run X` (identical package.json scripts; none of them invoke bun).

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
- `task_scope` is read from project.yaml (one task at a time). A per-task scope (e.g. on `run` / a context-builder invocation) is the natural slice 2 extension; enforcement is prompt-level only, nothing blocks an engine from editing outside it.
- `task_scope` entries are not checked for existence (a path or repo ID that does not exist is accepted); add a doctor warning if it bites.
- Skill `--mode summary|full` and agent profile `minimal|detected` are equivalent aliases; a later release could deprecate one name of each pair (one-release notice first).
- `bun` is not installed on the Hermes host; gates run via npm there. Install bun or keep documenting the substitution.
- Deprecated migration writers: GATED (see finding 8).
- `core.ts` is ~4.9k lines; extract only along slice boundaries as later slices touch it.
