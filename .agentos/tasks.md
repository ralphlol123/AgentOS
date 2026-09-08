# Tasks

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
- [x] Task 2: filesystem boundary containment implemented directly by Hermes on `fix/filesystem-boundary-containment`; 91 tests pass; final native independent review PASS. Delivered as one scoped local commit; push/merge remain pending. No Claude Code/OpenCode used.

## Now

- [ ] Commit and push `feat/subrepo-engine-skill-access`, then prepare PR details.

## Next

- [ ] In KargaX after install, run `agentos doctor --fix` from workspace root so `kargax-be`/`kargax-fe` child pointers pick up parent AgentOS skill access.
- [ ] When Ralph resumes release prep: update release notes/CHANGELOG, run final dry-run + packed install smoke, and publish only after explicit approval.
- [ ] When Ralph resumes Worktrees Optional + Installation Wizard: start a feature branch from latest `main` and implement the first slice from the saved plan.

## Later

- [ ] Resume `agentos run` Phase 2 after release.
- [ ] Add richer local skill authoring/import UX.
- [ ] Add more specialized reusable agent templates when real projects justify them.
