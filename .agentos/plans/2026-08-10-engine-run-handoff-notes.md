# Engine Run Handoff Notes Implementation Plan

> **For Hermes:** Planning only. Implement later task-by-task on a feature branch. Do not auto-switch engines; AgentOS only prepares handoff artifacts and the human chooses what happens next.

**Goal:** Add an AgentOS run-handoff feature that answers: what exactly did the engine finish, what changed, what remains, and how should a human or next engine continue safely.

**Architecture:** AgentOS remains the orchestrator/run manager while Claude Code, OpenCode, Codex, and Hermes are workers. The first production-ready version adds a manual `agentos run handoff` command that writes engine-neutral handoff notes from supplied run context plus local git/file state. It does not launch another engine, does not close terminals, and does not modify app source.

**Tech Stack:** Node.js CLI, TypeScript, existing `src/cli.ts` and `src/core.ts`, Node `fs/path/child_process`, Node test runner, existing AgentOS `.agentos/runs/`, `.agentos/tasks.md`, and `.agentos/handoff.md` conventions.

---

## Product Decision

The feature is **handoff notes only**, not automatic engine switching.

AgentOS should not do this:

```text
Claude quota low → automatically open OpenCode
```

AgentOS should do this:

```text
Engine risk detected before hard failure → write proactive handoff note → capture status/diff → update AgentOS state → human chooses next step
```

This applies generally to Photobooth, KargaX, AgentOS itself, and future projects.

Important refinement from Ralph: the best handoff is written **before** the engine fully hits its usage limit. Once the engine is exhausted, it may not be able to summarize its own work. AgentOS should therefore support proactive handoff triggers when quota/rate-limit/provider-risk signals appear, while still supporting recovery handoff after a hard failure.

## User Problem

When Claude Code, OpenCode, Codex, or Hermes stops because of usage quota, rate limit, provider error, or manual pause, Ralph needs a reliable answer to:

1. What did the engine finish?
2. What files changed?
3. What remains incomplete?
4. What verification was run?
5. What risks or unknowns remain?
6. How should the next human/engine continue safely?

Today this is manual and fragile. A model can hit quota before summarizing, and another engine may restart from scratch or misunderstand partial work.

Critical correction: once an engine has fully hit its usage limit, that engine may be unable to write anything. Therefore the production-ready feature cannot depend on the stopped engine writing the handoff. AgentOS must be able to generate a **recovery handoff** from local ground truth: git status, diff stat, changed files, existing run prompts/notes, known role/repo/worktree metadata, and any user-provided stop reason. If the engine can still write a final summary before exhaustion, that summary is a bonus input, not a requirement.

## Non-Goals

- No automatic engine switching.
- No automatic OpenCode/Codex/Claude launch.
- No terminal/process management.
- No killing or closing the current engine.
- No automatic commits, pushes, merges, PRs, or worktree cleanup.
- No destructive Git commands.
- No app source edits.
- No full build/test/QA during handoff by default.

## User-Facing Command

Add:

```bash
agentos run handoff
```

Useful flags:

```bash
agentos run handoff \
  --engine claude-code \
  --role backend-engineer \
  --repo photobooth-be \
  --worktree worktrees/photobooth-be__feat-event-template-system \
  --phase event-template-system \
  --reason quota-limit
```

Minimal/manual form:

```bash
agentos run handoff --reason manual-pause
```

Dry-run:

```bash
agentos run handoff --reason quota-limit --dry-run
```

Output should include:

```text
Handoff written: .agentos/runs/2026-08-10T143000Z-backend-engineer-event-template-system-handoff.md
AgentOS state updated: .agentos/tasks.md, .agentos/handoff.md
Next: choose whether to wait, resume same engine, or continue manually with another engine.
```

## Handoff File Naming

Use flat `.agentos/runs/` files for v1:

```text
.agentos/runs/<timestamp>-<role>-<phase>-handoff.md
```

