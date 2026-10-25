# AgentOS v1 priorities — progress record

Started 2026-10-25 from `main` = `3c03372` (0.9.0). Branch `feat/v1-cleanup`. Philosophy: Build First → Validate Always → Improve Later: smallest end-to-end version that works, real checks, defects fixed now, refinements to the backlog below.

## Goal

Deliver a working v1 of the five AgentOS priorities — context builder, checkpoints, managed Project Brain, agent management, optional Obsidian — plus the correctness/cleanup fixes found in review.

## Slices

| # | Slice | Status |
|---|---|---|
| 1 | Baseline, review findings, correctness fixes + cleanup (section A) | Done; reviewed, pushed to `origin/feat/v1-cleanup` (`78638c0`), PR #46 open, not merged |
| 2 | Context builder (`agentos context`, section B) | Done; reviewed, pushed to `origin/feat/v1-context` (`ca527fb`), PR #47 (stacked on #46), not merged |
| 3 | Checkpoints and resume (section C) | Done; reviewed, pushed to `origin/feat/v1-checkpoint` (`2e3374b`), PR #48 (stacked on #47), not merged |
| 4 | Managed Project Brain (section D) | Done; reviewed, pushed to `origin/feat/v1-brain` (`bfd97d8`), PR #49 (stacked on #48), not merged |
| 5 | Agent manifests, lifecycle + engine capability matrix (section E) | Done; reviewed, pushed to `origin/feat/v1-agents` (`19a7806`), PR #50 (stacked on #49), not merged |
| 6 | Optional Obsidian on Brain storage + manifests from init (section F) | Done; reviewed, pushed to `origin/feat/v1-obsidian` (`d3010d9`), PR #51 (stacked on #50), not merged |
| 7 | Trial defects (D1 Claude deny rules, D2 nested work trees, D3 bare `.`), verified matrix, docs, migration + acceptance matrix, backlog | Done; pushed to `origin/feat/v1-final` (`856b61f`), PR #52 |
| 8 | Closure: Claude deny rules cover everything outside the edit scope (sibling enumeration), `context claude-code --require-enforcement` hash check, matrix/docs separation | Done on `fix/v1-claude-deny-siblings` (stacked on `856b61f`), local commit, not pushed; re-trialled on the host (T6b found the `/*` over-match) |
| 9 | Closure 2: drop `Edit/Write(/*)`, record re-trials T6–T8, `tools_requested` → Claude `tools:`, reconcile matrix/docs | Done on `fix/v1-claude-deny-siblings` (new commits on `71cdb19`), local, not pushed |

**Next exact action: Phynceon reviews and pushes the closure-2 commits on `fix/v1-claude-deny-siblings`; optional host re-trial of T8 with a rendered `tools:` list.** See the completion statement below.

## Closure 2 — `/*` removed, re-trials T6–T8 recorded, `tools:` rendering (2026-10-25)

Phynceon's host re-trials (`docs/evidence/2026-10-25-cross-engine/closure/`, copied complete, 22 files): T6b showed Claude Code 2.1.310 matches `Edit(/*)`/`Write(/*)` recursively (all 14 probe items denied, `web/src` included); T6c (71cdb19 minus `/*`) allowed the edit scope and denied siblings, listed paths, a Bash redirect into `api/`, `project.yaml`, `settings.local.json`, with residual new root file/dir and `.agentos/` writes allowed; T6d read-only deny-all held; T7 Codex followed the role-block marker 2/2 from `web/` (0/1 root control, 0/1 "Nothing else"); T8 a `Task`-invoked Claude subagent used the marker and refused out-of-scope edits by instruction but had every tool. Code: `claudeDenyTargets()` no longer adds `*`; `src/engines.ts` `claudeTools()` maps `tools_requested` to the subagent `tools:` (read/edit/write/bash/grep/glob → Claude names, unknown verbatim + sync warning, read-only default `Read, Grep, Glob`), warnings ride on `NativeFile.warnings` and print as `Warning:` lines in `agents sync`. Matrix: claude-code `permission_enforcement` evidence T3b/T5/T6c/T6d with residual; `native_agent_config` verified for both (codex T7 instruction-following, advisory; claude T5+T8, `tools:` consumption untested); claude `tool_restrictions` verified for launch-time `--allowedTools` only. Tests (RED first, 3 new + pinned lists updated): `test/v1-claude-deny-siblings.test.js` › "closure 2: …" (no `(/*)` for edit `web/src`, `web`, `web/src/a.js`, `.`; `web/src` never denied; `tools:` frontmatter; read-only default). Docs: `docs/engines.md`, `docs/acceptance-matrix.md` (S19/S20 PASS, new S22, 14-item probe table per build, 27 PASS / 0 FAIL / 0 BLOCKED), `docs/improve-later.md`, `docs/migration.md` (71cdb19 settings STALE), CHANGELOG. `docs/agents.md` write refused again by the protected-file gate; its line "only `tools_requested` reaches an engine (Claude Code subagent `tools:`, unverified)" stays as is (still accurate: consumption unverified).

## Closure — Claude deny rules: sibling enumeration (2026-10-25)

