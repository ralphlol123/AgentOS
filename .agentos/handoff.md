# Handoff

## Current objective

Improve global install/publish flow once the package is ready to publish.

## Scope

- Workspace kind: single-repo
- Repo in scope: `agentos-for-projects` at `.`
- Files in scope: `package.json`, `README.md`, `LICENSE`, `test/package-metadata.js`, `.github/workflows/ci.yml`, `.agentos/*`
- Protected paths: secrets, npm tokens, unrelated repos, Photobooth app repos unless explicitly requested

## Current state

- npm package name checked with `npm view agentos-for-projects`; registry returned 404 from this environment, so the name appears unpublished.
- Added package metadata for publishing:
  - `repository`
  - `bugs`
  - `homepage`
  - `publishConfig.access: public`
- Fixed `bin.agentos` to `dist/cli.js` via `npm pkg fix` so npm no longer auto-corrects/removes the bin during dry-run publish.
- Added release scripts:
  - `pack:dry-run`: `npm pack --dry-run`
  - `publish:dry-run`: `npm publish --dry-run --access public`
  - `release:check`: check + tests + smoke + package-manager compatibility + publish dry-run
- Added `LICENSE` with MIT license text.
- Added `test/package-metadata.js` to verify package metadata and packed tarball contents.
- CI now includes `bun run publish:dry-run` after pack dry-run.
- README documents package/publish flow and warns not to run real publish until npm account/name/version are confirmed.

## Last completed step

Verified release readiness locally.

## Files changed

- `package.json`
- `README.md`
- `LICENSE`
- `test/package-metadata.js`
- `.github/workflows/ci.yml`
- `.agentos/tasks.md`
- `.agentos/status.md`
- `.agentos/memory.md`
- `.agentos/handoff.md`

## Tests run

- RED: `bun run build && node --test test/package-metadata.js` failed because `publishConfig.access` was missing and `LICENSE` was not packed.
- GREEN: metadata tests passed after adding metadata/LICENSE/scripts and fixing package bin.
- `npm view agentos-for-projects name version repository --json || true` — returned npm 404, name appears unpublished from this environment.
- `npm install --package-lock-only` — OK
- `bun install --lockfile-only` — OK
- `npm pkg fix` — changed `bin.agentos` from `./dist/cli.js` to `dist/cli.js`
- `bun run publish:dry-run` — OK; dry-run warns login is required for real publish, expected.
- PyYAML workflow parse — OK
- `actionlint .github/workflows/ci.yml` — OK
- `bun install --frozen-lockfile` — OK
- `bun run build` — OK
- `node dist/cli.js doctor --json` parsed by `python3 -m json.tool` — OK
- `bun run release:check` — OK; unit tests 20 pass, smoke OK, npm/pnpm/Bun compatibility OK, publish dry-run OK
- `bun pm pack --dry-run` — OK; package has 9 files, unpacked size ~128.6KB
- `agentos doctor` — OK
- `agentos status` — OK
- `npm install -g /home/hermes/agentos-for-projects` — OK
- global `agentos --version` — `0.1.0`
- global `agentos init --existing --dry-run` — OK

## Known failures

None currently known.

## Next exact action

Commit and push global install/publish flow improvements.

## Protected files / do not touch

- `.env` files
- npm tokens / auth files
- auth tokens/secrets
- unrelated project repos
- Photobooth workspace unless the user explicitly asks to reinstall AgentOS there

## Open decisions

- Confirm package ownership/name before real `npm publish`.
- Decide whether first real release should be `0.1.0` or a bumped version after more dogfood.
