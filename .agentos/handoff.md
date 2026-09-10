# Handoff

## Current objective

Task 3: atomic state writes and best-effort command rollback on `fix/atomic-state-writes`.
Implemented with Claude Code from merged Task 2 (`a21c718`). Critical state replacements now use same-directory temporary files, fsync/close, mode preservation, atomic rename, and cleanup. Multi-output mutation commands roll back original bytes/existence when a later in-process write fails.

Verification: `npm run check`, 18 focused atomic/rollback tests, full `npm test` (109 passed), and `git diff --check` passed independently after implementation. Final independent review: PASS. Package version is unchanged. Branch delivery is via PR; merge pending.

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

Merge the Task 3 PR after GitHub checks and human review. After merge/install in KargaX, run:

```bash
cd /home/app/www/kargax/new
agentos doctor --fix
agentos doctor
```

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
