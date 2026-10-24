# Memory

Stable project facts only. Do not dump execution logs here.

- AgentOS for Projects is a Node/TypeScript CLI package that installs project-owned AI-agent context into single-repo and multi-repo workspaces.
- Package bin: `agentos` -> `dist/cli.js`; build output must be regenerated before packing/publishing.
- Preferred dogfood package manager is Bun; supported consumer/package-manager compatibility targets remain npm, pnpm, and Bun.
- AgentOS reads/writes `.agentos/project.yaml` with the `yaml` package; avoid regex/string-splice YAML parsing for project config changes.
- Core rule: one AgentOS per product/workspace; many repos inside it; each task declares repo scope.
- Obsidian integration is link-only: create/link specific notes through `.agentos/knowledge.md`; never bulk-load the vault.
- Current command surface (`agentos help`): `init`, `status`, `handoff`, `run`, `doctor`, `adapters`, `compact`, `link-obsidian`, `obsidian`, `skills`, `agents`, `templates`, `migrate`, `prompt`, `context`, `checkpoint`, `resume`, `brain`, `help`, `version`.
- `doctor --fix` never edits `engines.allowed`; the engine list is the owner's choice. Optional `task_scope: {read, edit}` in project.yaml separates read from edit permission; `repos:` is inventory only.
- Project Brain records are project Markdown files with validated frontmatter (`id: brain:<slug>`); the frontmatter is authoritative and `.agentos/brain/index.json` is derived. Changes go through proposals (`agentos brain propose/apply`); a changed `source_hash` means "changed since verification", not "wrong" (`docs/brain.md`).
- Release readiness uses `bun run release:check` plus `bun run publish:dry-run`; real `npm publish` still requires confirmed npm account/package ownership/version.
- AgentOS dogfoods itself in this repo before Photobooth rollout.
