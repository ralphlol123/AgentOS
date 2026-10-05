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
