# Tasks

Active scope: post-release. Catalog cleanup (slices 1–5) shipped — merged via PR #20, released as 0.4.0. Rolled out to Labahub and KargaX (both migrated to the six-agent + 15-skill model). Next priority: make old→new version migration smooth for real workspaces.

## Done

- [x] Slice 1 (`b983635`): canonical package-owned templates, summary/full workflows, parity regressions.
- [x] Slice 2 (`ae3d17e`): 15 framework-neutral skills + 9 optional references, reference byte parity, rollback/symlink/lock safety.
- [x] Slice 3 (`775fe08`): six-role agent consolidation (planner, developer, tester, reviewer, release-manager, security-reviewer).
- [x] Slice 4 (`419ae98`): deprecated agent/skill aliases (`src/aliases.ts`) + safe migration diagnostics in `doctor`/`doctor --fix`.
- [x] Slice 5 (final): rebuild + pack + packed-install dogfood (npm/pnpm/Bun).
- [x] PR #20 merged; 0.4.0 released (PR #21: version bump + CHANGELOG).
- [x] Rolled out to Labahub (`/home/app/www/laundry-pos`) and KargaX (`/home/app/www/kargax/new`) via `doctor --fix` + `skills add` + manual adapter resolution.

## Now

- [ ] Improve version-upgrade migration UX. Lessons from the 0.3.0 → 0.4.0 rollout to real workspaces:
  - `doctor --fix` only auto-migrates **byte-matched historical card shapes**, so a workspace whose root `AGENTS.md`/`CLAUDE.md` hold custom project knowledge *interleaved with* a stale AgentOS bootloader hits "adapter ownership is ambiguous" and needs manual resolution (back up → strip bootloader → regenerate → re-add custom content).
  - Unsafe repo IDs (e.g. `frontend_client`) block `doctor --fix` until renamed by hand.
  - Retired agent/skill cards are only detected, not cleaned up automatically.
  - Desired behavior: classify and safely migrate custom-content adapters (preserve custom bytes, wrap/replace only the AgentOS block), auto-normalize repo IDs, and offer guided/automated cleanup of retired cards — while never clobbering customized content. Roll the fixes through the normal slice → verify → review → commit flow.

## Next

- [ ] Resume `agentos run` Phase 2 after release.
- [ ] Add richer local skill authoring/import UX.

## Later

- [ ] Add more specialized reusable agent templates when real projects justify them.
