# Project Brain goal: real-engine trials (Slice 4)

Source: Phynceon's trial record, 2026-10-26, kept outside the repo in `/home/hermes/developer-workspace/agentos trial/` (`PHYNCEON-TRIAL-RECORD.md`, transcripts `run1.jsonl` and `run2.jsonl`, macOS CI log `ci-macos-fail.log`). Phynceon (the Hermes default profile) ran the sessions because the Developer sandbox has no `claude`, no GitHub credentials, no `/mnt/c` and no persistent tmp. This file is a sanitized summary of that record: trial paths are kept, and nothing personal or secret is included. The rules are the goal's Slice 4 rules: BLOCKED is not PASS, a filesystem edit is never reported as an Obsidian UI trial, and each claim is assigned to one layer.

## Build and host

- **Build under test:** `feat/project-brain` at **b4498f8**. It was packed with `npm pack` and installed with `npm install --prefix "<trial>/prefix"`, and the CLI reported 1.1.0. b4498f8 differs from the pushed PR head 1de2f4b only by the Windows CI matrix line.
- **Host:** WSL2 Linux, not native Linux. Node v26.5.0, npm 11.17.0.
- **Engine:** Claude Code 2.1.310, run non-interactively (`claude -p`) with a fresh session for each run.
- **The trial predates the fixes for D1–D4.** Those fixes (below) change behaviour the sessions used: `--help`, `checkpoint --cwd`, the Obsidian index note and the WSL guidance. The sessions therefore have to be **repeated on the final SHA**. Phynceon will rerun them.

## Fixtures and command

- **Fixtures:** `/home/hermes/developer-workspace/agentos trial/run 1` and `…/run 2`. Each is a git repo containing:
  - a `package.json` (type module; `npm test` runs `node --test`);
  - `src/math.js`;
  - an existing note `docs/notes.md` with the sentinel NOTE-SENTINEL-1;
  - `docs/unrelated.txt` with the sentinel UNRELATED-SENTINEL;
  - a nested directory `tools/nested dir`.

  Each fixture was set up with `agentos init --existing --yes --agents minimal`, with Obsidian absent and unconfigured. `.agentos/memory.md` got a `## Purpose` section containing PURPOSE-SENTINEL-<run>. Everything was committed before the session.
- **Prompt:** identical for both runs (`prompt.txt`). It does not mention AgentOS, the Brain, checkpoints or proposals:
  > Task retry-helper: add a retry(fn, attempts) helper in src/retry.js that calls an async function and retries it up to `attempts` times, rethrowing the last error, with a test in test/retry.test.js. Run the tests. Project decision from the owner, effective now: utility helpers must have zero runtime dependencies, and retries use exponential backoff starting at 10ms.
- **Command:**

  ```
  claude -p "$PROMPT" --permission-mode acceptEdits --allowedTools "Bash(agentos:*)" "Bash(node:*)" "Bash(npm:*)" "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(ls:*)" "Bash(cat:*)" Read Edit Write Glob Grep --max-turns 50 --output-format stream-json --verbose
  ```

  Run 1 started at the project root. Run 2 started in `tools/nested dir`.

## Observations (n = 2 fresh Claude Code sessions)

Each claim belongs to exactly one of five layers:

| Layer | What it means | run 1 (root) | run 2 (nested dir) |
|---|---|---|---|
| **CLI generation** | AgentOS wrote the files an engine can find | `AGENTS.md`, `CLAUDE.md`, `.hermes.md`, `.agentos/*` present | same |
| **Engine discovery** | the engine found and opened them without being told | ran `agentos status` first; read `AGENTS.md`, `project.yaml`, `memory.md`, `handoff.md`, `tasks.md`, `guide.md` | ran `agentos status`; read the root `AGENTS.md` and the same files |
| **Context consumption** | the engine pulled task context through the CLI | `agentos resume --task retry-helper` (clean start, exit 0), then `agentos context claude-code --task retry-helper` | `agentos context claude-code --task retry-helper --role developer` |
| **Instruction-following** | the engine did what the generated instructions ask | `agentos checkpoint --task retry-helper --engine claude-code --role developer … --check "npm run test"` → observed-pass 1; also wrote a run note and rewrote handoff/tasks | checkpoint written; a first checkpoint without `--check` gave observed-pass 0; one attempt failed (D2); the final checkpoint with `--cwd .` gave observed-pass 1 |
| **Enforcement** | AgentOS stops the engine from doing otherwise | **not tested, not claimed.** Permissions came from Claude Code flags, not from AgentOS | same |