Examples:

```text
.agentos/runs/2026-08-10T143000Z-backend-engineer-event-template-system-handoff.md
.agentos/runs/2026-08-10T143000Z-frontend-engineer-event-template-system-handoff.md
.agentos/runs/2026-08-10T143000Z-event-template-system-phase-handoff-summary.md
```

## Handoff Note Template

Each handoff note must include:

```md
# Engine Run Handoff — <Role> / <Phase>

## Stop reason

- Engine:
- Reason: quota-limit | rate-limit | provider-error | manual-pause | completed | unknown
- Confidence: user-reported | parsed-output | exact | unknown
- Timestamp:

## Scope

- Workspace:
- Repo:
- Worktree:
- Branch:
- Role:
- Phase/task:
- Protected paths:

## What the engine finished

- <bullets, from user/engine summary if provided>

## What changed

### Git status

```text
<git status --short --branch>
```

### Diff stat

```text
<git diff --stat>
```

### Changed files

- <file list>

### Relevant diff snippets

```diff
<small targeted snippets, not full huge diff>
```

## What remains

- <remaining work / assumptions / TODOs>

## Verification

- Commands run:
- Results:
- Commands not run and why:

## Risks and caveats

- <risks>

## Safe continuation instructions

Before editing, the next human/engine must run:

```bash
git status --short --branch
git diff --stat
git diff
```

Rules:

- Continue from existing worktree; do not restart from scratch.
- Preserve existing diffs unless clearly wrong.
- Do not reset, clean, delete, commit, push, merge, or remove worktrees unless explicitly approved.
- If switching engines, read the relevant `.agentos/engines/<engine>.md` adapter first.
```

## Phase-Level Summary Rule

If multiple workers are affected, write:

1. one role handoff per role/worktree;
2. one short phase-level summary.

Default for a single worker: role handoff only.

Phase summary should link role handoffs and call out cross-repo contract risks.

## State Updates

`agentos run handoff` should update:

```text
.agentos/tasks.md
.agentos/handoff.md
```

Rules:

- The AgentOS runner/orchestrator updates canonical state, not implementation agents.
- State update is concise.
- Mark the task as paused/handoff-ready, not done.
- Preserve existing on-hold release/worktree plan state.

Example `.agentos/tasks.md` entry:

```md
## Now

- [ ] Phase 2 backend paused after Claude quota limit; handoff written at `.agentos/runs/...handoff.md`.
```

Example `.agentos/handoff.md` entry:

```md
## Current state

- Backend engineer paused because Claude quota limit was reached.
- Partial work is preserved in `worktrees/...`.
- Handoff note: `.agentos/runs/...handoff.md`.
- Next step: Ralph chooses wait/resume/switch engine; no auto-switching.
```

## Git Inspection Behavior

V1 should capture quick, safe Git state only:

```bash
git status --short --branch
git diff --stat
git diff --name-only
git diff -- <changed file> # relevant snippets only, bounded
```

Do not run:

```bash
git reset --hard
git clean -fdx
git checkout
git commit
git push
git worktree remove
```

## Relevant Diff Snippet Policy

Include bounded snippets, not full huge diffs.

Suggested defaults:

```text
max files with snippets: 8
max lines per file snippet: 80
max total snippet chars: 12000
```

If diff is too large, include:

```text
Diff too large for handoff. Next engine must inspect directly with `git diff`.
```

## Implementation Plan

### Task 1: Add CLI routing for `agentos run handoff`

**Objective:** Make the CLI recognize `run handoff` without changing any behavior yet.

**Files:**

- Modify: `src/cli.ts`
- Modify: `src/core.ts`
- Test: `test/core.test.js` or new focused CLI/core test file

**Steps:**

1. Add a `run` command branch in `src/cli.ts`.
2. Parse subcommand `handoff`.
3. Parse flags:
   - `--engine`
   - `--role`
   - `--repo`
   - `--worktree`
   - `--phase`
   - `--reason`
   - `--dry-run`
