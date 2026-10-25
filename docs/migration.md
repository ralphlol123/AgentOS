# Migrating an existing workspace to v1

v1 (released as 1.0.0) adds files and keys; it removes and renames nothing. A workspace created by 0.9.0 keeps working without any change, and every v1 feature is adopted by running its command. Nothing below is applied by `doctor --fix`.

## What `doctor` says on a 0.9.0 workspace

Measured on 2026-10-25: a two-directory workspace (`web/`, `api/`, one root git repo) initialised with `agentos init --existing --yes` from `3c03372` (0.9.0), then checked with the v1 build:

- `agentos doctor` → `AgentOS doctor: OK`, exit 0. No new problem or warning. New **diagnostics** only: one line per agent card without a manifest, with the exact command, e.g. `legacy agent card .agentos/agents/developer.md has no manifest; add one with \`agentos agents manifest developer --from-catalog\``.
- `agentos doctor --json` → exit 0, `"ok": true`.
- `agentos doctor --fix --dry-run` → `AGENTS.md`, `CLAUDE.md`, `.hermes.md`: `noop` (the adapter generators did not change in v1).
- `git status --short` after all of the above: empty (nothing written).

## New files and keys

| What | Created by | Old workspace without it | Adopt with |
|---|---|---|---|
| `task_scope: {read, edit}` in `.agentos/project.yaml` | the owner (hand edit) | Prompt/context unchanged; `context` uses read = whole workspace, edit = none (warning). An **invalid** `task_scope` makes `prompt` and `doctor` fail. | Add the key (see [README](../README.md#v1-workflow) step 3); `agentos doctor` validates it |
| Agent manifest frontmatter in `.agentos/agents/<id>.md` | `init`, `doctor --fix` (missing card), `templates copy agent:<id>`, `agents add`, `agents manifest` | Legacy cards (no frontmatter) keep working and are never rewritten; `doctor` lists them as diagnostics. `agents sync` refuses a legacy card. | `agentos agents manifest <id> --from-catalog` (card byte-matches the catalog) or `--custom` (yours; `provenance: unknown`), or `agentos agents add <id> --replace` (old card kept under `.agentos/runs/replaced-agents/`). See [agents.md](agents.md) |
| `.agentos/checkpoints/<task>/` (records, `current.json`, `evidence/*.log`) and a `## Checkpoint (managed)` block in `handoff.md` | `agentos checkpoint` | Absent = no checkpoint; `resume` exits 1 with a clear message (or shows a read-only recovered view when files changed). Not gitignored by default. `doctor` fails on a `current.json` pointing at a missing/invalid record. Records written before slice 7 have no per-repo `state` key and stay valid. | `agentos checkpoint --task <id> …`, `agentos resume --task <id>`. See [checkpoints.md](checkpoints.md) |
| `.agentos/brain/` (`index.json`, `proposals/`, `applied/`) and Brain frontmatter on registered Markdown files | `agentos brain init\|register\|propose\|apply` | Absent = no records; `context` still reads `.agentos/decisions.md` per heading as before. `index.json` is derived, never read as truth. | `agentos brain init` (templates) or `agentos brain register <path>`. See [brain.md](brain.md) |
| `knowledge.obsidian.canonical` and `knowledge.obsidian.index` | `agentos obsidian init`, `agentos obsidian link` | Configs from `link-obsidian` (link-only) or `obsidian link-workspace` keep working and get no new warning; a missing `canonical` means `workspace`. | `agentos obsidian init [--dir <path>]` or `agentos obsidian link --vault <abs> --dest <folder> [--canonical workspace\|vault] --create`. See [obsidian.md](obsidian.md) |
| `.claude/settings.local.json` `permissions.allow` / `permissions.deny`, `.claude/agents/<id>.md` | `agentos agents sync claude-code` only | Absent = Claude Code gets the scope as instructions only. | `agentos agents sync claude-code [--role <id>] [--dry-run]`, then trust the workspace (`claude` once interactively, or `projects[<root>].hasTrustDialogAccepted`). Merge is add-keys-only: an existing different `allow`/`deny` array refuses the sync with zero writes — edit or remove the old value, then sync again. This applies to a file written by the unreleased slice-5 sync for a read-only role (`deny: ["Edit", "Write", "NotebookEdit"]`), which now becomes `["Edit(/**)", "Write(/**)", "NotebookEdit(/**)"]`. See [engines.md](engines.md) |
| Codex role block `<!-- agentos:role:start/end -->` in an `AGENTS.md` | `agentos agents sync codex` only | Absent = Codex reads the normal adapters. | `agentos agents sync codex [--role <id>]` |

Behaviour that changed for existing data:

- `checkpoint`/`resume`: a repo path that is a directory inside one enclosing git work tree used to be `unavailable (not the top of a git work tree)`; it is now available with `state: enclosing-worktree` (HEAD/branch of the enclosing repo, git calls limited to the directory). A checkpoint taken before this change and resumed after it reports that repo as `drifted (was unavailable at checkpoint time)` once; take a new checkpoint.
- `agentos context <engine>` ADVISORY line for claude-code and codex now states the conditional enforcement instead of `instruction-only`. `--require-enforcement` exits 1 for every engine (closure 3); the synced deny-set check that used to pass it is `--require-synced-config`. Scripts that relied on `context claude-code --require-enforcement` exiting 0 must switch to `--require-synced-config`, which checks configuration presence, not enforcement.
- `agents sync claude-code` now also denies every sibling entry outside the edit scope (v1 closure). A `.claude/settings.local.json` written by an earlier v1 sync has the listed-path deny list only: `context claude-code --require-synced-config` reports it `STALE`, and a re-sync refuses (add-keys-only) until you remove `permissions.allow`/`deny` from it; then sync again.
- **Settings synced by `71cdb19` are STALE and must be re-synced.** That build added `Edit(/*)` and `Write(/*)` for new root-level files. Claude Code matches `/*` recursively (gitignore-style), so in a trusted workspace those two rules deny every edit, including the edit scope itself (closure re-trial T6b: all 14 probe items denied, `web/src/a.js` included). Closure 2 no longer generates them: `context claude-code --require-synced-config` reports the old file `STALE`; remove `permissions.allow`/`deny` from `.claude/settings.local.json` (sync adds keys only) and run `agentos agents sync claude-code` again. The `.claude/agents/<id>.md` of a read-only role, or of a role with `tools_requested`, now carries a `tools:` line: delete the old file before re-syncing (a different existing file is a conflict).

## 1.0.0 → unreleased (1.1): sync records

- `agents sync <engine>` now also writes `.agentos/synced/<engine>.json`, a record of what it generated (role, scope, per-file sha256, generated settings entries). `agentos doctor` and `context <engine> --require-synced-config` check the synced config against it ([engines.md](engines.md#synced-config-freshness)).
- **Syncs made by 1.0.0 have no record.** Both commands report `Synced config: STALE — synced by 1.0.0 without a record; re-run agentos agents sync <engine>` (doctor: a warning, exit status unchanged; nothing is rewritten). Detection: a `.claude/agents/*.md` carrying the ``Generated by `agentos agents sync claude-code` `` comment, or a `<!-- agentos:role:start -->` block in the root or a repo `AGENTS.md`. Re-run the sync with the same `--role`/`--scope`: if nothing drifted the engine files stay unchanged and only the record is written; if the deny list drifted, remove `permissions.allow`/`deny` from `.claude/settings.local.json` first (sync adds keys only). A workspace that never ran `agents sync` sees no change in `doctor` output.
- `context codex --require-synced-config` used to print `UNSUPPORTED — codex has no synced config`; it now checks the Codex role block (`MISSING` until `agents sync codex`). The OK line names the recorded role: `Synced config: OK (<engine>, role <id>, sha256 <8>)`. `--json` `synced_config` may carry `role` and `reason`, and `status` may be `invalid`.

## Keep / simplify / remove inventory

`keep` = part of v1 as is. `simplify-later` = works, but overlaps something else; candidate for a later consolidation with a deprecation notice first. `remove-gated` = deprecated in 0.9.0, removal waits for the gate below. Nothing changes status in this slice.

| Command / module | Status | Note |
|---|---|---|
| `init`, `status`, `doctor`, `doctor --fix`, `doctor --json` | keep | Core. |
| `init --agents minimal\|detected` | simplify-later | Equivalent teams (slice 1 finding 6, pinned by `v1-slice1.test.js`); one name could be deprecated. |
| `adapters explain` | keep | |
| `compact` (+ `--checkpoint`) | keep | `--rewrite` is a compatibility alias → simplify-later. |
| `handoff`, `run handoff` | simplify-later | Overlap with `checkpoint`/`resume`, which record and reconcile task state with receipts; keep until owners have moved. |
| `prompt` | simplify-later | `context` supersedes it for tasks; `prompt` output is pinned byte-identical (`v1-slice2-context.test.js`), so any change is a deliberate decision. |
| `context`, `checkpoint`, `resume`, `brain …` | keep | v1 priorities B–D. |
| `agents list\|add\|show\|enable\|disable\|remove\|manifest\|sync`, `engines` | keep | v1 priority E. |
| `skills list\|add\|remove` | keep | `--mode summary\|full` are equivalent → simplify-later. |
| `templates list\|show\|copy\|validate\|import` | keep | `templates import --type agent` still writes a legacy card (backlog). |
| `obsidian init`, `obsidian link`, `obsidian status` | keep | v1 priority F. |
| `obsidian link-workspace` | simplify-later | `obsidian link` = `link-workspace` + index note + `canonical` on one code path; `link-workspace` stays because a test pins its no-note behaviour. |
| `link-obsidian` (exact-note `link-only` mode) | simplify-later | Older link-only flow, unchanged in v1. `obsidian link` is the v1 path; `link-obsidian` was deliberately **not** turned into an alias because its behaviour differs (slice 6 decision). |
| `doctor --fix --adopt-custom-adapters` (pre-managed-block adapters) | remove-gated | |
| `doctor --fix --prune-retired` (retired pre-0.4.0 cards) | remove-gated | |
| `doctor --fix --normalize-repo-ids` | remove-gated | |
| `migrate claude` | remove-gated | |
| `src/legacy-deprecation.ts`, `src/legacy-skill-shapes.ts`, retired-id parts of `src/aliases.ts` | remove-gated | Back the four paths above. |
| read-only `migration` inventory in `doctor --json` | keep | Kept by the gate's own terms. |
| `src/core.ts` (~5k lines) | simplify-later | Extract along slice boundaries as later work touches it. |
| `src/context-builder.ts`, `checkpoint.ts`, `brain.ts`, `agents.ts`, `engines.ts`, `task-scope.ts`, `git-evidence.ts` | keep | v1 modules. |

**Gate for the remove-gated rows (unchanged; evidence: [slice 1 finding 8](../.agentos/plans/2026-10-25-v1-priorities.md), history in `.agentos/runs/2026-10-25-v1-slice1-history.md`):** delete in 2.0.0 (moved from 0.10.0 by the 1.0.0 release) only after 0.9.0 has been out a few weeks, the npm download split has been re-checked, the read-only `migration` inventory is kept, and the owner decides. Not met: 2.0.0 is not scheduled and there is no owner decision. Until then `npx agentos-for-projects@1 doctor --fix` (or `@0.9`) is the documented migration route for very old workspaces.
