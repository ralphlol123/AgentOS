# Skills

Policy: on-demand. Load only workflows relevant to the assigned role/task and repo.
Project conventions prevail; optional references apply only to the detected stack.

## Local installation status

No AgentOS-local skill cards are installed in this worktree (verified with
`node dist/cli.js skills list --installed`). The catalog below is available package
source, not installed `.agentos/skills/**/SKILL.md` paths. Full self-install is
reserved for slice 5; do not mistake this index for an installation.

## Available catalog — not installed locally

### core

- code-review — use when preparing a change for review or performing a review. **Not installed.**
  Package source: `templates/skills/core/code-review.md`
- debugging — use for unclear bugs or inconsistent reproduction. **Not installed.**
  Package source: `templates/skills/core/debugging.md`
- documentation — use when writing/updating docs about code behavior. **Not installed.**
  Package source: `templates/skills/core/documentation.md`
- git-safety — use before commit/push/merge or when touching config/env/credential files in shared repos. **Not installed.**
  Package source: `templates/skills/core/git-safety.md`
- test-driven-development — use when adding or changing behavior. **Not installed.**
  Package source: `templates/skills/core/test-driven-development.md`
- verification — use before trusting a "done" report from a person, agent, or tool. **Not installed.**
  Package source: `templates/skills/core/verification.md`

### frontend

- frontend-design — use for UI design, design review, and interaction/feel polish. **Not installed.**
  Package source: `templates/skills/frontend/frontend-design.md`
- frontend-testing — use before declaring frontend work done. **Not installed.**
  Package source: `templates/skills/frontend/frontend-testing.md`

### backend

- authorization — use for auth/permission/access-control work. **Not installed.**
  Package source: `templates/skills/backend/authorization.md`
- backend-development — use when implementing a new backend feature. **Not installed.**
  Package source: `templates/skills/backend/backend-development.md`
- backend-testing — use for backend verification before declaring backend work done. **Not installed.**
  Package source: `templates/skills/backend/backend-testing.md`

### fullstack

- integration-testing — use before declaring cross-component/cross-service work done. **Not installed.**
  Package source: `templates/skills/fullstack/integration-testing.md`

### github

- ci-verification — use when adding/changing CI workflows. **Not installed.**
  Package source: `templates/skills/github/ci-verification.md`
- commit-messages — use when generating or reviewing commit messages from Git changes. **Not installed.**
  Package source: `templates/skills/github/commit-messages.md`
- pull-request-workflow — use for PR lifecycle work. **Not installed.**
  Package source: `templates/skills/github/pull-request-workflow.md`

## Retired ID aliases (slice 4)

Retired skill and agent IDs now resolve to their canonical replacements with a
deprecation notice across `skills add`, `agents add`, `templates copy`, and
`init --agents`. None are installed locally. Key skill mappings (full table in
`src/aliases.ts`): `systematic-debugging` → `debugging`,
`shared-repo-git-safety` → `git-safety`, `backend-service-verification` →
`backend-testing`, `requesting-code-review` → `code-review`,
`github-pr-workflow` → `pull-request-workflow`, `nuxt-e2e-testing` →
`frontend-testing`, `ai-slop-design-review`/`interface-feel-polish` →
`frontend-design`. Agent mappings: `implementation`/`frontend-engineer`/
`backend-engineer`/`data-engineer` → `developer`, `qa` → `tester`,
`code-reviewer` → `reviewer`, `project-manager` → `planner`. Never delete a
customized or native card by retired name.

## Role routing

- developer: debugging, test-driven-development, documentation; backend-development when applicable.
- tester: verification, frontend-testing, backend-testing, integration-testing as relevant.
- reviewer: git-safety, code-review; authorization when relevant.
- release-manager: git-safety, commit-messages, pull-request-workflow, ci-verification.

For source consultation in this package repository, load the exact package card
listed above and resolve `references/` beside its matching `<id>/` support folder.
To materialize a card in an authorized workspace, preview
`agentos skills add <id> --dry-run` first; apply installs the card and references
and adds an exact local Details pointer. Do not bulk-load the catalog.
