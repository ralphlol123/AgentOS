# Agent cards and manifests

`.agentos/agents/<id>.md` is the role's readable instruction card. Its YAML frontmatter, when present, is the role's **manifest**: validated metadata in the same file (the pattern Brain records use). `src/agents.ts` owns the format; `templates/schemas/agent-manifest.schema.json` is an informational copy that a test keeps in step with `validateAgentManifest()`.

```markdown
---
id: developer
name: developer
purpose: Implement scoped changes and their tests inside the assigned repo, ...
responsibilities:
  - Read AgentOS project, memory, handoff, and tasks first.
knowledge_selectors: []
skills: []
tools_requested: []
permission_intent: edit-in-scope
expected_output: Report files changed, verification run (real command output or inspected state), failures, and the next action.
provenance:
  installed_from: catalog:developer
  version: 0.9.0
  source_hash: 5f0c…            # sha256 of the body below at install time (CRLF read as LF)
  installed_at: 2026-10-25T05:00:00.000Z
custom: false
---
# Developer
...
```

## Keys

| Key | Required | Meaning |
|---|---|---|
| `id` | yes | Lowercase-hyphen id; must equal the file name. |
| `name` | yes | Display name. |
| `purpose` | yes | One line; the catalog `Mandate:` line. |
| `responsibilities` | yes | List; the card's `Responsibilities in` bullets. |
| `knowledge_selectors` | yes | List of Brain kinds, ids or terms the role usually needs (empty for catalog cards; not yet used for selection). |
| `skills` | yes | List of skill ids (empty for catalog cards; the card body names skills in prose). |
| `tools_requested` | yes | List of engine tool names. Becomes the Claude Code subagent `tools:` list on `agents sync claude-code`. |
| `permission_intent` | yes | `read-only`, `edit-in-scope` or `release`. Anything else is rejected: a manifest cannot widen the task scope. Catalog defaults: researcher, planner, reviewer, security-reviewer `read-only`; release-manager `release`; developer, writer, tester `edit-in-scope`. |
| `expected_output` | yes | What the role reports when it stops. |
| `provenance` | yes | `unknown`, or `{installed_from: catalog:<id> \| template:<path> \| import:<url>, version, source_hash, installed_at}`. |
| `custom` | yes | `true` = the owner owns this card (see preservation). |
| `edit_request` | no | Repo ids or workspace-relative paths the role asks to edit. Advisory only; see scope. |

Unknown keys (manifest or provenance) are rejected. An invalid manifest is a `doctor` problem and narrows nothing in `context` (a warning says so).

## Scope: the task decides, the manifest only narrows

The effective edit scope is the task's (`task_scope.edit` in `project.yaml`, narrowed by `agentos context --scope`). Then:

- `permission_intent: read-only` → edit scope `[]` (warning when the task had one);
- `edit-in-scope` and `release` → the task's edit scope unchanged;
- `edit_request` entries not covered by the task's edit scope → ignored, with a warning. A card declaring `edit_request: [backend]` under task scope `[web]` gets edit `[web]`.

The same effective scope feeds `agentos context`, `agentos checkpoint` and `agentos agents sync`.

## Lifecycle

