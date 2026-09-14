# Handoff

## Current objective

Catalog cleanup slice 4 (retired-ID aliases + safe migration): implementation complete, awaiting independent review. Worktree `/home/hermes/agentos-catalog-cleanup`, branch `feat/catalog-cleanup`, HEAD `775fe082b1ed6a8f893f9e64713fad92ac11174c` (slices 1–3 committed as `b983635`, `ae3d17e`, `775fe08`). Slice 4 remains uncommitted; no push, merge, publication, version bump, or client rollout.

Slice 4 adds `src/aliases.ts` (agent + skill deprecated-alias tables and resolve helpers) and wires alias resolution with deprecation notices into `init --agents`, `agents add`, `skills add`, `templates show`, and `templates copy`; `doctor` detects retired enabled/capabilities, retired agent cards, and stale skills.md entries, and `doctor --fix` safely migrates clearly-generated retired cards (closed-set legacy shapes) while preserving customized cards and native `.claude`/`.opencode` copies. The one prior failing test — `templates copy id='qa'` returning ok:false — was fixed by letting a deprecated alias resolve idempotently to an already-installed canonical card (byte-identical) instead of refusing with "target already exists"; differing/customized cards still refuse.

Verification: build, check, `test/catalog-parity.test.js` (53), full suite (281), CLI smoke, and npm/pnpm/Bun packaged-manager checks (15 cards/9 references per manager) all pass. `test/aliases-and-migration.test.js` 9/9. Node/Bun from `bun --version`.

Dogfood `.agentos/` migrated via `doctor --fix` to the six-agent + 15-skill model: project.yaml `agents.enabled`/`capabilities` remapped (implementation→developer, qa→tester, code-reviewer→reviewer), retired cards migrated to `developer.md`/`tester.md`/`reviewer.md`, `release-manager.md` regenerated to canonical, and `.agentos/skills.md` retired-skill bullets + role routing updated to canonical IDs/aliases. Root adapters (AGENTS.md/CLAUDE.md/.hermes.md) were wrapped in `agentos:managed` markers by the adapter repair; content preserved byte-for-byte. No custom content was clobbered; no native `.claude`/`.opencode` copies exist in this worktree to preserve.

Scope: this isolated worktree and disposable fixtures only. Original dirty `/home/hermes/agentos-for-projects`, KargaX, Labahub, secrets, migrations, production config, and custom/native cards are protected. Next: independently review slice 4; no commit or later-slice work in this run.

Below is historical rollout context, not the active implementation task.

## Scope

- Repo: `agentos-for-projects` only.
- Branch: `feat/subrepo-engine-skill-access`.
- Version: `0.3.0`.
- Implemented:
  - stronger child `AGENTS.md` pointer for OpenCode, Codex, Hermes, and other AGENTS.md engines.
  - stronger child `CLAUDE.md` pointer for Claude Code.
  - child pointers explicitly reference `../.agentos/skills.md` and relevant engine adapters.
  - commit-message skill hints for `kargax-commit` / `conventional-commit` so Ralph does not need to repeat the skill path every time.
  - `doctor` detects child pointers that do not expose parent skills/engine adapters.
  - `doctor --fix` repairs stale child pointers.
  - README docs and regression tests.
- Out of scope/not implemented:
  - automatic engine launching.
  - changing OpenCode/Claude native global behavior.
  - editing KargaX source repos.

## Current state

New behavior for child repo pointer files:

```text
kargax-fe/AGENTS.md
kargax-fe/CLAUDE.md
kargax-be/AGENTS.md
kargax-be/CLAUDE.md
```

These now tell engines launched from child repos to treat `..` as the parent AgentOS root and read:

```text
../AGENTS.md
../.agentos/project.yaml
../.agentos/handoff.md
../.agentos/tasks.md
../.agentos/skills.md
../.agentos/repos/<repo>.md
../.agentos/engines/opencode.md      # OpenCode
../.agentos/engines/codex.md         # Codex
../.agentos/engines/claude-code.md   # Claude
```

Then engines should load only the specific `../.agentos/skills/**/SKILL.md` files relevant to the task.

## Last completed step

