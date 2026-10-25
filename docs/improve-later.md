# Improve later — consolidated v1 backlog

Collected from the slice records in `.agentos/plans/2026-10-25-v1-priorities.md` (slices 1–6) and slice 7. Each item says what would justify doing it. Nothing here blocks v1.

## Defects and missing requirements

**Open: none in code.** One verification gate remains partly **BLOCKED** on a host-side engine run; it is not a code defect:

- Codex consumption of the synced AGENTS.md role block is not observed → [acceptance matrix S19](acceptance-matrix.md); codex `native_agent_config` stays `unverified`. (Claude Code discovery of `.claude/agents/<id>.md` and the post-fix deny rules were re-trialled on 2026-10-25, T5: S19 Claude half and S20 PASS.)

Closed during v1 (evidence in the plan file and the named tests):

| ID | Defect | Fixed in | Evidence |
|---|---|---|---|
| D1 | `agents sync claude-code` wrote allow rules only; Claude Code does not restrict on them | slice 7 | trial T3; `test/v1-slice7.test.js` › "D1: …" (RED on `d3010d9`) |
| D2 | Child directories of one root work tree were `unavailable` to checkpoint/resume | slice 7 | trial REPORT D2; `test/v1-slice7.test.js` › "D2: …" (RED on `d3010d9`) |
| D3 | A trailing `.` broke the `checkpoint` command | slice 7 | trial T2 prompt; `test/v1-slice7.test.js` › "D3: …" |
| A1–A5 | `prompt` objective parity, broken-state prompts, missing scope contract, `doctor --fix` widening `engines.allowed`, dead code | slice 1 | `test/v1-slice1.test.js` |
| B-dogfood | The word "decision" matched every decision via its id prefix | slice 2 | `test/v1-slice2-context.test.js` (first test) |

## Optional refinements

### Engines and agents

- **New files directly inside an ancestor of a nested edit path.** With edit `web/src`, existing siblings in `web/` are denied (2026-10-25), but a new `web/new.txt` is not (`Write(/web/*)` would risk the same gitignore-style over-match question as `/*`). Do it after the host re-trial shows how `/*` is matched.
- **Re-sync after the tree changes.** Sync adds keys only, so a changed deny list is refused until the owner removes `permissions.allow`/`deny`; `context --require-enforcement` reports `STALE` meanwhile. A marker for AgentOS-generated lists would allow in-place replacement. When re-syncing becomes routine.
- **`context --require-enforcement` cannot confirm trust.** It checks that the synced deny set is current, not that the workspace is trusted or that Claude Code applies it.
- **Codex per-path scope.** Not expressible with `--sandbox` (T4). Only if Codex gains a per-path mechanism.
- **Per-tool allowlists.** `tools_requested` reaches only the Claude Code subagent `tools:` list; no Codex/OpenCode mapping, no per-tool ADVISORY. When a role needs a tool restriction enforced.
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