| Command | Writes | Behaviour |
|---|---|---|
| `agents add <catalog-id\|template-path\|url> [--name <id>] [--replace] [--dry-run] [--yes] [--expected-sha256 <hash>]` | card + `project.yaml` (`agents.enabled`, profile `custom`) | Writes the card with its manifest (`installed_from`, package `version`, `source_hash` of the body). Re-adding an unmodified card is a no-op. A template that already has frontmatter is refused. A URL, or a file that is not a valid agent template, goes through the safe import ([safe-imports.md](safe-imports.md); preview until `--yes`) and becomes a manifest card. A valid template file is also refused on a BLOCK finding of the import review. |
| `agents show <id> [--json]` | nothing | State (`legacy`, `manifest`, `invalid`), enabled, capabilities, manifest, `modified`, problems. For an agent that is not installed: the catalog card (since 2.1.0). |
| `agents enable\|disable <id> [--dry-run]` | `project.yaml` `agents.enabled` only | Through the format-preserving editor (comments and layout kept). The card stays on disk. Disabling the last enabled agent is refused. Capabilities still pointing at a disabled id are reported. |
| `agents remove <id> [--dry-run]` | moves the card | Refuses (exit 1, zero writes) while referenced by `agents.enabled`, `agents.capabilities`, a current checkpoint's role, or a Brain record whose `scope` is the id or whose `tags` contain `<id>`/`agent:<id>`; lists every reference. Otherwise moves the card to `.agentos/runs/removed-agents/<ts>-<id>.md` in one mutation transaction. Nothing is deleted. |
| `agents manifest <id> --custom [--dry-run]` | card frontmatter | For a legacy card only; the body stays byte-identical. Writes `provenance: unknown`, `custom: true`. A card that byte-matches its catalog card gets its catalog manifest from `doctor --fix` (`--from-catalog` was removed in 3.0.0). |
| `agents sync claude-code\|codex [--role] [--scope] [--dry-run] [--replace]` | engine-native files + `.agentos/synced/<engine>.json` | See [`docs/engines.md`](engines.md#re-sync-and---replace). Requires a manifest. Re-sync replaces only what the sync record owns; one record (one role) per engine. |

`context --role <id>` and `checkpoint --role <id>` exit 1 for a disabled role with an existing card, naming `agentos agents enable <id>`.

## Preservation rules

`agents add` overwrites an existing card only when it is clearly generated:

- a legacy card (no frontmatter) whose bytes equal the source card → gets its manifest (upgrade);
- a manifest card with `custom: false` whose body still hashes to `provenance.source_hash` → upgraded to the current source.

Everything else is refused with exit 1 and zero writes: `custom: true`, a body edited since install, a legacy card that differs from the source, an invalid manifest. `agents add <id> --replace --dry-run` prints a diff summary of the body and writes nothing; `agents add <id> --replace` replaces the card and keeps the old bytes under `.agentos/runs/replaced-agents/<ts>-<id>.md`.

`doctor --fix` creates missing cards and, since 2.1.0, gives a legacy card that byte-matches its catalog card its manifest (body byte-identical). It never rewrites any other existing card (3.0.0 removed the migration of retired cards). Since slice 6, every card AgentOS generates for a catalog agent — `init`, `doctor --fix` (a missing card) and `agents add <id>` — carries its manifest: `provenance.installed_from: catalog:<id>`, `custom: false`, the body byte-identical to the catalog card. Other legacy cards (no frontmatter) are never touched; `doctor` lists each with the exact command: `doctor --fix` when it byte-matches the catalog, otherwise `agents manifest <id> --custom` (or `agents add <id> --replace`). Provenance is never inferred for a card that does not match its source.

## What `custom` means

`custom: true` says "this card is mine": AgentOS treats it like a hand-edited card even when its body hash still matches, so neither `agents add` nor `doctor --fix` replaces it without `--replace`. `agents manifest <id> --custom` sets it together with `provenance: unknown` for a card AgentOS did not install or cannot match. Flip it to `false` by hand only if you want catalog upgrades again.

## Limits

- Existing workspaces keep their legacy cards until `doctor --fix` (catalog-matching cards), `agents manifest --custom` or `agents add` runs.
- `knowledge_selectors`, `skills` and `tools_requested` are recorded but not used for context selection; only `tools_requested` reaches an engine (Claude Code subagent `tools:`, verified for the invoked subagent — closure T9).
- `agents add <url|file>` writes a manifest card (`import:<url>` or `template:<path>`); cards imported by `templates import` before 3.0.0 are legacy cards (`agents manifest <id> --custom`).

What the Claude Code deny rules written by `agents sync claude-code` cover and do not cover (siblings, listed paths, Bash redirects, residual new root files/dirs, `.agentos/` state, trust requirement): see [`docs/engines.md`](engines.md#what-the-claude-code-deny-rules-cover--do-not-cover).

## Lean team

New projects default to `core`: **Developer, Writer, Researcher**. Existing projects retain their configured agents. Explicit `init --agents minimal` retains the historical four-role team; it is a compatibility profile, not the new recommendation. Optional tester, reviewer, planner, release-manager and security-reviewer cards remain available.

| Role | Assignments | Default model preference |
| --- | --- | --- |
| Developer | Implement, debug, refactor, test, plan; independent review in a fresh session | standard |
| Writer | README, guides, examples, changelog; validate claims against code | economy |
| Researcher | Investigate a bounded question, compare options, return sources and uncertainties; read-only | standard |

The engine's main session coordinates. Do not invoke all three for every task. A small code fix can stay in one session. Delegate only when a bounded assignment benefits from separate context or different capabilities. Review requires a fresh session that did not author the change; it does not require a permanent Reviewer identity. Security-sensitive work can use an optional specialist and stronger review. Publishing remains an authorized workflow, not an autonomous role entitlement.

Each assignment needs a workspace, task ID, objective, read/edit scope, acceptance criteria and expected result. The coordinator owns shared checkpoints and handoff updates. Workers return evidence; they do not concurrently rewrite shared state. Roles share the Project Brain and load relevant records on demand. Sequential work remains supported when an engine cannot spawn subagents.

### Native team definitions

```sh
agentos agents sync claude-code --team --dry-run
agentos agents sync claude-code --team
agentos agents sync codex --team
agentos agents sync opencode --team
```

This opt-in export requires validated manifests (for legacy custom cards, review and use `agents manifest <id> --custom`). It writes **all enabled cards**, including custom ones, as coexisting `agentos-<role>` definitions:

| Engine | Files | Limits |
| --- | --- | --- |
| Claude Code | `.claude/agents/agentos-<role>.md` | Read-only roles get a read/web tool allowlist; inherited settings still apply |
| Codex | `.codex/agents/agentos-<role>.toml` | Permissions inherit from the parent; read-only intent is advisory unless the parent sandbox enforces it |
| OpenCode | `.opencode/agents/agentos-<role>.md` | Read-only roles deny edit and bash; custom tools still need session-level review |
| Other engines | Portable `.agentos/agents/<role>.md` | No native team export; load the card in the main or a fresh session |

Schemas follow the documented formats ([Claude Code](https://code.claude.com/docs/en/sub-agents), [Codex](https://learn.chatgpt.com/docs/agent-configuration/subagents), [OpenCode](https://opencode.ai/docs/agents/)). **Live discovery, delegation, model selection and permission behavior for these exports have not yet been verified.** They are not covered by older task-scoped engine trials. Restart/reload the engine as its documentation requires, confirm each definition is discovered, and run a bounded assignment before relying on it.

Team export does not start engines, schedule workers, alter project task scope, edit global settings, or prove enforcement. Existing task-scoped `agents sync <engine> --role <role> --scope <paths>` remains separate. `--team` rejects `--role` and `--scope`; assign those boundaries when delegating. Legacy Claude settings may still restrict team agents. Team export leaves those settings intact. `tools_requested` is not exported in team mode; configure additional tools in the engine session. No role file grants approval to use unavailable or forbidden tools.

Ownership is recorded separately in `.agentos/synced/team-<engine>.json`. Re-export after changing enabled roles, cards or model mappings. `--dry-run` reports what would change, without writing. Unmodified owned exports are updated/removed transactionally; unrelated files remain untouched. Edited exports cause a refusal, unless `--replace` is explicitly supplied (overwritten content is backed up). Edit source cards rather than generated files. Team records do not satisfy `context --require-synced-config`, which checks the older task-scoped configuration. Use team dry-run to inspect team drift; doctor’s engine matrix continues to describe task-scoped adapters.

### Model selection

Optional manifest fields:

```yaml
model_preference: economy  # economy | standard | deep; advisory
models:
  claude-code: haiku       # example: configure an available model/alias
  # codex: <an actual model available to your Codex installation>
  # opencode: <provider/model available in your installation>
```

An explicit mapping is exported only for that engine. Without one, the field is omitted and the engine/session default is inherited; sync prints that fact. AgentOS neither probes accounts nor silently substitutes a different model. If an explicit model is unavailable, resolve the engine error by choosing a supported model or removing the mapping, then re-export. The preference alone does not route requests. No names such as Luna/Terra are assumed to be public or supported engine model IDs.

Use economy for routine, well-specified writing; escalate technical synthesis and ambiguous work when needed. Research can also be simple or difficult. A role name is insufficient to determine model quality or price. Compare total task cost (including repeated context, failed attempts and review), correctness and elapsed time on representative assignments before claiming savings.

### Adopting the core team in an existing project

1. Preserve current custom cards and review capability mappings in `project.yaml`.
2. Install missing roles with `agentos agents add writer` and `agentos agents add researcher`.
3. Explicitly set `agents.profile: core` and `agents.enabled: [developer, writer, researcher]`. Map implementation/qa/review/planning to developer, documentation to writer and research to researcher. Remove mappings to disabled roles or retain those roles if still needed. Review occurs in a fresh session; the mapping does not automate that requirement.
4. Keep optional cards until their references are resolved; do not bulk-delete existing cards. Refresh generated definitions with `agents sync <engine> --team --dry-run`, review, then export.

Do not change an existing team by rerunning `init`: preserving the owner's configuration is intentional.
