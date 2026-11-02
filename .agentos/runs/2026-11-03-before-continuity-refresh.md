# State before the continuity refresh

Archived verbatim before updating stale project state. These historical claims describe earlier work, not the current checkout.

## .agentos/handoff.md

````markdown
# Handoff

## Current objective

Project Brain goal (Ralph, approved 2026-10-26; `briefs/AgentOS-Project-Brain-Goal-2026-10-26.md`). The Brain works without Obsidian, and Obsidian is an optional second location. **Goal complete, pending owner review:** all 20 acceptance rows pass with their limits stated.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace). `main` = `7bcca0e` (1.1.0, npm latest 1.1.0). No version bump on this branch.
- Branch `feat/project-brain`, draft PR https://github.com/ralphlol123/AgentOS/pull/57. Final code SHA `6ce3d25` (pushed, per Phynceon). The card-9 commits after it change docs and `.agentos/` state only and are local.
- Client workspaces are rolled out by the owner and are out of scope.

## Current state

- Slices 1–5 and trial defects D1–D7 are implemented and tested. Plan and design: `.agentos/plans/project-brain.md`.
- Matrix `docs/project-brain-acceptance.md`: **20 PASS, 0 FAIL, 0 BLOCKED**. Limits: A13 automated CLI regression + WSL2 manual; A14 automated CLI regression on native Windows (no Windows GUI/engine trial); A15/A17 n=1 owner GUI round trip (vault opened at the trial root, not `knowledge/`; Obsidian version not recorded); A16 OpenCode accepted by the owner in place of Codex.
- CI run 40310090906 on `6ce3d25`: all 7 jobs green (ubuntu Node 20/22/24/26, macOS Node 24, Windows Node 24, npm/pnpm/Bun packaged workflows).
- Evidence: `docs/evidence/project-brain-trials.md` (engine legs, GUI round trip, D1–D7), `docs/evidence/windows-validation.md` (A14).
- History: the pre-card-9 handoff and tasks are in `.agentos/runs/2026-10-26-project-brain-card8-state.md`; earlier history in the other files under `.agentos/runs/`.

## Known warnings / failures

- `bun`, `pnpm` are absent on the dev host. The gates run as `npm run …`; `test:package-managers` fails locally on the missing pnpm/bun (CI covers them).
- `npm publish --dry-run` fails on the dev host (version 1.1.0 already published); no version bump on this branch.
- `doctor` diagnostics list this repo's three legacy agent cards (developer, tester, release-manager).

## Next exact action

1. Phynceon: review the final head (re-run gates if the card-9 commits are pushed).
2. Owner: decide the release version. D6 is breaking for scripts: `brain apply` without `--by` is now refused.
3. Owner: decide whether D6's instruction + audit trail is enough or an enforced gate is wanted later.
4. Owner: merge decision for PR #57.

## Protected files / do not touch

