# Changelog

All notable changes to AgentOS for Projects are documented here.

## [Unreleased]

## [0.8.0] - 2026-10-05

Known gaps in this release: the Codex engine was not tested (not installed where the acceptance runs happen); nested-repo discovery with OpenCode grounded 8 of 12 runs on a synthetic fixture and needs the owner's OpenCode config (`continue_loop_on_deny`, `external_directory`) to be reliable; `doctor --fix` falls back to a whole-file `project.yaml` rewrite for anchors/aliases and unusual layouts; and the legacy upgrade code is kept because only one real workspace's migration inventory has been seen.

### Added

- **Oversized state files are now visible.** `agentos doctor` and `agentos status` warn when `.agentos/handoff.md` or `.agentos/tasks.md` is over 50,000 characters, naming the largest section and the next command. The warning is advisory only: `doctor` problems and exit status, and `status` OK/NEEDS ATTENTION, are unchanged, and output for workspaces under the limit is byte-identical.
- **`compact` explains a no-op.** When no safe reduction exists, the output lists the five largest sections with their size, decision and reason, and counts sections kept only because their heading is not a recognised role or history heading. Previously it said only `No safe reduction found`. Compaction behavior itself is unchanged.
- **`.agentos/guide.md`.** One engine-agnostic guide (managed block, repaired by `doctor --fix`) that maps jobs to `agentos` commands and covers starting from a child repo. The root bootloaders (`AGENTS.md`, `CLAUDE.md`, `.hermes.md`) point at it in one line. Coding engines found `.agentos/` files but rarely reached for the CLI. In an ablation (Claude Code and OpenCode, one run per task, synthetic fixture), engines used the intended command (`doctor`, `compact`, `skills add`) in 6 of 8 root tasks with the guide and 2 of 8 without it. `doctor` warns when the guide is missing. There is deliberately no `agentos guide` command: with and without it, 8 of 12 nested OpenCode runs gave a fully grounded answer. Samples are small, so treat these as directional.

### Changed (development)

- **`dist/` is no longer committed.** 42 generated files (710 KB) rode along in every pull request (5% to 32% of each diff, and a second source of merge conflicts), and the CI step that required them to match `src/` only policed that duplication. They are now ignored by git and built by a new `prepare` script, which runs on `bun install`, `npm ci` and `pnpm install` in a checkout. `prepack` still builds for `npm pack`/`publish`, and the published package still ships `dist/`. Installing from a source checkout (`npm install -g /path/to/agentos-for-projects`) now requires running the checkout's own dependency install first; skipping it now fails at install time with a `tsc` error (exit 2); before, it installed a binary that crashed on a missing `yaml` package when first run. No change for users of the published package.

### Fixed

- **`project.yaml` edits keep your formatting.** `doctor --fix`, `agents add`, `templates copy`/`import` of an agent, `link-obsidian` and `obsidian link-workspace` used to parse the file and re-dump all of it, so comments, flow style and layout were lost even when nothing needed to change. They now edit only the value that changes (and return the file byte-for-byte when nothing does). The result is re-parsed and must equal the intended data; anything the editor cannot prove it reproduced (anchors and aliases, mixed line endings, an unusual layout) falls back to the old whole-file dump, so the data is never different, only the formatting.
- **`agentos doctor --fix --dry-run` no longer takes the workspace writer lock.** It is documented as a read-only preview, but it failed with `EACCES` on `.agentos-write.lock` in a workspace the user cannot write to and would have been blocked by an unrelated writer. A real `doctor --fix` still takes the lock.

### Removed

- **`.agentos/engines/<engine>.md` is no longer generated.** All five files (`claude-code`, `codex`, `opencode`, `hermes`, `chatgpt`) were the same 143-149-byte sentence, already stated by the bootloader rules, with nothing engine-specific in them. `init` and `doctor --fix` no longer create them, the bootloaders, child pointers, `agentos handoff` reading lists and `agentos prompt` no longer name them, and `doctor` no longer warns when `opencode.md` is missing or reports a problem when a child pointer omits an engine adapter. `agentos prompt claude-code|hermes` still names the engine's bootloader (`CLAUDE.md`, `.hermes.md`). `doctor --fix` still records `opencode` in `engines.allowed`.
- Existing workspaces keep their stub files: they are tolerated, never deleted, and left byte-identical by `doctor` and `doctor --fix`. Delete `.agentos/engines/` by hand when you want it gone. Root and child adapters from the previous generator report stale until `doctor --fix`; roll that out manually per project.

### Changed

