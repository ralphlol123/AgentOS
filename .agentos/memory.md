# Memory

Stable project facts only. Do not dump execution logs here.

- AgentOS for Projects is a Node/TypeScript CLI package that installs project-owned AI-agent context into single-repo and multi-repo workspaces.
- Package bin: `agentos` -> `dist/cli.js`; build output must be regenerated before packing/publishing.
- Preferred dogfood package manager is Bun; supported consumer/package-manager compatibility targets remain npm, pnpm, and Bun.
- AgentOS reads/writes `.agentos/project.yaml` with the `yaml` package; avoid regex/string-splice YAML parsing for project config changes.
- Core rule: one AgentOS per product/workspace; many repos inside it; each task declares repo scope.
- Obsidian integration is link-only: create/link specific notes through `.agentos/knowledge.md`; never bulk-load the vault.
- Current command surface: `init`, `status`, `handoff`, `doctor`, `compact`, `link-obsidian`, and `prompt`.
- Release readiness uses `bun run release:check` plus `bun run publish:dry-run`; real `npm publish` still requires confirmed npm account/package ownership/version.
- AgentOS dogfoods itself in this repo before Photobooth rollout.
