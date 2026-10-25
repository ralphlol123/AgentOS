# Handoff

## Current objective

AgentOS 1.1 — make 1.0 dependable for everyday development (Ralph, 2026-10-25). Three sequential slices: (1) synced-config freshness detection, (2) safe agent re-sync, (3) complete generated workflow guidance; then a Claude + Codex validation run by Phynceon. Slice 1 is implemented and awaiting review.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace). `main` = `99553dc` (release 1.0.0, npm latest 1.0.0; PRs #46–#54 merged).
- Slice 1 branch: `feat/1.1-sync-freshness` from `origin/main`, one local commit, not pushed. No version bump.
- Client workspaces (KargaX, Labahub) are rolled out manually by the owner and are out of scope.

## Current state

- Slice 1: `agents sync <engine>` writes `.agentos/synced/<engine>.json` (role, scope, per-file sha256, generated settings entries) in the same transaction as the engine files; dry-run writes nothing. One shared check (`src/synced-config.ts` + `syncedConfigStatus` in `src/core.ts`) serves `doctor` (one warning per STALE/INVALID engine, exit status unchanged, `--json` `synced_config`) and `context --require-synced-config` (OK/STALE/INVALID/MISSING/UNSUPPORTED; checks the recorded role/scope; covers allow, deny, `.claude/agents/<id>.md` and the Codex role block; owner-added entries are `user entries: N`). Syncs made by 1.0.0 report `STALE — synced by 1.0.0 without a record`. Docs: `docs/engines.md` (Synced config freshness), `docs/migration.md`, README, CHANGELOG `[Unreleased]`, `docs/improve-later.md` (F1–F5 closed).
- Tests: `test/sync-freshness.test.js` (RED on `99553dc`); three older assertions updated (OK line names the role; codex is MISSING, not UNSUPPORTED). Gates ran as `npm run ...` (no `bun` on PATH in the developer sandbox).
- History: v1 closure/release state `.agentos/runs/2026-10-26-v1-release-state.md`; slices 1–6 `.agentos/runs/2026-10-25-v1-slice6-handoff.md`; older `.agentos/runs/2026-10-25-v1-slice1-history.md`.

## Known warnings / failures

- Re-sync after `tree changed`/`scope changed` still refuses (add-keys-only) until the owner removes `permissions.allow`/`deny`: slice 2.
- One sync record per engine: syncing a second role overwrites it; freshness then covers the last synced role only.
- `agentos status` does not show synced-config freshness (doctor does).
- `doctor` diagnostics list this repo's three legacy agent cards (developer, tester, release-manager).

## Next exact action

1. Phynceon: review slice 1 on `feat/1.1-sync-freshness`; push/PR on approval.
2. Then slice 2 (safe agent re-sync).

## Protected files / do not touch

- `/home/app/**`, the Obsidian vault, Hermes config.
- Deprecated migration writers until the owner decides.

## Open decisions

- Removal of the deprecated legacy upgrade paths: retargeted to 2.0.0; owner decides.
- This repo's three non-matching legacy cards (developer, tester, release-manager): `agents manifest <id> --custom` or `agents add <id> --replace`.
- Alias/overlap consolidation candidates (`docs/migration.md`, keep / simplify / remove inventory).
- Import and quarantine (`templates import`): frozen.
