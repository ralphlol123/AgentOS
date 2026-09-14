# Tasks

Active scope: catalog cleanup slice 4 (retired-ID aliases + safe migration) in `/home/hermes/agentos-catalog-cleanup` on `feat/catalog-cleanup`. Earlier milestones below are historical, not authorization to edit client workspaces or resume other tasks.

## Done

- [x] Slice 1 (`b983635`): canonical package-owned templates, summary/full workflows, parity regressions.
- [x] Slice 2 (`ae3d17e`): 15 framework-neutral skills + 9 optional references, reference byte parity, rollback/symlink/lock safety.
- [x] Slice 3 (`775fe08`): six-role agent consolidation (planner, developer, tester, reviewer, release-manager, security-reviewer).
- [x] Slice 4 code + tests: `src/aliases.ts` (AGENT_ALIASES/SKILL_ALIASES + resolve helpers), `init --agents`/`agents add`/`skills add`/`templates show`/`templates copy` alias resolution with deprecation notices, `doctor` legacy detection + `doctor --fix` safe card migration via closed-set legacy shapes.

## Now

- [x] Fix `templates copy` retired-agent-alias resolution (the one failing test): `templates copy id='qa'` now resolves to `tester` and returns ok:true with a deprecation notice when the canonical card is already installed byte-identical; customized/differing cards still refuse.
- [x] Verify full matrix green: build, check, `test/catalog-parity.test.js` (53), full suite (281), smoke, `test:package-managers` (npm/pnpm/bun 15 cards/9 refs).
- [x] Migrate this worktree's dogfood `.agentos/` to the six-agent + 15-skill model via `doctor --fix` (project.yaml capabilities/enabled, agent cards, skills.md; release-manager card regenerated to canonical). No custom content clobbered; no native `.claude`/`.opencode` copies present to preserve.
- [ ] Independent review of slice 4. Stop here: NO COMMIT/PUSH; no client rollout or version bump.
- [ ] Only after review/parent gates, continue with slice 5 (full self-install). Not implemented by this run.

## Next

- [ ] Slice 5: full local self-install of the 15-skill catalog into `.agentos/skills/**/SKILL.md` with exact Details pointers.
- [ ] When Ralph resumes release prep: update release notes/CHANGELOG, run final dry-run + packed install smoke, and publish only after explicit approval.
- [ ] Install/verify current AgentOS in KargaX, run `agentos doctor --fix`, then smoke-test child-repo skill access.

## Later

- [ ] Resume `agentos run` Phase 2 after release.
- [ ] Add richer local skill authoring/import UX.
- [ ] Add more specialized reusable agent templates when real projects justify them.
