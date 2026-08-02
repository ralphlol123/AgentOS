# Memory

Stable project facts only. Do not dump execution logs here.

- AgentOS for Projects is a Node/TypeScript CLI package that installs project-owned AI-agent context into single-repo and multi-repo workspaces.
- Package bin: `agentos` -> `dist/cli.js`; build output must be regenerated before packing/publishing.
- Supported package managers for consumers and compatibility testing: npm, pnpm, and Bun.
- Core rule: one AgentOS per product/workspace; many repos inside it; each task declares repo scope.
- Obsidian integration is link-only: create/link specific notes through `.agentos/knowledge.md`; never bulk-load the vault.
- Current command surface: `init`, `status`, `handoff`, `doctor`, `compact`, `link-obsidian`, and `prompt`.
- AgentOS dogfoods itself in this repo before Photobooth rollout.
