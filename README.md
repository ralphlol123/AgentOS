# AgentOS for Projects

## Filesystem boundary safety

Mutating commands preflight AgentOS-managed paths before writing. Repository paths must be workspace-relative; traversal (`..`), absolute paths, Windows drive paths, and backslash paths are rejected rather than silently rewritten. Obsidian destinations and note paths follow the same rule relative to the selected vault. Workspace-folder note links must stay beneath the declared destination; legacy explicit note allowlists remain vault-relative.

AgentOS conservatively rejects symlinks (including dangling links) in `.agentos/`, adapter targets/backups, repository adapter paths, and Obsidian target components. Migration checks only its `.claude` sources and targets, leaving unrelated native skill links alone. This includes links pointing inside the workspace: use real managed files/directories instead. The explicitly selected workspace/vault root may itself be reached through an alias.

These checks protect against existing unsafe paths, not concurrent filesystem replacement by another process. They are not an OS sandbox or a transactional filesystem. Do not run concurrent writers in the same checkout. General read-only commands and user-selected import sources are not restricted to the output boundary.

## Atomic state writes and rollback

Every critical AgentOS text file — `.agentos/project.yaml`, `handoff.md`, `tasks.md`, `knowledge.md`, `skills.md`, managed agent/repo markdown, and root/child adapter files (`AGENTS.md`, `CLAUDE.md`, `.hermes.md`, child repo pointers) plus their `.agentos.bak` backups — is replaced through a single atomic-write primitive: the new content is written to a uniquely named temporary file in the *same directory* as the destination, flushed and fsync'd, closed, given the destination's existing file mode (or the OS default for a brand-new file), then renamed over the destination in one filesystem `rename()` call. `rename()` never follows a symlink at the destination — it replaces the link entry itself — and this primitive does not change Task 2's symlink/boundary checks, which still run before any of this. If the temp file can't be renamed (or any earlier step fails), the temp file is removed; no partial or zero-byte destination file is ever left behind.

Commands that touch more than one output — `agentos init`, `doctor --fix`, `agentos obsidian link` (with or without `--no-index`), `agents add`, `skills add` / `skills remove` (catalog cards, file and URL imports), `compact`, and `agentos checkpoint` — run their entire write phase as one in-process mutation transaction. For `init`, that includes every filesystem mutation it makes, not just the adapter files: the `.agentos` scaffold directories and files, per-agent/engine/repo files, root/child adapters and their one-time backups, and child `.gitignore` blocks are all one transaction, so a fault partway through leaves the workspace exactly as it was before `init` ran. Before each write/create/remove, the transaction snapshots either the target's existing bytes and mode (if it already existed) or its topmost not-yet-existing ancestor directory (if it's new), so a brand-new nested folder can be removed as a whole on rollback. If any later step in the same command throws, every tracked path is restored to its pre-command bytes, mode, or absence, in reverse order, before the error is re-raised; dry-run and dependency/config validation still happen before any of this and are unaffected.

Guarantees:

- Byte-for-byte restoration: if a multi-file command fails partway, files it had already rewritten are restored to their exact pre-command bytes and permission bits — not approximated or re-derived.
- Existence restoration: outputs that did not exist before a failed command (new agent/skill files, new adapter backups, newly created nested folders, new Obsidian notes/workspace folders) do not exist afterward either.
- Removal restoration: directories/files a command intentionally deletes (e.g. `skills remove`) are recreated with their original content if a later step in the same command then fails.
- No leftover temp artifacts: the atomic-write temp file naming pattern (`.<name>.agentos-tmp-<pid>-<timestamp>-<random>`) is always cleaned up, on both the success and failure paths.

Limitations — read these as scope boundaries, not gaps to file issues against:

- **Command-level, not crash-level.** Rollback runs from inside the same Node.js process that performed the writes. It defends against a failing write/rename call (permission errors, disk-full, an injected fault) partway through a command; it is best-effort against the *process itself* being killed (`SIGKILL`, power loss, `OOM`) mid-command — a kill during the final `rename()` of one file can still leave that one file updated with everything before it unrolled-back, because there is no crash recovery journal replayed on the next run.
- **Atomicity is per-file, not cross-file.** Each individual `rename()` is atomic at the filesystem level. The *set* of files a multi-output command touches is not a single atomic filesystem transaction — there is no all-or-nothing, cross-file commit point below the application-level transaction described above. Two files can never be observed half-written, but a hard process kill between two files' renames can still leave the set inconsistent (see above).
- **No defense against a concurrent hostile filesystem replacement.** As with the boundary checks, this primitive assumes a single writer. It does not protect against another process concurrently replacing a tracked path (e.g. swapping a directory for a symlink) between the snapshot and the eventual write/rollback; do not run concurrent AgentOS writers against the same checkout.
- **Existing scaffold trees are preserved.** `init` tracks newly created scaffold directories so a failed first initialization removes them again. If `.agentos`, `.agentos/runs`, or `.claude` already exists, the transaction preserves that existing tree and snapshots/restores only the specific files it mutates inside it; it does not roll back unrelated run history.

## Conflict-safe adapter repair

`agentos init` and `agentos doctor --fix` write to a small, fixed set of adapter files outside `.agentos/`: root `AGENTS.md`, `CLAUDE.md`, `.hermes.md`, and child-repo `AGENTS.md`/`CLAUDE.md` pointers. Every AgentOS-owned section in these files is wrapped in an explicit, bounded marker pair:

```
<!-- agentos:managed:start -->
...AgentOS-generated section...
<!-- agentos:managed:end -->
```

Init/doctor --fix only ever rewrite the bytes strictly between a *valid* single marker pair. Everything outside it — custom text before the block, custom text after it, blank lines, Markdown, and CRLF-vs-LF newline style — is preserved byte-for-byte. A brand-new file just gets the managed block; nothing else is touched.

**Legacy migration.** A file with no markers yet is converted into this format — with a one-time backup, see below — only when ownership of its current content is unambiguous:

- the file is missing or empty: nothing to lose, so no backup is taken;
- the whole trimmed file is exactly one legacy AgentOS-generated section from an earlier AgentOS version (one heading, one recognized legacy phrase, nothing else); or
- the file uses the older `custom text\n\n---\n\nAgentOS section` convention and the custom part mentions nothing AgentOS-related; or
- the file has no AgentOS-related content at all — a genuinely custom file — in which case the managed block is appended after the existing bytes.

**Custom content around a legacy section.** A root `AGENTS.md` that holds project knowledge *with* a stale AgentOS bootloader section interleaved in it is classified **`adopt`**: AgentOS can see the exact byte span of the historical section. 3.0.0 no longer rewrites such a file (`doctor --fix --adopt-custom-adapters` was removed): a plain `doctor --fix` makes **zero** changes and names the two ways out, either run `npx agentos-for-projects@2 doctor --fix --adopt-custom-adapters` once (2.x replaces only that span and keeps every custom byte, with one `.agentos.bak`), or move your text outside a fresh managed block by hand. `doctor --fix --dry-run` and `doctor --explain <file>` show the span. Two candidate sections, or a section inside a fenced code block, stay a conflict.

