# Changelog

All notable changes to AgentOS for Projects are documented here.

## [0.5.0] - 2026-09-14

### Migration UX (upgrading an older workspace)

- `doctor` / `doctor --json` report a read-only **migration inventory** — `migration.adapters`, `migration.repoIds`, `migration.retiredCards`, `migration.summary` — so an owner can see everything an older workspace still needs migrated before approving anything. It is report-only: no writes, and no change to doctor's exit status.
- New `agentos adapters explain <file>` reports the classification, managed-block status with byte offsets, the reason for a conflict, the legacy section span, and the next command for one adapter path — including when `.agentos/project.yaml` fails validation.
- **Adopting custom-content adapters.** An adapter that holds custom project knowledge with a stale AgentOS section interleaved in it is now classified `adopt` instead of an ownership conflict. `agentos doctor --fix --adopt-custom-adapters` replaces only that byte span — custom bytes before and after it are preserved verbatim and one `.agentos.bak` is written — and `agentos doctor --fix --dry-run` previews every planned adapter change read-only. A plain `doctor --fix` still refuses and names the flag.
- **Repository ID normalization.** `agentos doctor --fix --normalize-repo-ids [--dry-run]` renames a non-canonical repo ID (`frontend_client` → `frontend-client`) together with its repo note, preserving every other byte of `project.yaml` (comments, quoting, key order), and records an audit note under `.agentos/runs/`. It refuses with zero writes on any ambiguity: colliding IDs, both note files present, or a mapping that cannot be edited line-by-line.
- **Retired card cleanup.** Retired skill cards now carry per-card eligibility — `prunable` when their bytes hash-match a card body a real AgentOS version installed, `manual-review` otherwise. `agentos doctor --fix --prune-retired` removes only provably-generated cards, leaves forks reported and untouched, and rebuilds the local-skills index in `.agentos/skills.md`.

### Changed

- A non-canonical repository ID is no longer a parse-time failure that blocks every command: it is a reported, fixable `doctor` problem, so the rest of the diagnostics (adapter scan, agents, tasks, git state) still run. Genuinely unmigratable configs still fail closed exactly as before.

### Fixed

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
