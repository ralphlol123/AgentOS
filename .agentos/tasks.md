# Tasks

Active scope: catalog cleanup COMPLETE (slices 1–5) in `/home/hermes/agentos-catalog-cleanup` on `feat/catalog-cleanup` (ahead of `origin/main` by 4 commits). All five slices are implemented and verified; awaiting final human review, then push/PR (explicit owner approval). Earlier milestones below are historical, not authorization to edit client workspaces or resume other tasks.

## Done

- [x] Slice 1 (`b983635`): canonical package-owned templates, summary/full workflows, parity regressions.
- [x] Slice 2 (`ae3d17e`): 15 framework-neutral skills + 9 optional references, reference byte parity, rollback/symlink/lock safety.
- [x] Slice 3 (`775fe08`): six-role agent consolidation (planner, developer, tester, reviewer, release-manager, security-reviewer).
- [x] Slice 4 (`419ae98`): deprecated agent/skill aliases (`src/aliases.ts`) + safe migration diagnostics in `doctor`/`doctor --fix`.
- [x] Slice 5 (final): rebuild + pack + packed-install dogfood. Verified in clean npm/pnpm/Bun temp projects: `--version` reads installed `package.json` (0.3.0, no stale constant); `init --existing` yields detected six-agent profile (developer/tester/reviewer/release-manager; planner + security-reviewer not auto-enabled); `skills add` canonical `debugging` + retired alias `systematic-debugging` install byte-identical with a deprecation notice; references installed alongside `SKILL.md`; `templates copy` (agent + skill-with-reference); `doctor`/`status` OK. Full local gate green (build/check/test 281/smoke/test:package-managers). Tarball ships 6 agent templates + 15 skill templates + 9 references + `dist/` (aliases.js/catalog.js/core.js/cli.js).

## Now

- [ ] Final human review of slice 5 and the full `feat/catalog-cleanup` branch. No commit/push/merge/publication/version-bump in this run.
- [ ] After review approval: push `feat/catalog-cleanup` and open the PR against `main`.

## Next

- [ ] When Ralph resumes release prep: update release notes/CHANGELOG, run final dry-run + packed install smoke, and publish only after explicit approval.
- [ ] Install/verify current AgentOS in KargaX, run `agentos doctor --fix`, then smoke-test child-repo skill access.

## Later

- [ ] Resume `agentos run` Phase 2 after release.
- [ ] Add richer local skill authoring/import UX.
- [ ] Add more specialized reusable agent templates when real projects justify them.