Phynceon's boundary probe (Claude Code 2.1.310, trusted workspace, edit `web/src`) showed the D1 deny list covered only repo/read paths outside the edit scope; `web/tests`, `web/package.json`, new root files and `.env.example` stayed editable. `src/core.ts`: `claudeDenyTargets()` enumerates, per edit path, every entry at each ancestor level that is not on the way to or inside an edit path (skips `.git`, `node_modules`, `.agentos-write.lock`, root `.agentos`), adds `.claude/**` (virtual, so a re-sync after sync's own `.claude/agents` write is a no-op), `Edit/Write(/*)` unless the scope includes `.`, `Edit/Write` on both `.claude/settings*.json`, `.agentos/project.yaml`, `.agentos/agents/**`, plus the listed paths; sorted by path (codepoint). `nativeConfigPlan()` is shared by `agents sync` and `claudeEnforcementCheck()` (`context claude-code --require-enforcement`: sha256 of the sorted deny list vs the regenerated one → OK / STALE / UNSUPPORTED). `src/engines.ts`: per-entry tools, sync limits note, matrix evidence separated (listed-path verified T3b/T5; siblings "host re-trial pending (Phynceon)"; shell writes advisory). Test: `test/v1-claude-deny-siblings.test.js` (4); pinned deny lists in `v1-slice5-agents`/`v1-slice7` updated. Decisions: listed paths are kept alongside the enumeration (keeps the T5-verified rule shape); `.claude/**` is denied as a whole sibling; the boundary probe is recorded in the acceptance matrix, not in the evidence folder (no transcript, SHA256SUMS untouched). Open (answered by closure 2, T6b): Claude Code matches `/*` recursively; the rule was removed. `docs/agents.md` was not edited (protected-file approval gate); the "cover / do not cover" section lives in `docs/engines.md`.

## Completion statement

v1 is complete pending owner review. All five priorities and the cleanup slice are implemented, tested (716/716 on `fix/v1-claude-deny-siblings` after closure 2, 713/713 at `71cdb19`; 709/709 on `feat/v1-final`) and documented; the real-engine trial of 2026-10-25 (`docs/evidence/2026-10-25-cross-engine/REPORT.md`, n=1) passed both continuity directions and its three defects are fixed with tests that fail on `d3010d9`. Acceptance (`docs/acceptance-matrix.md`): 27 rows, **27 PASS, 0 FAIL, 0 BLOCKED** after closure 2 and the host re-trials T6–T8 (n=1 per probe; T7 n=2 + controls). Residuals of Claude deny-list enumeration (new root files/dirs after sync, `.agentos/` state, unrecognised shell writes) are advisory and documented; `tools:` consumption by a Claude subagent is untested. Still GATED: deletion of the deprecated migration writers (owner decision, unchanged). Owner actions: review/push `feat/v1-final`, merge PRs #46–#51 and the final PR in order, choose the version and release, decide this repo's three legacy agent cards. No open defects; refinements are in `docs/improve-later.md`. Slice 6 left `obsidianBinding()` / `obsidianIndexWarnings()` (`src/core.ts`) and `VaultBinding` / `classify()` / `vaultUnavailable()` / `brainMissing()` (`src/brain.ts`); `loadBrain(root, repos, vault)` walks the linked folder only when `canonical: vault`. Slice 5 left `parseAgentCard()` / `validateAgentManifest()` / `effectiveEditScope()` (`src/agents.ts`) and `ENGINE_ADAPTERS` / `engineAdapter()` / `advisories()` (`src/engines.ts`); a recorded engine trial changes a row there. Earlier: slice 2 left `buildContextBundle()` / `assertContextBundle()` (`src/context-builder.ts`); slice 3 left `assertCheckpoint()`, `loadCurrent()` and `workspaceState()` (`src/checkpoint.ts`); slice 4 left `loadBrain()`, `parseRecord()`, `patchFrontmatter()`, `brainContextRecords()` (`src/brain.ts`) and the shared matcher `taskTerms()` / `termHits()` / `subjectOf()` (`src/context-builder.ts`). Slice 6 (Obsidian) can build on `loadBrain`/`patchFrontmatter`: storage is plain Markdown + frontmatter with workspace-relative paths, no engine-specific code.

## Slice 7 — trial defects, verified matrix, docs

Read first: Phynceon's trial report (copied to `docs/evidence/2026-10-25-cross-engine/`, `claude-run1.err` omitted because it names the host home directory). `src/engines.ts`: `claudeSettingsFragment(edit, outside)` (allow + deny), `CLAUDE_TRUST_NOTE`, adapter `syncNote`, `permission_enforcement.edit_scope`, `advisories()` per condition; trial rows. `src/core.ts`: `syncAgentsUnlocked` computes `outside` (repo + read paths not covered by and not containing an edit path) and prints the note; `contextAgentOS --require-enforcement` refuses conditional enforcement. `src/checkpoint.ts` `repoState()`: enclosing work tree via `rev-parse --show-prefix`, pathspec-limited git calls, directory-relative paths, `state: enclosing-worktree`. `src/git-evidence.ts`: optional pathspec. `src/cli.ts`: bare `.` ignored by `checkpoint`. Docs: README "v1 workflow"/"Documentation"/"Engines", `docs/engines.md` (rewritten), `docs/checkpoints.md`, new `docs/migration.md`, `docs/acceptance-matrix.md`, `docs/improve-later.md`, CHANGELOG.

Decisions taken in this slice (assumptions, revisit in review):

- Deny targets = repo paths + read-scope paths outside the edit scope, `/<dir>/**` or `/<file>`; a path that contains an edit path is not denied (deny beats allow), so siblings of a nested edit path stay editable (backlog). Read paths inside a denied repo are listed too (literal reading of the card).
- The trust note is printed by `agents sync claude-code` (dry run and real); the Codex advisory by `agents sync codex`.
- `permission_enforcement` gains an optional `edit_scope` string; `--require-enforcement` still fails for every engine because the condition (synced deny rules + trust, launch flags) cannot be checked from `context`. The ADVISORY line for claude-code/codex states the condition instead of "instruction-only".
- D2 paths in `changed_paths` are relative to the child directory (same as a child repo), so slice-3 assertions hold on both layouts. HEAD is the enclosing repo's: a commit anywhere moves `head` for every directory of that work tree (documented; refinement in backlog).
- D3: every bare `.` positional is dropped (not only a trailing one).
- Evidence: transcripts without host paths are included (JSON/log/out), not only the prompts, so the T1–T4 claims can be checked from the repo.
- The goal document's verification table was not available in the sandbox; the acceptance rows follow the slice-7 card's enumeration, plus S17–S20 for the engine-enforcement claims.
- The usage-vs-handler and doc-link tests live in `test/v1-slice7-docs.test.js` so the G1 commit stays green on its own.

