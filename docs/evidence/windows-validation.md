# Native Windows validation (A14)

Goal row A14 ("Native Windows behavior is validated"). Source run: CI run 40302164627 on `1325b56`, job
"Node 24 / windows-latest regression": 803 tests, **47 failed** (8 new on this branch, 39 also failing on main
`7bcca0e`, run 40303523276: 40 failures, one of which this branch had already fixed). Logs (read-only):
`agentos trial/ci-windows-fail.log`, `ci-windows-baseline.log`, `win-branch.txt`, `win-base.txt`.

No Windows machine was available locally. Each fix was reasoned from the CI output and checked on Linux; where
a Windows condition can be reproduced on Linux it was (below). **The PASS/FAIL of A14 is set only from the
next Windows CI run.**

## Triage: 47 failures → (a) 17 product bugs, (b) 25 test-harness assumptions, (c) 5 POSIX-only (win32 skips)

Buckets: **a** = real product bug on Windows, fixed in `src/` with a test; **b** = test assumed POSIX
(mode bits, `/` separators, CRLF from checkout, `chmod` fault injection), rewritten to assert the same
behaviour portably; **c** = genuinely POSIX-only, skipped on `win32` only with a reason. "Origin": `new` = failing
only on this branch, `main` = also failing on main.

| Test | File (at `1325b56`) | Origin | Bucket | Cause | Fix |
|---|---|---|---|---|---|
| doctor --fix rolls back an already-converted adapter and its backup when a later adapter write fails | `adapter-conflicts.test.js:349` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases) |
| init rolls back its ENTIRE mutation set - scaffold, agent/engine/repo files, adapters, and backups - when a later adapter write fails | `adapter-conflicts.test.js:372` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases) |
| apply rolls the whole workspace back when any write fails | `compact-rewrite-apply.test.js:200` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases) |
| compact rollback: runs=false, target=tasks.md, point=before-rename | `compaction-safety.test.js:149` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases) |
| compact rollback: runs=false, target=tasks.md, point=before-sync | `compaction-safety.test.js:149` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases) |
| compact rollback: runs=true, target=tasks.md, point=before-rename | `compaction-safety.test.js:149` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases) |
| compact rollback: runs=true, target=tasks.md, point=before-sync | `compaction-safety.test.js:149` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases) |
| migrate claude --preserve disables active .claude files and patches CLAUDE.md | `core.test.js:844` | main | **a** | `relative(root, dst)` gave `.claude\agents.agentos-legacy-…`; the boundary check (correctly) rejects backslashes | Pass `toPosix(relative(…))` to the check and the output; the test now asserts the `/`-separated `Moved:` line |
| migrate claude --preserve dry-run is non-mutating and requires --preserve | `core.test.js:865` | main | **a** | Same as above (dry run plans the same move) | Same fix |
| D2: from a nested dir, an absolute --cwd inside the workspace is normalized; outside is refused; no --cwd = workspace root | `project-brain-trial-defects.test.js:58` | new | **a** | `--cwd` realpath (long name) compared with the root as reached (8.3 short name) → "outside the workspace" | `checkCwd` realpaths both sides and uses `isWithin`; new test `D2 (A14): … alias …` reproduces it on Linux with a directory link (fails before the fix) |
| obsidian link-workspace rolls back knowledge.md when the project.yaml patch write fails | `rollback.test.js:187` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases) |
| run handoff rolls back the run note and tasks.md rewrite when the final handoff.md write fails | `rollback.test.js:258` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases) |
| compact rolls back handoff/tasks rewrite and archive creation when the last write fails | `rollback.test.js:50` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases) |
| fault injection: a failure while writing the record rolls back every file, the backup and the record | `safe-resync.test.js:279` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed; the final assertion also compared native snapshot keys with `/` paths | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases); expected keys via `join()` |
| add: rollback replacement on .agentos/skills.md | `skill-references.test.js:75` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases) |
| add: rollback replacement on .agentos/skills/core/code-review/references/security-review.md | `skill-references.test.js:75` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases) |
| copy: rollback replacement on .agentos/skills.md | `skill-references.test.js:75` | main | **a** | Rollback tracking: `isDescendantPath` tested `../` only, so on Windows a sibling (`..\x`) of an already-tracked file counted as covered and was never snapshotted; rollback left it changed | `isWithin()` (platform separator) in `src/task-scope.ts`, used by the transaction; regression test `A14: isWithin …` (win32 + posix cases) |
| canonical loader rejects malformed identity metadata and duplicate skill IDs | `catalog-parity.test.js:167` | main | **b** | Parent of the two subtests below (fails when they fail) | `.gitattributes` `* text=auto eol=lf`; reproduced and verified on Linux with an autocrlf=true clone. Product CRLF input stays covered by the CRLF tests |
| init appends the managed block after pre-existing custom content, preserving it byte-for-byte, with one backup | `adapter-conflicts.test.js:78` | main | **b** | Mode bits: Windows keeps only the read-only bit, so `chmod 0o640` reads back as `0o666` | Expect the mode `stat` reported right after `chmod` (still `0o640` on POSIX) |
| writeFileAtomic replaces content correctly and preserves the existing file mode | `atomic-writes.test.js:43` | main | **b** | Mode bits: Windows keeps only the read-only bit, so `chmod 0o640` reads back as `0o666` | Expect the mode `stat` reported right after `chmod` (still `0o640` on POSIX) |
| canonical loader accepts CRLF source cards without losing content | `catalog-parity.test.js:154` | main | **b** | CRLF checkout (`core.autocrlf=true` on the runner): package templates arrived as CRLF; the test's LF→CRLF conversion then produced `\r\r\n` | `.gitattributes` `* text=auto eol=lf`; reproduced and verified on Linux with an autocrlf=true clone. Product CRLF input stays covered by the CRLF tests |
| missing mandate | `catalog-parity.test.js:174` | main | **b** | CRLF checkout (`core.autocrlf=true` on the runner): package templates arrived as CRLF; `/^Mandate:.*\n/m` cannot match `\r\n` | `.gitattributes` `* text=auto eol=lf`; reproduced and verified on Linux with an autocrlf=true clone. Product CRLF input stays covered by the CRLF tests |
| missing summary | `catalog-parity.test.js:174` | main | **b** | CRLF checkout (`core.autocrlf=true` on the runner): package templates arrived as CRLF; `/^summary:.*\n/m` cannot match `\r\n` | `.gitattributes` `* text=auto eol=lf`; reproduced and verified on Linux with an autocrlf=true clone. Product CRLF input stays covered by the CRLF tests |
| returned non-empty patch applies unchanged and reproduces exact bytes | `compact-report.test.js:17` | main | **b** | `git apply` in a temp dir uses the runner's `core.autocrlf=true` and writes CRLF | `git -c core.autocrlf=false apply` (the contract is exact bytes); reproduced on Linux with `GIT_CONFIG_GLOBAL` autocrlf=true |
| returned patches apply unchanged across line-ending and EOF transitions | `compact-report.test.js:31` | main | **b** | `git apply` in a temp dir uses the runner's `core.autocrlf=true` and writes CRLF | `git -c core.autocrlf=false apply` (the contract is exact bytes); reproduced on Linux with `GIT_CONFIG_GLOBAL` autocrlf=true |
| large high-distance replacement stays within a bounded heap and applies exactly | `compact-report.test.js:53` | main | **b** | `git apply` in a temp dir uses the runner's `core.autocrlf=true` and writes CRLF | `git -c core.autocrlf=false apply` (the contract is exact bytes); reproduced on Linux with `GIT_CONFIG_GLOBAL` autocrlf=true |
| compact archive isolates arbitrary Markdown so source fences cannot hide archive targets | `compaction-safety.test.js:190` | main | **b** | `archivePath` is a native absolute path; the test split it on `/` | `path.basename(archivePath)` |
| compact previews deterministic archive links that resolve to exact previous content | `compaction-safety.test.js:67` | main | **b** | `archivePath` is a native absolute path; the test split it on `/` | `path.basename(archivePath)` |
| compact is a write-free no-op on unchanged state and keeps archive chains after edits | `compaction-safety.test.js:85` | main | **b** | `archivePath` is a native absolute path; the test split it on `/` | `path.basename(archivePath)` |
| doctor --json CLI prints parseable JSON only | `core.test.js:588` | main | **b** | Reported root is the cwd as given (`C:\Users\RUNNER~1\…`, 8.3 short name); `realpath` gives the long name | Compare `realpath` of both sides (same directory; still exact on Linux/macOS) |
| prompt includes Obsidian workspace boundary when configured | `core.test.js:765` | main | **b** | The prompt prints the vault folder as a native path (`Projects\KargaX\AgentOS`); the test matched `/` | Match `join('Projects', 'KargaX', 'AgentOS')` |
| skill mode compatibility preserves complete workflows in both modes | `core.test.js:880` | main | **b** | CRLF checkout (`core.autocrlf=true` on the runner): package templates arrived as CRLF | `.gitattributes` `* text=auto eol=lf`; reproduced and verified on Linux with an autocrlf=true clone. Product CRLF input stays covered by the CRLF tests |
| A05/A20: an index note write failure keeps the Brain write and reports the note stale | `project-brain-slice2.test.js:154` | new | **b** | Fault injection by `chmod 0o555` on the note folder: Windows ignores directory mode bits | `blockNote()`: read-only note file on Windows (the atomic rename over it fails), read-only folder on POSIX |
| A12: Obsidian app availability is detected and only advised; setup succeeds without it | `project-brain-slice3.test.js:290` | new | **b** | Fake app named `obsidian` with a `:`-joined PATH; on Windows the product looks up `Obsidian.exe` on a `;`-joined PATH | Create `Obsidian.exe` on win32; join PATH with `path.delimiter` |
| A20: apply survives a broken optional index note: the record is accepted, the note reported stale | `project-brain-slice5.test.js:174` | new | **b** | Fault injection by `chmod 0o555` on the note folder: Windows ignores directory mode bits | `blockNote()`: read-only note file on Windows (the atomic rename over it fails), read-only folder on POSIX |
| Git evidence excludes sensitive/renamed content and handles spaces/newlines | `reliability.test.js:112` | main | **b** | Windows file names cannot contain a newline (ENOENT on create) | On win32 the unusual name is `name with spaces.txt`; POSIX keeps the newline |
| add: orphan custom reference blocks the entire install until explicit replacement | `skill-references.test.js:58` | main | **b** | Mode bits: Windows keeps only the read-only bit, so `chmod 0o640` reads back as `0o666` | Expect the mode `stat` reported right after `chmod` (still `0o640` on POSIX) |
| copy: orphan custom reference blocks the entire install until explicit replacement | `skill-references.test.js:58` | main | **b** | Mode bits: Windows keeps only the read-only bit, so `chmod 0o640` reads back as `0o666` | Expect the mode `stat` reported right after `chmod` (still `0o640` on POSIX) |
| context creates, changes or locks nothing in any mode (whole parent tree, private TMPDIR) | `v1-slice2-context.test.js:234` | main | **b** | Snapshot keys are built with `join` (`ws\.agentos\…`) but deleted with `/` | Delete `join('ws', '.agentos', 'handoff.md')` |
| record carries ids, objective, scope, per-repo branch/HEAD/fingerprint, knowledge refs; the default task id is the objective slug | `v1-slice3-checkpoint.test.js:118` | main | **b** | Reported root is the cwd as given (`C:\Users\RUNNER~1\…`, 8.3 short name); `realpath` gives the long name | Compare `realpath` of both sides (same directory; still exact on Linux/macOS) |
| nested start: context, checkpoint and resume run from inside a child directory and find the parent workspace | `v1-slice7.test.js:217` | main | **b** | Reported root is the cwd as given (`C:\Users\RUNNER~1\…`, 8.3 short name); `realpath` gives the long name | Compare `realpath` of both sides (same directory; still exact on Linux/macOS) |
| doctor reports a 1.0.0 guide as stale; doctor --fix refreshes only the managed block | `workflow-guidance.test.js:75` | main | **b** | CRLF checkout (`core.autocrlf=true` on the runner): package templates arrived as CRLF | `.gitattributes` `* text=auto eol=lf`; reproduced and verified on Linux with an autocrlf=true clone. Product CRLF input stays covered by the CRLF tests |
| writeFileAtomic fails closed under a real filesystem permission fault and leaves no partial file | `atomic-writes.test.js:67` | main | **c** | EACCES via `chmod 0o555` on a directory has no Windows equivalent in Node (directory mode bits are ignored) | Skipped on win32 only; the injected-fault tests in the same file cover cleanup on every platform |
| F9/A07: an unreadable directory holding records is not reported complete; its last-known records are kept | `project-brain-slice2.test.js:192` | new | **c** | `chmod 0o000` cannot make a directory unreadable on Windows; Node has no ACL API | Skipped on win32 only. Windows users: the product treats any non-ENOENT read error (EACCES/EPERM, e.g. an ACL deny) the same way — unreadable, last-known records kept, never read as empty |
| A07: an unreadable directory with no known records is a warning, not missing knowledge | `project-brain-slice2.test.js:227` | new | **c** | `chmod 0o000` cannot make a directory unreadable on Windows; Node has no ACL API | Skipped on win32 only. Windows users: the product treats any non-ENOENT read error (EACCES/EPERM, e.g. an ACL deny) the same way — unreadable, last-known records kept, never read as empty |
| A07: vault folder unreadable vs absent vs empty are reported differently; required records stay Missing | `project-brain-slice2.test.js:249` | new | **c** | `chmod 0o000` cannot make a directory unreadable on Windows; Node has no ACL API | Only the unreadable sub-case is skipped on win32; absent and empty still run on Windows. Windows users: the product treats any non-ENOENT read error (EACCES/EPERM, e.g. an ACL deny) the same way — unreadable, last-known records kept, never read as empty |
| D4: under WSL, obsidian init, link and status also print the Windows path of the vault | `project-brain-trial-defects.test.js:117` | new | **c** | WSL-only behaviour (Linux paths under WSL); `WSL_DISTRO_NAME` set on native Windows has no Linux path to map | Skipped on win32 only; on native Windows the vault path printed is already a Windows path |

