# Tasks

Active scope: AgentOS 1.1 — dependable everyday development (three sequential slices, then a Claude + Codex validation run). v1 history: `.agentos/runs/2026-10-26-v1-release-state.md`.

## Done

- [x] AgentOS 1.0.0 released (`main` = `99553dc`, npm latest 1.0.0; PRs #46–#54 merged).
- [x] 1.1 slice 1 on `feat/1.1-sync-freshness`: sync record + synced-config freshness in `doctor` and `context --require-synced-config` (local commit, not pushed).

## Now

- [ ] Phynceon: review 1.1 slice 1 (`feat/1.1-sync-freshness`); push/PR on approval.

## Next

- [ ] 1.1 slice 2: safe agent re-sync (replace AgentOS-generated entries recorded in `.agentos/synced/<engine>.json`, keep owner entries).
- [ ] 1.1 slice 3: complete generated workflow guidance.
- [ ] Claude + Codex validation run (Phynceon).

## Later

- [ ] Removal of the deprecated upgrade paths (2.0.0): owner decision.
- [ ] Optional refinements in `docs/improve-later.md`.