- Built and verified subrepo engine skill-access improvement.
- Bumped package version to `0.3.0`.
- Packed tarball:
  - `/tmp/agentos-subrepo-skill-pack-Es8UaX/agentos-for-projects-0.3.0.tgz`

## Files changed

- `.agentos/handoff.md`
- `.agentos/tasks.md`
- `README.md`
- `package.json`
- `package-lock.json`
- `src/core.ts`
- `test/core.test.js`
- generated build output under `dist/`

## Tests run

```bash
npm test -- --test-name-pattern='child repo pointers expose|doctor reports and fixes child repo pointers|doctor --fix refreshes stale child pointers'
npm test
npm pack --pack-destination /tmp/agentos-subrepo-skill-pack-Es8UaX
```

Results:

```text
69 tests passed
0 failed
agentos --version -> 0.3.0
```

Dogfood temp workspace verified:

- `doctor` fails stale `kargax-fe` child pointers missing `../.agentos/skills.md` and engine adapters.
- `doctor --fix` rewrites the child pointers.
- `doctor` returns OK after repair.
- fixed child `AGENTS.md` includes `../.agentos/skills.md`, `../.agentos/engines/opencode.md`, `../.agentos/engines/codex.md`, and `kargax-commit` / `conventional-commit` guidance.
- fixed child `CLAUDE.md` includes `../.agentos/skills.md` and `../.agentos/engines/claude-code.md`.

## Known warnings / failures

- No test failures in final verification.
- Temporary dogfood workspace had expected warnings for missing dev/test commands and non-git child repos.

## Next exact action

Independently review catalog cleanup slice 4 in `/home/hermes/agentos-catalog-cleanup`. Read `.agentos/runs/2026-09-14-catalog-cleanup-resume.md` and current staged/unstaged/untracked diffs (`src/aliases.ts`, `src/core.ts`, `test/aliases-and-migration.test.js`, `dist/`, and the dogfood `.agentos/` + root-adapter changes). No commit/push is authorized in this run. Slice 5 (full self-install) remains deferred.

## Open decisions

- Whether to add stronger OpenCode-native `.opencode` integration later; current fix uses repo-visible `AGENTS.md` pointers.
- Whether to add proactive quota/risk detection later.
- Whether to add `--summary-file` for engine-written final summaries later.
- Whether phase-level summary generation belongs in a later slice.

## Reliability implementation — 2026-09-10

Role/scope: implementation, QA and release preparation; `agentos-for-projects` only. Branch: `fix/discovery-reliability` in an isolated worktree. Original checkout edits and discovery report are preserved separately.

Implemented discovery reliability recommendations: lossless handoff records; unique run files; corrected repository IDs/topology and additive refresh; validated CLI flags and read-only previews; explicit replacement; root diagnostics/repair and imported role registration; policy enforcement; bounded and filtered Git/HTTP evidence; reviewed import hashes; transactional Claude migration; installed inventories and structural validation; cooperating writer locks; typed helper extraction; reduced history snapshot work; packaged mutation smoke and runtime/platform CI. See `docs/reliability-acceptance.md` for contracts and limits.

Verification so far: 194 regression tests passed on Node 26; full release check passed (typecheck, suite, smoke, npm/pnpm/Bun packed workflows, npm publish dry-run); package metadata tests 2/2; Bun pack dry-run and doctor passed. Advisory history fixture: 500 files/57 MB, re-init 209 ms on this host; not a benchmark guarantee. Node 20 acquisition did not complete successfully locally; CI matrix remains required. External-engine root/child acceptance is manual and has not been performed. No release publication, merge, client-repo edits, wizard or runner implementation.

Next: complete runtime/PR checks, open the review PR, and retain any unverified external-engine acceptance explicitly. Human reviews and merges.

### Delivery status

Implementation commit `341de5352816254c206204c14d87a6b28517a778` is pushed to `origin/fix/discovery-reliability`. All 194 tests also passed on Node 22.23.1. Rebuild matched committed dist; working tree was clean. PR creation is blocked: the connected GitHub account is ralphlol123, but repository metadata, create-PR and workflow calls for ralphlol123/AgentOS return 404. SSH Git push works; no separate local GitHub API authentication was available. Enable repository access for the connected GitHub app, then create main <- fix/discovery-reliability and verify CI. Do not claim a PR URL or hosted checks exist yet.