## Product bugs fixed (a)

1. **Rollback tracking on Windows** (14 tests). `MutationTransaction.track` skips a path already covered by a
   tracked root; `isDescendantPath` rejected only `../`-prefixed relative paths, so on Windows
   `relative('C:\\ws\\AGENTS.md', 'C:\\ws\\.agentos') = '..\\.agentos'` counted as *inside* `AGENTS.md`. The second
   file was never snapshotted and a failed multi-file write left it changed. Fix: one helper,
   `isWithin(root, candidate, path = node:path)` in `src/task-scope.ts`, now used by the transaction, the brain
   and Obsidian containment checks and `checkpoint --cwd`. Test: `A14: isWithin …` in `test/boundaries.test.js`
   runs the win32 and posix cases on any OS (the old check returns `true` for the win32 sibling case).
2. **D2: absolute `--cwd` vs an aliased root** (1 test). The root is the directory as reached
   (`C:\Users\RUNNER~1\…`, an 8.3 short name); `--cwd` was realpath'd to the long name, so an inside path was
   "outside the workspace". Fix: realpath both sides, then `isWithin`. Test: `D2 (A14): … alias …` in
   `test/project-brain-trial-defects.test.js` reaches the root through a directory link (`junction` on Windows);
   it fails on Linux without the fix and passes with it.
