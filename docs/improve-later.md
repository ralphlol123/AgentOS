# Improve later — consolidated v1 backlog

Collected from the slice records in `.agentos/plans/2026-10-25-v1-priorities.md` (slices 1–6) and slice 7. Each item says what would justify doing it. Nothing here blocks v1.

## Defects and missing requirements

**Open: none in code, no BLOCKED gate.** The closure re-trials (2026-10-25, [closure/REPORT-closure.md](evidence/2026-10-25-cross-engine/closure/REPORT-closure.md)) verified the sibling denies (T6c), the read-only deny-all (T6d), the Codex role block (T7) the Claude subagent invocation (T8), the final generator (T6e) and the subagent `tools:` list (T9): acceptance matrix S19, S20, S22 PASS.

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
| C4 | Manifest `tools_requested` never reached the Claude subagent in practice (catalog cards empty, names not mapped; T8 subagent had every tool) | closure 2 (`tools:` rendering with name mapping and the read-only default) | `test/v1-claude-deny-siblings.test.js` › "closure 2: tools_requested renders …"; consumption closure T9 (invoked subagent, n=1) |
| C5 | `context claude-code --require-enforcement` exited 0 on a matching synced deny set: configuration presence reported as enforcement (owner review of PR #53) | closure 3 (always exits 1; freshness check renamed `--require-synced-config`) | `test/v1-enforcement-contract.test.js` (RED on `d7501a9`: exit 0) |
| F1–F5 | Synced-config freshness (1.1 slice 1): not surfaced by `doctor`; only `permissions.deny` compared (not `allow`, `.claude/agents/<id>.md`, Codex role block); regenerated with the current call's role/scope; owner-added deny rules counted as drift; errors reported as `MISSING` | 1.1 slice 1 (sync record `.agentos/synced/<engine>.json`, shared check in `doctor` and `context --require-synced-config`) | `test/sync-freshness.test.js` (RED on `99553dc`) |
| R1–R4 | Re-sync (1.1 slice 2): a changed `allow`/`deny` list was refused (add-keys-only) until the owner hand-deleted the keys; `.claude/agents/<id>.md` was never replaced (no marker, no `--replace`); 1.0.0 settings without a record (incl. `71cdb19`'s `Edit(/*)`) had no safe path; the printed `--scope` was unquoted | 1.1 slice 2 (record-owned entries replaced, owner entries kept in place, `--replace` with one backup, dry-run `+`/`-` diff, quoted `--scope`) | `test/safe-resync.test.js` (RED on `4faca16`: 9 of 10) |

## Optional refinements

### Engines and agents

- **Residuals of deny-list enumeration (T6c).** New root-level files and directories (and new files directly inside an ancestor such as `web/new.txt` for edit `web/src`) created after the sync stay writable until a re-sync; `/*`-style patterns cannot close this, Claude Code matches them recursively (T6b). `.agentos/` state is writable by design; shell writes beyond recognised redirects are advisory. Options if it matters: a pre-tool hook, or a sandboxed launch.
- **Re-sync JSON fidelity.** `.claude/settings.local.json` is re-serialized with its indent and trailing newline; non-standard spacing inside it is normalised, and a generated entry the owner already had is claimed by the record (a later re-sync that stops generating it removes it). A format-preserving JSON editor would close both. When an owner reports either.
- **One sync record per engine.** The last synced role wins (its files replace the previous role's). Per-role records would allow several Claude subagents side by side. When a workspace needs more than one synced role per engine.
- **Hard enforcement (`context --require-enforcement` exiting 0).** v1 always exits 1: AgentOS cannot verify workspace trust, the residual paths above stay writable, and the deny rules bind only Claude Code's own tools (Codex: the sandbox is chosen at launch, no per-path scope). `--require-synced-config` checks configuration presence only. Justified when AgentOS controls the boundary itself: it launches the engine in a sandbox whose writable paths equal the edit scope (or installs a pre-tool hook that refuses every write outside it, shell included) and can read back that the boundary is active for the session; then a re-trial must show refusals for the residual paths before any exit 0.
- **Codex per-path scope.** Not expressible with `--sandbox` (T4). Only if Codex gains a per-path mechanism.
- **Per-tool allowlists.** `tools_requested` reaches only the Claude Code subagent `tools:` list (consumption verified for the invoked subagent, closure T9); no Codex/OpenCode mapping, no per-tool ADVISORY. Catalog cards ship with `tools_requested: []`, so edit roles get no `tools:` line. When a role needs a tool restriction enforced.
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