**Knowledge proposal (A18, instruction-following layer).** Both sessions staged a proposal **unprompted**:
- run 1: `retry-helper-5b07dcc0a601-decisions.md`;
- run 2: `retry-helper-a5e3bc354385-decisions.md`.

Both proposals have target `brain:decisions`, mode append, and evidence `changed: src/retry.js`, `changed: test/`, `observed-pass: npm run test`. Neither session got an owner reminder. Both first tried `brain propose --task` before a checkpoint existed and were refused (`NOTHING STAGED`, exit 1). Each then wrote a checkpoint and staged. The trigger was the bootloader, the guide and the checkpoint output. It is instruction-following, not a runtime hook. **Result: 2/2.**

**Task result.** 5/5 tests passed in each run, and nothing was committed.

**Sentinels.** `git status --short docs` was empty in both runs: the existing note and the unrelated file were not touched.

## Defects found and fixed

| ID | Observed on b4498f8 | Fix | Fix SHA | Test (RED on b4498f8 → GREEN) |
|---|---|---|---|---|
| D1 | `agentos checkpoint --help`, `agentos brain --help` and `agentos brain propose --help` print `Unknown option: --help` (exit 1). Both sessions tried it, then fell back to `agentos --help \| grep`. | One shared check in `src/cli.ts`, before option parsing: `--help` or `-h` anywhere before `--` prints that command's lines of the global help (for `brain`, the detailed `BRAIN_USAGE`), exits 0 and runs nothing. | 58f83df | `project-brain-trial-defects.test.js` › "D1: --help and -h on every command …" (all 19 commands × both flags, `brain propose --help`, `init --help` writes nothing) |
| D2 | From the nested dir, `checkpoint … --check "npm run test" --cwd "<absolute workspace root>"` fails with `Unsafe boundary path; expected a workspace-relative path`. The same command with `--dry-run` had accepted the path and echoed it, so dry run and real run disagreed. The `observed-pass 0` checkpoint in run 2 had no `--check` at all (the transcript shows the session dropped it). The check was not misattributed. | `checkCwd` in `src/checkpoint.ts`, applied to every check before dry run or execution: a relative `--cwd` is workspace-root-relative from any directory (no `--cwd` = root). An absolute path inside the workspace is resolved with `realpath` and recorded workspace-relative. A path outside the workspace, or a relative one with `..`, is refused, with `--dry-run` too. Documented in `docs/checkpoints.md`. | 1bb5878 | › "D2: from a nested dir, an absolute --cwd inside the workspace is normalized; outside is refused; no --cwd = workspace root" (observed-pass receipt recorded from the nested dir) |
| D3 | `obsidian init` creates `knowledge/` as the preferred vault, but the default Brain records are `.agentos/brain/*.md` and `.agentos/decisions.md`. Their `../.agentos/…` links leave the vault, so Obsidian cannot show or edit them. Only records registered inside `knowledge/` are visible in the app. | Option (a), smallest honest fix. The generated index block marks every record outside the vault folder with `— outside this vault: edit in your editor`, plus one sentence explaining that Obsidian shows only records inside the vault folder and how to keep a record editable there: `agentos brain register <vault folder>/<note>.md`, in place. No relocation, no copies, no symlinks: one editable file per record. The external-vault navigation note no longer suggests that `obsidian init` makes the default records editable. | 24ebce4 | › "D3: the vault index marks records outside the vault folder; a record registered inside it is not marked; no copies" |
| D4 | Under WSL, `obsidian init` prints `"Open folder as vault" → /mnt/c/_/agentos-trial/obs project/knowledge`, a path a Windows Obsidian cannot open. | `wslWindowsPath` and `wslLine` in `src/core.ts` do explicit string mapping, with no `wslpath` exec: `/mnt/<d>/rest` → `<D>:\rest`, and other absolute paths → `\\wsl$\<distro>\rest` (`WSL_DISTRO_NAME`). The mapping applies only under WSL (`WSL_DISTRO_NAME`, or `microsoft` in `/proc/sys/kernel/osrelease`). `obsidian init` and `obsidian link` add `Windows path (WSL): …`, and `obsidian status` adds `Vault Windows path (WSL): …`. A Linux-side path with no distro name is not mapped. Documented in `docs/obsidian.md`. | 637de61 | › "D4: wslWindowsPath maps …" (unit), › "D4: under WSL, obsidian init, link and status also print the Windows path of the vault" |

