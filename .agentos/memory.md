# Memory

Stable project facts only. Do not dump execution logs here.

- AgentOS for Projects is a Node/TypeScript CLI package that installs project-owned AI-agent context into single-repo and multi-repo workspaces.
- Package bin: `agentos` -> `dist/cli.js`; build output must be regenerated before packing/publishing.
- Preferred dogfood package manager is Bun; supported consumer/package-manager compatibility targets remain npm, pnpm, and Bun.
- AgentOS reads/writes `.agentos/project.yaml` with the `yaml` package; avoid regex/string-splice YAML parsing for project config changes.
- Core rule: one AgentOS per product/workspace; many repos inside it; each task declares repo scope.
- Obsidian integration is link-only and optional: never bulk-load the vault. A linked folder (`agentos obsidian init|link`, `knowledge.obsidian`) is a second location for the same Brain, not a second store: `canonical: workspace|vault` decides where records live, one file per record, links (never copies) on the other side, no sync. Vault records keep vault-relative `sources`; the absolute vault path is machine-local in git-ignored `.agentos/local.yaml` (wins over a legacy `knowledge.obsidian.vault` in `project.yaml`) (`docs/obsidian.md`, `docs/migration-project-brain.md`).
- The Project Brain is independent of Obsidian: `brain`, `context`, `checkpoint` and `resume` need only workspace Markdown plus `project.yaml`. An absent, disabled (`knowledge.obsidian.enabled: false`), unbound or invalid integration never blocks them, but vault-only records stay listed as Missing.
- Current command surface (`agentos help`): `init`, `status`, `doctor`, `upgrade`, `context`, `checkpoint`, `resume`, `brain`, `agents`, `skills`, `obsidian`, `compact`, `help`, `version` (3.0.0 removed the 2.x old forms; see docs/migration-3.0-cli.md).
- `doctor --fix` never edits `engines.allowed`; the engine list is the owner's choice. Optional `task_scope: {read, edit}` in project.yaml separates read from edit permission; `repos:` is inventory only.
- Project Brain records are project Markdown files with validated frontmatter (`id: brain:<slug>`); the frontmatter is authoritative and `.agentos/brain/index.json` is derived. Changes go through proposals: engines stage them with `agentos brain propose <record> --from <file> --task <id>` (tied to the task's checkpoint); the owner runs `brain preview`/`brain apply`; a changed `source_hash` means "changed since verification", not "wrong" (`docs/brain.md`).
- Agent cards: the frontmatter of `.agentos/agents/<id>.md` is a validated manifest (`docs/agents.md`); the task decides the edit scope and a manifest can only narrow it. An engine capability is `verified` only with a recorded trial section as evidence (`agentos doctor --engines`, `docs/engines.md`; 2026-10-25 trial, n=1): Claude Code restricts edits only with deny rules in a trusted workspace (allow-only rules do nothing), Codex only via its launch-time `--sandbox`; generated engine config alone is not proof of enforcement.
- Checkpoint/resume treat a repo path inside an enclosing git work tree (child dirs of one root repo) as `state: enclosing-worktree`, scoped by pathspec (`docs/checkpoints.md`).
- Release readiness uses `bun run release:check` plus `bun run publish:dry-run`; real `npm publish` still requires confirmed npm account/package ownership/version.
- AgentOS dogfoods itself in this repo before Photobooth rollout.
