# Handoff

## Current objective

AgentOS 1.1 — make 1.0 dependable for everyday development (Ralph, 2026-10-25). Three sequential slices: (1) synced-config freshness detection — accepted; (2) safe agent re-sync — implemented, awaiting review; (3) complete generated workflow guidance; then a Claude + Codex validation run by Phynceon.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace). `main` = `99553dc` (release 1.0.0, npm latest 1.0.0).
- Slice 1: `feat/1.1-sync-freshness` = `4faca16`, pushed, accepted.
- Slice 2: `feat/1.1-safe-resync`, stacked on `4faca16`, one local commit, not pushed. No version bump.
- Client workspaces (KargaX, Labahub) are rolled out manually by the owner and are out of scope.

## Current state

- Slice 2: `agents sync <engine>` takes ownership only from the slice-1 record `.agentos/synced/<engine>.json`. Re-sync replaces exactly the recorded `permissions.allow`/`deny` entries (owner entries keep place and order; other keys, indent and trailing newline kept), replaces `.claude/agents/<role>.md` while it matches the recorded sha256, replaces only the Codex role block, and removes files recorded for a previous role. Hand-edited generated content, no record with a different list/file, or a broken record refuses with zero writes until `--replace` (one backup per overwritten file under `.agentos/runs/replaced-synced/<ts>/`). `--dry-run` prints per-file `+`/`-` entries and writes nothing. Files, backups and record are one mutation transaction.
- Shared classifier: `editedEntries` in `src/synced-config.ts` is used by both `syncFreshness` and the sync planner (`planSyncedFile` in `src/core.ts`); `mergeAddKeysOnly` was deleted.
- STALE line: `re-run agentos agents sync <engine> --role <id> [--scope '<a,b>']`, plus `--replace` only for `generated entry edited` and the 1.0.0 no-record case.
- Tests: `test/safe-resync.test.js` (11 tests; RED on `4faca16`: 9 of the first 10 fail, the Codex block test already passed); five older assertions updated to the new messages. Docs: `docs/engines.md` (Re-sync and `--replace`), `docs/migration.md`, `docs/agents.md`, README, CHANGELOG `[Unreleased]`, `docs/improve-later.md` (R1–R4 closed). Gates ran as `npm run ...` (no `bun` on PATH in the developer sandbox).
- History: slice 1 handoff `.agentos/runs/2026-10-26-1.1-slice1-handoff.md`; v1 closure/release state `.agentos/runs/2026-10-26-v1-release-state.md`; slices 1–6 `.agentos/runs/2026-10-25-v1-slice6-handoff.md`; older `.agentos/runs/2026-10-25-v1-slice1-history.md`.

## Known warnings / failures

- One sync record per engine: the last synced role wins and its files replace the previous role's (documented; per-role records are in `docs/improve-later.md`).
- `.claude/settings.local.json` is re-serialized (indent + trailing newline kept); non-standard spacing is normalised.
- `agentos status` does not show synced-config freshness (doctor does).
- `doctor` diagnostics list this repo's three legacy agent cards (developer, tester, release-manager).

## Next exact action

1. Phynceon: review slice 2 on `feat/1.1-safe-resync`; push/PR on approval.
2. Then slice 3 (complete generated workflow guidance).

## Protected files / do not touch

- `/home/app/**`, the Obsidian vault, Hermes config.
- Deprecated migration writers until the owner decides.

## Open decisions

- Removal of the deprecated legacy upgrade paths: retargeted to 2.0.0; owner decides.
- This repo's three non-matching legacy cards (developer, tester, release-manager): `agents manifest <id> --custom` or `agents add <id> --replace`.
- Alias/overlap consolidation candidates (`docs/migration.md`, keep / simplify / remove inventory).
- Import and quarantine (`templates import`): frozen.
