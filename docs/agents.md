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
  source_hash: 5f0c…            # sha256 of the body below at install time
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
| `permission_intent` | yes | `read-only`, `edit-in-scope` or `release`. Anything else is rejected: a manifest cannot widen the task scope. Catalog defaults: planner, reviewer, security-reviewer `read-only`; release-manager `release`; developer, tester `edit-in-scope`. |
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
| `agents add <catalog-id\|template-path> [--name <id>] [--replace] [--dry-run]` | card + `project.yaml` (`agents.enabled`, profile `custom`) | Writes the card with its manifest (`installed_from`, package `version`, `source_hash` of the body). Re-adding an unmodified card is a no-op. A template that already has frontmatter is refused. |
| `agents show <id> [--json]` | nothing | State (`legacy`, `manifest`, `invalid`), enabled, capabilities, manifest, `modified`, problems. |
| `agents enable\|disable <id> [--dry-run]` | `project.yaml` `agents.enabled` only | Through the format-preserving editor (comments and layout kept). The card stays on disk. Disabling the last enabled agent is refused. Capabilities still pointing at a disabled id are reported. |
| `agents remove <id> [--dry-run]` | moves the card | Refuses (exit 1, zero writes) while referenced by `agents.enabled`, `agents.capabilities`, a current checkpoint's role, or a Brain record whose `scope` is the id or whose `tags` contain `<id>`/`agent:<id>`; lists every reference. Otherwise moves the card to `.agentos/runs/removed-agents/<ts>-<id>.md` in one mutation transaction. Nothing is deleted. |
| `agents manifest <id> --from-catalog\|--custom [--dry-run]` | card frontmatter | For a legacy card only; the body stays byte-identical. `--from-catalog` requires the card to byte-match the catalog card (else refused, zero writes). `--custom` writes `provenance: unknown`, `custom: true`. |
| `agents sync claude-code\|codex [--role] [--scope] [--dry-run] [--replace]` | engine-native files + `.agentos/synced/<engine>.json` | See [`docs/engines.md`](engines.md#re-sync-and---replace). Requires a manifest. Re-sync replaces only what the sync record owns; one record (one role) per engine. |

`context --role <id>` and `checkpoint --role <id>` exit 1 for a disabled role with an existing card, naming `agentos agents enable <id>`.

## Preservation rules

`agents add` overwrites an existing card only when it is clearly generated:

- a legacy card (no frontmatter) whose bytes equal the source card → gets its manifest (upgrade);
- a manifest card with `custom: false` whose body still hashes to `provenance.source_hash` → upgraded to the current source.

Everything else is refused with exit 1 and zero writes: `custom: true`, a body edited since install, a legacy card that differs from the source, an invalid manifest. `agents add <id> --replace --dry-run` prints a diff summary of the body and writes nothing; `agents add <id> --replace` replaces the card and keeps the old bytes under `.agentos/runs/replaced-agents/<ts>-<id>.md`.

`doctor --fix` only creates missing cards; it never rewrites an existing one, with or without a manifest (its only other card action is the existing migration of byte-matched retired cards). Since slice 6, every card AgentOS generates for a catalog agent — `init`, `doctor --fix` (a missing card, or the canonical card of a migrated retired one) and `templates copy agent:<id>` — carries its manifest: `provenance.installed_from: catalog:<id>`, `custom: false`, the body byte-identical to the catalog card. Existing legacy cards (no frontmatter) are never touched; `doctor` lists each with the exact command, `--from-catalog` when it byte-matches the catalog, otherwise `--custom` (or `agents add <id> --replace`). Provenance is never inferred for a card that does not match its source.

## What `custom` means

`custom: true` says "this card is mine": AgentOS treats it like a hand-edited card even when its body hash still matches, so neither `agents add` nor `doctor --fix` replaces it without `--replace`. `agents manifest <id> --custom` sets it together with `provenance: unknown` for a card AgentOS did not install or cannot match. Flip it to `false` by hand only if you want catalog upgrades again.

## Limits

- Existing workspaces keep their legacy cards until `agents manifest` or `agents add` runs; nothing upgrades them automatically.
- `knowledge_selectors`, `skills` and `tools_requested` are recorded but not used for context selection; only `tools_requested` reaches an engine (Claude Code subagent `tools:`, verified for the invoked subagent — closure T9).
- `import:<url>` provenance is accepted by the validator but `templates import` still writes legacy cards.

What the Claude Code deny rules written by `agents sync claude-code` cover and do not cover (siblings, listed paths, Bash redirects, residual new root files/dirs, `.agentos/` state, trust requirement): see [`docs/engines.md`](engines.md#what-the-claude-code-deny-rules-cover--do-not-cover).
