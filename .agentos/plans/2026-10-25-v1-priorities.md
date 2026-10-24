# AgentOS v1 priorities — progress record

Started 2026-10-25 from `main` = `3c03372` (0.9.0). Branch `feat/v1-cleanup`. Philosophy: Build First → Validate Always → Improve Later: smallest end-to-end version that works, real checks, defects fixed now, refinements to the backlog below.

## Goal

Deliver a working v1 of the five AgentOS priorities — context builder, checkpoints, managed Project Brain, agent management, optional Obsidian — plus the correctness/cleanup fixes found in review.

## Slices

| # | Slice | Status |
|---|---|---|
| 1 | Baseline, review findings, correctness fixes + cleanup (section A) | Done; reviewed, pushed to `origin/feat/v1-cleanup` (`78638c0`), PR #46 open, not merged |
| 2 | Context builder (`agentos context`, section B) | Done on `feat/v1-context` (stacked on `feat/v1-cleanup`), awaiting review; not pushed |
| 3 | Checkpoints | Next |
| 4 | Managed Project Brain | Not started |
| 5 | Agent management | Not started |
| 6 | Optional Obsidian | Not started |
| 7 | v1 end-to-end validation (title assumed; confirm against the slice 7 card) | Not started |

**Next exact action: slice 3, checkpoints** (after slice 2 review). Slice 2 left `buildContextBundle()` / `assertContextBundle()` (`src/context-builder.ts`) for any later slice that needs task context.

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
