# Changelog

All notable changes to AgentOS for Projects are documented here.

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