A marker only counts if it appears as its own standalone line (after stripping a trailing `\r`) outside a fenced code block. Fence tracking follows CommonMark closely enough for this purpose: an opening run of 3+ backticks or tildes only closes on a later run of the *same character* with length *at least* the opener's and only spaces/tabs after it — a shorter run, a different delimiter, a would-be closer with trailing text, or marker text embedded in a longer line is never treated as forming or extending an owned block; its mere presence makes the file a conflict instead. Adapter files must be valid UTF-8; invalid byte sequences fail closed before mutation rather than being decoded and rewritten with replacement characters.

Anything else is treated as a **conflict** and left completely untouched: corrupted markers (a start with no end, an end with no start, markers in reversed order, duplicate/nested marker pairs, or marker text embedded/fenced as above), a recognized legacy shape with any extra content appended to it (nothing is ever silently discarded), files that merely *mention* AgentOS in prose without matching one of the shapes above, and two or more repo entries in `.agentos/project.yaml` that resolve to the same adapter file (e.g. `frontend` and `./frontend`, or two differently named entries pointing at the same directory) — AgentOS has no way to know which repo's section should own that path, so it refuses to guess. AgentOS never guesses ownership of ambiguous text. `doctor` and `doctor --json` report each ambiguous file by path (e.g. `frontend/CLAUDE.md adapter ownership is ambiguous: ...`), and additionally flag a *valid* managed block whose content has simply gone stale (`... managed block is stale and does not match the current canonical section`) even when unrelated surrounding text happens to satisfy older, broader health checks elsewhere in `doctor`. `doctor --fix` preflights every root and child adapter file *before its first mutation* — if even one is ambiguous, the entire command (adapters, `.agentos/project.yaml`, `skills.md`, agent files) makes zero changes rather than partially repairing the rest; the same preflight-before-first-mutation rule applies to `agentos init`, including for hybrid workspaces where the root itself is also a package (root adapters always stay bootloaders — only non-root repos ever receive child pointers). If `.agentos/project.yaml` itself is malformed, `doctor` reports that config error alone and skips every adapter diagnostic that would otherwise be derived from it — it never compares real adapters against a canonical section built from a `{}` fallback, which would produce misleading "stale, run `doctor --fix`" noise unrelated to the adapters themselves.

**Backups.** The first time a pre-existing custom or legacy file is converted into the managed-block format, AgentOS writes one `<file>.agentos.bak` containing the exact pre-conversion bytes and file mode, taken from the same read used to decide what to do with the file (not a second, independently racy read at write time). That write is an exclusive create (temp file + `link()`, not `rename()`): if a backup already exists at that path — from an earlier run or a racing writer — this call always loses to it rather than clobbering it, with no check-then-write gap. Repeated `init`/`doctor --fix` runs never overwrite or multiply a backup — once a file has a valid managed block, later repairs only update the bytes between the markers (or do nothing at all if they already match). `agentos init`'s entire mutation set — the `.agentos` scaffold, agent/repo files, root/child adapters and their backups, and child `.gitignore` blocks — and doctor --fix's adapter writes each run inside one mutation transaction, so a fault partway through (including during a backup write) rolls every output in that command back to its original bytes/existence, with no leftover temp artifacts. Every root/child adapter target's plan is computed once per command and applied verbatim, without rereading or reclassifying the file a second time at write time; as a narrow defense-in-depth check, applying a plan that read an existing file compares that file's current bytes against the plan-time snapshot immediately before writing, and fails closed instead of applying a stale plan if they no longer match.

Limitations:

- Newline style is preserved outside the managed block always; inside it, AgentOS matches whichever style (LF or CRLF) the file already uses as a whole. A file that mixes both styles is treated as CRLF if any `\r\n` is present.
- Legacy-shape recognition matches only an exact, fully anchored structural signature per historical AgentOS version (or the current generator's own output) — never a loose "looks AgentOS-ish" heuristic — so it can safely auto-migrate without a human review step; anything it doesn't recognize fails closed as a conflict instead of guessing.
- The plan-vs-apply staleness check (above) assumes non-hostile, non-concurrent use, same as the rest of this section: it catches accidental drift and defends in depth, but AgentOS still assumes a single writer per checkout, not protection against an adversarial concurrent process.


## Legacy upgrade paths (removed in 3.0.0)

Four ways of upgrading a workspace set up by a pre-0.9 release were deprecated in 0.9.0 and are **removed in 3.0.0**:

- adopting adapter files that interleave custom text with a legacy section (`doctor --fix --adopt-custom-adapters`);
- migrating and pruning retired pre-0.4.0 agent and skill cards (`doctor --fix` for agent cards, `doctor --fix --prune-retired` for skill cards);
- `doctor --fix --normalize-repo-ids`;
- `agentos migrate claude`.

Each removed flag or command exits 1 with one line naming the 2.x command that still does it. **If your workspace is that old, run `npx agentos-for-projects@2 doctor --fix` once first** (add `--adopt-custom-adapters`, `--prune-retired` or `--normalize-repo-ids` as its report says), then upgrade. 3.0.0 still reports all of these read-only in the migration inventory below, still resolves retired agent/skill IDs in `project.yaml` to their canonical IDs, and `doctor --fix` still converts an adapter that is exactly one recognised legacy section (`migrate`), because that is the same planner that keeps adapters current.

## Migration inventory

`doctor` and `doctor --json` include a read-only **migration inventory**: the workspace's adapter files, unsafe repository IDs, and retired catalog cards, classified before anyone approves a fix. It is reporting only — it never writes, never changes doctor's exit status (problems and warnings still do), and stays silent on a clean workspace.

Scope: the inventory covers **files and IDs** — adapters, repo IDs, retired cards. Retired IDs *referenced* inside `.agentos/project.yaml` (`agents.enabled`, `agents.capabilities`) never become inventory entries; they are reported only as ordinary `doctor` warnings by `checkLegacyCatalogState`. A retired entry left in `.agentos/skills.md` with no card on disk is reported **both** ways: that same ordinary warning, plus an `index-only` retired-card entry — so a retired ID can legitimately appear twice in one human run (once as a warning, once as an inventory line), and neither adds to the other's counts. `summary.action_required` counts non-`noop` adapters plus all repo-ID and retired-card entries; `summary.adapter_count` counts every inventoried adapter, `noop` included.

```bash
agentos doctor --json | jq '.migration.summary'
agentos doctor --explain AGENTS.md
```

Three classes, matching the real upgrade pain seen when moving a workspace from an older AgentOS:

- **adapters** — every root and child adapter file with its classification (`create`, `noop`, `update`, `migrate`, `append`, `adopt`, `conflict`), the same pure classification `doctor --fix` uses. `safe` means "unambiguous **and** applied by `doctor --fix`", so both `conflict` and `adopt` entries report `safe: false`; an `adopt` entry also carries `requiresOptIn: true` and the legacy byte span, and its `next` names the 2.x command (adoption was removed in 3.0.0). The inventory never guesses ownership.
- **repoIds** — repository IDs in `.agentos/project.yaml` that are not lowercase-hyphen safe (e.g. `frontend_client` → `frontend-client`), with `collides` telling you whether the normalized ID would clash with an existing key. A non-canonical ID is a reported problem, not a parse failure, so the rest of `doctor` still runs; rename it (and `.agentos/repos/<id>.md`) by hand, or run `npx agentos-for-projects@2 doctor --fix --normalize-repo-ids` once.
- **retiredCards** — retired agent/skill cards with their canonical replacement, `canonicalInstalled`, an eligibility class and `next`:
  - `manual-review` — a retired card on disk. 3.0.0 does not migrate or prune it; `next` names the manual step (`agents add <canonical>` / `skills remove` + `skills add`) and the 2.x command that does it.
  - `index-only` — listed in `.agentos/skills.md` with no card on disk.

`agentos doctor --explain <file>` (`adapters explain` before 3.0.0) answers the same question for exactly one path: target level (root/child), classification, managed-block status with byte offsets, the reason for a conflict, and the next command. If `.agentos/project.yaml` cannot be parsed, it still reports marker structure rather than nothing, and says why the canonical section is unavailable.

When `.agentos/project.yaml` fails validation there is no canonical section for any path, so the classification falls back to marker structure and uses its own vocabulary: `managed-block` (a valid block exists, staleness unknown), `create` (missing or empty), `migrate` (a recognized historical body), `append` (unrelated custom content), and `conflict`. With a valid config, a path that is not an adapter target is refused outright (with the known-target list) rather than classified.

Nothing in the inventory performs a migration. The `doctor --fix` behavior — fail-closed preflight, one-time `.agentos.bak` backups, byte-preserving managed-block updates — is unchanged.

## Retired cards and unsafe repository IDs

3.0.0 reports both read-only and never rewrites them (the 2.x migrations were removed; see [above](#legacy-upgrade-paths-removed-in-300)):

- **Retired agent/skill cards** stay where they are; `doctor` warns with the canonical ID and the manual step. Retired IDs in `agents.enabled` / `agents.capabilities` still resolve to the canonical ID, and `doctor --fix` writes the canonical IDs and cards.
- **Repository IDs.** A repository ID becomes the filename `.agentos/repos/<id>.md` and is written into generated cards and child pointers, so an ID that is not a workspace-relative path fragment (`../x`, `a/b`, `a\b`) or that contains anything outside letters, digits, spaces, dots, underscores and hyphens is a hard configuration error. A *non-canonical but safe* ID like `frontend_client` is a reported problem (so the rest of `doctor` still runs); two IDs that normalize to the same ID fail strict validation.


Project-owned context layer for model-agnostic coding agents.

AgentOS installs a portable `.agentos/` project brain into a single repo or product workspace so Claude Code, Codex, OpenCode, Hermes, ChatGPT, and other agents can share the same scoped project context without bulk-loading every file.

## Core rule

```text
One AgentOS per product/workspace.
Many repos inside it.
Each task declares which repo(s) are in scope.
```

## What it does

AgentOS is a TypeScript CLI/package that supports:

- new project initialization;
- existing single-repo and multi-repo workspace import;
- root adapters: `AGENTS.md`, `CLAUDE.md`, and `.hermes.md` (OpenCode uses the portable `AGENTS.md` pointer);
- child repo pointer files for parent-managed multi-repo workspaces;
- `.agentos/guide.md`, one engine-agnostic command map (which `agentos` command for which job, and what to do from a child repo), loaded on demand from the root and child pointers;
- generated `.agentos/project.yaml`, `memory.md`, `handoff.md`, `tasks.md`, `decisions.md`, `status.md`, `skills.md`, `guide.md`, `agents/`, `repos/`, and `runs/`;
- agent selection profiles: `minimal`, `detected`, and custom comma lists;
- optional planning-only `planner` role;
- local project skills under `.agentos/skills/`;
- local custom agents under `.agentos/agents/`;
- reusable repository templates under `templates/`;
- guarded import of useful web/file agents or skills;
- Obsidian workspace-folder knowledge/output setup;
- a managed Project Brain: existing Markdown knowledge registered by reference, changed through validated proposals;
- deterministic live-context compaction;
- checkpoints with read-only Git grounding that the next engine resumes;
- doctor/status/handoff checks and JSON health output;
- Claude legacy migration preservation.

## Install

AgentOS ships as a Node CLI bin named `agentos`.

Requirements:

```text
Node >= 20
```

After publishing:

```bash
npm install -g agentos-for-projects
pnpm add -g agentos-for-projects
bun add -g agentos-for-projects
```

From a local checkout (the build runs during the checkout's own dependency install, so run that first):

```bash
bun install   # or npm ci / pnpm install: builds dist/ via the `prepare` script
npm install -g /path/to/agentos-for-projects
pnpm add -g /path/to/agentos-for-projects
bun add -g /path/to/agentos-for-projects
```

Verify:

```bash
which agentos
agentos --version
agentos init --existing --dry-run
```

## Upgrade

One command updates the CLI with the package manager that installed it (Bun, npm or pnpm global) and then refreshes the current workspace with the new binary's `doctor --fix`:

```bash
agentos upgrade --check     # read-only: current vs latest, install method, the command; exit 0 up to date, 10 update available
agentos upgrade --dry-run   # the plan, installs nothing
agentos upgrade             # asks first on a terminal; --yes for scripts and for a major version
agentos upgrade --to 3.1.0  # pin a version
```

It refuses a project-local install (prints the command to run in that project), stops if the installer fails or if `agentos --version` on PATH is not the new version afterwards, and outside a workspace reminds you to run `agentos doctor --fix` in each one. `--json` prints the plan/result as JSON. `AGENTOS_REGISTRY_URL` points it at a mirror.

## Quickstart

New project:

```bash
mkdir my-product && cd my-product
agentos init --new
agentos status
agentos doctor
```

Existing single-repo or multi-repo workspace:

```bash
cd /path/to/product-root
agentos init --existing --dry-run
agentos init --existing
agentos status
agentos doctor
```

Generate a short engine start prefix (the full, task-specific bundle is `agentos context <engine> --task <id>`):

```bash
agentos context claude --brief
agentos context codex --brief
agentos context opencode --brief
agentos context hermes --brief
```

More detail: [docs/quickstart.md](docs/quickstart.md).

## v1 workflow

The path below is the one Phynceon's 2026-10-25 cross-engine trial walked (Claude Code 2.1.310 → Codex 0.156.1 and back, on a disposable root repo with `web/`, `api/`, `docs/adr/`; [report](docs/evidence/2026-10-25-cross-engine/REPORT.md), n=1). Steps 1–7 use the trial's commands; steps 8–9 were not part of the trial and are covered by tests only. Engines learn the same loop (status → context → checkpoint/resume → brain propose → agents sync) from the generated `.agentos/guide.md`; `agentos doctor --fix` refreshes it in an existing workspace.

1. **Init** the workspace once: `agentos init --existing`.
2. **Role**: give the role a manifest card (catalog cards from `init` already have one): `agentos agents add developer` (an older card that matches the catalog gets its manifest from `agentos doctor --fix`). See [docs/agents.md](docs/agents.md).
3. **Task scope** in `.agentos/project.yaml` — what the task may read and edit; the owner sets it, engines do not edit that file (without it `context` reports an empty edit scope). The trial used:

   ```yaml
   task_scope:
     read: [web, api/contracts/openapi.yaml, docs/adr]
     edit: [web]
   ```

4. **Context** for the first engine: `agentos context claude-code --task greeting` (objective, constraints, scope, role card, relevant decisions/Brain records, budget). Optionally write Claude Code's deny rules with `agentos agents sync claude-code` and trust the workspace (see [Engines](#engines)).
5. **Work in Claude Code** with that context as the prompt prefix. The trial launched `claude -p "<context + task>" --allowedTools Read,Edit,Write,Bash(node:*),Bash(cd:*) --output-format json --no-session-persistence`.
6. **Checkpoint** before stopping, with real checks:

   ```bash
   agentos checkpoint --task greeting --engine claude-code --role developer \
     --progress "<what you did>" --next "<what remains>" --check "node test.js" --cwd web
   ```

   `--claim "<text>"` records something the engine reports but AgentOS did not observe.
7. **Fresh Codex**: `agentos resume --task greeting` (accomplished / remaining / receipts / reconciliation, read-only), then `agentos context codex --task greeting`. The trial ran `codex exec -a never` with both as the prompt; Codex continued from the `observed-pass`/`claimed`/`not-run` receipts and wrote its own checkpoint (`--engine codex`).
8. **Brain**: record what the task taught as a proposal; the engine proposes; the owner reviews and applies by default: `agentos brain propose <id-or-path> --from - --task <id> --summary "<why>"` (the checkpoint output asks for this review; progress-only work stages nothing), `agentos brain preview <proposal>`, `agentos brain apply <proposal> --by <owner>` (manual by default; the declared applier is recorded). See [docs/brain.md](docs/brain.md).
9. **Obsidian (optional)**: `agentos obsidian init` (plain `knowledge/` folder) or `agentos obsidian link --vault <abs-path> --dest <sub/folder> [--canonical workspace|vault] --create`. See [docs/obsidian.md](docs/obsidian.md).

What is enforced and what is only instruction, per engine: [docs/engines.md](docs/engines.md). Proven / not proven per scenario: [docs/acceptance-matrix.md](docs/acceptance-matrix.md).

## Documentation

- [docs/quickstart.md](docs/quickstart.md) — install and first run
- [docs/context-builder.md](docs/context-builder.md) — `agentos context`: selection, scope, budget
- [docs/checkpoints.md](docs/checkpoints.md) — `agentos checkpoint` / `resume`: records, receipts, reconciliation
- [docs/brain.md](docs/brain.md) — `agentos brain`: records, proposals, stale/duplicate checks
- [docs/agents.md](docs/agents.md) — agent manifests and lifecycle
- [docs/engines.md](docs/engines.md) — engine adapters and the trial-backed capability matrix
- [docs/obsidian.md](docs/obsidian.md) — optional Obsidian location for the Brain
- [docs/migration-project-brain.md](docs/migration-project-brain.md) — moving link-only and vault-canonical setups to the Project Brain; disabling Obsidian without losing records
- [docs/migration.md](docs/migration.md) — adopting v1 in an existing workspace; command inventory (kept / removed in 3.0)
- [docs/migration-3.0-cli.md](docs/migration-3.0-cli.md) — 3.0 CLI: removed form → new form
- [docs/acceptance-matrix.md](docs/acceptance-matrix.md) — v1 acceptance per priority and scenario (PASS / FAIL / BLOCKED)
- [docs/improve-later.md](docs/improve-later.md) — consolidated backlog
- [docs/compaction.md](docs/compaction.md), [docs/templates.md](docs/templates.md), [docs/safe-imports.md](docs/safe-imports.md), [docs/release-readiness.md](docs/release-readiness.md), [docs/reliability-acceptance.md](docs/reliability-acceptance.md)
- [docs/evidence/2026-10-25-cross-engine/](docs/evidence/2026-10-25-cross-engine/README.md) — engine trial report, prompts, transcripts, checkpoint records

## Commands

`agentos <command> --help` (or `-h`) prints one command's usage. The 12 commands:

```bash
# Setup & health
agentos init [--new|--existing] [--agents minimal|<agent-id>,...] [--refresh] [--dry-run] [--yes]
agentos status [--full]
agentos doctor [--fix] [--dry-run] [--json]
agentos doctor --explain <file>
agentos doctor --engines [--json]
agentos upgrade [--check] [--to <version>] [--dry-run] [--yes] [--json]

# Work loop (agents run these)
agentos context [claude|codex|opencode|hermes] [--task "<text>"] [--role <agent-id>] [--scope <repo-or-path>,...] [--budget <tokens>] [--json] [--strict] [--include-superseded]
agentos context [claude|codex|opencode|hermes] --brief
agentos checkpoint [--task <id>] [--engine <e>] [--role <r>] [--progress "<text>"] [--blocker "<text>"] [--next "<text>"] [--check "<cmd>" [--cwd <dir>]]... [--claim "<text>"]... [--json] [--dry-run]
agentos checkpoint --recover [--task <id>] [--dry-run]
agentos checkpoint list [--task <id>] [--json] | agentos checkpoint show <id> [--json]
agentos resume [--task <id>] [--engine <e>] [--json]

# Knowledge
agentos brain list|show|search|check|register|propose|preview|apply|revert|log|policy|verify|index ...  (agentos brain for details)

# Team
agentos agents list [--installed]
agentos agents show <id> [--json] | enable <id> | disable <id> | remove <id> [--dry-run]
agentos agents add <agent-id|file|url> [--name id] [--dry-run] [--replace] [--yes] [--expected-sha256 hash]
agentos agents manifest <id> --custom [--dry-run]
agentos agents sync claude-code|codex [--role <id>] [--scope <repo-or-path>,...] [--dry-run] [--replace]
agentos skills list [--installed]
agentos skills show <skill-id>
agentos skills add [--detected] [skill-id|category-pack,...] [--dry-run] [--replace]
agentos skills add <file|url> [--name id] [--dry-run] [--yes] [--replace] [--expected-sha256 hash]
agentos skills remove <skill-id> [--dry-run]

# Optional & maintenance
agentos obsidian init [--dir <path>] [--dry-run]
agentos obsidian link --vault <abs-path> --dest <sub/folder> [--canonical workspace|vault] [--no-index] [--create] [--dry-run]
agentos obsidian link --note <path> [--vault <path> --dest <folder> --create] [--dry-run]
agentos obsidian status
agentos compact [--objective <id>] [--expect-state <sha256>]
agentos compact [--objective <id>] --dry-run [--diff]
agentos compact --archive-only [--dry-run]
```

- `init --yes` (`-y`) skips the confirmation prompt. `--agents minimal` gives developer, tester, reviewer and release-manager, the same team as no `--agents`.
- `context --strict` is `--require-synced-config --require-enforcement --require-complete` together; the individual flags still work.
- `status --full` appends the full handoff and the reading list; `context --brief` prints the short generic start prefix.
- `skills add <file|url>` and `agents add <file|url>` run the safe import (hash pin, safety review, quarantine, `--yes` to write); `--dry-run` is the template structure check (exit 1 with the findings when it fails). An imported skill keeps a summary excerpt of its source.
- Brain subcommands in detail: `agentos brain` (or [docs/brain.md](docs/brain.md)). `brain verify` is an optional human sign-off; nothing depends on it.

**Removed in 3.0.0** (deprecated in 2.1.0): `handoff`, `prompt`, `adapters explain`, `engines`, `run handoff`, `link-obsidian`, `obsidian link-workspace`, `brain validate`, `brain init` (workspace), `agents manifest --from-catalog`, `templates list|show|copy|validate|import`, `compact --checkpoint|--rewrite`, `skills add --mode`, `init --agents detected` and the legacy migrations. Each exits 1 with one line, `agentos <x> was removed in 3.0.0; use <new>`. Old → new table: [docs/migration-3.0-cli.md](docs/migration-3.0-cli.md).

## Task-specific context

`agentos context --brief` prints a short generic prefix. `agentos context` builds a context bundle for one task and one role, read-only (no file, lock or temp file is created):

```bash
agentos context claude --task "rotate auth tokens in the settings page" --role developer --scope web,api/contracts/openapi.yaml
agentos context codex --task "..." --json      # structured bundle only
```

- Mandatory records come first and are never truncated: objective (same resolver as `status`/`doctor`), constraints (handoff "Protected files / do not touch" plus the generated rules), scope, and the role's agent card.
- Optional records are filtered before ranking: out of read scope → `out-of-scope`; `superseded`/`deprecated` heading or `status:` line → `superseded` (shown labelled with `--include-superseded`); decisions, skills and linked notes that share no term with `--task` → `no-match`. The rest (acceptance criteria, handoff current state / next action, repo notes and verification commands for repos in scope, decisions, skills, linked notes by reference) is ranked by term overlap, then freshness, and added until the budget is reached; the rest is listed as `budget`.
- `--scope` narrows `task_scope`: it replaces the read scope and keeps only the edit entries it still covers, so it never widens edit. Without any scope the read scope is the whole workspace and edit scope is empty; `context` prints `Edit scope: not set` and tells the engine to edit only the files the owner's task names and to ask the owner to set `task_scope`.
- Tokens are `estimate (chars/4)` plus a fixed per-engine overhead; default budget 24000. If the mandatory records alone exceed the budget, the command exits 1 with `overflow` and renders nothing. A missing objective also exits 1; a missing agent card or scope path is listed under `missing` as a warning; two current decisions with the same heading subject are listed under `conflicts`.

Selection signals, budget numbers and the JSON shape: [`docs/context-builder.md`](docs/context-builder.md).

## Checkpoints and resume

`agentos checkpoint` records where a task stands; `agentos resume` reads it back against the repos as they are now, so the same or another engine can continue without restarting:

```bash
agentos checkpoint --task token-rotation --engine claude --progress "Endpoint drafted" --next "Wire the settings page" \
  --check "npm run test" --cwd web --claim "manual login flow works"
agentos resume --task token-rotation          # read-only
agentos checkpoint --recover --task token-rotation   # the engine died without a summary
```

- Each checkpoint is an immutable JSON record (`agentos.checkpoint/1`) under `.agentos/checkpoints/<task>/`, plus a `current.json` pointer and one bounded `## Checkpoint (managed)` section in `.agentos/handoff.md` that is replaced in place, never appended. `tasks.md` is not touched.
- Per repo it stores branch, HEAD and a working-tree fingerprint (staged, unstaged and untracked), using bounded, sensitive-path-aware git evidence. A repo that is a directory inside one enclosing work tree (`web/`, `api/` in a root repo) uses that work tree limited to the directory (`state: enclosing-worktree`); only a path outside any work tree is `unavailable`.
- Verification receipts say exactly what is known: `observed-pass` / `observed-fail` (AgentOS ran the `--check`; output saved as evidence), `claimed` (`--claim`, engine-reported), `not-run` (declared build/test commands of in-scope repos nobody ran), `unavailable` (could not start). Each receipt records the state it tested.
- `resume` reports `clean`, `drifted` (HEAD moved, fingerprint differs, new changed paths) or `unavailable`, lists what is accomplished (progress plus current passes) and what remains (next action, blockers, failed/claimed/not-run receipts, passes marked `stale (recheck)`), and prints the `agentos context <engine> --task <id>` line to run next. A missing pointer or damaged record is reported as `incomplete` with the files and error, never skipped.
- `agentos context` includes the current checkpoint; `doctor` fails on a pointer to a missing or invalid record.
- One active writer per workspace; concurrent engines are not supported. Each file is written atomically, but several files are not one crash-safe transaction.

Schema, receipt vocabulary, reconciliation states and limits: [`docs/checkpoints.md`](docs/checkpoints.md).

## Project Brain

`agentos brain` keeps durable project knowledge (architecture, decisions, ADRs, conventions, feature notes) in ordinary Markdown files, registered by reference:

```bash
agentos init                                         # sets up the Brain: templates for what is missing, existing records/docs adopted
agentos brain register docs/adr/0003-use-postgres.md --kind adr
agentos brain propose brain:0003-use-postgres --from new-text.md --summary "pin Postgres 16"   # an engine writes the text
agentos brain preview <proposal>   &&   agentos brain apply <proposal> --by <owner>
agentos brain check                                  # changed / invalid records
agentos brain verify brain:0003-use-postgres --by ralph
```

- A record is the file itself plus a small validated frontmatter (`id: brain:<slug>`, `kind`, `scope`, `status`, `sources`, `source_hash`, …). `register` adds only that block; the body stays byte-identical. Unknown keys such as `task_scope`, rules or permissions are refused: Brain content is data, not instructions. `.agentos/brain/index.json` is derived, never authoritative.
- Lifecycle `proposed → accepted → verified → superseded`. Changes go through proposals under `.agentos/brain/proposals/`; `apply` validates identity, scope, schema, references, exact duplicates and stale writes (a proposal whose `base_hash` no longer matches is refused with both hashes, zero writes), flags ambiguous same-subject records, then updates the target, supersession links and the index in one transaction and keeps the proposal under `applied/`. Applying twice is a no-op.
- A different `source_hash` means "source changed since verification — recheck", not "wrong". Humans may edit bodies freely; `brain check` and `doctor` report it, `brain verify` refreshes the hash explicitly. Invalid frontmatter is reported with `file:line` and the file is left alone (`doctor` problem).
- `agentos context` lists Brain records by reference: superseded ones omitted by default, proposed ones labelled and ranked lower, changed ones labelled.
- Optional `knowledge.brain.approval` policy: `agentos brain policy` shows the owner-approved actors and records. Agents can append eligible checkpoint-backed observations with `brain apply <proposal> --auto --by <self>`; decisions, replacements, stale evidence and detected conflicts remain pending for review. Manual review remains the default. See [automatic application](docs/brain.md#optional-automatic-application).
- One writer per workspace; no database, embeddings or vault ingestion.

Metadata keys, validation table and limits: [`docs/brain.md`](docs/brain.md).

## Compaction

The ordinary workflow is:

```bash
agentos compact --dry-run
agentos compact
```

Both commands use the same structural planner. The dry run is strictly read-only and concise: it reports sizes, classifications, and intended paths without dumping complete proposed files. Add `--diff` for the detailed unified patch; `--diff` is accepted only with `--dry-run`. A single valid current objective is selected automatically. Use `--objective <id>` only to resolve ambiguity or deliberately override that selection; dates and words such as “latest” never choose for you. `--expect-state <sha256>` is an optional preview binding. Without it, apply replans the current files under the writer lock.

Normal compact is structural, not a summary. It keeps the selected objective and heading, active tasks with nested details, protected paths, warnings and decisions. Unknown sections remain live. Complete obligations that can be lifted safely are carried forward verbatim; when a possible obligation cannot be lifted as a complete unit, its whole block stays live. The recognition is intentionally conservative and has known semantic limits; the rules, measured residuals, and fixed-point behavior are documented in [`docs/compaction.md`](docs/compaction.md).

Apply proceeds only when the combined live character count strictly decreases. Equal, growing, or identical proposals report `No safe reduction found; files unchanged.` and create no archive, lock, temporary file, or live-state write. One file may grow when the combined total still falls, and the report shows each file honestly. A successful apply first archives the exact original `handoff.md` and `tasks.md`, verifies their hashes, rechecks source state, then replaces both files inside the workspace writer lock and rollback transaction. Boundary checks and per-file atomic writes still apply.

Compaction archives only sections it can recognise as superseded history by their heading. A heading qualifies when it is exactly `History`, `Done`, `Completed`, `Completed work`, `Archived work`, `Archive`, `Run log` or `Run logs`, or when it starts with `Previous`, `Prior`, `Superseded`, `Past`, `Old`, `Historic`, `Archived` or `Earlier` followed by a noun such as `objective`, `state`, `status`, `scope`, `work`, `notes`, `run`, `sprint`, `session`, `iteration`, `step`, `log`, `context` or `tasks`. Parenthetical qualifiers and anything after an em dash, en dash, colon, period or comma are ignored, so `Previous objective (superseded) — 2026-09-13 (run 4)` qualifies. An ASCII hyphen is not one of those separators, so `Previous objective - 2026-09-13` does not, and neither does `Done — 2026-09-13` or `Sprint report`. Compaction never shrinks a canonical live section, and a section with an unrecognised heading is kept verbatim. A file whose bulk sits in a few large canonical sections, or under headings that do not match, therefore cannot shrink, and `compact` reports `No safe reduction found`. In that case the dry run now lists the five largest sections with their size, decision and reason, and counts the sections kept only because their heading is unrecognised.

`agentos doctor` and `agentos status` warn when `handoff.md` or `tasks.md` exceeds 50,000 characters (about 12k tokens), naming the largest section. Sections are the file's `# ` and `## ` blocks, plus a `start of file` entry for any text before the first heading, so their sizes add up to the whole file. The warning is advisory: it never changes `doctor`'s problems, exit status, or `status` OK/NEEDS ATTENTION. `doctor` also warns, the same advisory way, when `tasks.md` has checkbox items above its first `##` section, more than one `# ` heading, or unchecked items whose lead says `DONE`, `MERGED`, `DELIVERED`, `COMPLETED`, `CLOSED` or `SHIPPED`.

Ambiguous, missing, empty, malformed, stale-selector, and stale-`--expect-state` inputs refuse with zero writes. `status` and `doctor` use the same current-objective recognition as compaction.

`agentos compact --archive-only` selects the old archive-and-link behavior. It keeps all live text, appends archive links, and may grow live state. (`--checkpoint`, its old name, and `--rewrite`, an alias of plain `compact`, were removed in 3.0.0.)

Full archive layout, preservation policy, refusal rules, rollback boundaries, and known limits: [`docs/compaction.md`](docs/compaction.md).

## Agent profiles

```bash
agentos init --existing --agents minimal
agentos init --existing --agents developer,tester,reviewer,release-manager
```

Profiles:

- `minimal`: `developer`, `tester`, `reviewer`, `release-manager`.
- custom comma list: friendly aliases such as `review`, `release`, `planning`, and `pm`.

Without `--agents`, `init` enables the same team as `minimal` (frontend/backend specialists were absorbed into the single `developer` role). `planner` is optional and planning-only; it is not enabled by default.

### Task scope (optional)

`repos:` in `.agentos/project.yaml` is an inventory; it grants no permission. To scope the current task, add an optional `task_scope` mapping (repo IDs or workspace-relative paths; `edit` implies `read`):

```yaml
task_scope:
  read: [api/contracts/openapi.yaml]
  edit: [web]
```

`agentos context --brief` then prints the repo inventory, read scope and edit scope separately, so a frontend task can read a backend contract without gaining backend edit scope. `context --brief` and `doctor` fail on a malformed `task_scope` (unknown keys, non-lists, absolute or `..` paths). `doctor --fix` never edits `engines.allowed`.

```bash
agentos agents add planner
```

## Agents

An agent card `.agentos/agents/<id>.md` is readable instructions; its YAML frontmatter, when present, is a validated manifest (`id`, `name`, `purpose`, `responsibilities`, `knowledge_selectors`, `skills`, `tools_requested`, `permission_intent: read-only|edit-in-scope|release`, `expected_output`, `provenance`, `custom`, optional `edit_request`). Unknown keys and any other `permission_intent` are rejected; `doctor` fails on an invalid manifest.

```bash
agentos agents add developer                  # writes the manifest: installed_from catalog:developer, package version, source_hash
agentos agents show developer --json
agentos agents disable tester                 # edits agents.enabled only; the card stays on disk
agentos agents remove tester --dry-run        # refuses while anything still references tester
agentos doctor --fix                          # a legacy card that byte-matches the catalog gets its manifest
```

- The task decides the scope (`task_scope` / `--scope`). A manifest can only narrow it: `read-only` empties the edit scope; `edit_request` entries outside the task's edit scope are ignored with a warning.
- `agents add` and `doctor --fix` never overwrite a card marked `custom: true` or whose body changed since install (`provenance.source_hash`). `agents add <id> --replace --dry-run` prints a diff and writes nothing; `--replace` keeps the old card under `.agentos/runs/replaced-agents/`.
- Cards written by `init` have no frontmatter (legacy). They keep working; `doctor` lists them with the command that adds a manifest. Provenance is never inferred for a card that does not byte-match its source: use `agents manifest <id> --custom` (provenance `unknown`).
- `disable` leaves the card; `context`/`checkpoint --role <disabled>` exit 1 naming `agentos agents enable <id>`. `remove` refuses while `agents.enabled`, `agents.capabilities`, a current checkpoint role or a Brain record (`scope`, or a tag `<id>`/`agent:<id>`) points at the id, and moves the card to `.agentos/runs/removed-agents/<ts>-<id>.md` instead of deleting it.

Keys, lifecycle and preservation rules: [`docs/agents.md`](docs/agents.md).

## Engines

`agentos doctor --engines [--json]` (`agentos engines` before 3.0.0) prints what AgentOS can make each engine (`claude-code`, `codex`, `opencode`, `hermes`, `generic`) do, per row `context_rendering`, `native_agent_config`, `tool_restrictions`, `permission_enforcement`, `launch`, `native_session_resume`, with status `verified | advisory | unsupported | unverified` and the evidence. `verified` cells come from the 2026-10-25 trials (n=1 per probe; T7 n=2): Claude Code `permission_enforcement` (deny rules in a trusted workspace: listed paths, siblings, Bash redirects to denied paths, read-only deny-all; T3, T5, T6c, T6d) and `tool_restrictions` (launch-time `--allowedTools`, T1/T2); Codex `permission_enforcement` (launch-time `--sandbox read-only` only; per-path scope unsupported, T4); `native_agent_config` for both (Claude: discovery T5, invocation T8/T9, instruction-following T8; Codex: instruction-following T7); the rendered subagent `tools:` restricted the invoked subagent (T9). `agentos context <engine>` ends with one ADVISORY line saying how far the edit scope is enforced and which paths stay writable. `--require-synced-config` checks configuration presence against the sync record `agents sync` writes (`.agentos/synced/<engine>.json`), for the recorded role and scope: `Synced config: OK (claude-code, role developer, sha256 …)` while every generated file and entry is installed and sync would generate the same now, otherwise `STALE` (with the file and reason: tree, scope or manifest changed, generated entry edited; or a 1.0.0 sync without a record), `INVALID` (with the reason), `MISSING` (never synced) or `UNSUPPORTED` (opencode, hermes, generic). Owner-added entries are not drift. `agentos doctor` runs the same check and prints one warning per stale or invalid engine with the re-sync command (exit status unchanged; `--json` adds `synced_config`). `--require-enforcement` always exits 1 (`Enforcement: UNSUPPORTED — …`) for every engine in v1: AgentOS cannot verify workspace trust, residual paths stay writable, and the rules bind only the engine's own tools. Configuration presence is not proof of enforcement ([`docs/engines.md`](docs/engines.md#enforcement-vs-synced-configuration)).

`agentos agents sync claude-code [--dry-run] [--replace]` writes `.claude/agents/<role>.md` and a `.claude/settings.local.json` permission fragment (added to an existing file; on re-sync only the entries recorded in `.agentos/synced/claude-code.json` are replaced, owner entries stay in place): `Edit(/<path>/**)` allow rules for the edit scope plus `Edit(…)` **deny** rules for everything outside it (Edit only since 3.1.1: Claude Code applies Edit rules to every file-editing tool and 2.1.311 warns that `Write(…)`/`NotebookEdit(…)` rules never match; a re-sync drops the ones earlier versions recorded) — listed repo/read paths, every sibling entry at each ancestor level of the edit path, `.claude/` with its settings files, `.agentos/project.yaml` and `.agentos/agents/**` (a read-only role denies `/**`). Listed-path and sibling denies are trial-verified (T5, T6c); new root files/dirs created after the sync, `.agentos/` state and other shell writes are advisory — re-run it after adding top-level directories (`agentos doctor` warns when the synced config is stale). The subagent gets `tools:` from the manifest's `tools_requested` (read-only roles: `Read, Grep, Glob`; the invoked subagent had exactly the listed tools in T9, n=1; the top-level session is not restricted). Hand-edited generated content, or an existing different list without a sync record, refuses the whole sync with zero writes until `--replace` (one backup per overwritten file under `.agentos/runs/replaced-synced/`); `--dry-run` prints the `+`/`-` entries per file. One sync record per engine: syncing another role replaces the previous role's files. Claude Code ignores `.claude/settings.local.json` until the workspace is trusted; run `claude` interactively once or set `projects[<root>].hasTrustDialogAccepted`. `agentos agents sync codex` writes a managed role block (`<!-- agentos:role:start/end -->`) into the in-scope repo's `AGENTS.md` and prints that Codex enforces only its launch-time sandbox. Only `agents sync` writes these files; `context` and `checkpoint` never do.

Matrix, evidence and what the trial did not prove: [`docs/engines.md`](docs/engines.md).

## Local skills

List built-in skills and packs:

```bash
agentos skills list
```

Add detected skill pack for the current workspace:

```bash
agentos skills add --detected
```

Add specific skills or category packs:

```bash
agentos skills add debugging
agentos skills add commit-messages
agentos skills add frontend-pack
agentos skills add backend-pack,github-pack
```

Skills are written project-locally:

```text
.agentos/skills/<category>/<skill>/SKILL.md
```

The catalog has 15 framework-neutral workflow skills. `skills add` installs the
complete card plus its optional `references/` files
with byte parity, per-file atomic writes, and best-effort command rollback. Load
only references matching the assigned repo's actual stack; project conventions
prevail. Existing differing cards or references require reviewed `--replace`, and
unrelated owner reference files are preserved.

`.agentos/skills.md` remains an on-demand index, not proof of installation. Use
`agentos skills list --installed` for local inventory. The read-only `commit-messages`
workflow prefers staged changes, reports untracked files, discovers commit
conventions, and produces separate messages per independent repo; it never
formats or stages automatically. See [the complete catalog](docs/templates.md).
Retired skill IDs are unavailable for new installs in this intermediate slice;
compatibility aliases and migration diagnostics are deferred, with existing local
and native cards preserved.

Remove a project-local AgentOS skill with dry-run first:

```bash
agentos skills remove commit-messages --dry-run
agentos skills remove commit-messages
```

Removal deletes matching `.agentos/skills/**/<skill-id>/` folders and updates `.agentos/skills.md`. It intentionally leaves native engine copies under `.claude/skills/` and `.opencode/skills/` untouched.

## Child repo engine launch

For multi-repo workspaces, `agentos init --existing` and `agentos doctor --fix` maintain child repo pointer files such as:

```text
frontend/AGENTS.md
frontend/CLAUDE.md
backend/AGENTS.md
backend/CLAUDE.md
```

These files are for engines launched from inside a repo directory, for example:

```bash
cd kargax-fe
opencode

cd ../kargax-be
claude
```

The child pointer tells OpenCode/Codex/Hermes/Claude to resolve the relative AgentOS root (`..` for immediate children, deeper paths for nested repositories), read the root `.agentos/skills.md`, and then load only the specific `../.agentos/skills/**/SKILL.md` cards relevant to the task. Commit-message requests should resolve AgentOS skills such as `commit-messages` or an explicitly indexed project-local workflow from the skills index without the user repeating the full path.

The pointers lead with the CLI, not with a file list. Some engines (OpenCode run non-interactively, observed) refuse file reads outside the directory they started in, and one refused read can end the session. From a child repo:

- `agentos status` finds the workspace root and prints the repo you are in, the repos in scope, that repo's verification commands, and the open tasks.
- `agentos status --full` adds the handoff content first. The file reading list follows, marked as applying only when reads outside the directory work.
- Both leave the workspace-root output unchanged.

OpenCode's own permission settings decide whether it may read the parent directory (in testing, `--auto` or an `external_directory` entry with an absolute path allowed it). Those settings are machine-specific, so AgentOS does not generate an `opencode.json`.

Run this after upgrading an older workspace so stale child pointers are repaired:

```bash
agentos doctor --fix
agentos doctor
```

## Templates

The repo ships portable source templates:

```text
templates/agents/
templates/skills/
templates/schemas/
templates/examples/
```

Discover and install them with `agents` and `skills` (`templates` was removed in 3.0.0):

```bash
agentos agents list                       # built-in agents
agentos skills list                       # built-in skills and packs
agentos agents show planner               # the catalog card when it is not installed
agentos skills show frontend-design
agentos agents add planner --dry-run
agentos agents add planner
agentos skills add frontend-design commit-messages
agentos agents add ./my-agent.md --name custom-auditor --dry-run   # also prints the template structure check
agentos skills add templates/skills/frontend/frontend-design.md --dry-run
```

Template docs: [docs/templates.md](docs/templates.md).

## Safe imports

Import is designed to be review-first and project-local by default.

Preview a local or web source (nothing is written without `--yes`):

```bash
agentos skills add ./external-skill.md --name external-review
agentos agents add https://example.com/agent.md --name security-reviewer
```

Write only after review, pinned to the reviewed bytes:

```bash
agentos skills add ./external-skill.md --name external-review --yes --expected-sha256 <sha256 from the preview>
```

An imported agent is written as a manifest card (`installed_from: import:<url>` or `template:<path>`). A local agent file that is already a valid agent template installs as written (`agents add <file>`), but a BLOCK finding refuses it too.

The importer shows source, SHA256, byte size, target path, and safety findings. Prompt-injection-like instructions block import and are written to `.agentos/imports/quarantine/` for review instead of being materialized as runtime templates. Secret-like words, dangerous command patterns, missing license hints, and large content produce warnings.

AgentOS refuses to overwrite existing copied/imported templates by default. Use `--replace` only after reviewing the existing local file and confirming replacement is intended:

```bash
agentos agents add planner --replace
agentos skills add ./external-skill.md --name external-review --yes --replace
```

Safe-import docs: [docs/safe-imports.md](docs/safe-imports.md).

## Obsidian (optional)

Obsidian is a second location for the same Project Brain, never a second store; nothing needs it. Details: [docs/obsidian.md](docs/obsidian.md).

- **No vault yet:** `agentos obsidian init [--dir <path>] [--dry-run]` creates a plain `knowledge/` folder with an `index.md` that links the Brain records by relative path, and registers it as `knowledge.obsidian` (keys added only). Open the folder in Obsidian if you like; `.obsidian/` is created by Obsidian, not by AgentOS.
- **Existing vault:** `agentos obsidian link --vault <abs-path> --dest <sub/folder> [--canonical workspace|vault] [--create] [--dry-run]` registers one project folder. It creates only that folder and `<Project> AgentOS Index.md` in it; nothing else in the vault is touched.
- **Canonical location** (`knowledge.obsidian.canonical`, default `workspace`): every record is one file in one place; the other side holds links, never copies; no sync. With `canonical: vault`, notes in the linked folder are Brain records with portable identity (`id`, vault-relative `sources`); the absolute vault path lives only in the git-ignored, machine-local `.agentos/local.yaml` (`obsidian.vault`; older setups: `project.yaml`, still read). Notes are read and changed only through `agentos brain register|propose|apply`, and only inside `<vault>/<dest>`.
- **Unavailable vault:** its records are `unavailable` in `brain check`, listed under Missing by `agentos context` (`--require-complete` exits 1), and `doctor` warns. An edit made in Obsidian shows up as `changed`.

The boundary-only form (no index note; `obsidian link-workspace` before 3.0.0):

```bash
agentos obsidian link --no-index \
  --vault /mnt/c/_/Obsidian/Ralph \
  --dest "Projects/KargaX/AgentOS" \
  --create

agentos obsidian status
```

This writes `.agentos/knowledge.md`, patches `.agentos/project.yaml`, and optionally creates the destination folder only. It intentionally does **not** create note files, plans, summaries, or templates. Claude Code, Codex, OpenCode, Hermes, or another engine may create/edit Markdown inside the linked workspace only when a task explicitly allows it.

Safety rules:

- AgentOS does not bulk-load the Obsidian vault.
- The linked destination folder is the default Obsidian boundary.
- Runtime state stays in `.agentos/`.
- Durable notes, summaries, plans, decisions, and runbooks belong inside the linked Obsidian workspace when exported or written.

Exact-note, link-only mode (`link-obsidian --link` before 3.0.0; on a terminal it asks for missing values):

```bash
agentos obsidian link \
  --note "AgentOS Index.md" \
  --vault /mnt/c/_/Obsidian/Ralph \
  --dest "Projects/AgentOS" \
  --create
```

When `--dest` is omitted, AgentOS defaults to:

```text
Projects/<ProjectName>/AgentOS
```

## Claude legacy migration (removed in 3.0.0)

`agentos migrate claude --preserve` was removed in 3.0.0 (see [legacy upgrade paths](#legacy-upgrade-paths-removed-in-300)). To move old `.claude` files aside, run `npx agentos-for-projects@2 migrate claude --preserve` once, or rename them by hand.

## Development

```bash
bun install            # also builds dist/ (the `prepare` script)
bun run build          # rebuild after editing src/
bun run check
bun run test
bun run smoke
bun run test:package-managers
```

Release-readiness without publishing:

```bash
bun run release:check
bun run publish:dry-run
npm run pack:dry-run
```

npm also works:

```bash
npm run build
npm test
npm run smoke
npm run test:package-managers
```

## Package / publish flow

The npm package is prepared for public publishing under:

```text
agentos-for-projects
```

The package publishes runtime files declared by `files` plus npm standard metadata:

```text
dist/
templates/
README.md
LICENSE
package.json
```

Do not run real `npm publish` until the intended package name, npm account, and version are confirmed.

Release checklist: [docs/release-readiness.md](docs/release-readiness.md).

## CI

GitHub Actions uses Bun as the primary dogfood package manager. The package-manager compatibility test verifies npm, pnpm, and Bun installs.

```text
.github/workflows/ci.yml
```

## Reliability and recovery

See [reliability contracts and acceptance](https://github.com/ralphlol123/AgentOS/blob/main/docs/reliability-acceptance.md) for preview/replacement behavior, additive `init --refresh`, installed inventories, writer-lock recovery, protected handoff evidence, reviewed import hashes, and verification limits.
