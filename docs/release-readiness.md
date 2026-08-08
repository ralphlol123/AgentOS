# Release Readiness

This checklist prepares AgentOS for an npm release without publishing accidentally.

## Current package identity

```text
name: agentos-for-projects
version: 0.1.0
bin: agentos -> dist/cli.js
license: MIT
node: >=20
```

## Files published

`package.json` declares:

```json
"files": [
  "dist",
  "templates",
  "README.md"
]
```

npm also includes standard metadata such as `package.json` and `LICENSE`.

Expected runtime package contents:

```text
dist/
templates/
README.md
LICENSE
package.json
```

## Pre-release checks

Run from repo root:

```bash
bun run check
bun run test
bun run smoke
bun run test:package-managers
npm publish --dry-run --access public
node dist/cli.js doctor
node dist/cli.js status
git diff --check
```

Shortcut:

```bash
bun run release:check
```

## Real packed-install dogfood

Create and install a packed tarball in a clean temp project:

```bash
WORK=$(mktemp -d /tmp/agentos-release-check-XXXXXX)
PACKDIR="$WORK/pack"
PROJECT="$WORK/project"
mkdir -p "$PACKDIR" "$PROJECT"
npm pack --pack-destination "$PACKDIR"
TARBALL=$(find "$PACKDIR" -maxdepth 1 -name 'agentos-for-projects-*.tgz' -print -quit)
npm install -g "$TARBALL"
cd "$PROJECT"
agentos --version
agentos init --new
agentos agents list
agentos skills list
printf 'License: MIT\n# Sample Skill\nUse safely.\n' > sample-skill.md
agentos templates import sample-skill.md --type skill --name sample-skill --dry-run
agentos templates import sample-skill.md --type skill --name sample-skill --yes
agentos doctor
```

Use `find` to locate the tarball instead of capturing `npm pack` stdout directly: npm lifecycle output can appear around the filename.

The repository test `bun run test:package-managers` also packs the tarball and verifies npm, pnpm, and Bun can install and execute the `agentos` bin.

## Before real publish

Confirm with the owner:

- package name is final: `agentos-for-projects`;
- version is correct: `0.1.0` or a bumped version;
- npm account is logged in and has permission to publish;
- public access is intended;
- README reflects current CLI behavior;
- `templates/` should be part of the public package;
- no private project content is present in docs/templates.

## Publish command

Only after explicit approval:

```bash
npm publish --access public
```

## Post-publish smoke

Install from registry in a fresh environment:

```bash
npm install -g agentos-for-projects
agentos --version
mkdir /tmp/agentos-registry-smoke && cd /tmp/agentos-registry-smoke
agentos init --new
agentos doctor
agentos agents list
agentos skills list
```

## Known non-blockers

- `npm publish --dry-run --access public` may warn if not logged in. That is acceptable for dry-run release readiness as long as the tarball contents are correct and the dry-run completes.
- `gh` may be unavailable in WSL. PRs can still be opened manually from GitHub compare URLs.