3. **`migrate claude --preserve` backslash boundary path** (2 tests). The legacy target was passed to the
   boundary check as `relative(root, dst)` (`.claude\agents.agentos-legacy-…`), which the check rightly refuses.
   Fix: pass and print the `/`-separated workspace path; the migrate test now asserts the `Moved:` line.

## Line endings

`.gitattributes` (`* text=auto eol=lf`) makes every text file LF in the working tree on every platform. All 259
tracked files were already LF in the index (`git ls-files --eol`), so nothing is renormalized. Templates and
fixtures are package data copied and compared byte-for-byte. User-supplied CRLF input stays supported and tested
(canonical loader CRLF card test, skill removal with CRLF, compact patches across CRLF/LF transitions).

## win32-only skips (c)

| Test | Reason | What Windows users get |
|---|---|---|
| writeFileAtomic fails closed under a real filesystem permission fault … | `chmod 0o555` does not stop file creation on Windows; Node has no ACL API | Same fail-closed cleanup, covered by the injected-fault tests in the same file |
| F9/A07: an unreadable directory holding records … | `chmod 0o000` cannot deny reads on Windows | Any non-ENOENT read error (EACCES/EPERM from an ACL deny) is reported unreadable, with last-known records kept |
| A07: an unreadable directory with no known records … | same | same (warning, not missing knowledge) |
| A07: vault folder unreadable vs absent vs empty … (unreadable sub-case only) | same | absent and empty cases still run on Windows |
| D4: under WSL, … Windows path of the vault | WSL-only: maps Linux paths under WSL | the printed vault path is already a Windows path |