4. Call a new core function like `runHandoffAgentOS(...)`.
5. If subcommand is unknown, print usage:

```text
Usage: agentos run handoff [--engine name] [--role role] [--repo repo] [--worktree path] [--phase slug] [--reason reason] [--dry-run]
```

**Verification:**

```bash
bun run test
node dist/cli.js run
node dist/cli.js run handoff --dry-run --reason manual-pause
```

Expected: command is recognized and returns dry-run output.

### Task 2: Define handoff input/result types

**Objective:** Add typed core interfaces for handoff generation.

**Files:**

- Modify: `src/core.ts`
- Test: `test/core.test.js`

**Suggested types:**

```ts
export type RunHandoffReason =
  | 'quota-limit'
  | 'rate-limit'
  | 'provider-error'
  | 'manual-pause'
  | 'completed'
  | 'unknown';

export interface RunHandoffOptions {
  cwd: string;
  engine?: string;
  role?: string;
  repo?: string;
  worktree?: string;
  phase?: string;
  reason?: RunHandoffReason | string;
  dryRun?: boolean;
}
```

**Verification:**

```bash
bun run check
```

Expected: TypeScript passes.

### Task 3: Resolve workspace and worktree path safely

**Objective:** Determine the workspace root and target Git worktree without guessing dangerously.

**Rules:**

- If `--worktree` is provided, resolve relative to workspace root or cwd.
- If not provided, use `cwd`.
- The resolved path must exist.
- It must be inside the workspace or explicitly equal cwd.
- If Git commands fail because of safe-directory/dubious ownership, show the exact Git message and do not pretend status is known.

**Files:**

- Modify: `src/core.ts`
- Test: `test/core.test.js`

**Verification:**

Create temp fixture worktree-ish folders in tests; do not require real worktrees for unit tests.

### Task 4: Capture quick Git state

**Objective:** Implement safe read-only Git inspection.

**Commands to run from target worktree:**

```bash
git status --short --branch
git diff --stat
git diff --name-only
git branch --show-current
```

**Files:**

- Modify: `src/core.ts`
- Test: `test/core.test.js`

**Rules:**

- Never run mutating Git commands.
- Capture command failures as text in the handoff note.
- If not a Git repo, write a handoff note that says Git state unavailable.

**Verification:**

Unit test with a temporary Git repo:

1. initialize repo;
2. commit baseline;
3. modify one file;
4. call core function in dry-run;
5. assert status/diff stat includes modified file.

### Task 5: Generate bounded relevant diff snippets

**Objective:** Include helpful snippets without bloating the note.

**Approach:**

- Run `git diff -- <file>` for changed files.
- Include only first N files and bounded lines/chars.
- Redact or omit suspicious secret-looking lines if simple detection exists; otherwise document that secret scanning is future work.

**Files:**

- Modify: `src/core.ts`
- Test: `test/core.test.js`

**Verification:**

Test large diff truncation and output marker:

```text
[diff truncated]
```

### Task 6: Render the engine-neutral handoff markdown

**Objective:** Produce the final note content.

**Files:**

- Modify: `src/core.ts`
- Test: `test/core.test.js`

**Required sections:**

- Stop reason
- Scope
- What the engine finished
- What changed
- What remains
- Verification
- Risks and caveats
- Safe continuation instructions

**Initial content limitations:**

Since AgentOS may not know the engine's private reasoning, the note should be honest:

```text
AgentOS generated this handoff from disk state and supplied run metadata. If the engine did not provide a final summary, treat completion details as unknown and inspect diffs before continuing.
```

### Task 7: Write the handoff file under `.agentos/runs/`

**Objective:** Persist the note in the workspace.

**Files:**

- Modify: `src/core.ts`
- Test: `test/core.test.js`

**Rules:**

