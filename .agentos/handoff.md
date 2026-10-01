# Handoff

## Current objective

Simplify AgentOS without losing capability, one verified slice at a time. Findings, decisions, evidence and the queue are in `.agentos/plans/2026-10-02-simplification-audit.md`. Four slices are merged on `main` (PRs #27–#30, CI green); nothing is released yet (`main` is `0.7.0` with six unreleased CHANGELOG entries). Next: pack a `0.8.0` candidate for the `app` user, get the KargaX section listing from `compact --dry-run`, then fix state-file growth at the source.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace); integration branch `main`.
- Client workspaces (KargaX `/home/app/www/kargax/new`, Labahub `/home/app/www/laundry-pos`) are rolled out manually by the owner and excluded from engine-behavior tests. One read-only listing of file names, sizes and mtimes was made with approval; nothing there was modified.

## Current state

- `main` = `e2575c6`, version 0.7.0 (npm latest is 0.7.0). CI green on all six jobs. No open PRs.
- Merged on 2026-10-02:
  - #27 `5abdff4`: `.agentos/guide.md` managed adapter, self-sufficient `status`/`handoff` in a child repo, CLI-first child pointers. No `agentos guide` command: the ablation showed no gain for it (nested 8/12 vs 8/12) while the file lifted root right-tool outcomes from 2/8 to 6/8.
  - #28 `208e44a`: regenerated this repo's own adapters. #27 had left `main` red because CI runs `doctor --json` on this workspace.
  - #29 `efc260f`: `doctor`/`status` warn when `handoff.md` or `tasks.md` exceeds 50,000 chars; `compact --dry-run` lists the largest sections when nothing can be reduced.
  - #30 `e2575c6`: stop generating `.agentos/engines/<engine>.md`; existing stubs are tolerated and never deleted; this repo's five stubs were removed.
- Owner measurement (KargaX `compact --dry-run`, 2026-10-02): `handoff.md` 385,274 chars and `tasks.md` 300,898 chars, classified 0 archived / 6 live / 2 preserved and 0 / 3 / 2. Its recorded live size right after the 0.5.0 apply was 138,398, so about 548K chars accumulated since (inference, dates approximate). Labahub is small (6 KB / 3 KB).
- Housekeeping done: the dev checkout `/home/hermes/agentos-for-projects` is on `main` at `e2575c6` and built, so Hermes's `agentos` reports 0.7.0 (it was 0.6.0). The merged worktree `agentos-simple-safe-compaction` was removed after its 4 untracked files were archived to `~/.hermes/backups/agentos-worktrees-20261002/` (byte-for-byte verified); two dead `/tmp` worktree entries were pruned. The dev checkout keeps 7 untracked files on purpose (listed in git status; they are not leftovers).
- Ablation evidence is archived at `/home/hermes/agentos-archive/2026-10-02-engine-discovery-ablation/` (403 files, sha256-verified, README inside).
- Earlier versions of this file and `tasks.md` (long 0.5–0.7 compaction history) are in git history: `git show e2575c6:.agentos/handoff.md`.

## Known warnings / failures

- Engine acceptance gaps: Codex was never tested (not installed for the `hermes` user). Nested OpenCode starts still fail in the way pointers cannot fix: refused reads under `..` end the session. With the final build, 8 of 12 nested free-model runs gave a grounded answer. One run per cell on a synthetic fixture: directional only.
- The `app` user has two installs: bun global `0.7.0` and a stale npm-global `0.2.0` shim (a symlink into `/home/app/www/tools/agentos-for-projects`) that can shadow it depending on PATH order. The KargaX dry-run output matched the 0.7.0 format.
- Existing workspaces report root and child adapters stale until `doctor --fix` (guide and engine-stub changes). Rollout is the owner's manual step.
- Do not run two test suites concurrently in one checkout (fixtures leak into `templates/`).

## Next exact action

1. Pack a `0.8.0` candidate tarball for the `app` user (a minor bump, since the unreleased CHANGELOG has six entries). Verify it by installing that exact file into a throwaway prefix and running `--version`; quote the shasum. Publishing stays the owner's call.
2. The owner runs `agentos compact --dry-run` in KargaX with that build and sends the "Largest sections" block (titles and sizes only). That decides between recognising more heading shapes in `compact` and changing how state is written (overwrite `handoff.md`, history to `runs/`).
3. Then the state-growth slice, then untracking `dist/` (needs a `prepare` script) and the `agentos prompt` deprecation.

## Open decisions

- Upgrade support horizon: proposed rule is "keep every migration path the owner's workspaces have actually passed through" instead of a fixed last-two-minors, because KargaX and Labahub were rolled out at 0.4.0. Needs `agentos doctor --json` migration inventories from both workspaces (the owner runs them) before any legacy path is deleted.
- Compaction: add no new heuristics; fix growth at the source (the specific fix waits on the listing in step 2).
- Import and quarantine (`templates import`): frozen, no new work.
- Whether and when to publish `0.8.0`.
