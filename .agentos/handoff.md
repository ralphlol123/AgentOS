# Handoff

## Current objective

Generalize Ralph's KargaX commit-message workflow into a reusable AgentOS `conventional-commit` skill template, then prepare for the release branch after this PR merges.

## Scope

- Repo: `agentos-for-projects` only.
- Branch: `feat/conventional-commit-skill-template`.
- In scope:
  - `templates/skills/github/conventional-commit.md`
  - built-in skill catalog entry
  - template/catalog tests
  - README/templates docs
- Out of scope:
  - publishing to npm
  - editing KargaX repos
  - changing release version

## Current state

- Started from latest `origin/main`, which already included import safety hardening.
- Inspected KargaX source skill at `/home/app/www/kargax/new/.opencode/skills/kargax-commit/SKILL.md`.
- Generalized its reusable behavior:
  - inspect latest git state before message generation
  - prefer staged diff when present
  - do not stage/commit/push without explicit user request
  - stop on secrets/sensitive files/unrelated concerns
  - optionally run configured quality checks and re-inspect after formatter changes
  - choose Conventional Commit type/scope from the actual diff
  - imperative subject + past-tense outcome body bullets
- Added `templates/skills/github/conventional-commit.md`.
- Added `conventional-commit` to the `github` built-in skill catalog so `github-pack` and detected Git workspaces include it.
- Updated tests and docs.
- Packed installed CLI smoke passed for template list/show/copy/validate, overwrite protection, `--replace`, and `github-pack` materialization.
- Full verification gate passed.

## Last completed step

- Full verification gate exited 0.

## Files changed

- `.agentos/handoff.md`
- `.agentos/tasks.md`
- `README.md`
- `docs/templates.md`
- `src/core.ts`
- `test/core.test.js`
- `templates/skills/github/conventional-commit.md`
- generated `dist/core.js`
- generated `dist/core.js.map`

## Tests run

- `bun run test` — passed, 54 tests / 0 failures.
- Packed installed CLI smoke — passed with `COMMIT_SKILL_TEMPLATE_SMOKE_PASS`.
- Full gate — passed:
  - `bun run check`
  - `bun run test`
  - `bun run smoke`
  - `bun run test:package-managers`
  - `npm publish --dry-run --access public`
  - `node dist/cli.js doctor`
  - `node dist/cli.js status`
  - `git diff --check`

## Known failures

- None.

## Next exact action

1. Commit and push `feat/conventional-commit-skill-template`.
2. Open PR and merge.
3. After merge, start `chore/release-0.1.0`.

## Protected files / do not touch

- Do not edit `/home/app/www/kargax/new`.
- Do not publish npm package yet.
- Do not start release branch until this skill-template branch is pushed/merged.

## Open decisions

- Whether to merge this small skill-template PR before starting `chore/release-0.1.0`.
