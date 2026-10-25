# Tasks

Active scope: AgentOS v1 (seven slices) — complete pending owner review. Plan, decisions, evidence and completion statement: `.agentos/plans/2026-10-25-v1-priorities.md`. Slice 1–6 task list: `.agentos/runs/2026-10-25-v1-slice6-tasks.md`; earlier history: `.agentos/runs/2026-10-25-v1-slice1-history.md`.

## Done

- [x] Slices 1–6 (PRs #46–#51, stacked, not merged): cleanup, `agentos context`, `checkpoint`/`resume`, `agentos brain`, agent manifests + `agentos engines`, optional Obsidian. 699/699 tests at slice 6.
- [x] Slice 7 on `feat/v1-final`: trial defects D1–D3 fixed, trial-backed capability matrix, README v1 workflow, `docs/migration.md`, `docs/acceptance-matrix.md`, `docs/improve-later.md`, CHANGELOG v1 entry. 709/709 tests.
- [x] Closure (`71cdb19`): sibling-enumerated Claude deny rules, `--require-enforcement` hash check.
- [x] Closure 2 on `fix/v1-claude-deny-siblings`: `/*` removed, re-trials T6–T8 recorded (S19/S20/S22 PASS), `tools_requested` → Claude `tools:`.

## Now

- [ ] Phynceon: review and push the closure-2 commits on `fix/v1-claude-deny-siblings`.

## Next

- [ ] Owner: merge #46–#51 + the final PR in order; choose the version and release.
- [ ] Optional host re-trial: Claude subagent with a rendered `tools:` list.
- [ ] Upgrade-machinery deletion (0.10.0): GATED, owner decision.

## Later

- [ ] Optional refinements in `docs/improve-later.md`.
