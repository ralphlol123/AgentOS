# Handoff

## Current objective

Add GitHub Actions CI for AgentOS using Bun as the primary dogfood package manager while preserving npm/pnpm/Bun compatibility verification.

## Scope

- Workspace kind: single-repo
- Repo in scope: `agentos-for-projects` at `.`
- Files in scope: `.github/workflows/ci.yml`, `bun.lock`, `package.json`, `README.md`, `.agentos/*`, regenerated `dist/*`
- Protected paths: secrets, unrelated repos, Photobooth app repos unless explicitly requested

## Current state

- Added `.github/workflows/ci.yml`.
- CI uses `oven-sh/setup-bun@v2`, installs with `bun install --frozen-lockfile`, and runs Bun commands.
- CI also sets up pnpm because `test:package-managers` verifies npm, pnpm, and Bun tarball installs.
- Added `bun.lock`.
- Made package scripts package-manager-neutral by removing nested `npm run` calls from scripts.
- Updated docs and AgentOS context to show Bun as the preferred dogfood path.
- Verification passed locally.

## Last completed step

Validated workflow YAML/schema and executed the equivalent workflow steps locally.

## Files changed

- `.github/workflows/ci.yml`
- `bun.lock`
- `package.json`
- `README.md`
- `dist/core.d.ts`
- `dist/core.js.map`
- `.agentos/project.yaml`
- `.agentos/memory.md`
- `.agentos/repos/agentos-for-projects.md`
- `.agentos/tasks.md`
- `.agentos/status.md`
- `.agentos/handoff.md`
- `AGENTS.md`

## Tests run

- PyYAML workflow parse — OK
- actionlint `.github/workflows/ci.yml` — OK
- `bun install --frozen-lockfile` — OK
- `bun run build` — OK
- `bun run check` — OK
- `bun run test` — 14 pass, 0 fail
- `bun run smoke` — OK
- `bun run test:package-managers` — npm/pnpm/Bun install and bin execution pass
- `bun pm pack --dry-run` — OK
- `agentos doctor` — OK
- `agentos status` — OK

## Known failures

None currently known.

## Next exact action

Commit and push the Bun-based CI changes, then start `agentos doctor --json`.

## Protected files / do not touch

- `.env` files
- auth tokens/secrets
- unrelated project repos
- Photobooth workspace unless the user explicitly asks to reinstall AgentOS there

## Open decisions

- Whether to keep package-manager compatibility on every CI run or later split it into a slower scheduled job.
- Whether to implement `doctor --json` before or after YAML parser adoption.
