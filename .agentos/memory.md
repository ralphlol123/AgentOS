# Memory

Stable project facts only. Do not dump execution logs here.

- AgentOS for Projects is a Node/TypeScript CLI package that installs project-owned AI-agent context into single-repo and multi-repo workspaces.
- Package bin: `agentos` -> `dist/cli.js`; build output must be regenerated before packing/publishing.
- Preferred dogfood package manager is Bun; supported consumer/package-manager compatibility targets remain npm, pnpm, and Bun.
- AgentOS reads/writes `.agentos/project.yaml` with the `yaml` package; avoid regex/string-splice YAML parsing for project config changes.
- Core rule: one AgentOS per product/workspace; many repos inside it; each task declares repo scope.
- Obsidian integration is link-only and optional: never bulk-load the vault. A linked folder (`agentos obsidian init|link`, `knowledge.obsidian`) is a second location for the same Brain, not a second store: `canonical: workspace|vault` decides where records live, one file per record, links (never copies) on the other side, no sync. Vault records keep vault-relative `sources`; the absolute vault path lives only in `project.yaml` (`docs/obsidian.md`).
- Current command surface (`agentos help`): `init`, `status`, `handoff`, `run`, `doctor`, `adapters`, `compact`, `link-obsidian`, `obsidian`, `skills`, `agents`, `templates`, `migrate`, `prompt`, `context`, `engines`, `checkpoint`, `resume`, `brain`, `help`, `version`.
- `doctor --fix` never edits `engines.allowed`; the engine list is the owner's choice. Optional `task_scope: {read, edit}` in project.yaml separates read from edit permission; `repos:` is inventory only.
- Project Brain records are project Markdown files with validated frontmatter (`id: brain:<slug>`); the frontmatter is authoritative and `.agentos/brain/index.json` is derived. Changes go through proposals (`agentos brain propose/apply`); a changed `source_hash` means "changed since verification", not "wrong" (`docs/brain.md`).
- Agent cards: the frontmatter of `.agentos/agents/<id>.md` is a validated manifest (`docs/agents.md`); the task decides the edit scope and a manifest can only narrow it. No engine capability is `verified` until a recorded trial (`agentos engines`, `docs/engines.md`); generated engine config is not proof of enforcement.
- Release readiness uses `bun run release:check` plus `bun run publish:dry-run`; real `npm publish` still requires confirmed npm account/package ownership/version.
- AgentOS dogfoods itself in this repo before Photobooth rollout.
