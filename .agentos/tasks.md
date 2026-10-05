# Tasks

Active scope: AgentOS simplification audit. Plan, findings, decisions, evidence and queue: `.agentos/plans/2026-10-02-simplification-audit.md`. PRs #27–#39 are merged on `main` (CI green); `0.8.0` and `0.8.1` are published (npm latest `0.8.1`). The long 0.4–0.7 delivery history that used to live here is in git: `git show e2575c6:.agentos/tasks.md`.

## Done

- [x] Catalog cleanup (0.4.0), migration UX (0.5.0), compaction rewrite and its fixes (0.5.1, 0.6.0) and simple-safe default compaction (0.7.0, PR #26): all merged and published; 0.7.0 is npm latest.
- [x] Engine discovery (PR #27, `5abdff4`): `.agentos/guide.md`, self-sufficient `status`/`handoff` in a child repo, CLI-first child pointers. Ablation evidence archived at `/home/hermes/agentos-archive/2026-10-02-engine-discovery-ablation/`.
- [x] Regenerated this repo's own adapters (PR #28, `208e44a`) after #27 left CI red.
- [x] State-size visibility (PR #29, `efc260f`): `doctor`/`status` warn over 50,000 chars; `compact --dry-run` lists the largest sections.
- [x] Engine stubs no longer generated (PR #30, `e2575c6`); existing stubs tolerated, never deleted.
- [x] Housekeeping (2026-10-02): dev checkout on `main` and built; merged worktree archived (`~/.hermes/backups/agentos-worktrees-20261002/`) and removed; dead `/tmp` worktree entries pruned.
- [x] `agentos doctor --fix --dry-run` no longer takes the writer lock (PR #32, `b7dae69`); found while previewing the release candidate against a real workspace as another Unix user.
- [x] `dist/` is no longer committed; a `prepare` script builds it on install (PR #33, `8f73c30`). 42 files / 7,706 lines out of git.
- [x] `project.yaml` is edited in place by all six commands that write it, instead of re-dumping the whole file (PR #34, `01279dd`); the old whole-file dump remains the proven fallback.
- [x] Labahub (`/home/app/www/laundry-pos`) upgraded with the `0.8.0-rc.2` candidate: 7 adapters rewritten, `guide.md` created, 98 other files byte-identical, `doctor` exit 0.
- [x] Closed: the `templates/` fixture-leak advisory. Not reproducible on current `main` with 1, 2 and 4 concurrent suites or 3 concurrent `bun run test` runs (576/576 each, `templates/` hash identical before and after); the only test that mutates template files already copies them into a temp directory (`catalog-parity`).
- [x] Read the code behind the proposed command merges and dropped them: Obsidian is 302 lines in two modes that write the same two files and both are taught in the README; `handoff` prints a reading list while `run handoff` writes a git-grounded recovery note (different jobs, only the names are confusing); `templates copy`, `skills add` and `agents add` share almost no code. Removing every deprecation candidate would save about 200 of 4,595 `core.ts` lines.

- [x] Released `0.8.0` (PR #36, published 2026-10-05, shasum `244a44c7…`) and `0.8.1` (PR #39, shasum `20baa702…`); both verified on the registry and installed from it with npm and Bun; the 0.8.0 to 0.8.1 workspace upgrade path tested.
- [x] Size listing sums to the whole file (PR #37): 0.8.0 hid level-1 blocks, about 70% of a real `tasks.md`.
- [x] Adapters, guide and agent cards say what "update handoff/tasks" means (PR #38). Directional ablation: disciplined handoff with history kept 2/8 vs 7/8 (details in `handoff.md` and the skill reference).
- [x] KargaX upgraded to 0.8.1 by the owner; its `doctor --json` migration inventory was empty. Its oversized state files (404K and 342K chars) were cleaned once with the owner-run `state_cleanup.py`: the dry run said 34,205 and 26,619 chars, everything moved verbatim to `.agentos/runs/state-cleanup-e22aa1b515cb/`.

## Now

- [ ] Owner's post-cleanup check in KargaX: `agentos doctor`, `wc -c .agentos/handoff.md .agentos/tasks.md`, `cmp` of the `~/` backups against `.agentos/runs/state-cleanup-e22aa1b515cb/original/`. The cleanup is applied but not yet confirmed from output.
- [ ] Size the legacy upgrade-code deletion, read-only: `src/core.ts` lines and tests that pin it, and what an old-version upgrader would lose. Gate met (both migration inventories empty). Propose a deprecation step before any removal.

## Next

- [ ] Upgrade-machinery deletion, after the read-only sizing in Now: keep every path the owner's workspaces have passed through (both inventories are empty, so the gate is met); deprecate before removing.
- [ ] `agentos prompt` (43 lines): not a pure duplicate, since it inlines the current objective and Now tasks into a paste-ready prefix. Leave it unless the owner wants it gone; if so, deprecate for one release first.
- [ ] **Follow-up, pre-existing and not a regression:** `refilterCarriedBlock` is line-based, so a fenced code sample inside `## Preserved context` that quotes `### Constraints carried forward from archived history` loses its heading and its bullet. Byte-identical to the shipped 0.5.1 build, recoverable from the run archive, and now documented as a known limit in `docs/compaction.md`.
- [ ] **Recorded decision (considered, rejected, not a defect):** archiving a block archives whatever is nested inside it — ride-along — mirroring the shipped level-2 rule. Per-descendant `## History` entries were considered and rejected: they would either bloat History with an entry per nested heading or block archival whenever a history block contains subheadings. Independent review accepted this after failing to construct material harm (412 adversarial unchecked-task cases, 0 leaks).
- [ ] **Documented limits of the slice C carry rule** (all deliberate, all pinned by tests in `test/compact-rewrite-carry-fragments.test.js`, all stated in `docs/compaction.md`): a line that opens on a code span reads as a continuation of the previous line; a line ending on a conjunction reads as truncated; the subject-before-modal window is six words, so `Accounts, locations and trips in the production database must not be modified without approval` (modal at token 9) stays in the archive. Widening the window past six words was measured to buy 3 more constructed obligations at the cost of admitting narrative, and the accepted false-positive class is a line that opens as an obligation and then continues as reported speech (`Guards must not be relied on here, the ticket explained …`) — carried, and harmless in a heuristic safety net.
- [ ] Non-blocking doc nit from review: in the repeat-run sentence, the example "a deeper block above a later sibling" is attached to the "shallowest nested block is not itself archivable" condition, though in that shape the shallowest block *is* archivable and the later-pass archival is covered by the lead clause. Every asserted behaviour is true; the reviewer supplied exact tightening text if the sentence is touched again.
- [ ] Resume `agentos run` Phase 2 (the release it waited on has shipped; still on hold until the owner asks).
- [ ] Add richer local skill authoring/import UX.

## Later

- [ ] Add more specialized reusable agent templates when real projects justify them.
