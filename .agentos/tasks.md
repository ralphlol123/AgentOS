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

- [ ] Version-upgrade migration UX — approved plan: `.agentos/plans/2026-09-14-upgrade-migration-ux.md` (five slices). Owner defaults locked: always write the `.agentos.bak` sidecar; repo-ID normalization behind an explicit flag; retired cleanup report-only by default; slice 5 targets `0.5.0`.
  - [x] Slice 1 — read-only migration inventory: `doctor`/`doctor --json` carry `migration.{adapters,repoIds,retiredCards,summary}`, plus `agentos adapters explain <file>`. 12 tests in `test/migration-inventory.test.js`; full local gate green (build, check, test 293/293, smoke, package-managers npm/pnpm/Bun, `npm pack --dry-run`, doctor `OK`). Two independent read-only review rounds: round 1 passed every functional invariant (read-only proof, problems/warnings/exit-status parity, fail-closed safety) and found two doc/usage mismatches; round 2 confirmed those fixed and found one remaining README/code mismatch. All doc findings fixed and re-verified against live repros before the single slice commit.
  - [ ] Slice 2 — repo-ID normalization: split unmigratable (hard error) from normalizable, transactional rename of the key + `.agentos/repos/<id>.md`, collision refusal, run note under `.agentos/runs/`.
  - [ ] Slice 3 — custom-content adapter migration: `legacy-embedded` classification, opt-in `--adopt-custom-adapters` with dry-run preview, byte-span replacement preserving all custom bytes.
  - [ ] Slice 4 — retired-card cleanup completion: per-card eligibility, retired **skill** card pruning, `.agentos/skills.md` repair, evidence-driven `legacyAgentCardShapes` expansion, opt-in `--prune-retired`.
  - [ ] Slice 5 — release `0.5.0`: CHANGELOG, version bump, packed-install dogfood, synthetic fixture replay.
  - Recorded rollout lessons behind the design: `doctor --fix` only auto-migrates byte-matched historical card shapes (so interleaved custom content hits "adapter ownership is ambiguous" and needs manual resolution); unsafe repo IDs block `doctor --fix` until renamed by hand; retired skill cards and stale `.agentos/skills.md` entries still need manual cleanup. Correction found while planning: retired **agent** cards are already detected and migrated by `doctor --fix` when byte-matched (`checkLegacyCatalogState`/`fixLegacyCatalogState`).

## Next

- [ ] Resume `agentos run` Phase 2 after release.
- [ ] Add richer local skill authoring/import UX.

## Later

- [ ] Add more specialized reusable agent templates when real projects justify them.
