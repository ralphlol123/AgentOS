# History displaced by v1 slice 1 (2026-10-25)

Verbatim copies of `.agentos/handoff.md` and `.agentos/tasks.md` as of `3c03372` (main, 0.9.0), taken before slice 1 rewrote them. Note: the handoff below says `main` = `ed36d1e`; actual `main` at the time was `3c03372` (PRs #43–#45 merged after it was written).

## handoff.md at 3c03372

````markdown
# Handoff

## Current objective

Simplify AgentOS without losing capability, one verified slice at a time. Findings, decisions, evidence and the queue are in `.agentos/plans/2026-10-02-simplification-audit.md`. PRs #27–#42 are merged on `main` (CI green) and **0.8.0, 0.8.1 and 0.9.0 are published** (npm latest is `0.9.0`). KargaX and Labahub are upgraded, KargaX's oversized state files were cleaned by the owner and the result verified, and 0.9.0 deprecates the legacy upgrade paths for removal in 0.10.0 (not scheduled).

## Scope

- Repo: `agentos-for-projects` (single-repo workspace); integration branch `main`.
- Client workspaces (KargaX `/home/app/www/kargax/new`, Labahub `/home/app/www/laundry-pos`) are rolled out manually by the owner and excluded from engine-behavior tests. The owner ran read-only checks there (`compact --dry-run`, `doctor --json`, the state-file heading listing) and sent the output; nothing there was modified by an engine.

## Current state

- `main` = `ed36d1e`, version 0.9.0 (npm latest is 0.9.0). CI green on all six jobs. No open PRs.
- Merged on 2026-10-02:
  - #27 `5abdff4`: `.agentos/guide.md` managed adapter, self-sufficient `status`/`handoff` in a child repo, CLI-first child pointers. No `agentos guide` command: the ablation showed no gain for it (nested 8/12 vs 8/12) while the file lifted root right-tool outcomes from 2/8 to 6/8.
  - #28 `208e44a`: regenerated this repo's own adapters. #27 had left `main` red because CI runs `doctor --json` on this workspace.
  - #29 `efc260f`: `doctor`/`status` warn when `handoff.md` or `tasks.md` exceeds 50,000 chars; `compact --dry-run` lists the largest sections when nothing can be reduced.
  - #30 `e2575c6`: stop generating `.agentos/engines/<engine>.md`; existing stubs are tolerated and never deleted; this repo's five stubs were removed.
  - #31 `52ba67c`: this audit's state reset. #32 `b7dae69`: `doctor --fix --dry-run` no longer takes the writer lock.
  - #33 `8f73c30`: `dist/` is no longer committed (42 files, 7,706 lines); a `prepare` script builds it on install, so a checkout needs its own `bun install` / `npm ci` / `pnpm install` before use. The dev checkout the `hermes` user's `agentos` symlinks into was rebuilt that way.
  - #34 `01279dd`: `project.yaml` is edited in place (comments, flow style and layout survive) by the six commands that write it; whole-file dump remains the proven fallback.
  - #35 `38d548a`: audit state. #36 `0536fc6`: release 0.8.0. #37 `2157f34`: size listing now sums to the whole file (0.8.0 hid level-1 blocks, about 70% of a real `tasks.md`). #38 `a730c5f`: adapters, guide and agent cards say what "update handoff/tasks" means (rewrite the handoff, delete finished tasks, copy older entries to a `runs/` note first, never discard history). #39 `d8924c1`: release 0.8.1.
  - #40 `7793aef`: state record. #41 `5de0159`: the legacy upgrade paths are deprecated for removal in 0.10.0 (adapters from before the managed-block format and `--adopt-custom-adapters`; retired pre-0.4.0 cards and `--prune-retired`; `--normalize-repo-ids`; `agentos migrate claude`): nothing removed, notices only when a path applies or a flag is used, clean workspaces print the same text as 0.8.1. #42 `ed36d1e`: release 0.9.0.
- Published: 0.8.0 on 2026-10-05 09:44 UTC (shasum `244a44c711ead8f99012913aebec1211d4b8951f`) and 0.8.1 at 13:21 UTC (shasum `20baa702014efcf25e0d7c12b1db9c53a51374a0`), both verified on the registry (version endpoint 200, `dist-tags.latest`, shasum equal to the packed tarball) and installed from it with npm and Bun in isolated prefixes. An upgrade of a 0.8.0-made workspace with the published 0.8.1 plans only `update`s and ends with `doctor` exit 0.
- 0.9.0 published 2026-10-05 14:33 UTC (shasum `d368c87bae8c59d92dfabe2924fa983421a35e7b`), registry-verified (version endpoint 200, `dist-tags.latest`, shasum equal to the packed tarball), installed from the registry with npm and Bun in isolated prefixes. On a clean 0.8.1 workspace `doctor`, `doctor --fix --dry-run` and `doctor --fix` print byte-identical text on 0.9.0; on a workspace with a pre-managed-block `AGENTS.md` the deprecation section appears, `doctor --fix` migrates it (exit 0) and the notice is gone afterwards. Sizing behind the deprecation: about 970 of 7,317 source lines (`core.ts` 710, `legacy-skill-shapes.ts` 150, `aliases.ts` 114) and roughly 1,100 dedicated test lines; npm downloads in the last week were spread over 0.3.0 to 0.7.0 (26 in total, 769 in the last month), so some people may still be on old releases.
- State-wording evidence (directional only: n=8 per variant, one task, synthetic fixture, free OpenCode model, and the final wording was tuned after the first version lost history in 2 of 4 Claude runs): disciplined handoff with history kept 2/8 on the 0.8.0 wording vs 7/8 on the shipped wording, planted history kept 8/8, finished tasks removed 0/8 vs 4/8. Run data and method are in `/home/hermes/agentos-sandbox/state/` (`PREREG.md`, `run1-v1/`, `out/`) and the skill reference `state-file-growth-and-cleanup.md`.
- KargaX (owner ran everything; no engine touched it): upgraded to 0.8.1 with `doctor --fix` (10 adapters updated, `guide.md` created, no conflict or adoption). Its `doctor --json` migration inventory was empty (`repoIds: []`, `retiredCards: []`, `action_required: 0`) and the pre-fix dry run planned only plain `update`s. State files were 404,351 and 341,843 chars; the owner then applied a one-off cleanup (`state_cleanup.py`, plan `e22aa1b515cb`): the dry run showed handoff 404,351 to 34,205 and tasks 341,843 to 26,619 chars, 89 older handoff entries and 189 finished tasks moved verbatim to `.agentos/runs/state-cleanup-e22aa1b515cb/` with full copies of both originals. The owner's post-apply check on 0.9.0 verified it: `agentos doctor` is OK with both size warnings gone, `handoff.md` and `tasks.md` are 34,423 and 26,633 bytes (the dry run said 34,205 and 26,619 chars; the gap is most likely bytes versus characters, not proven), and both `~/` backups are byte-identical (`cmp`) to the archived originals. KargaX is on 0.9.0 and its `doctor --fix --dry-run` shows every adapter as `noop`.
- Owner measurement (KargaX `compact --dry-run`, 2026-10-02): `handoff.md` 385,274 chars and `tasks.md` 300,898 chars, classified 0 archived / 6 live / 2 preserved and 0 / 3 / 2. Its recorded live size right after the 0.5.0 apply was 138,398, so about 548K chars accumulated since (inference, dates approximate). Labahub is small (6 KB / 3 KB).
- Labahub (`/home/app/www/laundry-pos`) was upgraded by the owner with the `0.8.0-rc.2` candidate (`/home/hermes/agentos-archive/releases/agentos-for-projects-0.8.0-rc.2.tgz`, sha256 `6e26c54ad3b27c514a40f950abf1265353cab5e944ad00f1051018e7cfc6256b`): `doctor --fix` rewrote 7 adapters and created `guide.md`; the other 98 files in the rollback copy are byte-identical; `doctor` exits 0. It carried no legacy migration classes (no adopt, conflict, repo-ID or retired-card entries). KargaX is covered in the next bullets.
- Housekeeping: the dev checkout `/home/hermes/agentos-for-projects` is at `7793aef` (0.8.1, built); it is behind `main` (0.9.0) until it is pulled and `bun install` rebuilds `dist/`.
- Ablation evidence is archived at `/home/hermes/agentos-archive/2026-10-02-engine-discovery-ablation/` (403 files, sha256-verified, README inside).
- Earlier versions of this file and `tasks.md` (long 0.5–0.7 compaction history) are in git history: `git show e2575c6:.agentos/handoff.md`.

## Known warnings / failures

- Engine acceptance gaps: Codex was never tested (not installed for the `hermes` user). Nested OpenCode starts still fail in the way pointers cannot fix: refused reads under `..` end the session. With the final build, 8 of 12 nested free-model runs gave a grounded answer. One run per cell on a synthetic fixture: directional only.
- The `app` user has two installs: bun global `0.7.0` and a stale npm-global `0.2.0` shim (a symlink into `/home/app/www/tools/agentos-for-projects`) that can shadow it depending on PATH order. In KargaX `agentos -v` printed 0.9.0, so the bun-global install is current; whether the stale 0.2.0 shim still exists is unchecked.
- Existing workspaces report root and child adapters stale until `doctor --fix` (guide, engine-stub and state-wording changes). Rollout is the owner's manual step; both client workspaces have done it.
- KargaX `doctor` still reports tracked working-tree changes in `kargax-be` (1 file) and `kargax-fe-client` (2 files). Not diagnosed; they predate the 0.8.1 upgrade and are still reported on 0.9.0 and are not adapter files as far as the output shows.
- The `state_cleanup.py` script is a one-off, kept outside the product (`/home/hermes/agentos-sandbox/cleanup/`). It was tested on synthetic shapes and then by the owner's dry runs; its rule for finished tasks is heuristic (rule word in the first 80 chars, one-day recency window) and its handoff rule keeps only the newest `###` entry.
- Concurrent test suites: the old advisory that they leak fixtures into `templates/` could not be reproduced on current `main` (1, 2 and 4 concurrent suites and 3 concurrent `bun run test` runs all passed 576/576 with the `templates/` hash unchanged), and the only test that edits template files copies them to a temp directory first. Sequential runs are still the safe habit but not a known requirement.

## Next exact action

1. Nothing is queued that needs code. The legacy-upgrade-code deletion (0.10.0) is deliberately not scheduled: 0.9.0 only announces it, and the owner decides when to delete after it has been out long enough for anyone on an old release to see the notice (a few weeks at least). Before deleting, check the npm download split again and keep the read-only `migration` inventory.
2. Optional, owner-side: report what the first real engine session in KargaX does with the shorter handoff under the new wording (rewrite it? copy history to a `runs/` note? append?). That is the real test of the wording and nothing here has seen it.
3. Optional: `git merge --ff-only origin/main` then `bun install` in `/home/hermes/agentos-for-projects` so the checkout Hermes runs follows `main`.

## Open decisions

- Upgrade support horizon: rule is "keep every migration path the owner's workspaces have actually passed through". Evidence is now in for both workspaces: Labahub's inventory was empty at 0.4.0 to 0.8.0, and KargaX's was empty after `doctor --fix` with a pre-fix dry run of plain `update`s. What remains is the decision itself, after the read-only sizing in step 2.
- Compaction: add no new heuristics. Growth was fixed at the source (the 0.8.1 wording) and the existing bloat was cleaned once, outside the product.
- Import and quarantine (`templates import`): frozen, no new work.
- Released: 0.8.0, 0.8.1 and 0.9.0. Nothing is pending release.
````

## tasks.md at 3c03372

````markdown
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
````
