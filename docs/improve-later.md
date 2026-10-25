# Improve later — consolidated v1 backlog

Collected from the slice records in `.agentos/plans/2026-10-25-v1-priorities.md` (slices 1–6) and slice 7. Each item says what would justify doing it. Nothing here blocks v1.

## Defects and missing requirements

**Open: none in code, no BLOCKED gate.** The closure re-trials (2026-10-25, [closure/REPORT-closure.md](evidence/2026-10-25-cross-engine/closure/REPORT-closure.md)) verified the sibling denies (T6c), the read-only deny-all (T6d), the Codex role block (T7) and the Claude subagent invocation (T8): acceptance matrix S19, S20, S22 PASS.

Closed during v1 (evidence in the plan file and the named tests):

| ID | Defect | Fixed in | Evidence |
|---|---|---|---|
| D1 | `agents sync claude-code` wrote allow rules only; Claude Code does not restrict on them | slice 7 | trial T3; `test/v1-slice7.test.js` › "D1: …" (RED on `d3010d9`) |
| D2 | Child directories of one root work tree were `unavailable` to checkpoint/resume | slice 7 | trial REPORT D2; `test/v1-slice7.test.js` › "D2: …" (RED on `d3010d9`) |
| D3 | A trailing `.` broke the `checkpoint` command | slice 7 | trial T2 prompt; `test/v1-slice7.test.js` › "D3: …" |
| A1–A5 | `prompt` objective parity, broken-state prompts, missing scope contract, `doctor --fix` widening `engines.allowed`, dead code | slice 1 | `test/v1-slice1.test.js` |
| B-dogfood | The word "decision" matched every decision via its id prefix | slice 2 | `test/v1-slice2-context.test.js` (first test) |
| C1 | Claude deny rules covered only the listed repo/read paths; siblings such as `web/tests`, `web/package.json`, `.env.example` stayed editable (boundary probe T6a) | closure (`71cdb19`) | closure T6c; `test/v1-claude-deny-siblings.test.js` (exact list) |
| C2 | Sibling denies pending a host re-trial | closure 2 | closure T6c/T6d (S20 PASS) |
| C3 | `Edit(/*)`/`Write(/*)` over-match: Claude Code matches `/*` recursively, so every probe item was denied, including `web/src` (T6b) | closure 2 (rules removed) | closure T6b/T6c; `test/v1-claude-deny-siblings.test.js` › "closure 2: no (/*) rule is ever generated …" |
| C4 | Manifest `tools_requested` never reached the Claude subagent in practice (catalog cards empty, names not mapped; T8 subagent had every tool) | closure 2 (`tools:` rendering with name mapping and the read-only default) | `test/v1-claude-deny-siblings.test.js` › "closure 2: tools_requested renders …"; consumption untested (below) |

## Optional refinements

### Engines and agents

