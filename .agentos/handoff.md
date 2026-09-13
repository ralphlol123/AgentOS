# Handoff

## Current objective

Catalog cleanup slice 1: canonical definitions and installation parity. Implemented directly by Hermes in `/home/hermes/agentos-catalog-cleanup`, branch `feat/catalog-cleanup`, based on `293d97562f9228a49848e85d90baa7e2cccb43f3`. Independent review is pending; no commit, push, merge, publication, or client rollout.

`src/catalog.ts` now derives skills, agents, and the registry from package-owned Markdown. All 20 skill IDs/categories and 9 existing agent-template IDs are retained; data/security are explicitly addable, not detected by default. Summary/full skill modes preserve the complete body and differ only in mode metadata. The strict planning-only project-manager contract and portable safety gates are retained. Existing customized/local/native cards and capability mappings remain protected by the existing replacement, boundary, locking, and rollback paths.

Verification: test-first RED exposed missing source coverage, differing add/copy workflows, lost late steps/safety notes, and the permissive PM source. Focused parity, custom-card preservation, metadata rejection, and CRLF tests are GREEN. `bun run build`, `bun run check`, full `bun run test` (260 passed), `bun run smoke`, and existing `bun run test:package-managers` (npm/pnpm/Bun packed mutation checks) passed on Node 26.5.0 / Bun 1.3.14. Smoke warnings were expected non-git disposable fixture repos. Worktree `node dist/cli.js status` and `node dist/cli.js doctor --json` both returned OK; doctor reported only the expected tracked-working-tree-changes warning. Package version remains 0.3.0.

Files: `src/catalog.ts`, `src/core.ts`, `test/catalog-parity.test.js`, `test/core.test.js`, all 20 `templates/skills/` cards (9 newly materialized), `templates/agents/project-manager.md`, `docs/templates.md`, generated `dist/catalog.*` / `dist/core.*`, and these worktree handoff/task notes.

Limits: package templates must be present at runtime; catalogs are loaded once per process. No aliases, renames/consolidation, migration, self-install rollout, or external-engine acceptance. Older source cards may be reported as custom-or-imported and are not automatically replaced. Existing import excerpt limits and capability/default-role policy remain unchanged. Passing the existing packed regression command is not completion of slice 5.

Scope: this isolated worktree and disposable fixtures only. The original dirty `/home/hermes/agentos-for-projects`, KargaX, Labahub, local customized cards, secrets, migrations, and production configuration are protected. Next: independently review slice 1; do not begin slice 2 until that review gate passes.

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

Independently review catalog cleanup slice 1 in `/home/hermes/agentos-catalog-cleanup`. No commits or client-workspace commands are authorized in this slice. After review passes, the parent may begin the approved slice 2; slices 2–5 are not implemented here.

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
