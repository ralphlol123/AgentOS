# Handoff

## Current objective

Simplify AgentOS without losing capability, one verified slice at a time. Findings, decisions, evidence and the queue are in `.agentos/plans/2026-10-02-simplification-audit.md`. Eight slices are merged on `main` (PRs #27–#34, CI green); nothing is released (`main` is `0.7.0` with unreleased CHANGELOG entries) and the owner decided on 2026-10-02 **not to release for now**. What is left is gated on real-workspace evidence from KargaX, which the owner has not asked to touch; see `## Next exact action`.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace); integration branch `main`.
- Client workspaces (KargaX `/home/app/www/kargax/new`, Labahub `/home/app/www/laundry-pos`) are rolled out manually by the owner and excluded from engine-behavior tests. One read-only listing of file names, sizes and mtimes was made with approval; nothing there was modified.

## Current state

- `main` = `01279dd`, version 0.7.0 (npm latest is 0.7.0). CI green on all six jobs. No open PRs.
- Merged on 2026-10-02:
  - #27 `5abdff4`: `.agentos/guide.md` managed adapter, self-sufficient `status`/`handoff` in a child repo, CLI-first child pointers. No `agentos guide` command: the ablation showed no gain for it (nested 8/12 vs 8/12) while the file lifted root right-tool outcomes from 2/8 to 6/8.
  - #28 `208e44a`: regenerated this repo's own adapters. #27 had left `main` red because CI runs `doctor --json` on this workspace.
  - #29 `efc260f`: `doctor`/`status` warn when `handoff.md` or `tasks.md` exceeds 50,000 chars; `compact --dry-run` lists the largest sections when nothing can be reduced.
  - #30 `e2575c6`: stop generating `.agentos/engines/<engine>.md`; existing stubs are tolerated and never deleted; this repo's five stubs were removed.
  - #31 `52ba67c`: this audit's state reset. #32 `b7dae69`: `doctor --fix --dry-run` no longer takes the writer lock.
  - #33 `8f73c30`: `dist/` is no longer committed (42 files, 7,706 lines); a `prepare` script builds it on install, so a checkout needs its own `bun install` / `npm ci` / `pnpm install` before use. The dev checkout the `hermes` user's `agentos` symlinks into was rebuilt that way.
  - #34 `01279dd`: `project.yaml` is edited in place (comments, flow style and layout survive) by the six commands that write it; whole-file dump remains the proven fallback.
- Owner measurement (KargaX `compact --dry-run`, 2026-10-02): `handoff.md` 385,274 chars and `tasks.md` 300,898 chars, classified 0 archived / 6 live / 2 preserved and 0 / 3 / 2. Its recorded live size right after the 0.5.0 apply was 138,398, so about 548K chars accumulated since (inference, dates approximate). Labahub is small (6 KB / 3 KB).
- Labahub (`/home/app/www/laundry-pos`) was upgraded by the owner with the `0.8.0-rc.2` candidate (`/home/hermes/agentos-archive/releases/agentos-for-projects-0.8.0-rc.2.tgz`, sha256 `6e26c54ad3b27c514a40f950abf1265353cab5e944ad00f1051018e7cfc6256b`): `doctor --fix` rewrote 7 adapters and created `guide.md`; the other 98 files in the rollback copy are byte-identical; `doctor` exits 0. It carried no legacy migration classes (no adopt, conflict, repo-ID or retired-card entries). KargaX has not been touched.
- Housekeeping done: the dev checkout `/home/hermes/agentos-for-projects` is on `main` at `e2575c6` and built, so Hermes's `agentos` reports 0.7.0 (it was 0.6.0). The merged worktree `agentos-simple-safe-compaction` was removed after its 4 untracked files were archived to `~/.hermes/backups/agentos-worktrees-20261002/` (byte-for-byte verified); two dead `/tmp` worktree entries were pruned. The dev checkout keeps 7 untracked files on purpose (listed in git status; they are not leftovers).
- Ablation evidence is archived at `/home/hermes/agentos-archive/2026-10-02-engine-discovery-ablation/` (403 files, sha256-verified, README inside).
- Earlier versions of this file and `tasks.md` (long 0.5–0.7 compaction history) are in git history: `git show e2575c6:.agentos/handoff.md`.

## Known warnings / failures

- Engine acceptance gaps: Codex was never tested (not installed for the `hermes` user). Nested OpenCode starts still fail in the way pointers cannot fix: refused reads under `..` end the session. With the final build, 8 of 12 nested free-model runs gave a grounded answer. One run per cell on a synthetic fixture: directional only.
- The `app` user has two installs: bun global `0.7.0` and a stale npm-global `0.2.0` shim (a symlink into `/home/app/www/tools/agentos-for-projects`) that can shadow it depending on PATH order. The KargaX dry-run output matched the 0.7.0 format.
- Existing workspaces report root and child adapters stale until `doctor --fix` (guide and engine-stub changes). Rollout is the owner's manual step.
- Concurrent test suites: the old advisory that they leak fixtures into `templates/` could not be reproduced on current `main` (1, 2 and 4 concurrent suites and 3 concurrent `bun run test` runs all passed 576/576 with the `templates/` hash unchanged), and the only test that edits template files copies them to a temp directory first. Sequential runs are still the safe habit but not a known requirement.

## Next exact action

Nothing is queued that needs only code. The remaining reductions need evidence from KargaX, so the next step is the owner's choice and is not started:

1. When the owner wants it: in KargaX, with the `rc.2` build, run `agentos compact --dry-run` (the "Largest sections" block: titles and sizes only) and `agentos doctor --json` (the `migration` block). The first decides between recognising more heading shapes in `compact` and changing how state is written (overwrite `handoff.md`, history to `runs/`). The second decides whether the legacy upgrade code can be deleted: Labahub alone is not enough.
2. Then the state-growth slice, and the upgrade-machinery deletion if KargaX's inventory is clean.
3. A `0.8.0` release (version bump, CHANGELOG date, `release:check`, `npm whoami`, publish, registry verification) only when the owner decides.

## Open decisions

- Upgrade support horizon: proposed rule is "keep every migration path the owner's workspaces have actually passed through" instead of a fixed last-two-minors, because KargaX and Labahub were rolled out at 0.4.0. Needs `agentos doctor --json` migration inventories from both workspaces (the owner runs them) before any legacy path is deleted.
- Compaction: add no new heuristics; fix growth at the source (the specific fix waits on the listing in step 2).
- Import and quarantine (`templates import`): frozen, no new work.
- Whether and when to publish `0.8.0`.
