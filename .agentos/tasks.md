# Tasks

## Done

- [x] Phase 1 agent model shipped and pushed.
- [x] Photobooth rollout to detected profile + on-demand skills verified.
- [x] `agentos run` Phase 2 placed on hold per Ralph.
- [x] Token-efficiency hardening completed, reviewed, committed, pushed, and verified at `c9c9fc8`.
- [x] KargaX AgentOS experiment findings recorded and KargaX workspace rolled back to `.claude`.
- [x] Prepared and pushed `feat/local-skills-custom-agents` at `399beb3`.
- [x] Implemented AgentOS repo template library for agents, skills, schemas, and import examples.
- [x] Implemented `agentos agents list/add`, `agentos skills list`, and guarded `agentos templates import`.
- [x] Verified template library with build/check/test/smoke/package-manager/publish-dry-run/doctor/status/diff-check.

## Now

- [ ] Review final diff, commit, and push `feat/template-library`.

## Next

- [ ] Open PR for `feat/template-library` after push if GitHub auth is available; otherwise provide manual PR URL.
- [ ] Review merge order: `feat/local-skills-custom-agents` should merge before `feat/template-library` because this branch builds on it.

## Later

- [ ] Consider real `npm publish` only after npm account, package ownership, and release version are confirmed.
- [ ] Keep `agentos run` on hold unless Ralph explicitly reopens it.
- [ ] Do not re-enable AgentOS in KargaX unless Ralph explicitly asks.
