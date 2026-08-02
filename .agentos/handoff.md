# Handoff

## Current objective

Dogfood AgentOS inside the AgentOS repository so future AgentOS development uses project-owned context instead of chat-only memory.

## Scope

- Workspace kind: single-repo
- Repo in scope: `agentos-for-projects` at `.`
- Files in scope: `.agentos/`, root adapter files (`AGENTS.md`, `CLAUDE.md`, `.hermes.md`), Obsidian AgentOS notes, docs/tests only as needed for verification
- Protected paths: secrets, unrelated repos, Photobooth app repos unless explicitly requested

## Current state

- AgentOS repo has been initialized with `agentos init --existing`.
- AgentOS repo has been linked to Obsidian destination `Projects/AgentOS` in link-only mode.
- Project context has been hardened for a Node/TypeScript CLI package and npm/pnpm/Bun compatibility.
- Verification passed.
- Dogfood context was committed and pushed to `origin/main`.

## Last completed step

Committed and pushed the AgentOS dogfood context.

## Files changed

- `.agentos/project.yaml`
- `.agentos/memory.md`
- `.agentos/handoff.md`
- `.agentos/tasks.md`
- `.agentos/decisions.md`
- `.agentos/knowledge.md`
- `.agentos/agents/*`
- `.agentos/engines/*`
- `.agentos/repos/*`
- `AGENTS.md`
- `CLAUDE.md`
- `.hermes.md`
- Obsidian notes under `Projects/AgentOS/`

## Tests run

- `agentos doctor` — OK
- `agentos status` — OK
- `npm test` — 14 pass, 0 fail
- `npm run smoke` — pass
- `npm run test:package-managers` — npm/pnpm/Bun install and bin execution pass
- `npm pack --dry-run` — pass

## Known failures

None currently known.

## Next exact action

Add GitHub Actions CI for build/test/smoke/package-manager checks.

## Protected files / do not touch

- `.env` files
- auth tokens/secrets
- unrelated project repos
- Photobooth workspace unless the user explicitly asks to reinstall AgentOS there

## Open decisions

- Whether CI should run package-manager compatibility on every PR or only main/nightly if runtime cost becomes high.
- Whether to implement `doctor --json` before or after YAML parser adoption.
