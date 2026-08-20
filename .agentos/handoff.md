# Handoff

## Current objective

Subrepo-launched engine access is implemented on `feat/subrepo-engine-skill-access`: when OpenCode/Codex/Hermes/Claude starts inside a child repo such as `kargax-fe` or `kargax-be`, the generated child pointers now send the engine back to the parent AgentOS root and parent skill index.

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

Commit and push `feat/subrepo-engine-skill-access`, then prepare PR details. After merge/install in KargaX, run:

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