- **Residuals of deny-list enumeration (T6c).** New root-level files and directories (and new files directly inside an ancestor such as `web/new.txt` for edit `web/src`) created after the sync stay writable until a re-sync; `/*`-style patterns cannot close this, Claude Code matches them recursively (T6b). `.agentos/` state is writable by design; shell writes beyond recognised redirects are advisory. Options if it matters: a pre-tool hook, or a sandboxed launch.
- **Re-trial `tools:` consumption.** Does a `Task`-invoked Claude subagent lose the tools not listed in the rendered `tools:`? Until observed, claude-code `tool_restrictions` stays verified for launch-time `--allowedTools` only.
- **Re-sync after the tree changes.** Sync adds keys only, so a changed deny list is refused until the owner removes `permissions.allow`/`deny`; `context --require-enforcement` reports `STALE` meanwhile. An in-place re-sync marker for AgentOS-generated lists would allow replacement without hand-editing (also needed now: settings synced by `71cdb19` contain `/*` and must be re-synced, [migration.md](migration.md)). When re-syncing becomes routine.
- **`context --require-enforcement` cannot confirm trust.** It checks that the synced deny set is current, not that the workspace is trusted or that Claude Code applies it.
- **Codex per-path scope.** Not expressible with `--sandbox` (T4). Only if Codex gains a per-path mechanism.
- **Per-tool allowlists.** `tools_requested` reaches only the Claude Code subagent `tools:` list (consumption verified for the invoked subagent, closure T9); no Codex/OpenCode mapping, no per-tool ADVISORY. Catalog cards ship with `tools_requested: []`, so edit roles get no `tools:` line. When a role needs a tool restriction enforced.
- **`agents sync claude-code` re-sync after a card edit** refuses an existing `.claude/agents/<id>.md` (no managed marker, no `--replace`). When re-syncing becomes routine.
- **Import provenance.** `templates import --type agent` still writes a legacy card; `import:<url>` is accepted but never written. When imported agents are used.
- **Legacy-card upgrade notice** in the release notes (`agents manifest`), since nothing upgrades them automatically. At release.
- **`knowledge_selectors` / `skills` used by the context builder.** Recorded, unused. When role-specific selection misses show up.
- **Native session resume** (`unsupported` everywhere). Only if engines expose a resumable session AgentOS can drive.
- **`launch`** (`agentos run`) — unsupported by design today.

### Context builder

- Relevance ranking (term overlap, trailing-`s` stemming, no body text or synonyms); per-engine overhead constants (2000/1500/1000) are unmeasured; semantic dedup (repo note vs commands, handoff state vs objective). When real tasks show misses or budget waste.
- `.agentos/guide.md` does not list `context`, `checkpoint`, `resume`, `brain`; adding them changes the adapter generator and needs `doctor --fix` in every workspace. At a release slice.
- Repo-in-scope for nested child repos would need a repo tree. When a workspace nests repos.

### Checkpoints

- Shared HEAD in an enclosing work tree: a commit touching only `web/` reports `head_moved` for `api/` too. Use the last commit touching the path if that noise matters.
- Fingerprint misses an edit that keeps status and line counts identical; hashing diff content closes it at a cost.
- No crash-safe multi-file transaction; no concurrent writers; no retention policy for records/evidence logs (not gitignored).
- `compact` demotes `## Checkpoint (managed)` under `## Preserved context` (restored by the next checkpoint); the start marker ends the previous section's text (cosmetic).
- `--check` has no shell; `npm` on Windows needs `npm.cmd`; untested on Windows.

### Project Brain

- Semantic dedup/conflict detection; splitting `decisions.md` into per-record files; automatic proposals from checkpoints; `index.json` as a cache for large monorepos; clearing `verified_at/by` on apply; a copied file with `id: brain:` becomes an (invalid) record.

### Obsidian

- Index note never refreshed (`obsidian index --refresh`); vault→workspace relative links may not open in Obsidian; `agents remove` does not scan vault records; EACCES on a mounted vault reads as empty; `obsidian init` cannot recreate a deleted index while `knowledge.obsidian` exists.

### Cleanup and docs

- The `engines.allowed does not list opencode` doctor warning is noise for owners who limited engines on purpose.
- `task_scope` entries are not checked for existence by `doctor`.
- Equivalent aliases (`--mode summary|full`, `--agents minimal|detected`, `compact --rewrite`) and overlapping commands (`handoff`/`run handoff` vs `checkpoint`/`resume`, `prompt` vs `context`, `link-obsidian`/`obsidian link-workspace` vs `obsidian link`): see [migration.md](migration.md#keep--simplify--remove-inventory). Deprecate with one release of notice.
- Deprecated migration writers: **GATED** (unchanged; gate in [migration.md](migration.md#keep--simplify--remove-inventory)).
- `src/core.ts` (~5k lines): extract along slice boundaries.
- `bun` is not on the developer sandbox PATH; gates run as the identical `npm run` scripts there.
