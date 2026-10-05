# AgentOS for Projects

## Filesystem boundary safety

Mutating commands preflight AgentOS-managed paths before writing. Repository paths must be workspace-relative; traversal (`..`), absolute paths, Windows drive paths, and backslash paths are rejected rather than silently rewritten. Obsidian destinations and note paths follow the same rule relative to the selected vault. Workspace-folder note links must stay beneath the declared destination; legacy explicit note allowlists remain vault-relative.

AgentOS conservatively rejects symlinks (including dangling links) in `.agentos/`, adapter targets/backups, repository adapter paths, and Obsidian target components. Migration checks only its `.claude` sources and targets, leaving unrelated native skill links alone. This includes links pointing inside the workspace: use real managed files/directories instead. The explicitly selected workspace/vault root may itself be reached through an alias.

These checks protect against existing unsafe paths, not concurrent filesystem replacement by another process. They are not an OS sandbox or a transactional filesystem. Do not run concurrent writers in the same checkout. General read-only commands and user-selected import sources are not restricted to the output boundary.

## Atomic state writes and rollback

Every critical AgentOS text file — `.agentos/project.yaml`, `handoff.md`, `tasks.md`, `knowledge.md`, `skills.md`, managed agent/repo markdown, and root/child adapter files (`AGENTS.md`, `CLAUDE.md`, `.hermes.md`, child repo pointers) plus their `.agentos.bak` backups — is replaced through a single atomic-write primitive: the new content is written to a uniquely named temporary file in the *same directory* as the destination, flushed and fsync'd, closed, given the destination's existing file mode (or the OS default for a brand-new file), then renamed over the destination in one filesystem `rename()` call. `rename()` never follows a symlink at the destination — it replaces the link entry itself — and this primitive does not change Task 2's symlink/boundary checks, which still run before any of this. If the temp file can't be renamed (or any earlier step fails), the temp file is removed; no partial or zero-byte destination file is ever left behind.

Commands that touch more than one output — `agentos init`, `doctor --fix`, `agentos obsidian link` / `link-workspace`, `agents add` and agent template copy, `skills add` / `skills remove` and skill template copy/import, `compact`, and `agentos run handoff` — run their entire write phase as one in-process mutation transaction. For `init`, that includes every filesystem mutation it makes, not just the adapter files: the `.agentos` scaffold directories and files, per-agent/engine/repo files, root/child adapters and their one-time backups, and child `.gitignore` blocks are all one transaction, so a fault partway through leaves the workspace exactly as it was before `init` ran. Before each write/create/remove, the transaction snapshots either the target's existing bytes and mode (if it already existed) or its topmost not-yet-existing ancestor directory (if it's new), so a brand-new nested folder can be removed as a whole on rollback. If any later step in the same command throws, every tracked path is restored to its pre-command bytes, mode, or absence, in reverse order, before the error is re-raised; dry-run and dependency/config validation still happen before any of this and are unaffected.

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

**Adopting custom content.** The recorded real-world upgrade case is a root `AGENTS.md` that holds project knowledge *with* a stale AgentOS bootloader section interleaved in it. That file is neither whole-legacy nor safe-custom, so it used to be a conflict that had to be resolved by hand. It is now classified **`adopt`**: AgentOS can see exactly which contiguous byte span is a byte-exact historical section, and can replace only that span while leaving every custom byte before and after it untouched. Adoption is offered, never assumed:

```bash
agentos doctor --fix --dry-run                     # preview every planned adapter change (read-only)
agentos doctor --fix --adopt-custom-adapters       # adopt, then repair as usual
```

- A plain `doctor --fix` still makes **zero** changes when a file needs adoption — it refuses and names the flag, exactly as it does for an ownership conflict.
- `--adopt-custom-adapters` only runs together with `--fix` (the same rule is enforced for library callers, not just the CLI), and `--fix --dry-run` prints each file's classification and, for adoptable files, the exact byte span that would be replaced. The preview covers adapter changes and, with `--prune-retired`, retired-card pruning; it is not a preview of every diagnostic `doctor --fix` performs.
- Only a *single* matching section is adoptable. Two candidate sections, or a section shown inside a fenced code block, stay a conflict — AgentOS never guesses which bytes are its own.
- Adoption recognizes only the enumerated historical bodies, byte-exact apart from the template placeholders (`Workspace: …`, `Repos: …`, child `name`/`path`) which match a single line each. A hand-written file that reproduces one of those bodies exactly is treated as AgentOS-owned, which is the same rule whole-file recognition has always used.