## Slice 7 — acceptance evidence

| Command | Where | Exit | Result |
|---|---|---|---|
| `npm test` | `feat/v1-final` start (= `d3010d9`) | 0 | 699 / 699 (slice 6 final) |
| `node --test test/v1-slice7.test.js test/v1-slice7-docs.test.js` (final test files) against `d3010d9` dist | detached worktree `/tmp/aos-d3010d9` | 1 | 10 tests, 1 pass (usage-vs-handler guard), 9 fail: D1 ×3 (no trust note / no deny / no Codex advisory), matrix (`permission_enforcement` `unverified`), D2 ×2 (`available: false`, `not the top of a git work tree`), D3 (usage line), nested start (repos unavailable), doc links (`docs/migration.md` etc. missing) |
| `npm test` on G1 commit `f091502` (docs test file set aside) | `feat/v1-final` | 0 | 706 / 706 |
| dogfood: 0.9.0 (`3c03372`) `init --existing` on a root git repo with `web/`, `api/`; v1 `doctor`, `doctor --json`, `doctor --fix --dry-run`, `checkpoint --dry-run .`, `context codex` from `web/` | `/tmp/s7-old-*` | 0 | doctor OK, only new output = 4 legacy-card diagnostics with commands; adapters `noop`; checkpoint `api (enclosing work tree) main@… ; web (enclosing work tree) main@…`; context from `web/` ends with the codex ADVISORY; `git status` empty |
| `npm run check` | final | 0 | |
| `npm test` | final | 0 | FINAL_TEST |
| `npm run smoke` | final | 0 | |
| `npm run test:metadata` | final | 0 | |
| `npm pack --dry-run` | final | 0 | FINAL_PACK |
| `node dist/cli.js doctor --json` | final | 0 | `"ok": true`, `problems: []`; diagnostics list three legacy cards (developer, tester, release-manager) |

## Slice 6 — optional Obsidian on Brain storage, manifests from init

`agentos obsidian init [--dir] [--dry-run]`, `agentos obsidian link --vault --dest [--canonical workspace|vault] [--create] [--dry-run]`, `brain init --location vault`, `context --require-complete`. `src/brain.ts`: records carry `location` + `abs`; `VaultBinding`; `classify()` decides workspace / vault / refused for every path argument; `loadBrain` walks `<vault>/<dest>` when `canonical: vault`; `vaultUnavailable()` / `brainMissing()`; writes go to `record.abs`. `src/core.ts`: `obsidianInitAgentOS`, `link` = `linkObsidianWorkspaceAgentOS` + index note (`obsidianIndexText`), `obsidianBinding`, `obsidianIndexWarnings`, doctor/context/brain wiring, `generatedCard()` for F2. `src/context-builder.ts`: `input.missing`, vault records readable under the Obsidian rule. Contract and limits: `docs/obsidian.md`.

Decisions taken in this slice (assumptions, revisit in review):