- `/home/app/**`, Obsidian vaults, Hermes config, `C:\_\agentos-trial\` (owner fixture).
- `.github/workflows/` (owner push only).
- Deprecated migration writers until the owner decides.

## Open decisions

- Release version for the Project Brain (D6 breaking change for scripts).
- D6 policy: instruction + audit, or an enforced apply gate later.
- Removal of the deprecated legacy upgrade paths: retargeted to 2.0.0; the owner decides.
- This repo's three non-matching legacy cards: `agents manifest <id> --custom` or `agents add <id> --replace`.
- Alias/overlap consolidation candidates (`docs/migration.md`, keep / simplify / remove inventory).
- Import and quarantine (`templates import`): frozen.

````

## .agentos/tasks.md

````markdown
# Tasks

Active scope: Project Brain goal (`feat/project-brain`, PR #57) — complete, pending owner review. Finished tasks are in `.agentos/runs/2026-10-26-project-brain-card8-state.md` and the other notes under `.agentos/runs/`.

## Now

- [ ] Phynceon: review the final head; mark PR #57 ready.
- [ ] Owner: release version (D6 is breaking for scripts calling `brain apply` without `--by`), D6 policy (instruction + audit enough?), merge decision.

## Next

- [ ] Owner: publish after merge.

## Later

- [ ] Removal of the deprecated upgrade paths (2.0.0): owner decision.
- [ ] Optional refinements in `docs/improve-later.md`.

````

## .agentos/status.md

````markdown
# Status

Last updated: 2026-08-03

## Health

- AgentOS doctor/status: OK before optimization.
- Phase 1 agent model: shipped and pushed.
- Photobooth rollout: verified, including Claude Code plain-engine read-only smoke.
- Phase 2 `agentos run`: ON HOLD per Ralph.

## Token-efficiency hardening

Goal: reduce unnecessary context loading without changing AgentOS features.

Changed:

- Generated root adapters now load core AgentOS files first, then only relevant repo/agent/engine/skill files.
- Generated child pointers avoid wildcard role/engine reads and point at the specific repo note first.
- Generated `agentos prompt` text avoids `repos/*`, `agents/*`, and `engines/*` wildcard wording.
- `doctor --fix` now treats stale wildcard adapter text as stale and replaces it instead of appending a duplicate AgentOS section.
- Added regression tests for selective context loading and no duplicate adapter bootloaders.
- Compacted this repo's live `.agentos/handoff.md` + `.agentos/tasks.md`; archive kept in `.agentos/runs/`.

## Current phase

Token-efficiency hardening is verified and reviewed. No CLI features or command semantics were intentionally changed.

Verification:

- Full Bun verification passed with 27 tests / 0 fail.
- npm/pnpm/Bun package-manager compatibility passed.
- `bun run release:check`, npm publish dry-run, and `bun pm pack --dry-run` passed.
- `doctor --json`, `doctor`, and `status` passed.
- Claude Code review returned PASS after fixes for root/child stale wildcard adapter detection.

````

## .agentos/memory.md

````markdown
# Memory

Stable project facts only. Do not dump execution logs here.

- AgentOS for Projects is a Node/TypeScript CLI package that installs project-owned AI-agent context into single-repo and multi-repo workspaces.
- Package bin: `agentos` -> `dist/cli.js`; build output must be regenerated before packing/publishing.
- Preferred dogfood package manager is Bun; supported consumer/package-manager compatibility targets remain npm, pnpm, and Bun.
- AgentOS reads/writes `.agentos/project.yaml` with the `yaml` package; avoid regex/string-splice YAML parsing for project config changes.
- Core rule: one AgentOS per product/workspace; many repos inside it; each task declares repo scope.
- Obsidian integration is link-only and optional: never bulk-load the vault. A linked folder (`agentos obsidian init|link`, `knowledge.obsidian`) is a second location for the same Brain, not a second store: `canonical: workspace|vault` decides where records live, one file per record, links (never copies) on the other side, no sync. Vault records keep vault-relative `sources`; the absolute vault path is machine-local in git-ignored `.agentos/local.yaml` (wins over a legacy `knowledge.obsidian.vault` in `project.yaml`) (`docs/obsidian.md`, `docs/migration-project-brain.md`).
- The Project Brain is independent of Obsidian: `brain`, `context`, `checkpoint` and `resume` need only workspace Markdown plus `project.yaml`. An absent, disabled (`knowledge.obsidian.enabled: false`), unbound or invalid integration never blocks them, but vault-only records stay listed as Missing.
- Current command surface (`agentos help`): `init`, `status`, `doctor`, `upgrade`, `context`, `checkpoint`, `resume`, `brain`, `agents`, `skills`, `obsidian`, `compact`, `help`, `version` (3.0.0 removed the 2.x old forms; see docs/migration-3.0-cli.md).
- `doctor --fix` never edits `engines.allowed`; the engine list is the owner's choice. Optional `task_scope: {read, edit}` in project.yaml separates read from edit permission; `repos:` is inventory only.
- Project Brain records are project Markdown files with validated frontmatter (`id: brain:<slug>`); the frontmatter is authoritative and `.agentos/brain/index.json` is derived. Changes go through proposals: engines stage them with `agentos brain propose <record> --from <file> --task <id>` (tied to the task's checkpoint); the owner runs `brain preview`/`brain apply`; a changed `source_hash` means "changed since verification", not "wrong" (`docs/brain.md`).
- Agent cards: the frontmatter of `.agentos/agents/<id>.md` is a validated manifest (`docs/agents.md`); the task decides the edit scope and a manifest can only narrow it. An engine capability is `verified` only with a recorded trial section as evidence (`agentos doctor --engines`, `docs/engines.md`; 2026-10-25 trial, n=1): Claude Code restricts edits only with deny rules in a trusted workspace (allow-only rules do nothing), Codex only via its launch-time `--sandbox`; generated engine config alone is not proof of enforcement.
- Checkpoint/resume treat a repo path inside an enclosing git work tree (child dirs of one root repo) as `state: enclosing-worktree`, scoped by pathspec (`docs/checkpoints.md`).
- Release readiness uses `bun run release:check` plus `bun run publish:dry-run`; real `npm publish` still requires confirmed npm account/package ownership/version.
- AgentOS dogfoods itself in this repo before Photobooth rollout.

````

## .agentos/repos/agentos-for-projects.md

````markdown
# AgentOS For Projects Repo

Path: `.`
Type: Node/TypeScript CLI package
Framework: Node CLI, TypeScript ESM
Primary dogfood package manager: Bun
Supported consumer package managers: npm, pnpm, Bun

## Commands

- Install: `bun install --frozen-lockfile`
- Build: `bun run build`
- Type check: `bun run check`
- Unit tests: `bun run test`
- Smoke test: `bun run smoke`
- Package-manager compatibility: `bun run test:package-managers`
- Pack verification: `bun pm pack --dry-run`

## Scope rules

- Edit this repo only when task scope includes `agentos-for-projects`.
- Regenerate `dist/` after TypeScript source changes.
- Stage exact intended files only; do not use broad `git add -A` in shared workspaces.
- Do not modify Photobooth or other client workspaces during AgentOS package work unless explicitly requested.

## Current product surface

- `agentos init [--new|--existing] [--dry-run]`
- `agentos status`
- `agentos handoff`
- `agentos doctor [--fix]`
- `agentos compact [--dry-run]`
- `agentos link-obsidian [--vault <path> --dest <folder> --link <note> --create]`
- `agentos prompt [claude|codex|opencode|hermes]`

````


## Implementation-stage state before validation completed

### handoff.md

````markdown
# Handoff

## Current objective

Make engine handoffs trustworthy: an engine saves project knowledge and task progress, and another engine can inspect current files and continue after a usage limit or interruption. Engine launching, automatic switching and chat-session transfer are outside this change.

## Scope

- Repo: `agentos-for-projects`, single-repo workspace.
- Baseline: `ed3accd` on main, package 3.1.1. This branch contains unreleased changes; no version bump or release is requested.
- Branch: `fix/reliable-engine-handoffs`; task id: `reliable-engine-handoffs`.
- Allowed changes: continuity implementation, tests, docs, generated adapters and this repository's AgentOS state.

## Current state

- Startup context now uses the same Git reconciliation and receipt freshness calculation as resume.
- Active checkpoint context is mandatory; incomplete checkpoints appear under Missing and fail `--require-complete`.
- Empty registered Brains produce explicit warnings in status, doctor and context.
- Generated instructions tell engines to checkpoint meaningful milestones before limits interrupt them, and reuse the same task id across engines.
- Previous handoff/tasks/status/memory/repo notes are preserved in `.agentos/runs/2026-11-03-before-continuity-refresh.md`.
- Implementation and validation are in progress. Check the latest checkpoint and PR evidence before treating this branch as ready or merged.

## Next exact action

Finish regression checks, review the scoped diff, register the project knowledge, and open a draft PR. Do not merge or publish as part of this task.

## Protected files / do not touch

- Secrets, .env files, migrations and production config.
- `.github/workflows/`, client workspaces, external Obsidian vaults and Hermes configuration.

## Open decisions

- Release version and merge remain separate from this implementation.
- Retrieval improvements, task-state consolidation and Obsidian layout changes remain follow-up work.
````

### tasks.md

````markdown
# Tasks

## Now

- [ ] `reliable-engine-handoffs`: validate startup reconciliation, milestone instructions and refreshed project state; open a draft PR.

## Acceptance criteria

- Context and resume distinguish current passing checks from stale receipts after code or Git changes.
- Missing Git evidence never counts as current verification.
- A damaged checkpoint is visible to `context --require-complete`; read-only inspection changes no files.
- The active checkpoint is retained or context reports budget overflow.
- Empty Brains are visible and inspection does not initialize them.
- All engine bootloaders advise milestone checkpoints and consistent task ids.

## Next

- [ ] Review the PR and perform a real cross-engine continuation trial before release.

## Later

- [ ] Improve body-text retrieval and separate task identity from task description.
- [ ] Consolidate current task views around checkpoints.
- [ ] Make the default Obsidian layout expose the actual Brain records.
````
