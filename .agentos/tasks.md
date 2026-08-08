# Tasks

## Done

- [x] Phase 1 agent model shipped and pushed.
- [x] Photobooth rollout to detected profile + on-demand skills verified.
- [x] `agentos run` Phase 2 placed on hold per Ralph.
- [x] Token-efficiency hardening completed, reviewed, committed, pushed, and verified at `c9c9fc8`.
- [x] KargaX AgentOS experiment findings recorded and KargaX workspace rolled back to `.claude`.
- [x] Merged `feat/local-skills-custom-agents`, `feat/template-library`, and `feat/docs-and-release-readiness` into `main`.
- [x] Verified merged `main` after PR #3.
- [x] Created `feat/template-registry-polish` from verified `main`.
- [x] Added RED tests for `agentos templates list/show/copy/validate`; watched them fail.
- [x] Implemented template registry list/show/copy/validate and watched tests pass.
- [x] Updated README and quickstart/templates docs for registry commands.
- [x] Ran safe throwaway-repo smoke with packed/installed AgentOS; result `SAFE_THROWAWAY_REPO_SMOKE_PASS`.
- [x] Ran full verification: check, test, smoke, package-manager tests, publish dry-run, doctor, status, diff-check.

## Now

- [ ] Review final diff, commit, and push `feat/template-registry-polish`.

## Next

- [ ] Open/review PR for `feat/template-registry-polish`.
- [ ] Decide release path: publish `0.1.0`, bump first, or continue polish.

## Later

- [ ] Stronger safe-import license/review/quarantine flow.
- [ ] Keep `agentos run` on hold unless Ralph explicitly reopens it.
- [ ] Do not re-enable AgentOS in KargaX unless Ralph explicitly asks.
