# Handoff

## Current objective

Cap Brain-first packing for `context --about`: at most three Brain `--about` hits (the top three in rank order) move ahead of the other optional records, and only while every always-relevant item (acceptance, handoff state, repo note, verification, read paths) that fits in the usual order still fits. Everything else keeps the usual order (score, freshness, source order). The stoplist, the PR #76 budget guarantee, scope/status filters and behaviour without `--about` stay unchanged. Title weighting, stemming, other tie-breaks, #71 and #72 are out of scope.

## Scope

- Repo: `agentos-for-projects`, single-repo workspace.
- Baseline: `main` at `d54ec30` (PRs #76 and #78 merged), package 3.2.0. Unreleased changes; no version bump or release is requested.
- Branch: `fix/brain-first-cap`; task id: `brain-first-cap`.
- Allowed changes: the rank/packing step in `src/context-builder.ts`, tests, docs/context-builder.md, CHANGELOG Unreleased and this repository's AgentOS state.

## Current state

- `b0becf6`: RED. New `test/brain-first-cap.test.js` (3 tests: F3-question-style fixture at ceil(needed x 1.15) keeps the target, acceptance, current state and next action; a long-reference variant at needed + target + always-relevant tokens keeps them all; only the top three hits are promoted and the 4th and later follow the task sections in their usual order). In `test/brain-ranking-stoplist-packing.test.js` the #78 test that required an always-relevant item to be dropped now requires the opposite (record first when there is room; not promoted when that would drop an always-relevant item). At `d54ec30`: 4 of the 6 tests fail. With a plain cap of three (no guard), 2 still fail (long references; the webhook case), so the plain cap was not enough.
- `49b0aa5`: fix. Packing is a `pack(order)` helper (same greedy fill and trailer loop as before); the usual order is packed, then the top 3, 2, 1 Brain `--about` hits are tried first and the first try that keeps every always-relevant item of the usual packing wins. Without `--about` there is nothing to try, so it is the old single pass. 836/836 tests.
- `96f2a9b`: docs/context-builder.md (selection step 5, budget line) and a CHANGELOG Unreleased `### Changed` line.
- Real CLI, ledgerline case, F3-question at `--budget 3952`: 313107b, d54ec30 and the fix are all ok; acceptance, current state, next action, verification and repo note are included at 313107b and with the fix, all omitted for budget at d54ec30 (11 Brain records); the fix includes 6 Brain records, the target among them. 18-query re-run: task sections lost at tight 15 (313107b) / 30 (d54ec30) / 15 (fix). No `ok:true` over its limit; without `--about` all 54 baseline outputs are byte-identical d54ec30 vs fix. Evidence outside the repo, in the task folder.
- Verification at `96f2a9b` (local WSL, npm), TMPDIR=/tmp and a 211-character TMPDIR: `npm run check` clean; `npm test` 836/836; `npm run smoke` exit 0; `npm run test:metadata` 3/3. Bun not run (not installed here).
- All commits are local; nothing pushed.
- Previous state: `.agentos/runs/2026-11-03-before-brain-first-cap.md`.

## Next exact action

Phynceon reviews the local commits on `fix/brain-first-cap`, then pushes and opens a PR against `main`.

## Protected files / do not touch

- Secrets, .env files, migrations and production config.
- `.github/workflows/`, client workspaces, external Obsidian vaults and Hermes configuration.
- `package.json` version and CHANGELOG release headings (release PR).

## Open decisions

- Release version and merge remain separate from this implementation.
- The guard protects every always-relevant item, read paths included; a narrower set (acceptance, handoff, verification only) would let a promoted hit displace read-path pointers.
- Whether `time` and `long` should stay stopwords (from #78; they can be project terms).

<!-- agentos:checkpoint:start -->
## Checkpoint (managed)

- Task: unify-current-task-state
- Record: `.agentos/checkpoints/unify-current-task-state/2026-11-03T09-05-27-224Z-af1f3cdc.json`
- Repos: agentos-for-projects feat/unify-current-task-state@a16062d (0 changed)
- Progress: Phase 1 (context): a checkpoint that saves --next records supersedes digests of handoff.md § Current state and § Next exact action; agentos context marks prose still matching as [superseded by checkpoint <id>] and keeps it as history. RED then GREEN in test/handoff-continuity.test.js (3 new tests).…
- Blockers: none
- Next: In src/core.ts statusAgentOS, print one 'Current next action' line from the newest .agentos/checkpoints/*/current.json record (by updated_at: task id, checkpoint id, its Next), and add a test in test/handoff-continuity.test.js that status shows that Next exactly once after a checkpoint while handof…
- Receipts: observed-pass 2, observed-fail 0, claimed 0, not-run 3, unavailable 0
- Resume: `agentos resume --task unify-current-task-state`
<!-- agentos:checkpoint:end -->
