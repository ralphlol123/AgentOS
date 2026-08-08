# Tasks

## Done

- [x] Phase 1 agent model shipped and pushed.
- [x] Photobooth rollout to detected profile + on-demand skills verified.
- [x] `agentos run` Phase 2 placed on hold per Ralph.
- [x] Token-efficiency hardening completed, reviewed, committed, pushed, and verified at `c9c9fc8`.
- [x] KargaX AgentOS experiment findings recorded and KargaX workspace rolled back to `.claude`.
- [x] Merged `feat/local-skills-custom-agents`, `feat/template-library`, `feat/docs-and-release-readiness`, and `feat/template-registry-polish` into `main`.
- [x] Verified merged `main` after PR #4.
- [x] Created `feat/import-safety-hardening` from verified `main`.
- [x] Added RED tests for overwrite protection, `--replace`, quarantine, URL fetch failures, and risky-content warnings.
- [x] Implemented hardening and watched tests pass: 54 tests / 0 failures.
- [x] Updated README, quickstart, templates, and safe-import docs for hardening behavior.
- [x] Ran packed installed CLI hardening smoke; result `IMPORT_SAFETY_HARDENING_SMOKE_PASS`.
- [x] Ran full verification: check, test, smoke, package-manager tests, publish dry-run, doctor, status, diff-check.

## Now

- [ ] Review final diff, commit, and push `feat/import-safety-hardening`.

## Next

- [ ] Open/review PR for `feat/import-safety-hardening`.
- [ ] After merge, create `chore/release-0.1.0` for changelog/release notes/final publish prep.

## Later

- [ ] Real npm publish only after explicit package/account/version approval.
- [ ] Keep `agentos run` on hold unless Ralph explicitly reopens it.
- [ ] Do not re-enable AgentOS in KargaX unless Ralph explicitly asks.
