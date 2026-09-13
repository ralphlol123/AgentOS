# Tasks

Active scope: catalog cleanup slice 1 in `/home/hermes/agentos-catalog-cleanup` on `feat/catalog-cleanup`. Earlier milestones and follow-ups below are historical, not authorization to edit client workspaces or resume other tasks.

## Done

- [x] Engine Run Handoff Notes first implementation completed on `feat/engine-run-handoff-notes`: `agentos run handoff`, grounded handoff notes, state updates, docs, and tests.
- [x] Grilled and updated Worktrees Optional + Installation Wizard plan in `.agentos/plans/2026-08-10-worktrees-optional-install-wizard.md` plus Obsidian `Projects/AgentOS/Plans/2026-08-10/worktrees-optional-install-wizard.md`.
- [x] Phase 1 agent model shipped and pushed.
- [x] Photobooth rollout to detected profile + on-demand skills verified.
- [x] `agentos run` Phase 2 placed on hold per Ralph.
- [x] Template registry polish merged.
- [x] Import safety hardening merged.
- [x] Generalized Ralph's KargaX commit workflow into reusable `conventional-commit` skill template.
- [x] Packed installed CLI smoke passed for `conventional-commit` template and `github-pack` inclusion.
- [x] PR #6 merged `feat/conventional-commit-skill-template` into `main`.
- [x] Local cleanup completed: checked out updated `main` and deleted the merged local feature branch.
- [x] Built and merged AgentOS `0.2.0`: Obsidian workspace-folder support, `agentos skills remove`, and CLI package-version source of truth.
- [x] Recorded and pushed roadmap item for subrepo-launched engine access to AgentOS skills.
- [x] Built `feat/subrepo-engine-skill-access`: child repo pointers now direct OpenCode/Codex/Hermes/Claude to parent `.agentos/skills.md` and engine adapters; `doctor` reports stale child pointers and `doctor --fix` repairs them; version bumped to `0.3.0`.

## Reliability improvement slices

- [x] Task 1: fail closed on invalid project config; merged as PR #13.
- [x] Task 2: filesystem boundary containment; 91 tests passed; merged as PR #14 (`a21c718`).
- [x] Task 3: atomic state writes and best-effort command rollback implemented with Claude Code on `fix/atomic-state-writes`; 18 focused tests and 109 full tests pass; final independent review PASS. Branch delivery is via PR; merge pending.

## Now

- [x] Implement slice 1 only: canonical package-owned templates, complete summary/full workflows, matching add/copy/init role contracts, public ID/path preservation, custom-card safeguards, and test-first parity regressions.
- [x] Verify build/check, 260 full tests, disposable CLI smoke, existing npm/pnpm/Bun packaged regression checks, and diff whitespace.
- [ ] Independent review of slice 1. No commit/push/merge/publish; no client rollout.
- [ ] After review passes, proceed sequentially with approved slices 2–5 (skill consolidation, agent consolidation, aliases/safe migration, self-install/packed acceptance). None of these later slices is implemented here.

## Next

- [ ] Install/verify current AgentOS in KargaX, run `agentos doctor --fix`, then smoke-test child-repo skill access.
- [ ] When Ralph resumes release prep: update release notes/CHANGELOG, run final dry-run + packed install smoke, and publish only after explicit approval.
- [ ] When Ralph resumes Worktrees Optional + Installation Wizard: start a feature branch from latest `main` and implement the first slice from the saved plan.

## Later

- [ ] Resume `agentos run` Phase 2 after release.
- [ ] Add richer local skill authoring/import UX.
- [ ] Add more specialized reusable agent templates when real projects justify them.

## Discovery reliability follow-up — 2026-09-10

- [x] Implement repository reliability scope R1–R10 with preservation/security regression coverage.
- [x] Pass 194 Node 26 tests, typecheck, CLI smoke, npm/pnpm/Bun packaged mutations, metadata checks and publication dry-run.
- [ ] Verify PR runtime/platform CI and provide the review link.
- [ ] Owner-observed external-engine root/nested-child acceptance before broader compatibility claims.
- [ ] Human review and merge; publishing and held runner/wizard work remain separate.

- [x] Verify 194/194 Node 22 regression tests and push reliability branch.
- [ ] Restore connected GitHub app access to ralphlol123/AgentOS (API 404); create PR and verify hosted checks. Branch is ready; PR is not created yet.