- **`agentos status` and `agentos handoff` are self-sufficient from a child repo.** `status` adds the repo name, repos in scope, that repo's verification commands and the open tasks; `handoff` prints the handoff content before the reading list. Output at the workspace root is unchanged.
- **Child repo pointers lead with the CLI.** The file list under `..` is now conditional on file reads working, because a refused read can end an OpenCode session.
- Existing workspaces report their root and child adapters stale until `doctor --fix` is run; roll this out manually per project.

## [0.7.0] - 2026-09-17

### Changed

- **Structural compaction is now the default.** The ordinary workflow is `agentos compact --dry-run`, then `agentos compact`. `--rewrite` remains a compatibility alias for that same behavior; `--checkpoint` explicitly selects the previous archive-and-link mode, which may grow live state.
- **Objective interpretation is shared across compact, status, and doctor.** One valid current objective is selected automatically. `--objective` is reserved for ambiguity or an intentional override, and dates or labels such as “latest” never decide. Missing, empty, malformed, unknown, ambiguous, or stale selections refuse with zero writes.
- **Preview output is concise by default.** Every dry run is write-free and omits complete proposed file bodies. `--diff` adds the detailed unified patch and is valid only with `--dry-run`; `--expect-state` remains an optional binding rather than a requirement for ordinary apply.
- **Normal apply requires a real reduction.** Compaction replans current disk state under the writer lock and writes only when the combined live character count strictly decreases. Equal, growing, and identical proposals report `No safe reduction found; files unchanged.` without creating an archive, lock, temporary file, or live-state write. Per-file growth is still reported honestly when the combined total falls.

### Safety

- Exact originals are archived and hash-verified before live replacement; source state is rechecked, workspace boundaries and the writer lock are enforced, and archive/live writes share the existing transaction and rollback path.
- Unknown sections remain live. Complete uncertain obligations that can be lifted are carried forward verbatim; an uncertain obligation that cannot be lifted as a complete unit keeps its whole block live. Repeat compaction reaches a write-free fixed point once no safe reduction remains. Detailed measured preservation residuals and known conservative semantic limits remain in `docs/compaction.md`.

## [0.6.0] - 2026-09-16

### Fixed

- **History that a previous version parked inside `## Preserved context` can be reclaimed.** Section scanning split level-2 headings only, and the container's history flag was forced off, so a superseded objective that an earlier build re-emitted as a `###` block under the container could never be classified again — it stayed live permanently, and no later version could recover it. A real workspace was carrying 90,003 characters of it and `compact --rewrite` reported **0 archived** there. The container's own body is now re-read on every run: nested blocks that are explicit history with no unchecked task block at any depth are archived and reported, their constraint lines are carried into the container's generated block (extended, never duplicated), and everything else is kept. Deeper headings stay attached to the shallowest heading that owns them, so an unchecked `- [ ]` under an intervening `####` still blocks its parent instead of being orphaned. On that workspace the same read-only preview went from `138,773 -> 117,454` characters (0 archived) to `95,431` with 6 archived, and to **`63,441`** with 12 archived once qualified headings were recognized too.
- **Qualified history headings are recognized at any nesting level.** `historyRemainder` cut at the first `—–:.,` *before* stripping parentheticals, so `## Previous objective (2026-09-11, now merged, superseded by the entry above)` reduced to `objective (2026-09-11` and failed the noun list; `prior` was not a history word at all, so `## Prior objective` never qualified. Both stayed live forever. Parenthetical groups are now stripped first, and `prior` joins the history words. Negative controls hold: `Previous objective backlog`, `Previous objectives roadmap`, `Current objectives backlog`, `Prior objectives backlog`, `Prior art` and `Notes about Current objective` all stay live, and no canonical alias is diverted into history.
- **Carried constraint lines must read as instructions, not as wrapped prose.** The carry rule matched keywords plus length, so reclaiming a long history block handed it every soft-wrapped line of it: a real workspace carried 22 lines of which 19 were mid-paragraph fragments (`never actually rendered. Possibly …`), and the same 19 returned on every run. A carried line must now open on an uppercase character, be either an explicit obligation (it opens on the directive, or states a subject followed within six words by `must`/`must not`/`must never`/`do not`/`don't`/`requires`/`is required`/`are required`/`without approval`/`only with approval`) or a sentence ending in `.`/`!`/`?`, and must not trail off on a function word or an unclosed parenthesis. Emphasis markers of one to three characters open a directive, so `*Never push to main*` qualifies. Two limits are deliberate and documented: a line opening on a code span is read as a continuation of the previous line, and a line ending on a conjunction as truncated — both stay in the archive rather than being re-injected. That workspace now carries **3 lines instead of 22**, and the three are the genuine directives. An independent pass measured 0 lines newly carried across 22,441 real lines, 19/19 fragments still dropped and 3/3 directives kept.

