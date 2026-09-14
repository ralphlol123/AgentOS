# Catalog cleanup — slice 2 ready for independent review

## Current state (2026-09-14 resumed run)

- Worktree: `/home/hermes/agentos-catalog-cleanup`; branch `feat/catalog-cleanup`.
- HEAD remains `b983635f72da9ca09c5a08db733b92bf384aa04a` (slice 1). Slice 2 is implemented and verified, UNCOMMITTED. No staging changes, commit, push, version bump, publication, external engine, or client-workspace edits by this continuation.
- Resume preserved the original WIP and staged deletions. Replaced 20-skill catalog with 15 workflow skills; 9 optional references install locally through add/copy using shared file planning, preflight, per-file atomic writes and command rollback.
- Differing custom/orphan references require explicit replacement. Extra owner reference files survive replacement. Installed inventory checks shipped reference bytes; missing/modified references are not source-match. Local removal includes references and leaves native copies untouched.
- Restored exact historical adapter recognition text instead of renaming historical shapes. Tightened code-review approval to require resolved must-fix findings. No agent consolidation or aliases/migration implemented.
- `.agentos/skills.md` is regenerated from the actual catalog: all 15 available cards are **uninstalled locally**; retired recommendations are unavailable. No full self-install (slice 5) performed.

## Verification receipts

Node 26.5.0 / Bun 1.3.14. Latest required gates passed:

- `bun run build` and `bun run check`: exit 0.
- `node --test test/catalog-parity.test.js test/skill-references.test.js`: 81 passed, 0 failed (56 parity + 25 reference regressions).
- `bun run test`: 275 passed, 0 failed. The 260-test slice-1 suite loses 10 parameterized cases from two 20-to-15 skill loops, and adds 25 reference regressions.
- `bun run smoke`: exit 0; expected non-git fixture warnings only.
- `bun run test:package-managers`: PASS npm, pnpm, Bun; each compares all 15 installed cards and 9 references to package bytes, exercises template copy/removal and prior role/handoff/checkpoint/doctor mutations.
- Latest tarball: `/tmp/agentos-pack-vWQwQb/agentos-for-projects-0.3.0.tgz` (0.3.0).
- `npm pack --dry-run`: exit 0, 64 files.
- Extra `bun pm pack --dry-run` first failed with TS2339 at existing `src/core.ts:1306` under the ambient PATH compiler. `PATH="$PWD/node_modules/.bin:$PATH" bun pm pack --dry-run` passed (64 files). Do not modify unrelated removal code or change versions to work around this environment selection issue. Normal build/prepack regenerated dist afterward; no unrelated dist changes remain.
- `node dist/cli.js doctor --json` and `status`: OK. Expected warnings: dirty tracked worktree and slice-1 commit ahead of origin/main.
- `git diff --check` and `git diff --cached --check`: exit 0.

Logs: `/tmp/agentos-slice2-focused.log`, `-full.log`, `-smoke.log`, `-managers.log`, `-npm-pack.log`, `-pack.log` (initial optional failure), `-pack-local-tsc.log` (successful retry), `-doctor.json`, `-status.log` (all share `/tmp/agentos-slice2` prefix).

RED evidence: installed-reference parity failed on missing reference paths before implementation; copy preview failed to enumerate references; installed inventory failed on modified references; code-review gate failed on allowing acknowledgment instead of resolution. Lock fixture was corrected to a competing process because same-process lock contexts intentionally reenter. No existing safety assertion was removed to achieve GREEN.

## Next exact action

Independent slice-2 review only. Inspect staged deletions, unstaged edits AND untracked cards/references/tests. NO COMMIT/PUSH in this run. Parent controls the review and subsequent slice gates. Slices 3–5 remain: agent consolidation, compatibility aliases/safe migration, full self-install. This is not completion of the five-slice task.

Known limits: rollback is best-effort in-process, not crash-safe cross-file atomicity or hostile-concurrency containment. Additional owner-only reference files are preserved but not inventory-classified. Retired IDs remain unavailable until slice 4. Hosted CI and external-engine acceptance were not run. The original dirty checkout and client workspaces remain off limits.

## Exact changed-file inventory (63 paths, includes pre-existing WIP)