## Verification on Linux (this change)

- Gates on the code commit: `npm run check` 0; `npm test` 805/805 (803 + 2 added tests: `A14: isWithin …`,
  `D2 (A14): … alias …`); `npm run smoke` 0; `node dist/cli.js doctor --json` exit 0, `ok: true`.
- CRLF reproduction: a `git -c core.autocrlf=true clone` before `.gitattributes` failed the same 5 tests as
  Windows (catalog CRLF, malformed metadata + its 2 subtests, skill mode, 1.0.0 guide). After the change, a fresh
  autocrlf=true clone with `GIT_CONFIG_GLOBAL` set to `core.autocrlf=true` passes 805/805.
- `git apply` reproduction: `compact-report.test.js` with global autocrlf=true fails 3 before the change, 0 after.
- D2 reproduction: the alias test fails without the `src/` change and passes with it.

## Not verified locally (needs the Windows CI run)

- The Windows read-only-note fault for A05/A20 and A20 assumes the atomic rename over a read-only file fails
  (`MoveFileEx` → EPERM). If it does not, these two tests will report the note not stale.
- Assertions after the first failing one in each test had never run on Windows; new Windows-only issues may
  appear further down (e.g. the absent/empty part of the A07 vault test).

## Second Windows run: CI run 40307106781 on `09c4c47`