### Changed

- `docs/compaction.md` documents the container re-read rule, the qualified-heading rules, the repeat-run behaviour (a repeat run rewrites nothing once no further block becomes archivable; a hand-edited mixed-level container can expose one on a later pass), and the carry rule's shape requirement together with its two deliberate limits.

## [0.5.1] - 2026-09-15

### Fixed

- **Carried constraints are directives, not prose.** `compact --rewrite` used to carry any archived-history line that merely contained a keyword such as `never` or `protected` anywhere in it, which re-injected long narrative paragraphs into live context (a real workspace pulled ~21 KB of history back in). A line is now carried only when it is short (≤ 200 characters), or when it opens with the directive itself (≤ 600 characters), and bullets are normalized to plain text. Instructions buried inside long narrative lines are no longer carried — they remain in the archive and are listed in the manifest.
- **Qualified history headings are recognized.** `## Previous objective (superseded) — 2026-09-13: …` and `## Previous (superseded) objective — …` were treated as unclassified and stayed live forever because the parenthetical broke the noun match. They are now history like any other `Previous …` section.
- **The machine-generated constraints block is re-evaluated on every rewrite.** `## Preserved context` → `### Constraints carried forward from archived history` is re-filtered against the current rule (originals stay in the archive), an emptied block is removed, and stacked bullet markers (`- - text`) written by an earlier version are collapsed to a single bullet. Hand-written content in the same container is never filtered.

## [0.5.0] - 2026-09-14

### Compaction

- **Opt-in structural rewrite.** `agentos compact --rewrite` is the first mode that reduces live context. It archives `.agentos/handoff.md` and `.agentos/tasks.md` byte-for-byte under `.agentos/runs/compact-rewrite-<sha256>/` (raw files, `manifest.json`, `README.md`), verifies the archive hashes, rechecks the sources, and only then replaces live state inside the existing mutation transaction. Plain `agentos compact` keeps its conservative checkpoint behaviour.
- **Nothing active is guessed away.** The selected objective keeps its original heading, every unfinished task keeps its nested details, unclassified sections are re-emitted verbatim under `## Preserved context`, and constraint lines found inside archived history (`do not`, `never`, `requires approval`, `before merging`) are carried forward verbatim. Only superseded objectives and explicit history sections (`Previous …`, `Superseded …`, `Done`) move to the archive, and only when they hold no unchecked task block.
- **Ambiguity blocks instead of choosing.** With more than one `## Current objective` heading the command lists every candidate with a content-bound id, exits 1, and writes nothing until `--objective <id>` names one. Missing, empty, fenced-broken, non-UTF-8, non-regular, or symlinked live state also refuses with zero writes. `--expect-state <sha256>` binds an apply to the reviewed preview so a context update in between cannot be silently overwritten.
- **Honest reporting.** Before/after per file, archived/live/preserved counts, carried-forward constraints, and missing canonical sections are printed; growth is reported as growth (`… chars added`) instead of negative savings, and an apply with nothing to archive says it is a structural normalization only. A repeat rewrite of unchanged state is a write-free no-op.


### Migration UX (upgrading an older workspace)

- `doctor` / `doctor --json` report a read-only **migration inventory** — `migration.adapters`, `migration.repoIds`, `migration.retiredCards`, `migration.summary` — so an owner can see everything an older workspace still needs migrated before approving anything. It is report-only: no writes, and no change to doctor's exit status.
- New `agentos adapters explain <file>` reports the classification, managed-block status with byte offsets, the reason for a conflict, the legacy section span, and the next command for one adapter path — including when `.agentos/project.yaml` fails validation.
- **Adopting custom-content adapters.** An adapter that holds custom project knowledge with a stale AgentOS section interleaved in it is now classified `adopt` instead of an ownership conflict. `agentos doctor --fix --adopt-custom-adapters` replaces only that byte span — custom bytes before and after it are preserved verbatim and one `.agentos.bak` is written — and `agentos doctor --fix --dry-run` previews every planned adapter change read-only. A plain `doctor --fix` still refuses and names the flag.
- **Repository ID normalization.** `agentos doctor --fix --normalize-repo-ids [--dry-run]` renames a non-canonical repo ID (`frontend_client` → `frontend-client`) together with its repo note, preserving every other byte of `project.yaml` (comments, quoting, key order), and records an audit note under `.agentos/runs/`. It refuses with zero writes on any ambiguity: colliding IDs, both note files present, or a mapping that cannot be edited line-by-line.
- **Retired card cleanup.** Retired skill cards now carry per-card eligibility — `prunable` when their bytes hash-match a card body a real AgentOS version installed, `manual-review` otherwise. `agentos doctor --fix --prune-retired` removes only provably-generated cards, leaves forks reported and untouched, and rebuilds the local-skills index in `.agentos/skills.md`.