The tests were committed in bc849ad. RED evidence: the five D1–D4 tests run against the b4498f8 build gave `fail 5, pass 0`. GREEN: all five pass on the final build.

**Post-fix replay (CLI layer only, not an engine session).** The replay ran on a disposable copy of the `run 2` fixture in `/tmp`; the trial folder was not touched. From `tools/nested dir`:
- `checkpoint --help` exits 0 and prints usage;
- `checkpoint --task replay --check "npm run test" --cwd "<abs root>"` records `observed-pass 1` with `cwd .`;
- `--cwd "<abs root>/.." --dry-run` exits 1 with `outside the workspace`.

After `obsidian init` and `brain index`, all four default records in `knowledge/index.md` are marked as outside the vault. `WSL_DISTRO_NAME=Ubuntu obsidian status` prints `Vault Windows path (WSL): \\wsl$\Ubuntu\tmp\…\run 2\knowledge`.

## macOS CI (not a product defect)

CI run 40295214967 on 1de2f4b failed only the job "Node 24 / macos-latest regression". Two tests were affected:
- `F8/A06: root and nested invocations resolve the same binding`;
- `A10: one Brain per workspace…`.

Both compared output against the `mkdtemp` path `/var/folders/…`. The CLI correctly prints the canonical root `/private/var/folders/…`: `process.cwd()` is the realpath, and earlier tests already assert that. Fix ebe9b6f: the two tests now compare against `realpathSync` of the fixture root. The failure was reproduced locally by pointing `TMPDIR` at a symlink: both tests fail on b4498f8 and pass after the fix. The full suite (802 tests) also passes with `TMPDIR` pointed at a symlink, the macOS condition, so no other test has the same pattern.

## Obsidian GUI fixture (A15/A17), awaiting the owner

Phynceon prepared `/mnt/c/_/agentos-trial/obs project` (Windows `C:\_\agentos-trial\obs project`) and ran `obsidian init` on it, giving `knowledge/` with canonical: workspace. Sentinels: `knowledge/.obsidian/app.json` and `knowledge/Unrelated.md`. `knowledge/design.md` was registered as `brain:design` and changed by an agent through `brain propose --task gui-trial` plus `brain apply`. The owner's checklist is `C:\_\agentos-trial\OWNER-STEPS.md`. **No Obsidian app step has been run.** Every Obsidian claim above is a filesystem fixture, not a UI trial.

## Not done in this trial

- **Codex leg and Hermes leg of A16:** NOT STARTED (Codex quota; Phynceon runs them).
- **Native Windows (A14):** the CI job was committed in b4498f8 but not run, because pushing `.github/workflows/ci.yml` needs a token with `workflow` scope (owner action).
- **Enforcement:** not tested at any layer.
