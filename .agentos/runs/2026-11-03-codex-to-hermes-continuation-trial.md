# Codex → Hermes continuation trial (2026-11-03): passed

- Task id: `reliable-engine-handoffs`. Start: fresh clone at `b62f37f`, repo artifacts only, no chat history.
- Continued from the Codex checkpoint `2026-11-02T21-32-50-521Z-e13c1a39`. Hermes recovered the goal, state and next step, and found the checkpoint `drifted` because it was saved before the branch commits (expected, not a failure).
- Hermes re-ran the stale checks at `b62f37f` (local WSL, Node 26, npm: `check`, `test` 815/815, `smoke`, `test:metadata`, all as `--check` receipts) and saved a clean checkpoint `2026-11-03T07-27-42-525Z-18dc50c7` in its disposable clone (not committed).
- Below the rule is the reconstruction Hermes wrote before changing anything (`01-understanding.md`), copied verbatim. Paths in it refer to the trial host.

---

# 01 — Understanding before any project edit

Clone: `/home/hermes/developer-workspace/handoff-trial-reliable-engine-handoffs/repo`
Branch: `fix/reliable-engine-handoffs` (`git branch --show-current`)
Starting HEAD: `b62f37f5baeae04eb845f959daba79259cd2967e` ("chore: preserve TypeScript check receipt") (`git rev-parse HEAD`)

How I read the project state without changing it: the clone has no `node_modules`/`dist`, so I cloned it again to the sibling
directory `../cli-build`, ran `npm ci && npm run build` there (npm cache redirected to `../.npm-cache` because `~/.npm` is not
writable), and ran `node ../cli-build/dist/cli.js status|resume|context` with cwd = the clone. Afterwards
`git status --short --ignored` in the clone printed nothing, so the clone was untouched. `npm test` was also run in
`cli-build`, not in the clone.

Labels: **[recovered]** = read from the project; **[inferred]** = my interpretation; **[unknown]** = not answerable from the artifacts.

## 1. What was the goal?

- **[recovered]** "Make engine handoffs trustworthy: an engine saves project knowledge and task progress, and another engine can
  inspect current files and continue after a usage limit or interruption. Engine launching, automatic switching and
  chat-session transfer are outside this change." Source: `.agentos/handoff.md` § Current objective; the same text appears in
  the checkpoint record's `objective.text` and in `agentos status`.
- **[recovered]** Acceptance criteria (6 bullets: stale vs current receipts, missing Git evidence never counts, damaged
  checkpoint fails `context --require-complete`, active checkpoint retained or overflow reported, empty Brains visible, all
  bootloaders advise milestone checkpoints and consistent task ids). Source: `.agentos/tasks.md` § Acceptance criteria.
- **[recovered]** Owner decision: cross-engine continuity is the product goal, and the owner starts the next engine by hand.
  Source: `.agentos/decisions.md` § "2026-11-03 — Cross-engine continuity is the product goal"; `knowledge/engine-handoff.md`.
- **[recovered]** Scope: repo `agentos-for-projects` only, baseline `ed3accd` (main, 3.1.1). No version bump or release.
  Allowed changes: continuity implementation, tests, docs, generated adapters, AgentOS state. Source: `.agentos/handoff.md` § Scope.

## 2. What work is already complete?

- **[recovered]** 11 commits on top of `ed3accd` (`b785bc4` … `b62f37f`), 28 files, +799/−126 (`git diff --stat ed3accd..HEAD`).
  They cover src changes (`src/checkpoint.ts`, `src/core.ts`, `src/context-builder.ts`, `src/brain.ts`), a new
  `test/handoff-continuity.test.js`, docs, the Brain records `knowledge/*.md` + `.agentos/brain/index.json`, and the checkpoint.
- **[recovered]** The previous engine says it is done: startup context uses the same reconciliation as resume, active checkpoint
  is mandatory, empty-Brain warnings, milestone guidance in the bootloaders. Source: `.agentos/handoff.md` § Current state;
  checkpoint `progress`.
