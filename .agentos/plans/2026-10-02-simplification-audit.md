# AgentOS simplification audit — findings, decisions, evidence, queue

Date: 2026-10-02. Baseline: `origin/main` at 0.7.0 (`66707e7`), read-only. Owner request: audit the whole system (architecture, agents, skills, workflows, configuration, conventions, integrations, developer experience) and find what can be removed, merged, generalized or simplified without losing capabilities that provide value.

## Principle

An addition must measurably help or it is net-negative. Deletions ship as "stop generating, tolerate what exists, never delete a user's file". Existing workspaces are rolled out manually by the owner; a generator change marks their adapters stale until `doctor --fix`.

## Baseline (measured on 0.7.0 unless noted)

- Source 6,824 lines (65% in `core.ts`); tests 9,501 lines; 107 commits over ~6.5 weeks; npm 752 downloads in 30 days, 0 stars (the owner's installs and CI are not separable from that).
- Most-edited files in the repo are its own `handoff.md` and `tasks.md`, ahead of any source file.
- Fresh 2-repo workspace: 29 files at 0.7.0. Always-read set (`AGENTS.md`, `project.yaml`, `memory.md`, `handoff.md`, `tasks.md`) about 2.9 KB, roughly 735 tokens.
- Compaction is the largest single mass: about 22% of source, 41% of test lines and 24% of docs. Upgrade/migration machinery is the second.

## What the audit found about real use (names, sizes, mtimes only; nothing modified)

- Both real workspaces use the default catalog unmodified: the four agent cards are byte-identical, skill sets differ by one skill (16 vs 15), the five engine files were identical stubs. The weight is not in the agent/skill catalog.
- KargaX state is the real cost: `handoff.md` 385,274 chars and `tasks.md` 300,898 chars (owner's `compact --dry-run`, 2026-10-02), both modified that day, every engine told to read them first. 32 compact bundles exist there (23 checkpoint, 9 rewrite). After the 0.5.0 apply its recorded live size was 138,398 chars, so about 548K chars accumulated since (inference; dates approximate). Labahub is healthy (6 KB / 3 KB, no compactions).
- `compact` cannot shrink those files: it archives only sections whose heading it recognises as superseded history, never shrinks a canonical live section, and keeps unrecognised headings verbatim. Verified on synthetic fixtures with only the heading varied: `Previous objective — DATE (run N)` archived; `Previous objective - DATE` (ASCII hyphen), `Sprint report`, `Done — DATE` and `Run log` not.
- Correction to the first audit: `status.md` is not dead (KargaX edited theirs 5 days earlier), so it stays.
- Session CLI counts come from development sessions (including this one) and are not owner usage.

## Decisions (owner approved "go with your recommendations", 2026-10-02)

1. Ablate before shipping an addition. Done for the guide; see Evidence.
2. Compaction: add no new heuristics; fix growth at the source. The specific fix waits on KargaX section titles.
3. `templates import` and quarantine: frozen.
4. Deletions in order: engine stubs (done), then `dist/` untracking, then `agentos prompt` after a deprecation. `status.md` stays.
5. Upgrade support horizon — **revised, pending evidence.** Proposed first as "last two minors". Problem found: KargaX and Labahub were rolled out at 0.4.0 (KargaX also ran a 0.5.0 compaction later), so their adapters may predate 0.5; which migration classes they still carry is unknown until their inventories are seen. Revised rule: keep every migration path the owner's workspaces have actually passed through; delete a legacy path only after `agentos doctor --json` in both workspaces shows an all-`noop` migration inventory (the owner runs it). The `app` user has bun-global 0.7.0 and a stale npm-global 0.2.0 shim that can shadow it by PATH order.

## Delivered (all merged, CI green)

| PR | Merge | What | Net effect |
|---|---|---|---|
| #27 | `5abdff4` | `.agentos/guide.md` managed adapter; `status`/`handoff` self-sufficient in a child repo; CLI-first child pointers; no `agentos guide` command | Adds a file and 29 tests; fixes nested OpenCode starts |
| #28 | `208e44a` | Regenerate this repo's own adapters | Fixed red `main`: CI runs `doctor --json` on this workspace and #27 left it stale |
| #29 | `efc260f` | `doctor`/`status` warn over 50,000 chars; `compact --dry-run` lists the largest sections | Read-only visibility |
| #30 | `e2575c6` | Stop generating `.agentos/engines/<engine>.md` | Removes ~25 sites in `core.ts`, 5 files per workspace |

Net since 0.7.0 (tracked source, `dist/` excluded): source +200 lines, tests +792, README +13, CHANGELOG +19. Fresh 2-repo workspace: 29 → 25 files, but 17 KB → 21 KB because the guide adds 3 KB. **The audit has so far added more code than it removed**; the real reductions are the queue below.

## Evidence

Engine-discovery ablation, pre-registered before any run (`PREREG.md`), same scorer for both variants, variant B = the build with every guide piece removed. Archive: `/home/hermes/agentos-archive/2026-10-02-engine-discovery-ablation/` (403 files, sha256-verified, README inside). Results: root right-tool 6/8 with the guide vs 2/8 without (5/8 vs 2/8 counting only completed outcomes); nested grounded answers 8/12 with and without the `agentos guide` command, so the command was dropped and the file kept. One run per cell, free OpenCode models plus Claude Code, synthetic fixture: directional. Codex untested (not installed for the `hermes` user).

## Queue

1. **Pack a `0.8.0` candidate** for the `app` user (six unreleased CHANGELOG entries make it a minor bump). Acceptance: install the exact tarball into a throwaway prefix, `agentos --version` matches, quote the shasum, confirm the target user can read the artifact's directory chain. Publishing is the owner's call.
2. **KargaX listing.** Owner runs `agentos compact --dry-run` with that build and sends the "Largest sections" block. Decides: recognise more heading shapes in `compact` (cheap, bounded) vs change how state is written (overwrite `handoff.md`, history to `runs/`, which is never auto-loaded).
3. **State-growth slice** per that result. Acceptance: a regression fixture shaped like the real section list shrinks; text under protected headings is never lost (byte-exact archive, existing safety tests unchanged).
4. **Untrack `dist/`** (about 39 files). Needs a `prepare` script, a `.gitignore` entry and a README change; the `hermes` user's `agentos` is a symlink into a checkout, so it must still build. Own slice.
5. **`agentos prompt`**: deprecate first (it duplicates the bootloaders and the guide), remove later.
6. **Merges to evaluate after a code read** (not yet read line by line): the three Obsidian entry points into one, `handoff` vs `run handoff`, `templates copy` vs `skills add`, `decisions.md`/`knowledge.md` into `memory.md`, constants in `project.yaml` (`agentos_version` is a constant 0.1).
7. **Upgrade-machinery deletion**, gated on decision 5.

## Not done / unknowns

Code for the merges in item 6 has not been read. Codex untested. The 548K-char growth figure is an inference from two data points. The owner's workspaces' `doctor` migration inventories have not been seen.

## Lessons recorded

CI runs the CLI on this repo's own workspace, so any generator change must be followed by `doctor --fix` here and `node dist/cli.js doctor --json` before the PR (skill `agentos-project-workspaces`, "Release gate").
