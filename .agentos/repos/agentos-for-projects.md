# AgentOS For Projects Repo

Path: `.`
Type: Node/TypeScript CLI package
Framework: Node CLI, TypeScript ESM
Primary dogfood package manager: Bun
Supported consumer package managers: npm, pnpm, Bun

## Commands

- Install: `bun install --frozen-lockfile`
- Build: `bun run build`
- Type check: `bun run check`
- Unit tests: `bun run test`
- Smoke test: `bun run smoke`
- Package-manager compatibility: `bun run test:package-managers`
- Pack verification: `bun pm pack --dry-run`

## Scope rules

- Edit this repo only when task scope includes `agentos-for-projects`.
- Regenerate `dist/` after TypeScript source changes.
- Stage exact intended files only; do not use broad `git add -A` in shared workspaces.
- Do not modify Photobooth or other client workspaces during AgentOS package work unless explicitly requested.

## Current product surface

Daily workflow: `agentos status`, `agentos context <engine> --task <id>`, work and milestone `agentos checkpoint --task <id>`, then another engine continues with the same id. `agentos resume --task <id>` provides detailed reconciliation and recovery evidence.

Setup and maintenance: `init`, `doctor`, `upgrade`, `brain`, `agents`, `skills`, `obsidian`, `compact`. The executable help and `.agentos/guide.md` are the command reference.