- **[recovered]** The latest checkpoint is `.agentos/checkpoints/reliable-engine-handoffs/2026-11-02T21-32-50-521Z-e13c1a39.json`
  (engine `codex`, role developer, recorded at HEAD `ed3accd` with 16 *uncommitted* changed paths). Its receipts are
  `npm run check` observed-pass, one `claimed` ("809 passed, 6 skipped …"), and three `not-run` (`bun run build`, `bun run test`,
  `bun run test:package-managers`). Source: the record file + `agentos resume --task reliable-engine-handoffs`.
- **[recovered]** Against the fresh clone, `resume` reports `Reconciliation: drifted` (HEAD moved ed3accd -> b62f37f, fingerprint
  differs, the 16 paths "no longer changed"), and `context hermes --task reliable-engine-handoffs --require-complete` exits 0
  with "Current passing checks: 0". Both prior receipts are marked `[stale (recheck)]`. Source: CLI output in this session.
- **[inferred]** The drift is benign: the 16 paths the checkpoint saw as uncommitted were committed afterwards (commits
  `52ec7b3`…`9166b93` touch exactly those paths), then the checkpoint itself was committed (`9f752b6`, `b62f37f`). So the code is
  probably the same, but no receipt has been observed at the current state.
- **[recovered]** Read-only inspection works: after status/resume/context the clone had no changes. This matches the acceptance
  criterion "read-only inspection changes no files".
- **[recovered]** In my throwaway build copy, at the same HEAD, `npm test` gave `tests 815, pass 815, fail 0, skipped 0` (exit 0).
  This was not recorded through AgentOS, so it is not a receipt yet.

## 3. What still needs verification?

- **[recovered]** No check has an observed pass for the current state. `npm run check` is stale, the test-suite result is only
  `claimed`, and build / test / package-manager checks are `not-run`. Source: `resume` / `context` output above.
- **[recovered]** A real cross-engine continuation trial, plus review and release approval, are still outstanding.
  Source: `.agentos/handoff.md` § Current state + § Next exact action; `.agentos/tasks.md` § Now / § Next.
- **[recovered]** Bun package-manager compatibility was not run locally ("Bun is unavailable; see PR CI"). Source: `.agentos/handoff.md`.
  `which bun` on this host also prints nothing, so I cannot run the declared `bun run …` commands either.
- **[unknown]** Whether PR CI ran on this branch and what it showed. The repo has no CI evidence, and I am not allowed to query the remote beyond clone/fetch.
- **[unknown]** Whether the owner reviewed the change. Handoff says "Review the draft change"; there is no review record.
- **[recovered]** `knowledge/architecture.md` "remains proposed for review". Source: `.agentos/handoff.md` § Current state.

## 4. What should I do next, and why?

- **[recovered]** The saved next action is: "Review the draft change …, then run a real Claude Code → second-engine continuation
  trial using task id `reliable-engine-handoffs`. Inspect current files and re-run stale checks. Do not merge or publish."
  Source: `.agentos/handoff.md` § Next exact action; checkpoint `next`.
- **[inferred]** This session is a second-engine continuation (Hermes developer). The documented step I can complete is
  **re-run the stale and not-run checks at the current HEAD and record them as observed receipts through
  `agentos checkpoint --check`**. Then the next engine sees real current verification instead of
  "Current passing checks: 0". It is also the documented recovery step for drift ("re-run stale checks"
  in `knowledge/engine-handoff.md` § Interrupted work and in the `context` warning).
- **[inferred]** Checks to run are the ones CI runs, using npm because Bun is unavailable: `npm run check`, `npm test`,
  `npm run smoke`, `npm run test:metadata` (`.github/workflows/ci.yml` job `verify`). The declared `bun run …` commands stay
  not-run/unavailable on this host.
- **[inferred]** No source change: I found no defect in the reconciliation. `resume`'s "Next: agentos context codex" uses the
  recorded engine unless `--engine` is passed, which is designed behaviour (`src/checkpoint.ts:490`). A "full review" of the
  change is a large, open-ended step, and the handoff does not say who reviews it, so I will not attempt it here.
- **[inferred]** I will not rewrite the prose in `.agentos/handoff.md` § Current state or `.agentos/tasks.md`. The owner has to
  decide whether this disposable trial counts as "the real continuation trial". The checkpoint updates only its managed section.