- Config key stays `destination` (what existing configs and readers use); the card's `dest` is read as an alias. New keys `canonical` and `index` mark a slice-6 config (`managed`); the index-note check runs only for those, so older `link-workspace` configs get no new warning.
- `obsidian init` stores `vault` workspace-relative when the folder is inside the workspace (portable), absolute otherwise; it refuses when `knowledge.obsidian` already exists or the index exists (no index refresh).
- `obsidian link` is `link-workspace` + index note + `canonical` (one code path; `link-workspace` stays boundary-only because an existing test pins "no note helpers"). `link-obsidian` (exact-note link-only) is left unchanged rather than turned into an alias with different behaviour.
- `canonical` governs the linked folder only: with `vault`, notes in `<vault>/<dest>` can be records; existing workspace records stay workspace records (one file each). With `workspace`, registering a vault note is refused.
- Unavailable records come from the last `index.json` (`location: vault` entries), the only list that survives the folder going away; brain writes keep those entries while the folder is absent. `brain check` exits 0 on `unavailable` (only `invalid` exits 1), matching doctor's warning.
- `context` keeps `ok: true` with Missing entries; `--require-complete` (new flag) exits 1 and still prints the bundle.
- The binding applies to every `workspace-folder` config (default `canonical: workspace`); `link-only` configs (this repo's) are not a location, so `doctor` never stats the personal vault.
- `.agentos/knowledge.md` for slice-6 configs names `project.yaml` instead of repeating the absolute vault path.
- F2: `generatedCard()` writes the slice-5 manifest for catalog agents in `init`, `doctor --fix` (missing card, retired-card migration) and `templates copy` (only when the template equals the catalog card). Custom ids stay plain. This repo: `reviewer` byte-matched the catalog and got its manifest (`agents manifest reviewer --from-catalog`); `developer`, `tester`, `release-manager` differ from the catalog and were left legacy (owner: `--custom` vs `agents add --replace`).

## Slice 6 — acceptance evidence

| Command | Where | Exit | Result |
|---|---|---|---|
| `npm test` | `feat/v1-obsidian` start (= `19a7806`) | 0 | 693 / 693 (slice 5 final) |
| `node --test --test-reporter=tap test/v1-slice6-obsidian.test.js` (RED) | before implementation | 1 | 6 tests, 0 pass, 6 fail: `obsidian init`/`link` print the old `link-workspace` usage, `--canonical` unknown option; F2 card regex fails on the legacy `developer` card |
| same, `link` also writes `<vault>/.obsidian/app.json` (dist) | fault injection | 1 | unrelated-notes test fails: `nothing outside <dest> changed (including .obsidian/)` |
| same, `vaultUnavailable()` always null (dist) | fault injection | 1 | unavailable test fails: `brain check` returns `{"ok":true,"records":[]}`, no `unavailable` record |
| same, `classify()` treats the whole vault as the linked folder (dist) | fault injection | 1 | boundary test fails: `brain register <vault>/Inbox/todo.md` succeeded |
| same, `generatedCard()` returns the legacy card (dist) | fault injection | 1 | F2 test fails |
| `test/boundaries.test.js` with `obsidian init` (symlinked `knowledge`, symlinked `.agentos/knowledge.md`) and `obsidian link` escape cases | final | 0 | 10 / 10 |
| `npm run check` | final | 0 | |
| `npm test` | final | 0 | 699 / 699 (693 + 6 in `test/v1-slice6-obsidian.test.js`; catalog-parity, three slice-5 tests (they now write the legacy card they test) and the boundary tables updated) |
| `npm run smoke` | final | 0 | |
| `node dist/cli.js doctor --json` | final | 0 | `"ok": true`, `problems: []`; diagnostics list three legacy cards (developer, tester, release-manager) |
| dogfood (`/tmp/s6-dogfood-*`): init, brain init, `obsidian link --canonical vault --create`, register a vault note, `brain list`, `obsidian status`, unmount (rename) the vault, `brain check`, `context --require-complete`, `doctor`, remount | `/tmp` | 0 / 1 as expected | list prints `Projects/Demo/AgentOS/design.md (vault: /tmp/…/design.md)`; check `1 unavailable`; context `## Missing` names the vault and `brain:design`, `INCOMPLETE`; doctor warns `Obsidian vault unavailable`, OK after remount |

## Slice 5 — agent manifests, lifecycle, engine capability matrix

`agentos agents add|show|enable|disable|remove|manifest|sync`, `agentos engines`, `agentos context --require-enforcement`. Modules `src/agents.ts` (manifest, validation, scope narrowing, lifecycle, doctor check) and `src/engines.ts` (adapter contract, matrix, native config, add-keys-only merge). `core.ts` gained wiring (`agents add` install plan, `syncAgentsUnlocked`, context advisories, the doctor check) and exports of `parseProjectYaml` / `assertProjectYamlWellFormed`; `context-builder.ts` reads the role card through `parseAgentCard` (body only in the role section) and applies `effectiveEditScope`; `brain.ts` exports `diffLines`. Contract and limits: `docs/agents.md`, `docs/engines.md`.

Decisions taken in this slice (assumptions, revisit in review):

- The card spec's "a card declaring edit of `backend`" needed a key: optional `edit_request` (advisory list). Entries outside the task's edit scope are ignored with a warning; entries inside change nothing (no narrowing by request). Only `permission_intent: read-only` narrows (to `[]`); `release` keeps the task scope.
- Catalog intents: planner, reviewer, security-reviewer `read-only`; release-manager `release`; developer, tester `edit-in-scope`. `knowledge_selectors`, `skills`, `tools_requested` are `[]` for catalog cards (not parsed from prose).
- `init` and `doctor --fix` still write legacy cards (no frontmatter) so existing byte-shape tests, retired-card migration and `templates copy` stay unchanged; `doctor` reports legacy cards as `diagnostics` (not warnings/problems) with the exact command. This repo's own four cards differ from the catalog (three) or match it (reviewer); they were left legacy — choosing `--custom` vs `agents add --replace` is the owner's call.
- `agents add` upgrade without `--replace`: a byte-matched legacy card or an unmodified non-custom manifest card. `--replace` keeps the old card under `.agentos/runs/replaced-agents/` (not in the card spec; added so a replace cannot lose a hand edit).
- `disable` refuses to empty `agents.enabled` (the format-preserving editor falls back to a whole-file dump for an emptied list, losing comments).
- `remove` Brain references: a record whose `scope` equals the id or whose `tags` contain `<id>` or `agent:<id>`. Brain scopes are repo ids, so tags are the practical selector.
- `agents sync` requires a manifest, takes role and edit scope from the context builder (so `--scope` and the manifest narrowing apply), and refuses on any conflict: an existing `.claude/agents/<id>.md` with different bytes, a settings key with a different value (arrays compared whole), invalid JSON, or an ambiguous role-block marker. Codex target = the `AGENTS.md` of the single child repo holding the edit scope, else the root.
- Claude settings rules follow the current Claude Code permissions docs: `Edit(/<path>/**)` (Write path rules never match; `/` is relative to the settings source; deny beats allow). Read-only roles get `deny: [Edit, Write, NotebookEdit]`.
- One hard requirement today (edit scope → `permission_enforcement`), so one ADVISORY line; per-tool requirements wait for per-tool allowlists.

## Slice 5 — acceptance evidence

| Command | Where | Exit | Result |
|---|---|---|---|
| `npm test` | `feat/v1-agents` start (= `bfd97d8`) | 0 | 680 / 680 (slice 4 final) |
| `node --test --test-reporter=tap test/v1-slice5-agents.test.js` against `bfd97d8` dist (RED) | detached worktree of `feat/v1-brain` | 1 | 13 tests, 0 pass, 13 fail. E1 scope test: fails at the warning assertion (line 149: no `requests edit of backend … ignored` warning; the base builder ignores the manifest, so `scope.edit` was already `['web']` — the widening fault below is what proves the never-exceeds check); E2 custom test: old message `Existing card differs: … Review it and use --replace` (no `body changed since install`, no diff preview); E2 remove test: `agents remove` prints the old `agents list | agents add` usage (no refusal, no reference list) |
| same, `effectiveEditScope` made to add `edit_request` to the edit scope (dist) | fault injection | 1 | scope test fails: actual `['web', 'backend']`, expected `['web']` |
| same, `remove` ignoring references (dist) | fault injection | 1 | remove test fails |
| same, every existing card treated as generated (dist) | fault injection | 1 | preservation test fails: hand-edited card overwritten (`agents add` exit 0). A first injection attempt with wrong operator precedence did not change behaviour and passed; recorded, not counted |
| `test/boundaries.test.js` with two new cases (`agents remove` via symlinked `.agentos/runs`, `agents manifest` via symlinked `.agentos/agents`) | final | 0 | 10 / 10 |
| `npm run check` | final | 0 | |
| `npm test` | final | 0 | 693 / 693 (680 + 13 in `test/v1-slice5-agents.test.js`; two boundary cases and the catalog-parity body check changed in existing tests) |
| `npm run smoke` | final | 0 | |
| `node dist/cli.js doctor --json` | final | 0 | `"ok": true`, `problems: []`; diagnostics list this repo's four legacy cards with their commands |
| dogfood on a fresh two-repo fixture (`/tmp/s5-dogfood-*`): init, add developer (legacy → manifest upgrade), show, engines, context claude, context codex `--require-enforcement`, sync claude-code `--dry-run`, sync codex, remove tester, doctor | `/tmp` | 0 / 1 as expected | upgrade printed `Diff summary: body unchanged (manifest only)`; `--require-enforcement` exit 1 `UNSUPPORTED`; dry-run printed both files; remove tester refused listing `agents.enabled` and `agents.capabilities.qa`; doctor OK |

## Slice 4 — managed Project Brain

`agentos brain init|register|list|show|search|propose|preview|validate|apply|check|verify`. Module `src/brain.ts`; `core.ts` gained only wiring (`brainAgentOS`, `BRAIN_USAGE`, `brainScopes`, Brain records into `contextInputFor`, the doctor check) and an export of `removeTracked`. `context-builder.ts` exports its matcher (`taskTerms`, `termHits`, `subjectOf`) instead of having `brain search` fork it, and accepts `brain` records as candidates. `checkpoint.ts` lists included Brain records as `knowledge_refs`. Contract and limits: `docs/brain.md`.

Decisions taken in this slice (assumptions, revisit in review):

- Records are discovered by a bounded workspace walk for `.md` files whose frontmatter has `id: brain:…`; the frontmatter is authoritative and `index.json` is derived (regenerated on every brain write, never read). No separate registry file.
- `source_hash` = sha256 of the body only (bytes after the closing `---`), so frontmatter edits never change it; an unclosed or unparsable block makes the record `invalid`.
- Allowed frontmatter keys: the metadata set plus `title`, `date`, `tags`, `aliases` (descriptive, common in ADR/Obsidian notes). Everything else is refused (register) or `invalid` (check).
- `id` = `brain:<file-name slug>`, falling back to the path slug on a clash; an existing `id` is kept. `sources` must include the file itself (a moved/copied file is `invalid`).
- `register` default status `accepted` (an existing project-owned file), `--status proposed` or `--by <name>` (→ `verified`). Conflicts are reported only for values given explicitly or for `sources`/`source_hash`; existing values are always kept and the command exits 0.
- `init` refuses (exit 1, zero writes) when any template file exists; templates are `status: proposed`; glossary uses kind `note`.
- Proposals: `mode: replace|append` (`--append`), content without frontmatter, `--supersedes` takes one or more ids. `propose` runs `validate` and does not write a rejected proposal. Proposal files are `<ISO-ts>-<slug>.md`, written exclusively.
- Stale = `base_hash` ≠ target `source_hash`, **or** target body ≠ its `source_hash` (a human edit since verification) — otherwise apply would silently overwrite the human edit.
- Duplicate = whitespace-normalized proposal text equals the target body (replace) / is contained in it (append) / equals another record's body.
- Conflict flag = another `accepted`/`verified` record of the same kind with the same `subjectOf(title)`; title = frontmatter `title`, else first H1, else file name.
- Context renders Brain records by reference (no body text) with `Source: <path>`; proposed records get a 0.5 rank penalty so they sort below accepted/verified records with the same matches.
- `doctor`: `changed` → warning, `invalid` → problem. `brain check` exits 1 only on `invalid`.
- `verify` sets `status: verified` unless the record is superseded; `apply` leaves an earlier `verified_at/by` in place (history shows the newer apply).

## Slice 4 — acceptance evidence

| Command | Where | Exit | Result |
|---|---|---|---|
| `npm test` | `feat/v1-brain` start (= `2e3374b`) | 0 | 664 / 664 (slice 3 final) |
| `node --test test/v1-slice4-brain.test.js` (RED, no `brain` command) | before implementation | 1 | 16 tests, 0 pass, 16 fail (`Unknown command: brain` / `Unknown option: --kind`) |
| same, stale check disabled in dist | fault injection | 1 | 2 fail: stale after first apply, stale after human edit |
| same, duplicate check disabled in dist | fault injection | 1 | 1 fail: duplicate test |
| same, `apply` ignoring rejections in dist (no-write-on-invalid) | fault injection | 1 | 2 fail: both stale tests (tree snapshot changed) |
| `test/boundaries.test.js` with two `.agentos/brain` cases (init, register), boundary check removed from dist | fault injection | 1 | 1 fail |
| `npm run check` | final | 0 | |
| `npm test` | final | 0 | 680 / 680 (664 + 16 in `test/v1-slice4-brain.test.js`; two boundary cases added to an existing test) |
| `npm run smoke` | final | 0 | |
| `node dist/cli.js doctor --json` | final | 0 | `"ok": true`, `problems: []` |
| dogfood on a fresh fixture (`/tmp/s4-dogfood`): init, register ×2, propose ×2, preview, apply, re-apply, validate/apply the stale one, duplicate propose, check, list, context, status, compact --dry-run, doctor | `/tmp/s4-dogfood` | 0 / 1 as expected | re-register and re-apply print no-op; stale validate/apply exit 1 printing both hashes, "Nothing was written."; duplicate propose exit 1; context lists `## Brain (adr, accepted): …` with `Source: docs/adr/…`; frontmatter on `.agentos/decisions.md` leaves status/compact/context working; doctor ok |

## Slice 3 — checkpoints and resume

`agentos checkpoint [--task] [--engine] [--role] [--progress] [--blocker] [--next] [--check "<cmd>" [--cwd <dir>]]... [--claim]... [--json] [--dry-run]`, `checkpoint --recover`, `checkpoint list|show`, `agentos resume [--task] [--engine] [--json]`. Module `src/checkpoint.ts`; `core.ts` gained wiring (`checkpointAgentOS`, `resumeAgentOS`, `checkpointContextFor`, the doctor check), exports of four existing write/marker helpers, and `contextInputFor` extracted from `contextAgentOS` (context output unchanged except the new checkpoint record). Contract and limits: `docs/checkpoints.md`.

Decisions taken in this slice (assumptions, revisit in review):

- Task id = slug of `--task`, else slug of the first line of the resolved objective (the heading suffix when it carries text). Without either, `checkpoint` exits 1 and asks for `--task`.
- The record id is `<ISO-ts>-<sha256(record body)[:8]>`: same content at the same millisecond is the same record and is refused. Records are linked into place from a temp file (`writeFileExclusiveAtomic`, link = no-clobber rename); `current.json` and `handoff.md` use `writeFileAtomic`; all inside one mutation transaction.
- Fingerprint = sha256 over porcelain status (no branch line), changed names and `git diff --numstat HEAD`; `.agentos/` paths are excluded because the checkpoint writes there (a single-repo workspace that tracks `.agentos/` would otherwise always be drifted; regression test added).
- `not-run` receipts come from declared `*build*|*test*|*check*|*lint*` commands of in-scope repos that no `--check` ran (and every check under `--dry-run`, which runs nothing).
- `--check` runs via `execFile` without a shell (quoted argv split); spawn errors are `unavailable`, non-zero exits and timeouts (10 min) are `observed-fail`. Output is kept as a content-addressed log, last 32 KiB per stream.
- Stale receipts (tested state ≠ current state) are listed under Remaining as `stale (recheck)`, even passes; only current passes count as accomplished.
- Overall resume status: drifted > unavailable > clean. `incomplete` and `none` exit 1; `recovered` (no record, but run notes or changed files) exits 0 and writes nothing.
- The handoff section uses its own markers (`<!-- agentos:checkpoint:start/end -->`) with the adapters' `locateManagedBlock` rules; it is inserted once at the end of the file and replaced in place afterwards.
- `run_id` is `$AGENTOS_RUN_ID` or null (AgentOS has no run concept yet).

## Slice 3 — acceptance evidence

| Command | Where | Exit | Result |
|---|---|---|---|
| `npm test` | `feat/v1-checkpoint` start (= `ca527fb`) | 0 | 647 / 647 (slice 2 final) |
| `node --test test/v1-slice3-checkpoint.test.js` (RED, no `checkpoint` command) | before implementation | 1 | 16 tests, 0 pass, 16 fail (`Unknown option: --progress`) |
| same, record overwrite allowed in dist (item 3) | fault injection | 1 | 1 fail: immutability test |
| same, missing `current.json` treated as "no checkpoint" (item 3) | fault injection | 1 | 1 fail: interruption test |
| same, block appended instead of replaced (item 4) | fault injection | 1 | 1 fail: five-checkpoints section-size test |
| same, stale flag disabled (item 5) | fault injection | 1 | 1 fail: drift test |
| same, untracked files ignored by the fingerprint (item 5) | fault injection | 1 | 3 fail: record shape, recovery, drift |
| same, `.agentos/` counted as drift (item 5) | fault injection | 1 | 1 fail: single-repo clean test |
| `test/boundaries.test.js` symlinked-managed-target table with `.agentos/checkpoints` case, boundary check removed from dist | fault injection | 1 | 1 fail |
| `npm run check` | final | 0 | |
| `npm test` | final | 0 | 664 / 664 (647 + 17 in `test/v1-slice3-checkpoint.test.js`; boundaries case added to an existing test) |
| `npm run smoke` | final | 0 | |
| `node dist/cli.js doctor --json` | final | 0 | `"ok": true`, `problems: []` |
| dogfood in a throwaway clone of this repo (`/tmp`): checkpoint with 2 checks + 1 claim, resume, edit README, resume, `compact`, checkpoint, doctor | `/tmp/cp-dogfood2` | 0 | clean → drifted (`new changed paths: README.md`, pass marked stale); 3 declared `bun run` commands listed `not-run`; after `compact` the next checkpoint still found and restored its block; doctor OK |

## Slice 2 — context builder

`agentos context <engine> [--task] [--role] [--scope] [--budget] [--json] [--include-superseded]`, read-only. Builder in `src/context-builder.ts`; `core.ts` only gained `contextAgentOS` wiring plus two extractions that keep `prompt` byte-identical (`PROMPT_RULES`, `promptHeaderLines`). Contract, selection signals and budget numbers: `docs/context-builder.md`.

Decisions taken in this slice (assumptions, revisit in review):

- `--scope` replaces the read scope and keeps only the `task_scope.edit` entries it still covers; with no scope at all, read is the whole workspace and edit is empty (warning). Edit is never widened.
- A path inside a repo (e.g. `api/contracts/openapi.yaml`) is included as a `read:<path>` reference but does not bring that repo's note or verification commands into scope.
- `--role` not in `agents.enabled` is an error (exit 1); an enabled role whose card file is missing is a `missing` warning. Default role: `agents.capabilities.implementation`.
- "Generated rules block" = the `prompt` rules line + engine-specific rule lines + the Obsidian link-only line.
- Budget default 24000 for every engine; overhead constants claude-code/hermes 2000, codex/opencode 1500, other 1000 — unmeasured assumptions.
- Optional records stop at the first that does not fit (predictable, not bin-packed).
- Skills, linked notes and read paths are rendered by reference; skill cards and the vault are not read.
- Dogfood found that the word "decision" in a task matched every decision through its `decision:` id prefix; the prefix is now excluded from matching (regression in the first test).

## Slice 2 — acceptance evidence

| Command | Where | Exit | Result |
|---|---|---|---|
| `npm test` | `feat/v1-context` start (= `78638c0`) | 0 | 631 / 631 |
| prompt golden capture (`claude`, `codex`, `opencode`, `hermes`, `generic` × 3 slice-1 fixtures) | `78638c0` dist | 0 | 15 outputs → `test/fixtures/prompt-golden-v1-slice1.json` |
| `node --test test/v1-slice2-context.test.js` (RED, no `context` command) | before implementation | 1 | 16 tests, 1 pass (prompt golden guard), 15 fail (`Unknown option: --task`) |
| same, scope filter disabled in dist (item 3) | fault injection | 1 | 2 fail (out-of-scope test, `--scope` narrowing test) |
| same, overflow check disabled in dist (item 5) | fault injection | 1 | 2 fail (overflow test, no-mutation test's overflow mode) |
| same, a `writeFile` injected into the builder (item 7) | fault injection | 1 | 1 fail: tree diff shows `ws/.agentos/.context-cache` |
| same, `decision:` prefix matching (dogfood bug) | before fix | 1 | 1 fail |
| `node --test --test-name-pattern="docs state" test/v1-slice1.test.js` with the old memory.md | before docs update | 1 | `context` missing from the command list |
| `npm run check` | final | 0 | |
| `npm test` | final | 0 | 647 / 647 (631 + 16 in `test/v1-slice2-context.test.js`) |
| `npm run smoke` | final | 0 | |
| `node dist/cli.js doctor --json` | final | 0 | `"ok": true`; warnings: uncommitted changes (before commit), no upstream |
| `node dist/cli.js context claude --task "obsidian link-only knowledge decision"` | this repo | 0 | 11 included (4 mandatory, the Obsidian decision ranked first), 20 omitted, estimate 3980 of 24000 |

## Slice 1 — findings

| # | Finding | Result | Evidence |
|---|---|---|---|
| 1 | `prompt` read the objective with `extractSection(handoff,'Current objective')`, not `resolveObjective()` | Reproduced, fixed | On `3c03372`, a `## Current objective — 2026-09-15 (latest): …` heading printed `Current objective: (none)` while `status`/`doctor` exited 0. Now prints `Current objective: 2026-09-15 (latest): ship the parser Merge the AUM work.` |
| 2 | Missing / empty / duplicate objective headings | Reproduced for `prompt` only; `status` and `doctor` already exited 1 with the resolver diagnostic on `3c03372` | On `3c03372`: prompt exit 0 with `(none)` for all three. Now prompt exits 1, prints `AgentOS prompt: NEEDS ATTENTION` + the same diagnostic as status/doctor, and no paste-ready prompt |
| 3 | No separation between repo inventory, read scope and edit scope | Reproduced (no such contract existed), added | `src/task-scope.ts` `validateTaskScope()`; optional `task_scope: {read, edit}` in project.yaml; `prompt` prints `Repos (inventory, not permission)`, `Read scope`, `Edit scope`; `prompt`/`doctor` fail on malformed scope. No `task_scope` = unchanged prompt |
| 4 | `doctor --fix` appended `opencode` to a user-limited `engines.allowed` | Reproduced, fixed | On `3c03372`, `engines.allowed: [claude-code]` became `[claude-code, opencode]` after `doctor --fix`; now byte-identical. `ensureProjectYamlEngine` removed; the doctor warning stays informational. Three existing tests that encoded the old behaviour were rewritten (core, no-engine-stubs, project-yaml-fidelity) |
| 5 | Dead code | Confirmed unused, removed | `sectionLines`, `appendUniqueTask`, `clipText`, `escapeRegex` (only their definitions matched grep), unused `writeFile` import, unused params `id` (agentTemplateContent), `abs` (checkUntrackedAdapters), `workspaceKind`/`repos` (plannedFiles). `tsc --noUnusedLocals --noUnusedParameters` reported 9 errors before, 0 after; both flags are now on in `tsconfig.json` |
| 6 | Skill `summary`/`full`, agent `minimal`/`detected` | Already equivalent; pinned | Built-in skills differ only in the `mode:` frontmatter line (`renderSkillTemplate`, pinned by `catalog-parity.test.js`). `detectedSpecialistIds()` returns `[]`, so `detected` enables the same team as `minimal`; new test proves the generated project.yaml differs only in the `profile:` label. Docs already state both. Imported-source modes untouched |
| 7 | Docs truth | Fixed + tested | `docs/release-readiness.md` said `version: 0.3.0` (now tested against package.json); `.agentos/memory.md` listed 7 commands (now the 16 `cli.ts` handles, tested against `cli.ts`); README documents `task_scope` and that `doctor --fix` never edits `engines.allowed`. No role count is stated in README/docs, so none to test |
| 8 | Deprecated migration writers | **GATED** — not touched | Gate (old handoff "Open decisions" / "Next exact action" 1, copied to `.agentos/runs/2026-10-25-v1-slice1-history.md`): delete in 0.10.0 only after 0.9.0 has been out a few weeks, the npm download split is re-checked, the read-only `migration` inventory is kept, and the owner decides. Not met: 0.10.0 is not scheduled and no owner decision exists. Paths: pre-managed-block adapters + `--adopt-custom-adapters`, retired pre-0.4.0 cards + `--prune-retired`, `--normalize-repo-ids`, `agentos migrate claude` |

## Slice 1 — acceptance evidence

The developer sandbox has no `bun` on PATH (bun is installed on the host); every `bun run X` gate was run as `npm run X` (identical package.json scripts; none of them invoke bun).

| Command | Where | Exit | Result |
|---|---|---|---|
| `npm run check` | `3c03372` | 0 | |
| `npm test` | `3c03372` | 0 | 620 tests, 620 pass |
| `npm run smoke` | `3c03372` | 0 | |
| `node dist/cli.js doctor --json` | `3c03372` | 0 | `"ok": true`, 1 warning (no upstream) |
| `node --test test/v1-slice1.test.js` against `3c03372` dist (RED) | `3c03372` | 1 | 9 tests, 1 pass, 8 fail (items 1, 2×3, 3×3, 4; the pass is the "no task_scope → no scope lines" guard) |
| `tsc --noEmit --noUnusedLocals --noUnusedParameters` | `3c03372` | 1 | 9 errors |
| `npm run check` | final | 0 | flags on, 0 unused |
| `npm test` | final | 0 | 631 tests, 631 pass (620 + 11 in `test/v1-slice1.test.js`) |
| `npm run smoke` | final | 0 | |
| `node dist/cli.js doctor --json` | final | 0 | see handoff |

## Improve Later backlog

Consolidated with slice 7 into `docs/improve-later.md` (defects vs refinements); this list is the slice 1–6 record.


- The doctor warning `engines.allowed does not list opencode` is informational noise for owners who limited engines on purpose; consider dropping it or phrasing it as a note.
- `task_scope` is read from project.yaml (one task at a time). Slice 2 added a per-invocation narrowing (`agentos context --scope`); enforcement is still prompt-level only, nothing blocks an engine from editing outside it.
- `task_scope` entries are not checked for existence by `doctor` (a path or repo ID that does not exist is accepted); `agentos context` lists a missing scope path under `missing`. Add a doctor warning if it bites.
- Skill `--mode summary|full` and agent profile `minimal|detected` are equivalent aliases; a later release could deprecate one name of each pair (one-release notice first).
- `bun` is not on the Hermes developer sandbox PATH (it is installed on the host); gates run via the identical `npm run` scripts in the sandbox.
- Context builder relevance ranking refinements: plain term overlap today (trailing-`s` stemming only, headings/IDs/paths, no body text, no synonyms); consider weighting, body matches and role-aware skill selection once real tasks show misses.
- Context builder semantic dedup: records that repeat each other (repo note vs verification commands, handoff state vs objective) are both included.
- Context builder per-engine overhead measurement: the 2000/1500/1000 overhead constants are assumptions; measure real engine bootloader/system-prompt cost and replace them.
- Context builder: `.agentos/guide.md` (generated) does not mention `agentos context` yet; adding it changes the adapter generator and requires `doctor --fix` in every workspace, so it waits for a release slice.
- Context builder: repo-in-scope is "a read entry covers the whole repo" (root repo special-cased); nested child repos would need a repo tree.
- Deprecated migration writers: GATED (see finding 8).
- `core.ts` is ~4.9k lines; extract only along slice boundaries as later slices touch it.
- Checkpoints: concurrent writers are not supported (one writer lock per workspace; two engines checkpointing the same workspace serialize or fail on the lock).
- Checkpoints: no crash-safe multi-file transaction. Per-file atomic writes plus in-process rollback only; a crash between the record and `current.json` is reported by `resume` as `incomplete`, not repaired.
- Checkpoints: receipt evidence retention policy. Records and evidence logs accumulate under `.agentos/checkpoints/`; nothing prunes or archives them, and they are not gitignored by default.
- Checkpoints: the fingerprint misses an edit that keeps a file's status and its added/removed line counts identical; hashing diff content would close it at a cost.
- Checkpoints: `agentos compact` treats `## Checkpoint (managed)` as an unclassified section and demotes it under `## Preserved context` (markers kept); the next checkpoint restores it. Teach compact to leave the managed block alone.
- Checkpoints: the start marker line sits at the end of the previous handoff section's body, so that section's text (e.g. in `agentos context`) ends with the marker comment. Cosmetic.
- Checkpoints: `--check` has no shell (no pipes/`&&`); `execFile` of `npm` on Windows needs `npm.cmd`. Untested on Windows.
- Checkpoints: `.agentos/guide.md` does not list `checkpoint`/`resume` yet (same generator constraint as `context`).
- Brain: semantic dedup and conflict detection (today exact normalized text and the heading-subject heuristic).
- Brain: cross-file refactor of `.agentos/decisions.md` into per-record files (today it is one record; the context builder still reads it per heading).
- Brain: automatic proposals (e.g. from checkpoints or run notes); today an engine writes every proposal by hand.
- Brain: every read walks the workspace; use `index.json` as a validated cache if large monorepos make it slow.
- Brain: `apply` keeps an earlier `verified_at/by` after new content is accepted; consider clearing them (history already shows the order).
- Brain: `.agentos/guide.md` does not list `brain` yet (same generator constraint as `context`).
- Agents: per-tool allowlists (`tools_requested` reaches only the Claude Code subagent `tools:` list; no ADVISORY line per tool, no Codex/OpenCode mapping).
- Agents: provenance for imports (`templates import --type agent` still writes a legacy card; `import:<url>` is accepted by the validator but never written).
- Agents: native session resume (`native_session_resume` is `unsupported` for every engine; `agentos resume` stays engine-neutral text).
- Agents: existing legacy cards are never upgraded automatically (slice 6 only changed newly generated cards); a release note should tell owners to run `agents manifest`.
- Agents: `knowledge_selectors` and `skills` are recorded but not used by the context builder.
- Agents: `agents sync claude-code` refuses an existing `.claude/agents/<id>.md` with different bytes (no managed marker, no `--replace`); re-syncing after a card edit needs the file moved first.
- Engines: (resolved in slice 7) trial rows recorded; `launch` is unsupported everywhere (no `agentos run`).
- Brain: record files are discovered only directly by frontmatter; a Markdown file with `id: brain:` copied from elsewhere becomes a record (reported `invalid` if its `sources` does not list it).
- Obsidian: the index note is written once and never refreshed; add `obsidian index --refresh` (rewrite only an unmodified generated note) if stale indexes bite.
- Obsidian: index links from a vault note to workspace records are relative paths outside the vault; Obsidian may not open them.
- Obsidian: `agents remove` does not scan vault records for references (AgentsCtx has no vault binding).
- Obsidian: unavailable detection is "linked folder absent"; a mounted but unreadable folder (EACCES) reads as empty, not unavailable.
- Obsidian: `obsidian init` cannot recreate a deleted index note while `knowledge.obsidian` exists (doctor says so).
