# Tasks

Active scope: AgentOS simplification audit. Plan, findings, decisions, evidence and queue: `.agentos/plans/2026-10-02-simplification-audit.md`. PRs #27–#42 are merged on `main` (CI green); `0.8.0`, `0.8.1` and `0.9.0` are published (npm latest `0.9.0`). The long 0.4–0.7 delivery history that used to live here is in git: `git show e2575c6:.agentos/tasks.md`.

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
- [x] KargaX cleanup verified from the owner's output (2026-10-05, on 0.9.0): `doctor` OK, size warnings gone, `handoff.md` 34,423 and `tasks.md` 26,633 bytes, both `~/` backups identical to the archived originals.
- [x] Read-only sizing of the legacy upgrade code (about 970 of 7,317 source lines, roughly 1,100 dedicated test lines) and the staged plan: PR #41 deprecates four paths for removal in 0.10.0 (nothing removed), released as `0.9.0` (PR #42, shasum `d368c87b…`, registry-verified).

## Now

- [ ] Nothing queued that needs code. Waiting on the owner for two things: (a) what the first real engine session in KargaX does with the shorter handoff under the new wording, the real test of PR #38; (b) when, if ever, to schedule 0.10.0 (the deletion), after 0.9.0 has been out for a few weeks.

## Next

- [ ] Upgrade-machinery deletion (0.10.0), not scheduled: 0.9.0 deprecates the four paths and names the way out (`npx agentos-for-projects@0.9 doctor --fix`). Delete only after 0.9.0 has been out for a few weeks, re-check the npm download split, and keep the read-only `migration` inventory.
- [ ] `agentos prompt` (43 lines): not a pure duplicate, since it inlines the current objective and Now tasks into a paste-ready prefix. Leave it unless the owner wants it gone; if so, deprecate for one release first.
- [ ] Compaction's deliberate limits (fence handling, ride-along archiving, the carry-rule window, reported-speech over-carry) are documented in `docs/compaction.md` and pinned by tests; nothing here is a known defect. The earlier backlog paragraphs, with a status and what could not be confirmed, are in `.agentos/runs/2026-10-05-compaction-backlog-notes.md`.
- [ ] Resume `agentos run` Phase 2 (the release it waited on has shipped; still on hold until the owner asks).
- [ ] Add richer local skill authoring/import UX.

## Later

- [ ] Add more specialized reusable agent templates when real projects justify them.
