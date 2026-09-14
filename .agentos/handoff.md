# Handoff

## Current objective

Post-release (0.4.0) maintenance. Catalog cleanup slices 1–5 are shipped, released, and rolled out. The next engineering slice is **version-upgrade migration UX** (see `.agentos/tasks.md` → `## Now`). It is not yet planned: no plan file exists, and no code for it has been written.

## Current state

- Repo: `agentos-for-projects` (single-repo workspace), branch `main`.
- `main` == `origin/main` at `866e43f49081ce7381544e6feb1294c74da3ad81` (merge of PR #21, `chore/v0.4.0-release`).
- Package version: `0.4.0`, documented in `CHANGELOG.md` (`## [0.4.0] - 2026-09-14`).
- Shipped and merged: PR #20 (`feat/catalog-cleanup`, slices 1–5) and PR #21 (`chore/v0.4.0-release`, version bump + CHANGELOG).
- Rolled out to real workspaces: Labahub (`/home/app/www/laundry-pos`) and KargaX (`/home/app/www/kargax/new`), both on the six-agent + 15-skill catalog via `doctor --fix` + `skills add` + manual adapter resolution.
- This reconciliation run changed **state files only**: `.agentos/tasks.md` (post-release rewrite) and this file. No source, template, test, or `dist/` changes.
- Worktree cleanup (this run): `/home/hermes/agentos-catalog-cleanup`, `/home/hermes/agentos-v0.4.0-release`, and `.agentos-for-projects/.worktrees/reliability` were each confirmed clean (0 dirty, 0 staged, 0 untracked) and confirmed merged into `origin/main` before removal. Registry pruned; only the primary checkout remains.
- Preserved evidence from the removed reliability worktree: `/home/hermes/agentos-archive/2026-09-10-reliability-evidence/` (9 files: `release-check.log`, `reliability-suite.log`, `node20-tests.log`, `node22-tests.log`, `bun-pack.log`, `metadata-check.log`, `pull-request.md`, `restore-cli.py`, `restore-core.py`). SHA256-verified against the originals before deletion.
- Intentionally left untracked and unmodified: `.agentos/plans/2026-08-10-worktrees-optional-install-wizard.md`, `.agentos/runs/2026-09-11-engine-acceptance-evidence.json`, `.agentos/runs/2026-09-11-post-merge-verification.md`, `.agentos/runs/compact-archive-20260815T165850Z.md`, `system-discovery-gap-analysis.md`.

## Files changed

- `.agentos/tasks.md` (state)
- `.agentos/handoff.md` (state)

## Tests run

None in this run. Documentation/state-only change; no implementation file, `dist/`, or `templates/` content was touched. The last full verification of shipped code remains the 0.4.0 release gate (`bun run build`, `check`, `test`, `smoke`, `test:package-managers`, packed-install dogfood on npm/pnpm/Bun).

## Known warnings / failures

- Hosted CI visibility is still unresolved: the connected GitHub account (ralphlol123) previously received 404s for repository/PR/workflow APIs, so Linux Node 20 and macOS outcomes were never confirmed from the agent side. If access is restored, inspect those jobs.
- External-engine acceptance (OpenCode agent-card discovery, nested-child parent-directory access) is unresolved per `.agentos/runs/2026-09-11-post-merge-verification.md`; owner-reviewed interactive acceptance has not been performed.
- Untracked artifacts above are deliberate, not leftovers to be cleaned without an explicit decision.

## Next exact action

Owner review of `.agentos/plans/2026-09-14-upgrade-migration-ux.md` (written this run, left untracked like the other plan files). The plan covers the three recorded gaps — custom-content adapters, unsafe repo IDs, retired-card cleanup — as five slices starting with a read-only migration inventory in `doctor`/`doctor --json`. No implementation may start before owner approval, and each slice must run the normal slice → verify → independent review → one scoped commit flow. Four decisions are flagged in the plan's section 9 (backup sidecar policy, repo-ID normalization default, retired-card pruning default, target version).

## Open decisions

- Whether custom-content adapter migration should rewrite in place or always emit a backup sidecar before touching `AGENTS.md`/`CLAUDE.md`.
- Whether unsafe repo-ID normalization is automatic in `doctor --fix` or confirmation-gated.
- Whether retired-card cleanup is automated or report-only by default.
- Whether to add stronger OpenCode-native `.opencode` integration later; current fix uses repo-visible `AGENTS.md` pointers.
- Whether to add proactive quota/risk detection later.

## Historical context (superseded)

Earlier catalog-cleanup, reliability, and sub-repo engine skill-access work is complete and merged. See `.agentos/runs/` for the preserved run records and `docs/reliability-acceptance.md` for reliability contracts and limits.