Job "Node 24 / windows-latest regression" (log, read-only: `agentos trial/ci-windows-r2.log`):

- Main suite (`npm test`): **805 tests, 801 pass, 0 fail, 4 skipped**. The 4 skips are the win32-only skips above,
  each printed with its reason: `writeFileAtomic fails closed under a real filesystem permission fault …`,
  `F9/A07: an unreadable directory holding records …`, `A07: an unreadable directory with no known records …`,
  `D4: under WSL, obsidian init, link and status also print the Windows path of the vault`. (The fifth row, the
  unreadable sub-case of the A07 vault test, is skipped inside a test that otherwise runs, so it is not counted.)
  The two "not verified locally" items above therefore pass on Windows: the read-only-note fault reports the note
  stale, and the rest of the A07 vault test passes.
- Smoke passed. The only failing step was `npm run test:metadata` (3 tests, 2 pass, 1 fail):
  `test/package-metadata.js` spawned `npm` directly, `spawnSync npm ENOENT` (on Windows npm is `npm.cmd`, which
  Node only starts through a shell). A test-harness assumption, not a product bug. Fix c947a92: the helper sets
  `shell: true` on win32 only. Checked on Linux (`npm run test:metadata` 3/3, exit 0); the Windows result needs the
  next CI run. ubuntu ×4, macOS and the package job passed on `09c4c47`.
