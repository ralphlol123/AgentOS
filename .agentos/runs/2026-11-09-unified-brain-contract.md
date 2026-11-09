# Unified Brain contract: audit and first milestone

Baseline: AgentOS main a96729c831217f1caf76f8a5929f92cf205d7432, version 3.3.0.
Working branch: feat/unified-brain-contract. Local changes only.

## Evidence and recommendation

Connected GitHub access and a local checkout allowed source inspection. The user's Windows/WSL vault and engine installations are not accessible here.

The current Obsidian surface is implemented in src/core.ts (init/link/status, knowledge.obsidian and local vault bindings). src/brain.ts retains generic record canonical ownership, proposals, policy/history and mirrors. Context ranks Brain content but does not call an engine MCP server. Checkpoint/resume reconciles repository drift. There was no shared-memory project contract.

Latest reviewed archive: unified-brain-v0.2(2).zip, SHA256 d40ecc9eb827bdbadd43be896089b1c3a403b47a152bbf88ffd7676410717550. Compared with v0.2(1), changes are documentation and per-engine guides; Python implementation/tests are unchanged. Its 26 tests pass, which does not establish actual engine interoperability.

Reproduced upstream weaknesses: individual-file registry scopes fail project listing; unknown IDs route writes to global folders; generic remember checkpoint writes bypass dedicated validation; checkpoint supersession lacks task identity and can hide another task; repeated writes create new UUID entries rather than deduplicate retries.

Recommendation: AgentOS owns stable project mapping, authority rules, local recovery and common instructions. Engines own connections/tool calls; Unified Brain owns the vault registry and entries. Obsidian is the human interface. Keep plans/repository ADRs authoritative in Git and save references/curated knowledge in the vault. Connection configuration alone cannot enforce memory use.

## Implemented

- Validated portable mapping and consistent rules for all engine contexts; status/doctor/context distinguish invalid, disabled and configured-unverified.
- Additive preview/apply mapping script, packaged playbook, preservation/conflict/locking tests.
- Missing external retrieval remains explicit, including failure of --require-complete while enabled. No invented receipt or automatic retry queue.
- Existing generic Brain/checkpoint/handoff and Obsidian paths retained. No vault notes moved or engine configuration overwritten.

## Migration sequence

1. Ship this opt-in contract; existing projects remain unchanged.
2. Fix upstream routing/validation/task-identity/retry behavior and validate actual engines.
3. Inventory each project's canonical notes, edited mirrors, plans and pending proposals. Reuse its stable ID and exact registry paths, preserving old notes and rollback config.
4. Deprecate Obsidian init/link and dedicated mirror setup only after replacement setup and readback work. Retain status/diagnostics during migration and retain any vault reader needed by existing canonical records.
5. Consider removal only in a separately announced breaking release. Generic Brain, checkpoint and handoff are not removal candidates.

The detailed setup and existing/new project, failure and two-actual-engine acceptance procedure is docs/shared-memory.md. Automated context tests are not an actual-engine handoff.

## Verification

- Final full AgentOS regression run: 883 tests passed, 0 failed, 0 skipped.
- Unified Brain latest archive: 26 tests passed.
- Final sequential smoke, package metadata (3 passed) and npm pack --dry-run passed.
- Earlier overlapping package rebuild/test run invalidated dist during tests; discarded. An intermediate clean run found a guide wording regression; restored wording before the final passing full run.
- User PC vault/Claude pilot evidence is user-reported, not independently repeated here. Codex/OpenCode/Hermes connectivity and two-engine handoff remain unverified.

No release, commit, push or PR was performed.

## PR preparation follow-up

User authorized commit/push and a PR on 9 November 2026. Latest origin/main remains a96729c. Guidance now describes the separately fixed Unified Brain v0.2.1 contract (34 upstream tests passed), task IDs and locally retained retry IDs, while retaining conservative behavior for older/unknown tool schemas.

Final AgentOS checks after this update: typecheck passed; 883/883 tests passed; smoke passed; package metadata 3/3 passed. Bun is absent, so the full npm/pnpm/Bun compatibility release gate is not certified locally. No package version bump or npm publication is part of this PR. Real-engine handoff remains unverified.

Publish dry-run built the package but exited 1 because version 3.3.0 is already published; it also reported missing npm login. Publication requires a separately versioned release after review and remaining gates.
