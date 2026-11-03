# State before the brain-ranking-stoplist-packing task

Archived verbatim before rewriting `.agentos/handoff.md` for task `brain-ranking-stoplist-packing` (branch `feat/brain-ranking-stoplist-packing`). Taken at `313107b` (`fix/context-budget-accounting`, PR #76). `.agentos/tasks.md` is unchanged by this task and is copied for completeness. The managed checkpoint block points at the `unify-current-task-state` record `2026-11-03T09-05-27-224Z-af1f3cdc`, which stays in `.agentos/checkpoints/unify-current-task-state/`.

## .agentos/handoff.md

````markdown
# Handoff

## Current objective

Every successful `agentos context` result fits its `--budget`: `ok:true` means `budget.estimate <= budget.limit`, and `overflow.needed` is the smallest budget that succeeds. Ranking, matching and `--about` semantics are out of scope and unchanged.

## Scope

- Repo: `agentos-for-projects`, single-repo workspace.
- Baseline: `f40626f` on main (PR #75 merged), package 3.2.0. Unreleased changes; no version bump or release is requested.
- Branch: `fix/context-budget-accounting`; task id: `context-budget-accounting`.
- Allowed changes: the context budget accounting (`src/context-builder.ts`, the advisory trailer in `src/engines.ts`, its wiring in `src/core.ts`), tests, docs/context-builder.md, CHANGELOG Unreleased and this repository's AgentOS state. Out of scope: ranking, scores, tie-breaks, matching, `--about`, the version bump.

## Current state

- `c768444`: RED test `test/context-budget-accounting.test.js` (2 tests). At `f40626f` both failed: at `--budget <needed>` the result was `ok:true` with estimate 3781 > limit 2863, and the estimate left out the ADVISORY lines (3866 vs 3964).
- `44a9582`: `needed` is now the estimate of the smallest full rendering (header, mandatory sections, every optional record listed as Omitted `budget`, Missing, Warnings, plus the engine's ADVISORY trailer from `advisoryTrailer` in src/engines.ts). The final loop drops optional records until the whole rendering fits and never returns `ok:true` over the limit (the old over-budget warning is gone). Selection order is unchanged. `budget.estimate` now counts the ADVISORY lines (`test/v1-slice2-context.test.js` estimate formula updated).
- `c0b1e75`: docs/context-builder.md § Budget (guarantee, what is and is not measured, real `needed`) and one CHANGELOG Unreleased `### Fixed` line.
- On AgentOS's own repo (claude-code, `--task split-core-into-modules`): B_min 3899 with `--about milestone`, 3901 without; B_min - 1 is OVERFLOW exit 1. No `ok:true` over limit in sweeps B_min..default size (step 10). At the default budget the rendered text, included and omitted lists are byte-identical to `f40626f`; only the reported estimate rises by the advisory (~99 tokens).
- Verification at `c0b1e75` (local WSL, npm): `npm run check` clean; `npm test` 830/830; `npm run smoke` exit 0; `npm run test:metadata` 3/3. Bun not run (not installed here).
- All commits are local; nothing pushed.
- Not counted in the estimate: the human `Budget:` footer line and the `--require-synced-config` status line (they report on the budget) and the JSON envelope.
- Previous state: `.agentos/runs/2026-11-03-before-context-budget-accounting.md`.

## Next exact action

Phynceon reviews the local commits on `fix/context-budget-accounting`, then pushes and opens the draft PR.

## Protected files / do not touch

- Secrets, .env files, migrations and production config.
- `.github/workflows/`, client workspaces, external Obsidian vaults and Hermes configuration.
- `package.json` version and CHANGELOG release headings (release PR).

## Open decisions

- Release version and merge remain separate from this implementation.
- Whether a tight budget should shorten the Omitted list (for example counts per reason) so more optional records fit. Not done here: the accounting fix alone makes the budget truthful and leaves the output format unchanged.

<!-- agentos:checkpoint:start -->
## Checkpoint (managed)

- Task: unify-current-task-state
- Record: `.agentos/checkpoints/unify-current-task-state/2026-11-03T09-05-27-224Z-af1f3cdc.json`
- Repos: agentos-for-projects feat/unify-current-task-state@a16062d (0 changed)
- Progress: Phase 1 (context): a checkpoint that saves --next records supersedes digests of handoff.md § Current state and § Next exact action; agentos context marks prose still matching as [superseded by checkpoint <id>] and keeps it as history. RED then GREEN in test/handoff-continuity.test.js (3 new tests).…
- Blockers: none
- Next: In src/core.ts statusAgentOS, print one 'Current next action' line from the newest .agentos/checkpoints/*/current.json record (by updated_at: task id, checkpoint id, its Next), and add a test in test/handoff-continuity.test.js that status shows that Next exactly once after a checkpoint while handof…
- Receipts: observed-pass 2, observed-fail 0, claimed 0, not-run 3, unavailable 0
- Resume: `agentos resume --task unify-current-task-state`
<!-- agentos:checkpoint:end -->
````

## .agentos/tasks.md

````markdown
# Tasks

## Now

- [ ] tasks.md § Now: mark items written before the checkpoint as superseded in `context` and in child-repo `status` ("Open tasks (Now)") (task id `unify-current-task-state`).

## Acceptance criteria

- After `agentos checkpoint --task <id> --next "<action>"`, `agentos status`, `agentos context <engine> --task <id>` and `agentos resume --task <id>` present exactly one current next action: the most recently saved one.
- Older or contradicting next-action text in handoff.md or tasks.md is not presented as current; the next agent can tell it is superseded.
- Nothing is silently deleted.

## Next

- [ ] Next-action truncation in the managed handoff block (300 characters) and `status` across several tasks: tracked separately.

## Later

- [ ] Body-text retrieval beyond Brain records: `brain search` and `decisions.md` section bodies (`context --about` covers Brain record bodies; the task id stays separate from the phrase).
- [ ] Make the default Obsidian layout expose the actual Brain records.
````
