# State before the brain-body-retrieval task

Archived verbatim before rewriting `.agentos/handoff.md` and `.agentos/tasks.md` for task `brain-body-retrieval` (branch `feat/brain-body-retrieval`). Taken at `ddf96c1` (main after PR #73 merged). The managed checkpoint block points at the `unify-current-task-state` record `2026-11-03T09-05-27-224Z-af1f3cdc`, which stays in `.agentos/checkpoints/unify-current-task-state/`.

## .agentos/handoff.md

````markdown
# Handoff

## Current objective

When handoff.md § Next exact action is edited after a checkpoint, `agentos context <engine> --task <id>` presents exactly one current next action, the checkpoint's Next. The edited text stays visible as a labelled not-current note with the command that makes it current. Without a checkpoint, § Next exact action stays the unlabelled current next action.

## Scope

- Repo: `agentos-for-projects`, single-repo workspace.
- Baseline: `46b7090` on main (PR #70 merged), package 3.1.1. Unreleased changes; no version bump or release is requested.
- Branch: `fix/context-next-action-precedence`; task id: `context-next-action-precedence`.
- Allowed changes: context/checkpoint implementation, tests, guide, docs and this repository's AgentOS state. `status`, `resume` and Next truncation are out of scope.

## Current state

- `2b770f3`: RED test in `test/handoff-continuity.test.js` (checkpoint, then an edited § Next exact action); it failed at `46b7090` with the edited text shown as an unlabelled second `## Next exact action`.
- `a74fdc7`: fix. `supersededProse` (`src/checkpoint.ts`) also returns `edited` when § Next exact action no longer matches the record's `supersedes` digest; `src/context-builder.ts` labels it `[edited after checkpoint <id>; not current]` and names `agentos checkpoint --task <id> --next "<this text>"`. An edited § Current state stays unlabelled. Records without `supersedes` (legacy, recovered) label nothing, as before.
- `8aec458`: guide (`guideMd` in `src/core.ts`, regenerated `.agentos/guide.md`, 5370/5376 bytes), docs/checkpoints.md and CHANGELOG state the precedence, with a guide test.
- `bbc0fe7`: Ralph's release-gate acceptance recorded in `.agentos/runs/2026-11-03-claude-code-controlled-interruption-trial.md` (one added line).
- Verification at `bbc0fe7` (local WSL, npm): `npm run check` clean; `npm test` 825/825; `npm run smoke` exit 0; `npm run test:metadata` 3/3. Bun not run (not installed here).
- All commits are local; nothing pushed.
- Not covered yet: tasks.md § Now is not reconciled with the checkpoint.
- Previous state: `.agentos/runs/2026-11-03-before-context-next-action-precedence.md`.

## Next exact action

Phynceon reviews the local commits on `fix/context-next-action-precedence`, then pushes and opens the PR.

## Protected files / do not touch

- Secrets, .env files, migrations and production config.
- `.github/workflows/`, client workspaces, external Obsidian vaults and Hermes configuration.

## Open decisions

- Release version and merge remain separate from this implementation.
- `status` has no `--task`: it uses the newest valid checkpoint by `created_at`; owner may still prefer a `--task` flag.
- Retrieval improvements and Obsidian layout changes remain follow-up work.

<!-- agentos:checkpoint:start -->
## Checkpoint (managed)

- Task: unify-current-task-state
- Record: `.agentos/checkpoints/unify-current-task-state/2026-11-03T09-05-27-224Z-af1f3cdc.json`
- Repos: agentos-for-projects feat/unify-current-task-state@a16062d (0 changed)
- Progress: Phase 1 (context): a checkpoint that saves --next records supersedes digests of handoff.md § Current state and § Next exact action; agentos context marks prose still matching as [superseded by checkpoint <id>] and keeps it as history. RED then GREEN in test/handoff-continuity.test.js (3 new tests).…
- Blockers: none
- Next: In src/core.ts statusAgentOS, print one 'Current next action' line from the newest .agentos/checkpoints/*/current.json record (by updated_at: task id, checkpoint id, its Next), and add a test in test/handoff-continuity.test.js that status shows that Next exactly once after a checkpoint while handof…
- Receipts: observed-pass 2, observed-fail 0, claimed 0, not-run 3, unavailable 0
- Resume: `agentos resume --task unify-current-task-state`
<!-- agentos:checkpoint:end -->
````

## .agentos/tasks.md

````markdown
# Tasks

## Now

- [ ] tasks.md § Now: mark items written before the checkpoint as superseded in `context` and in child-repo `status` ("Open tasks (Now)") (task id `unify-current-task-state`).

## Acceptance criteria

- After `agentos checkpoint --task <id> --next "<action>"`, `agentos status`, `agentos context <engine> --task <id>` and `agentos resume --task <id>` present exactly one current next action: the most recently saved one.
- Older or contradicting next-action text in handoff.md or tasks.md is not presented as current; the next agent can tell it is superseded.
- Nothing is silently deleted.

## Next

- [ ] Next-action truncation in the managed handoff block (300 characters) and `status` across several tasks: tracked separately.

## Later

- [ ] Improve body-text retrieval and separate task identity from task description.
- [ ] Make the default Obsidian layout expose the actual Brain records.
````