A marker only counts if it appears as its own standalone line (after stripping a trailing `\r`) outside a fenced code block. Fence tracking follows CommonMark closely enough for this purpose: an opening run of 3+ backticks or tildes only closes on a later run of the *same character* with length *at least* the opener's and only spaces/tabs after it — a shorter run, a different delimiter, a would-be closer with trailing text, or marker text embedded in a longer line is never treated as forming or extending an owned block; its mere presence makes the file a conflict instead. Adapter files must be valid UTF-8; invalid byte sequences fail closed before mutation rather than being decoded and rewritten with replacement characters.

Anything else is treated as a **conflict** and left completely untouched: corrupted markers (a start with no end, an end with no start, markers in reversed order, duplicate/nested marker pairs, or marker text embedded/fenced as above), a recognized legacy shape with any extra content appended to it (nothing is ever silently discarded), files that merely *mention* AgentOS in prose without matching one of the shapes above, and two or more repo entries in `.agentos/project.yaml` that resolve to the same adapter file (e.g. `frontend` and `./frontend`, or two differently named entries pointing at the same directory) — AgentOS has no way to know which repo's section should own that path, so it refuses to guess. AgentOS never guesses ownership of ambiguous text. `doctor` and `doctor --json` report each ambiguous file by path (e.g. `frontend/CLAUDE.md adapter ownership is ambiguous: ...`), and additionally flag a *valid* managed block whose content has simply gone stale (`... managed block is stale and does not match the current canonical section`) even when unrelated surrounding text happens to satisfy older, broader health checks elsewhere in `doctor`. `doctor --fix` preflights every root and child adapter file *before its first mutation* — if even one is ambiguous, the entire command (adapters, `.agentos/project.yaml`, `skills.md`, agent files) makes zero changes rather than partially repairing the rest; the same preflight-before-first-mutation rule applies to `agentos init`, including for hybrid workspaces where the root itself is also a package (root adapters always stay bootloaders — only non-root repos ever receive child pointers). If `.agentos/project.yaml` itself is malformed, `doctor` reports that config error alone and skips every adapter diagnostic that would otherwise be derived from it — it never compares real adapters against a canonical section built from a `{}` fallback, which would produce misleading "stale, run `doctor --fix`" noise unrelated to the adapters themselves.

**Backups.** The first time a pre-existing custom or legacy file is converted into the managed-block format, AgentOS writes one `<file>.agentos.bak` containing the exact pre-conversion bytes and file mode, taken from the same read used to decide what to do with the file (not a second, independently racy read at write time). That write is an exclusive create (temp file + `link()`, not `rename()`): if a backup already exists at that path — from an earlier run or a racing writer — this call always loses to it rather than clobbering it, with no check-then-write gap. Repeated `init`/`doctor --fix` runs never overwrite or multiply a backup — once a file has a valid managed block, later repairs only update the bytes between the markers (or do nothing at all if they already match). `agentos init`'s entire mutation set — the `.agentos` scaffold, agent/repo files, root/child adapters and their backups, and child `.gitignore` blocks — and doctor --fix's adapter writes each run inside one mutation transaction, so a fault partway through (including during a backup write) rolls every output in that command back to its original bytes/existence, with no leftover temp artifacts. Every root/child adapter target's plan is computed once per command and applied verbatim, without rereading or reclassifying the file a second time at write time; as a narrow defense-in-depth check, applying a plan that read an existing file compares that file's current bytes against the plan-time snapshot immediately before writing, and fails closed instead of applying a stale plan if they no longer match.

Limitations:

- Newline style is preserved outside the managed block always; inside it, AgentOS matches whichever style (LF or CRLF) the file already uses as a whole. A file that mixes both styles is treated as CRLF if any `\r\n` is present.
- Legacy-shape recognition matches only an exact, fully anchored structural signature per historical AgentOS version (or the current generator's own output) — never a loose "looks AgentOS-ish" heuristic — so it can safely auto-migrate without a human review step; anything it doesn't recognize fails closed as a conflict instead of guessing.
- The plan-vs-apply staleness check (above) assumes non-hostile, non-concurrent use, same as the rest of this section: it catches accidental drift and defends in depth, but AgentOS still assumes a single writer per checkout, not protection against an adversarial concurrent process.


## Migration inventory

`doctor` and `doctor --json` include a read-only **migration inventory**: the workspace's adapter files, unsafe repository IDs, and retired catalog cards, classified before anyone approves a fix. It is reporting only — it never writes, never changes doctor's exit status (problems and warnings still do), and stays silent on a clean workspace.

Scope: the inventory covers **files and IDs** — adapters, repo IDs, retired cards. Retired IDs *referenced* inside `.agentos/project.yaml` (`agents.enabled`, `agents.capabilities`) never become inventory entries; they are reported only as ordinary `doctor` warnings by `checkLegacyCatalogState`. A retired entry left in `.agentos/skills.md` with no card on disk is reported **both** ways: that same ordinary warning, plus an `index-only` retired-card entry — so a retired ID can legitimately appear twice in one human run (once as a warning, once as an inventory line), and neither adds to the other's counts. `summary.action_required` counts non-`noop` adapters plus all repo-ID and retired-card entries; `summary.adapter_count` counts every inventoried adapter, `noop` included.

```bash
agentos doctor --json | jq '.migration.summary'
agentos adapters explain AGENTS.md
```

Three classes, matching the real upgrade pain seen when moving a workspace from an older AgentOS:

- **adapters** — every root and child adapter file with its classification (`create`, `noop`, `update`, `migrate`, `append`, `adopt`, `conflict`), the same pure classification `doctor --fix` uses. `safe` means "unambiguous **and** appliable by a default `doctor --fix`", so both `conflict` and `adopt` entries report `safe: false`; an `adopt` entry also carries `requiresOptIn: true` and the legacy byte span. The inventory never guesses ownership.
- **repoIds** — repository IDs in `.agentos/project.yaml` that are not lowercase-hyphen safe (e.g. `frontend_client` → `frontend-client`), with `collides` telling you whether the normalized ID would clash with an existing key. A non-canonical ID is a reported problem, not a parse failure, so the rest of `doctor` still runs; fix it with `agentos doctor --fix --normalize-repo-ids`.
- **retiredCards** — retired agent/skill cards with their canonical replacement and an eligibility class:
  - `prunable` — bytes match a body a real AgentOS version installed (agent cards against the enumerated historical shapes, skill cards against `src/legacy-skill-shapes.ts` content hashes); opt-in cleanup may remove it.
  - `already-canonical` — same, and the canonical card is already installed, so only the stale file remains.
  - `customized` — hand-edited, or an older generated body AgentOS cannot prove; never auto-removed.
  - `manual-review` — a card with no byte-match evidence; a human decides (typically a local fork).
  - `index-only` — listed in `.agentos/skills.md` with no card on disk.

`agentos adapters explain <file>` answers the same question for exactly one path: target level (root/child), classification, managed-block status with byte offsets, the reason for a conflict, and the next command. If `.agentos/project.yaml` cannot be parsed, it still reports marker structure rather than nothing, and says why the canonical section is unavailable.

When `.agentos/project.yaml` fails validation there is no canonical section for any path, so the classification falls back to marker structure and uses its own vocabulary: `managed-block` (a valid block exists, staleness unknown), `create` (missing or empty), `migrate` (a recognized historical body), `append` (unrelated custom content), and `conflict`. With a valid config, a path that is not an adapter target is refused outright (with the known-target list) rather than classified.

Nothing in the inventory performs a migration. The `doctor --fix` behavior — fail-closed preflight, one-time `.agentos.bak` backups, byte-preserving managed-block updates — is unchanged.

## Retired card cleanup

When a card's ID is retired (the 0.4.0 catalog consolidation), AgentOS either migrates it or reports it — never guesses:

- **Retired agent cards** are migrated by `doctor --fix` when their bytes match an enumerated historical generated body: the canonical card is written and the stale file removed. A hand-edited card is reported and left alone.
- **Retired skill cards** and a stale local-skills index are handled by an explicit opt-in, because removal is deletion rather than replacement:

```bash
agentos doctor --fix --prune-retired
agentos doctor --fix --dry-run --prune-retired   # list the cards it would remove, write nothing
```

  - Only cards whose bytes hash-match a body AgentOS really installed are removed (see `src/legacy-skill-shapes.ts`, regenerated from this repository's own history). One edited character changes the hash, so a local fork is reported as `manual-review` and never touched.
  - `.agentos/skills.md`'s local-skills block is rebuilt from what is actually on disk, which drops stale retired bullets and `Details:` lines while leaving the `Policy: on-demand` line and everything outside the managed block intact.
  - Engine-native copies (`.claude/skills/`, `.opencode/skills/`) are out of scope and never touched.

## Repository ID normalization

An ID like `frontend_client` is **normalizable**: `agentos doctor --fix --normalize-repo-ids [--dry-run]` renames it to `frontend-client`, together with its `.agentos/repos/<id>.md` note, and writes an audit note under `.agentos/runs/`.

```bash
agentos doctor --fix --normalize-repo-ids --dry-run   # show the mapping, write nothing
agentos doctor --fix --normalize-repo-ids             # apply
agentos doctor --fix                                  # refresh adapters that named the old ID
```

- **Never implicit.** `--normalize-repo-ids` only runs together with `--fix`; a plain `doctor --fix` leaves an unsafe ID alone (it reports it instead). With the flag present, the command performs *only* the normalization — it does not also run the rest of `doctor --fix`, so run `agentos doctor --fix` afterwards to refresh adapters.
- **IDs stay path-safe.** A repository ID becomes the filename `.agentos/repos/<id>.md` and is written into generated cards and child pointers, so an ID that is not a workspace-relative path fragment (`../x`, `a/b`, `a\b`) or that contains anything outside letters, digits, spaces, dots, underscores and hyphens stays a hard configuration error. Those IDs were already fatal before normalization existed; only *non-canonical but safe* IDs like `frontend_client` became migratable.
- **Byte-preserving.** Only the renamed key's line changes. Comments, key order, quoting, indentation, and every other byte of `project.yaml` are untouched; the repo note is moved with its bytes intact. Renaming is refused (with zero writes) for a flow-style `repos: {…}` mapping or when the key cannot be located exactly once, because that cannot be edited safely line-by-line — the message says to edit by hand. (Duplicate YAML keys never reach that check: the YAML parser rejects the file as malformed first.)
- **Ambiguity fails closed.** Two IDs that normalize to the same canonical ID (`frontend_client` + `frontend-client`), or a repo that has *both* the old and the canonical note file, is never resolved by guessing: the command refuses and leaves every byte unchanged. Genuinely unmigratable configs still fail strict validation exactly as before — the only change is that a *normalizable* ID no longer bricks config parsing.
- **One transaction.** The config rewrite, note move, and audit note commit together or not at all.


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
- deterministic live-context compaction;
- engine-neutral run handoff notes with read-only Git grounding;
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

Generate an engine prompt:

```bash
agentos prompt claude
agentos prompt codex
agentos prompt opencode
agentos prompt hermes
```

More detail: [docs/quickstart.md](docs/quickstart.md).

## Commands

```bash
agentos init [--new|--existing] [--agents minimal|detected|developer,tester,reviewer,release-manager] [--dry-run]
agentos status
agentos handoff
agentos run handoff [--engine name] [--role role] [--repo repo] [--worktree path] [--phase slug] [--reason reason] [--dry-run]
agentos doctor [--fix] [--json]
agentos doctor --fix [--dry-run] [--adopt-custom-adapters] [--prune-retired]
agentos doctor --fix --normalize-repo-ids [--dry-run]
agentos adapters explain <file>
agentos compact [--objective <id>] [--expect-state <sha256>]
agentos compact [--objective <id>] --dry-run [--diff]
agentos compact --checkpoint [--dry-run]
agentos compact --rewrite ...  # compatibility alias for normal compact
agentos link-obsidian [--vault <path> --dest <folder> --link <note> --create]
agentos obsidian link-workspace --vault <path> --dest <folder> [--create] [--dry-run]
agentos obsidian status
agentos skills list
agentos skills add [--detected] [skill-id|category-pack,...] [--mode summary|full] [--dry-run]
agentos skills remove <skill-id> [--dry-run]
agentos agents list
agentos agents add <agent-id|template-file> [--name id] [--dry-run]
agentos templates list
agentos templates show <id>
agentos templates copy <id> [--dry-run] [--replace]
agentos templates validate <file> --type agent|skill
agentos templates import <url-or-file> --type agent|skill --name <id> [--mode summary|full] [--dry-run] [--yes] [--replace]
agentos migrate claude --preserve [--dry-run]
agentos prompt [claude|codex|opencode|hermes]
```

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

`agentos doctor` and `agentos status` warn when `handoff.md` or `tasks.md` exceeds 50,000 characters (about 12k tokens), naming the largest section. Sections are the file's `# ` and `## ` blocks, plus a `start of file` entry for any text before the first heading, so their sizes add up to the whole file. The warning is advisory: it never changes `doctor`'s problems, exit status, or `status` OK/NEEDS ATTENTION.

Ambiguous, missing, empty, malformed, stale-selector, and stale-`--expect-state` inputs refuse with zero writes. `status` and `doctor` use the same current-objective recognition as compaction.

Two compatibility paths remain explicit:

- `agentos compact --checkpoint` selects the old archive-and-link behavior. It keeps all live text, appends archive links, and may grow live state.
- `agentos compact --rewrite` is a compatibility alias for normal structural compaction. It is not a safer or different mode.

Full archive layout, preservation policy, refusal rules, rollback boundaries, and known limits: [`docs/compaction.md`](docs/compaction.md).

## Run handoff notes

Use `agentos run handoff` when an engine is near quota, hit a provider/rate-limit error, was manually paused, or left partial work that another human/engine may need to continue.

```bash
agentos run handoff \
  --engine claude-code \
  --role developer \
  --repo photobooth-be \
  --worktree worktrees/photobooth-be__feat-event-template-system \
  --phase event-template-system \
  --reason quota-risk
```

The command writes an engine-neutral note under `.agentos/runs/`, captures read-only Git state (`status`, `diff --stat`, changed files, bounded diff snippets), and updates `.agentos/tasks.md` plus `.agentos/handoff.md`.

Safety rules:

- AgentOS does **not** automatically switch engines.
- AgentOS does **not** launch OpenCode/Codex/Claude or close terminals.
- AgentOS does **not** commit, push, merge, reset, clean, or remove worktrees.
- The next human/engine must inspect `git status --short --branch`, `git diff --stat`, and `git diff` before editing.

## Agent profiles

```bash
agentos init --existing --agents minimal
agentos init --existing --agents detected
agentos init --existing --agents developer,tester,reviewer,release-manager
```

Profiles:

- `minimal`: `developer`, `tester`, `reviewer`, `release-manager`.
- `detected`: the same core team as minimal; frontend/backend specialists were absorbed into the single `developer` role.
- custom comma list: friendly aliases such as `review`, `release`, `planning`, and `pm`.

`planner` is optional and planning-only. It is not enabled by the default detected profile.

```bash
agentos agents add planner
```

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
agentos skills add backend-pack,github-pack --mode full
```

Skills are written project-locally:

```text
.agentos/skills/<category>/<skill>/SKILL.md
```

The catalog has 15 framework-neutral workflow skills. Both `skills add` modes and
`templates copy` install the complete card plus its optional `references/` files
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
- `agentos handoff` prints the handoff content first. The file reading list follows, marked as applying only when reads outside the directory work.
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

Use the registry commands to discover and materialize them:

```bash
agentos templates list
agentos templates show agent:planner
agentos templates copy agent:planner --dry-run
agentos templates copy agent:planner
agentos templates copy skill:frontend/frontend-design
agentos templates copy skill:github/commit-messages
agentos templates validate templates/agents/planner.md --type agent
```

Agent convenience commands remain available:

```bash
agentos agents list
agentos agents add planner
agentos agents add ./my-agent.md --name custom-auditor --dry-run
```

Template docs: [docs/templates.md](docs/templates.md).

## Safe imports

Import is designed to be review-first and project-local by default.

Dry-run a local or web source:

```bash
agentos templates import ./external-skill.md --type skill --name external-review --dry-run
agentos templates import https://example.com/agent.md --type agent --name security-reviewer --dry-run
```

Write only after review:

```bash
agentos templates import ./external-skill.md --type skill --name external-review --yes
```

The importer shows source, SHA256, byte size, target path, and safety findings. Prompt-injection-like instructions block import and are written to `.agentos/imports/quarantine/` for review instead of being materialized as runtime templates. Secret-like words, dangerous command patterns, missing license hints, and large content produce warnings.

AgentOS refuses to overwrite existing copied/imported templates by default. Use `--replace` only after reviewing the existing local file and confirming replacement is intended:

```bash
agentos templates copy agent:planner --replace
agentos templates import ./external-skill.md --type skill --name external-review --yes --replace
```

Safe-import docs: [docs/safe-imports.md](docs/safe-imports.md).

## Obsidian workspace-folder knowledge

Preferred setup links one Obsidian folder/workspace per AgentOS workspace:

```bash
agentos obsidian link-workspace \
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

Legacy exact-note linking remains available:

```bash
agentos link-obsidian \
  --vault /mnt/c/_/Obsidian/Ralph \
  --dest "Projects/AgentOS" \
  --link "AgentOS Index.md" \
  --create
```

When `--dest` is omitted, AgentOS defaults to:

```text
Projects/<ProjectName>/AgentOS
```

## Claude legacy migration

Preserve old Claude files before switching to AgentOS canonical context:

```bash
agentos migrate claude --preserve --dry-run
agentos migrate claude --preserve
```

This renames active `.claude` files to timestamped `.agentos-legacy-*` backups, writes `.claude/README.agentos.md`, and patches `CLAUDE.md` with the AgentOS canonical block.

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