### Changed

- A non-canonical repository ID is no longer a parse-time failure that blocks every command: it is a reported, fixable `doctor` problem, so the rest of the diagnostics (adapter scan, agents, tasks, git state) still run. Genuinely unmigratable configs still fail closed exactly as before.

### Fixed

- `doctor` recognizes documented objective heading variants such as `## Current objective — 2026-09-15 (latest): …` instead of warning that the section is missing. It now distinguishes a missing objective from a present-but-empty one, and reports duplicate objective headings with every source line, without rewriting state from a diagnostic.
- Repository IDs are written into file paths (`.agentos/repos/<id>.md`) and into generated cards, so they are validated as safe workspace-relative path fragments with a conservative character set; a key like `../../../victim` can no longer create or delete a file outside the workspace.
- `doctor --fix --normalize-repo-ids` now runs the workspace boundary preflight like every other mutating command, so a symlinked `.agentos/repos` cannot redirect the rename out of the workspace.

## [0.4.0] - 2026-09-14

### Agents

- Consolidated the agent catalog to six roles with distinct responsibility boundaries:
  - **planner** (was `project-manager`) — planning-only; does not implement, edit source, commit, or push.
  - **developer** (was `implementation`; absorbs `frontend-engineer` and `backend-engineer`) — implements scoped changes in the assigned repo using the relevant frontend/backend skills; does not claim independent QA or review.
  - **tester** (was `qa`) — independent verification; may author tests when assigned; reports defects without silently fixing the implementation under test.
  - **reviewer** (was `code-reviewer`) — read-only review unless reassigned.
  - **release-manager** — explicit authorization per commit/push/merge/publish; exact-path staging; remote read-back.
  - **security-reviewer** — optional specialist, not auto-enabled.
- `detected`/`minimal` profiles now install `developer`, `tester`, `reviewer`, `release-manager` (no longer add frontend/backend specialists).

### Skills

- Consolidated 20 skills into 15 framework-agnostic workflow skills:
  - core: `debugging`, `test-driven-development`, `git-safety`, `verification`, `documentation`, `code-review`
  - frontend: `frontend-design`, `frontend-testing`
  - backend: `backend-development`, `backend-testing`, `authorization`
  - fullstack: `integration-testing`
  - github: `pull-request-workflow`, `commit-messages`, `ci-verification`
- Core skill instructions are framework/provider-neutral; framework-specific guidance (NestJS, Nuxt, GitHub, Conventional Commits) lives in optional `references/` loaded only when relevant to the assigned repo.
- `git-safety` now absorbs secret-handling safeguards (was `secret-scanner-safe-edits`).
- `commit-messages` is a generalized, read-only, staged-first workflow that discovers project commit conventions instead of hardcoding them.
- `frontend-design` merges `ai-slop-design-review` + `interface-feel-polish`; `frontend-testing` merges `frontend-build-verification` + `nuxt-e2e-testing`; `backend-development` generalizes `nestjs-feature-implementation`; `backend-testing` generalizes `backend-service-verification`; `authorization` generalizes `nestjs-auth-guards`; `code-review` merges `requesting-code-review` + `backend-pr-review` + `github-code-review`.

### Catalog mechanics

- Package Markdown templates are now the single canonical source for skills and agents; `skills add`, `templates copy`, and `agents add` produce equivalent complete workflows (previously two competing inline/file sources could drift).
- Summary mode no longer truncates workflow steps; it preserves every safety and completion gate.
- Skill `references/` are installed alongside their `SKILL.md` (previously dangling paths).
- Deprecated agent/skill aliases resolve to canonical IDs with deprecation notices and dedupe.
- `doctor` detects legacy IDs; `doctor --fix` migrates only byte-matched historical card shapes, preserving customized cards and native engine copies.

## [0.3.0] - prior

- Subrepo-launched engine access to parent AgentOS skills.
- Reliability and discovery improvements (see `docs/reliability-acceptance.md`).