- Create `.agentos/runs/` if missing.
- Filename includes timestamp, role or `run`, phase or `task`, and `handoff`.
- In `--dry-run`, do not write; print planned path and preview.

**Verification:**

Test real write creates a file; dry-run does not.

### Task 8: Patch `.agentos/tasks.md` and `.agentos/handoff.md`

**Objective:** Record the handoff in canonical AgentOS state.

**Files:**

- Modify: `src/core.ts`
- Test: `test/core.test.js`

**Rules:**

- Keep updates concise.
- Do not duplicate `## Now` headings.
- If files are missing, create minimal standard files.
- Preserve existing content as much as possible.
- In dry-run, show planned state changes.

**Suggested update style:**

```md
- [ ] `<role>` paused after `<engine>` `<reason>`; handoff: `.agentos/runs/...handoff.md`.
```

### Task 9: Add phase-level summary support

**Objective:** Support multi-worker handoff without overcomplicating v1.

**Scope for v1:**

- Add `--phase-summary` flag only if easy; otherwise document as follow-up.
- Simpler v1 may generate one role handoff per command and let orchestrator run a separate summary manually.

**Recommendation:**

Keep v1 focused on one role/worktree per command. Add phase summary in the second implementation slice.

### Task 10: Add docs and examples

**Objective:** Document the safe manual workflow.

**Files:**

- Modify: `README.md`
- Possibly create: `docs/run-handoff.md` if docs folder exists later
- Modify: `.agentos/engines/*.md` only if needed to mention handoff behavior

**Docs must say:**

- AgentOS does not auto-switch engines.
- Handoff notes are for human/manual continuation.
- Replacement engines must inspect git status/diff first.
- Do not reset/clean/commit/push unless approved.

### Task 11: Verification matrix

**Objective:** Run complete project checks.

Commands:

```bash
bun run check
bun run test
bun run smoke
bun run test:package-managers
npm pack --dry-run
```

Also dogfood in a temp repo:

```bash
mkdir -p /tmp/agentos-handoff-smoke
cd /tmp/agentos-handoff-smoke
git init
echo hello > file.txt
git add file.txt
git commit -m 'chore: baseline'
echo change >> file.txt
agentos run handoff --reason manual-pause --engine claude-code --role implementation --phase smoke
```

Expected:

- `.agentos/runs/*handoff.md` exists.
- note includes git status/diff stat.
- tasks/handoff updated.
- no app/source file modified except AgentOS state files.

## Suggested First Slice

Implement only this first:

```text
agentos run handoff --reason manual-pause --dry-run
agentos run handoff --reason manual-pause
```

With:

- single worktree/cwd support;
- quick Git state;
- handoff note write;
- tasks/handoff update;
- no phase summaries yet;
- no usage detection yet;
- no engine launching.

This solves the real problem without becoming another giant orchestration feature.

## Risks

- Handoff generated from disk cannot know the engine's hidden reasoning.
- Diff snippets may omit important context if too aggressively truncated.
- Patching markdown state can duplicate or misplace bullets if not tested.
- Git dubious-ownership errors can block status capture under WSL multi-user setups.
- Future engine-specific continuation commands may tempt auto-switching; keep v1 human-driven.

## Open Questions

1. Should `agentos run handoff` accept a free-text `--summary-file` from the engine's own final summary?
2. Should it support `--from-log <file>` to parse terminal logs later?
3. Should phase-level summary be part of v1 or second slice?
4. Should lock files exist later, or is a handoff note enough for the no-auto-switch model?

## Completion Criteria

The feature is complete when:

- `agentos run handoff` works from a normal repo/worktree.
- It writes a clear `.agentos/runs/*handoff.md` note.
- It updates `.agentos/tasks.md` and `.agentos/handoff.md` accurately.
- It performs only read-only Git inspection.
- It never launches another engine.
- It never commits/pushes/merges/cleans/resets.
- Full AgentOS verification commands pass.