```text
 M .agentos/handoff.md
 M .agentos/skills.md
 M .agentos/tasks.md
 M README.md
 M dist/catalog.d.ts
 M dist/catalog.js
 M dist/catalog.js.map
 M dist/core.js
 M dist/core.js.map
 M docs/quickstart.md
 M docs/templates.md
 M src/catalog.ts
 M src/core.ts
D  templates/skills/backend/backend-pr-review.md
D  templates/skills/backend/backend-service-verification.md
D  templates/skills/backend/nestjs-auth-guards.md
D  templates/skills/backend/nestjs-feature-implementation.md
D  templates/skills/core/agent-output-verification.md
D  templates/skills/core/grounded-codebase-docs.md
D  templates/skills/core/requesting-code-review.md
D  templates/skills/core/secret-scanner-safe-edits.md
D  templates/skills/core/shared-repo-git-safety.md
D  templates/skills/core/systematic-debugging.md
D  templates/skills/frontend/ai-slop-design-review.md
D  templates/skills/frontend/frontend-build-verification.md
D  templates/skills/frontend/interface-feel-polish.md
D  templates/skills/frontend/nuxt-e2e-testing.md
D  templates/skills/fullstack/full-system-rehearsal.md
D  templates/skills/github/conventional-commit.md
D  templates/skills/github/github-actions-verification.md
D  templates/skills/github/github-code-review.md
D  templates/skills/github/github-pr-workflow.md
 M test/boundaries.test.js
 M test/catalog-parity.test.js
 M test/core.test.js
 M test/package-managers.js
 M test/reliability.test.js
 M test/rollback.test.js
?? .agentos/runs/2026-09-14-catalog-cleanup-resume.md
?? templates/skills/backend/authorization.md
?? templates/skills/backend/authorization/references/nestjs.md
?? templates/skills/backend/backend-development.md
?? templates/skills/backend/backend-development/references/nestjs.md
?? templates/skills/backend/backend-testing.md
?? templates/skills/core/code-review.md
?? templates/skills/core/code-review/references/backend-review.md
?? templates/skills/core/code-review/references/github-review.md
?? templates/skills/core/code-review/references/security-review.md
?? templates/skills/core/debugging.md
?? templates/skills/core/documentation.md
?? templates/skills/core/git-safety.md
?? templates/skills/core/verification.md
?? templates/skills/frontend/frontend-design.md
?? templates/skills/frontend/frontend-testing.md
?? templates/skills/frontend/frontend-testing/references/nuxt.md
?? templates/skills/fullstack/integration-testing.md
?? templates/skills/github/ci-verification.md
?? templates/skills/github/ci-verification/references/github-actions.md
?? templates/skills/github/commit-messages.md
?? templates/skills/github/commit-messages/references/conventional-commits.md
?? templates/skills/github/pull-request-workflow.md
?? templates/skills/github/pull-request-workflow/references/github.md
?? test/skill-references.test.js
```

## Historical pause note — superseded by status above


Branch: `feat/catalog-cleanup` in worktree `/home/hermes/agentos-catalog-cleanup`, based on `origin/main` (293d975).

## Approved plan (5 slices)
1. Canonical definitions + installation-parity tests.
2. Skill consolidation (20 -> 15 framework-agnostic skills) + improved commit workflow + safety fixes.
3. Agent consolidation and responsibility boundaries.
4. Compatibility aliases and safe migration diagnostics.
5. AgentOS self-install + packed-install verification.

## Status
- **Slice 1: DONE, committed `b983635`.** Independent review PASS; 260/260 tests, 66/66 parity. `src/catalog.ts` makes package Markdown templates the canonical source; summary no longer truncates steps.
- **Slice 2: IN PROGRESS, UNCOMMITTED WIP in the working tree. Full suite NOT green — do not commit as-is.**
  - Done: 20 old skill templates replaced by 15 new framework-agnostic skills
    (core: debugging, test-driven-development, git-safety, verification, documentation, code-review;
    frontend: frontend-design, frontend-testing; backend: backend-development, backend-testing, authorization;
    fullstack: integration-testing; github: pull-request-workflow, commit-messages, ci-verification).
    Optional `references/` written per skill. git-safety absorbed secret-scanner-safe-edits.
    commit-messages rewritten to the read-only generalized workflow. `catalog-parity.test.js` updated and passing (56/56). `bun run build` succeeds.
  - **Remaining before slice 2 can be committed:**
    1. **Substantive:** `skills add` / `templates copy` do NOT yet install skill `references/` files, so the "load references/<name>.md" instructions dangle after install. Implement transacted local install of references (+ parity + removal tests). Preferred over making refs package-only.
    2. Mechanical: ~25 full-suite failures are old skill IDs in `test/core.test.js` (incl. :336, :1041, :1069-70), `test/reliability.test.js`, `test/rollback.test.js`, `test/boundaries.test.js`, `test/package-managers.js`.
    3. Docs: `docs/templates.md`, `docs/quickstart.md`, `README.md`.
    4. Regenerate local `.agentos/skills.md`.
    5. Get full suite green: build, check, catalog-parity, test, smoke, test:package-managers.

## Constraints (unchanged)
- One verified commit per slice; independent review before each commit.
- No consolidation of agents until slice 3; no aliases/migration until slice 4.
- Preserve every safety/completion step; keep summary==full-except-mode invariant.
- Do not touch client workspaces (KargaX/Labahub) or `/home/hermes/agentos-for-projects` original checkout.
- No push/merge/publish without explicit approval. Nothing pushed yet.

## Resume command
Continue slice 2 from the current WIP in this worktree (do not restart from scratch).
