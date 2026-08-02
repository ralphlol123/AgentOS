# Tasks

## Done

- [x] Phase 1 agent model shipped and pushed.
- [x] Photobooth rollout to detected profile + on-demand skills verified.
- [x] `agentos run` Phase 2 placed on hold per Ralph.
- [x] Token-efficiency audit started: live context measured, stale wildcard adapter reads found.
- [x] Optimized generated adapter/prompt text to load core files first, then only relevant repo/agent/engine/skill context.
- [x] Fixed stale-adapter replacement so `doctor --fix` replaces old AgentOS sections instead of appending duplicate bootloaders.
- [x] Compacted live dogfood handoff/tasks and archived prior verbose state under `.agentos/runs/`.

## Now

- [x] Finish verification and Claude Code review for token-efficiency hardening.
- [ ] Commit/push token-efficiency hardening and verify remote.

## Next

- [ ] Wait for Ralph's next concrete AgentOS priority. Do not start `agentos run` unless Ralph explicitly reopens it.

## Later

- [ ] Consider real `npm publish` only after npm account, package ownership, and release version are confirmed.
