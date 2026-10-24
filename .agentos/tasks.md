# Tasks

Active scope: AgentOS v1 (seven slices). Plan, decisions, evidence and backlog: `.agentos/plans/2026-10-25-v1-priorities.md`. Earlier task history (simplification audit, 0.4-0.9 releases): `.agentos/runs/2026-10-25-v1-slice1-history.md`.

## Done

- [x] Slice 1 on `feat/v1-cleanup` (pushed, PR #46): objective resolver parity in `prompt`; broken objective state fails `prompt`/`status`/`doctor` alike; `task_scope` read/edit contract; `doctor --fix` keeps `engines.allowed`; dead code removed with unused-code compiler flags on; docs facts tested against source. 631/631 tests.
- [x] Slice 2 on `feat/v1-context` (pushed, PR #47): read-only `agentos context` task-specific context builder (`src/context-builder.ts`). 647/647 tests.
- [x] Slice 3 on `feat/v1-checkpoint` (pushed, PR #48): `agentos checkpoint` / `resume` with immutable records, receipts and reconciliation (`src/checkpoint.ts`). 664/664 tests.
- [x] Slice 4 on `feat/v1-brain` (pushed, PR #49): managed Project Brain, `agentos brain …` (`src/brain.ts`). 680/680 tests.
- [x] Slice 5 on `feat/v1-agents`: agent manifests, lifecycle, engine capability matrix (`src/agents.ts`, `src/engines.ts`). 693/693 tests. Awaiting review; not pushed.

## Now

- [ ] Review slice 5; Phynceon's cross-engine trial (`docs/engines.md`) fills the verified column.

## Next

- [ ] Slice 6: optional Obsidian.
- [ ] Slice 7: v1 end-to-end validation.
- [ ] Upgrade-machinery deletion (0.10.0): GATED, owner decision.

## Later

- [ ] Improve Later backlog in the v1 plan file.
