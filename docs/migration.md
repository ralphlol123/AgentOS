# Migrating an existing workspace to v1

v1 (released as 1.0.0) adds files and keys; it removes and renames nothing. A workspace created by 0.9.0 keeps working without any change, and every v1 feature is adopted by running its command. Nothing below is applied by `doctor --fix`.

## What `doctor` says on a 0.9.0 workspace

Measured on 2026-10-25: a two-directory workspace (`web/`, `api/`, one root git repo) initialised with `agentos init --existing --yes` from `3c03372` (0.9.0), then checked with the v1 build:

- `agentos doctor` → `AgentOS doctor: OK`, exit 0. No new problem or warning. New **diagnostics** only: one line per agent card without a manifest, with the exact command, e.g. `legacy agent card .agentos/agents/developer.md has no manifest; add one with \`agentos agents manifest developer --from-catalog\`` (since 2.1: `` add one with `agentos doctor --fix` (it matches the catalog card) ``).
- `agentos doctor --json` → exit 0, `"ok": true`.
- `agentos doctor --fix --dry-run` → `AGENTS.md`, `CLAUDE.md`, `.hermes.md`: `noop` (the adapter generators did not change in v1).
- `git status --short` after all of the above: empty (nothing written).

## New files and keys

| What | Created by | Old workspace without it | Adopt with |
|---|---|---|---|
| `task_scope: {read, edit}` in `.agentos/project.yaml` | the owner (hand edit) | Prompt/context unchanged; `context` uses read = whole workspace, edit = none (warning). An **invalid** `task_scope` makes `prompt` and `doctor` fail. | Add the key (see [README](../README.md#v1-workflow) step 3); `agentos doctor` validates it |
| Agent manifest frontmatter in `.agentos/agents/<id>.md` | `init`, `doctor --fix` (missing card; since 2.1 also a legacy card that byte-matches the catalog), `agents add`, `agents manifest` | Legacy cards (no frontmatter) keep working; a customised one is never rewritten; `doctor` lists them as diagnostics. `agents sync` refuses a legacy card. | `agentos doctor --fix` (card byte-matches the catalog; before 2.1 `agents manifest <id> --from-catalog`) or `agentos agents manifest <id> --custom` (yours; `provenance: unknown`), or `agentos agents add <id> --replace` (old card kept under `.agentos/runs/replaced-agents/`). See [agents.md](agents.md) |
| `.agentos/checkpoints/<task>/` (records, `current.json`, `evidence/*.log`) and a `## Checkpoint (managed)` block in `handoff.md` | `agentos checkpoint` | Absent = no checkpoint; `resume` exits 1 with a clear message (or shows a read-only recovered view when files changed). Not gitignored by default. `doctor` fails on a `current.json` pointing at a missing/invalid record. Records written before slice 7 have no per-repo `state` key and stay valid. | `agentos checkpoint --task <id> …`, `agentos resume --task <id>`. See [checkpoints.md](checkpoints.md) |
| `.agentos/brain/` (`index.json`, `proposals/`, `applied/`) and Brain frontmatter on registered Markdown files | `agentos init`, `agentos brain register\|propose\|apply` | Absent = no records; `context` still reads `.agentos/decisions.md` per heading as before. `index.json` is derived, never read as truth. | `agentos init` (templates; it runs the Brain setup) or `agentos brain register <path>`. See [brain.md](brain.md) |
| `knowledge.obsidian.canonical` and `knowledge.obsidian.index` | `agentos obsidian init`, `agentos obsidian link` | Configs from `link-obsidian` / `obsidian link --note` (link-only) or `obsidian link-workspace` / `obsidian link --no-index` (both old commands removed in 3.0.0) keep working and get no new warning; a missing `canonical` means `workspace`. | `agentos obsidian init [--dir <path>]` or `agentos obsidian link --vault <abs> --dest <folder> [--canonical workspace\|vault] --create`. See [obsidian.md](obsidian.md) |
| `.claude/settings.local.json` `permissions.allow` / `permissions.deny`, `.claude/agents/<id>.md` | `agentos agents sync claude-code` only | Absent = Claude Code gets the scope as instructions only. | `agentos agents sync claude-code [--role <id>] [--dry-run]`, then trust the workspace (`claude` once interactively, or `projects[<root>].hasTrustDialogAccepted`). The first sync adds keys to an existing file; an existing different `allow`/`deny` list without a sync record refuses with zero writes until `--replace` (takes the lists over, one backup; 1.1). This covers a file written by the unreleased slice-5 sync for a read-only role (bare `Edit`/`Write`/`NotebookEdit`), which becomes `Edit(/**)`/`Write(/**)`/`NotebookEdit(/**)`. See [engines.md](engines.md) |
| Codex role block `<!-- agentos:role:start/end -->` in an `AGENTS.md` | `agentos agents sync codex` only | Absent = Codex reads the normal adapters. | `agentos agents sync codex [--role <id>]` |

Behaviour that changed for existing data:

- `checkpoint`/`resume`: a repo path that is a directory inside one enclosing git work tree used to be `unavailable (not the top of a git work tree)`; it is now available with `state: enclosing-worktree` (HEAD/branch of the enclosing repo, git calls limited to the directory). A checkpoint taken before this change and resumed after it reports that repo as `drifted (was unavailable at checkpoint time)` once; take a new checkpoint.
- `agentos context <engine>` ADVISORY line for claude-code and codex now states the conditional enforcement instead of `instruction-only`. `--require-enforcement` exits 1 for every engine (closure 3); the synced deny-set check that used to pass it is `--require-synced-config`. Scripts that relied on `context claude-code --require-enforcement` exiting 0 must switch to `--require-synced-config`, which checks configuration presence, not enforcement.
- `agents sync claude-code` now also denies every sibling entry outside the edit scope (v1 closure). A `.claude/settings.local.json` written by an earlier v1 sync has the listed-path deny list only: `context claude-code --require-synced-config` reports it `STALE`; re-sync with `agentos agents sync claude-code --replace` (no record yet; see the 1.1 section below).
- **Settings synced by `71cdb19` are STALE and must be re-synced.** That build added `Edit(/*)` and `Write(/*)` for new root-level files. Claude Code matches `/*` recursively (gitignore-style), so in a trusted workspace those two rules deny every edit, including the edit scope itself (closure re-trial T6b: all 14 probe items denied, `web/src/a.js` included). Closure 2 no longer generates them: `context claude-code --require-synced-config` reports the old file `STALE`; run `agentos agents sync claude-code --replace` (preview with `--dry-run --replace`: it lists `- permissions.deny: Edit(/*)` and `- permissions.deny: Write(/*)`). The `.claude/agents/<id>.md` of a read-only role, or of a role with `tools_requested`, now carries a `tools:` line; the same `--replace` replaces it (one backup).

## 1.0.0 → unreleased (1.1): sync records and safe re-sync

- `agents sync <engine>` now also writes `.agentos/synced/<engine>.json`, a record of what it generated (role, scope, per-file sha256, generated settings entries). `agentos doctor` and `context <engine> --require-synced-config` check the synced config against it ([engines.md](engines.md#synced-config-freshness)).
- **Syncs made by 1.0.0 have no record.** Both commands report `Synced config: STALE — synced by 1.0.0 without a record; re-run agentos agents sync <engine> --replace` (doctor: a warning, exit status unchanged; nothing is rewritten). Detection: a `.claude/agents/*.md` carrying the ``Generated by `agentos agents sync claude-code` `` comment, or a `<!-- agentos:role:start -->` block in the root or a repo `AGENTS.md`. Re-run the sync with the same `--role`/`--scope`: if nothing drifted, the plain command leaves the engine files unchanged and writes only the record. If anything differs (a changed deny list, the `Edit(/*)`/`Write(/*)` rules from `71cdb19`, an older `.claude/agents/<id>.md`), the plain command refuses with zero writes because no record says which entries are AgentOS's; `--replace` takes over `permissions.allow`/`permissions.deny` wholesale and the generated files, backs each overwritten file up once under `.agentos/runs/replaced-synced/<timestamp>/`, and writes the record. Owner rules you want to keep in `allow`/`deny`: copy them back from the backup once; from then on re-syncs keep them in place. Preview first with `agentos agents sync claude-code --dry-run --replace`. A workspace that never ran `agents sync` sees no change in `doctor` output.
- **Safe re-sync.** With a record, `agents sync` replaces exactly the recorded entries and files and keeps owner entries in place; hand-edited generated content refuses with zero writes until `--replace`. The STALE line names `--replace` only in those cases. One record per engine: syncing another role replaces the previous role's files. Details: [engines.md](engines.md#re-sync-and---replace).
- `context codex --require-synced-config` used to print `UNSUPPORTED — codex has no synced config`; it now checks the Codex role block (`MISSING` until `agents sync codex`). The OK line names the recorded role: `Synced config: OK (<engine>, role <id>, sha256 <8>)`. `--json` `synced_config` may carry `role` and `reason`, and `status` may be `invalid`.
- **New workflow guide.** The generated `.agentos/guide.md` now names the v1 loop: `context`, `checkpoint`/`resume` (preferred over the now-deprecated `run handoff`), `brain propose` (owner previews and applies), `agents sync` and the `Synced config: STALE` warning, and `task_scope`. `doctor` reports a 1.0.0 guide as stale (`.agentos/guide.md managed block is stale …`); run `agentos doctor --fix` to refresh it (only the managed block changes; text outside it is kept). Root adapters do not change.
- **Set `task_scope`.** Without `task_scope` (`read`/`edit`) in `.agentos/project.yaml`, `agentos context` reports an empty edit scope and the guide tells engines to ask the owner for it. Add it per task (README, "v1 workflow", step 3).

## 2.1.0 → 3.0.0: the 11-command CLI

2.1.0 added the new forms and deprecated the old ones with one notice each; **3.0.0 removes the old forms**. Each removed form exits 1 with one line, `agentos <x> was removed in 3.0.0; use <new>`, and writes nothing. The removed → new table: [migration-3.0-cli.md](migration-3.0-cli.md). Workspaces pick up the guide and adapters (which name only the new forms) with `agentos doctor --fix`.

**Legacy migrations:** 3.0.0 also removes the legacy upgrade paths (adoption of custom adapters, retired-card migration and pruning, repo-ID renaming, `migrate claude`). A workspace that still needs one runs `npx agentos-for-projects@2 doctor --fix` once first (with the flag its report names), then upgrades. 3.0.0 still reports them read-only in the `doctor --json` `migration` inventory, whose `next` names the manual step or the 2.x command.

## Command inventory

`keep` = part of the 11-command CLI. `removed in 3.0` = exits 1 naming its replacement (deprecated in 2.1, where it still works).

| Command / module | Status | Use instead | Note |
|---|---|---|---|
| `init`, `status`, `doctor`, `doctor --fix`, `doctor --json` | keep | | Core. `init --yes` documented. |
| `init --agents detected` | removed in 3.0 | `init --agents minimal` | Same team (also the default without `--agents`); pinned by `cli-3.0.test.js` and `v1-slice1.test.js`. |
| `status --full`, `context --brief`, `context --strict`, `doctor --explain`, `doctor --engines` | keep (2.1) | | `context --brief` is byte-identical to the old `prompt` (pinned by `v1-slice2-context.test.js`). |
| `handoff` | removed in 3.0 | `status --full` | |
| `run handoff` | removed in 3.0 | `checkpoint` / `resume` | Checkpoints carry receipts `resume` reconciles. |
| `prompt` | removed in 3.0 | `context [engine] --brief` | |
| `adapters explain` | removed in 3.0 | `doctor --explain <file>` | |
| `engines` | removed in 3.0 | `doctor --engines [--json]` | |
| `context`, `checkpoint`, `resume` | keep | | |
| `brain …` | keep | | `brain verify` is an optional sign-off. |
| `brain validate` | removed in 3.0 | `brain preview` | `preview` exits 1 on a rejection. |
| `brain init` (workspace) | removed in 3.0 | `init` | `brain init --location vault` stays. |
| `agents list\|add\|show\|enable\|disable\|remove\|sync` | keep | | `agents add <file\|url>` imports; `agents show` shows a catalog card that is not installed. |
| `agents manifest --from-catalog` | removed in 3.0 | `doctor --fix` | `doctor --fix` gives byte-matched legacy cards their manifest. |
| `agents manifest --custom` | keep | | Custom legacy cards; `doctor` lists them. No replacement exists. |
| `skills list\|show\|add\|remove` | keep | | `skills add <file\|url>` imports; `add <file> --dry-run` is the template check (exit 1 when invalid). |
| `skills add --mode summary\|full` | removed in 3.0 | `skills add` | Catalog cards are always complete; imports keep a summary excerpt. |
| `templates list\|show\|copy\|validate\|import` | removed in 3.0 | `agents\|skills list\|show\|add` | The import safety scan moved intact; an imported agent is a manifest card. |
| `obsidian init`, `obsidian link`, `obsidian status` | keep | | `obsidian link --no-index`, `obsidian link --note <path>`. |
| `obsidian link-workspace` | removed in 3.0 | `obsidian link --no-index` | Configs it wrote are still read (`cli-3.0.test.js`, KargaX-style). |
| `link-obsidian` (exact-note `link-only` mode) | removed in 3.0 | `obsidian link --note <path>` | `mode: link-only` configs are still read. |
| `compact`, `compact --archive-only` | keep | | |
| `compact --checkpoint` | removed in 3.0 | `compact --archive-only` | Name clashed with the `checkpoint` command. |
| `compact --rewrite` | removed in 3.0 | `compact` | |
| `doctor --fix --adopt-custom-adapters` | removed in 3.0 | 2.x once, or by hand | `doctor --fix` refuses an `adopt` file with zero writes and names both. |
| `doctor --fix --prune-retired`; retired agent-card migration in `doctor --fix` | removed in 3.0 | 2.x once, or `agents add` / `skills remove` + `skills add` | Retired cards are `manual-review` in the inventory and a `doctor` warning. |
| `doctor --fix --normalize-repo-ids` | removed in 3.0 | 2.x once, or rename by hand | An unsafe ID is a `doctor` problem naming both. |
| `migrate claude` | removed in 3.0 | 2.x once, or by hand | |
| `src/legacy-deprecation.ts`, `src/legacy-skill-shapes.ts` | deleted in 3.0 | | Backed only the removed paths and the 2.1 notices. |
| retired-id alias resolution in `src/aliases.ts` | keep | | Cheap; protects old workspaces' `project.yaml`. |
| read-only `migration` inventory in `doctor --json` | keep | | `adapters`, `repoIds`, `retiredCards`, `summary` (no `deprecations` since 3.0). |
| whole-file legacy adapter conversion (`migrate` class) in `doctor --fix` | keep | | Same planner that keeps adapters current; no flag. |
| `src/core.ts` (~4.5k lines) | keep (extract later) | | Extract along slice boundaries as later work touches it. |
| `src/context-builder.ts`, `checkpoint.ts`, `brain.ts`, `agents.ts`, `engines.ts`, `task-scope.ts`, `git-evidence.ts` | keep | | v1 modules. |
