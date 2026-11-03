# Handoff

## Current objective

`context --about` ranks Brain records better with exactly two changes: common English function words are not match terms, and a Brain record that matched an `--about` term is packed before the always-relevant optional items. Mandatory items, scope/status filters, the PR #76 budget guarantee and behaviour without `--about` stay unchanged. Title/heading weighting, term frequency, stemming, date tie-breaks and skip-and-continue packing are out of scope.

## Scope

- Repo: `agentos-for-projects`, single-repo workspace.
- Baseline: `313107b` on `fix/context-budget-accounting` (PR #76, not merged), package 3.2.0. Unreleased changes; no version bump or release is requested.
- Branch: `feat/brain-ranking-stoplist-packing` (stacked on PR #76); task id: `brain-ranking-stoplist-packing`.
- Allowed changes: `STOPWORDS` and the rank order in `src/context-builder.ts`, tests, docs/context-builder.md, CHANGELOG Unreleased and this repository's AgentOS state.

## Current state

- `82b9a17`: RED test `test/brain-ranking-stoplist-packing.test.js` (3 tests). At `313107b` 2 failed (a function-word-only `--about` matched `brain:stale-rates` on how, long, time; under a tight budget `acceptance` was packed before the `--about` Brain hit) and the no-`--about` order guard passed.
- `1a71fc4`: `STOPWORDS` gains 67 function-word entries (the evaluation's 69-word simulate list minus `get`, `make`, `about`, with `doe` covered by `does`; plus `time`, `long`); entries go through the same `words()` normalisation as terms, so `does` matches and the old `this` entry now takes effect. Ranked records sort Brain `--about` hits first, then the old order. 833/833 tests; no existing test changed.
- `821f926`: docs/context-builder.md (stopwords, selection step 5, budget line) and a CHANGELOG Unreleased `### Changed` line.
- 18-query re-run with the real CLI, 313107b vs this branch (evidence outside the repo, in the task folder): hit@1 5→7/18, hit@1 without a tie 4→4, hit@3 11→11, present at tight 10→13, present at tighter 5→10; F2-para and F3-para lose their only (function-word) match and become no-match. At tight budgets acceptance, handoff current state and verification are dropped in some rows (F3-broad, F3-question, F4-*). No `ok:true` over its limit; without `--about` all 54 baseline outputs are byte-identical.
- Verification at `821f926` (local WSL, npm), TMPDIR=/tmp and a 207-character TMPDIR: `npm run check` clean; `npm test` 833/833; `npm run smoke` exit 0; `npm run test:metadata` 3/3. Bun not run (not installed here).
- All commits are local; nothing pushed.
- Previous state: `.agentos/runs/2026-11-03-before-brain-ranking-stoplist-packing.md`.

## Next exact action

Phynceon reviews the local commits on `feat/brain-ranking-stoplist-packing`, then pushes and opens a draft PR stacked on #76.

## Protected files / do not touch

- Secrets, .env files, migrations and production config.
- `.github/workflows/`, client workspaces, external Obsidian vaults and Hermes configuration.
- `package.json` version and CHANGELOG release headings (release PR).

## Open decisions

- Release version and merge remain separate from this implementation; PR #76 keeps its own merge gate.
- Whether Brain-first packing should wait for title/heading weighting (#2): with noisy single-word `--about` queries it packs unrelated Brain records before acceptance and handoff state at tight budgets.
- Whether `time` and `long` should stay stopwords (named in the task; they can be project terms).

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
