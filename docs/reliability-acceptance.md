# Reliability contracts and acceptance

This change completes the repository-level reliability scope of discovery recommendations R1–R10. It does not resume the held engine runner, installation wizard, worktree lifecycle, or automatic provider switching. Real-engine ingestion remains a separate acceptance gate: generated pointer tests cannot establish that an external engine actually follows instructions.

## Observable contracts

| Recommendation | Implemented contract | Regression evidence |
| --- | --- | --- |
| R1 continuity | Handoff appends pause metadata without replacing original tasks/handoff bytes or claiming completion; run notes have exclusive unique names; Git failures are visible. | `test/reliability.test.js`: CRLF/custom context, frozen-clock uniqueness, Git errors; existing atomic and compact tests |
| R2 topology | Directory identity is separate from framework/type; collisions fail before writes; empty and one-child detection works; nested pointers resolve to the workspace root. Existing YAML stays authoritative; `init --refresh` adds discovered repos without removing configured repos or replacing custom commands. | topology, nested pointers, re-init, refresh tests |
| R3 intent | Boolean flags never consume positional IDs; unknown commands/options fail. Dry-run overrides acceptance and performs no writes. Changed agent/skill cards need `--replace`; init previews its scaffold and adapter conflicts. | CLI, preview, replacement tests |
| R4 consistency | Doctor checks root and child repo metadata; repair recreates missing owned parents; imported roles register in YAML; adapter policy is enforced. | root doctor/repair, import registration, disabled pointers tests |
| R5 boundaries | Git paths use NUL delimiters; sensitive-path diff contents are omitted; subprocesses and HTTP requests are bounded; literal source uses safe fences; accepted imports can require a reviewed SHA256. | unusual paths/rename, HTTP limits, reviewed hash and fenced source tests |
| R6 recovery | Claude migration preflights targets, previews without creating directories, and rolls back tracked renames/writes on in-process failure. | migration dry-run/fault test plus existing migration tests |
| R7 catalogs | Built-in catalog, file registry, and installed state are explicitly distinguished; validation checks real required sections outside fences. | installed customization/activation and all registry cards validation |
| R8 delivery | Packed installs execute mutations under npm, pnpm, and Bun; missing managers fail verification. CI covers Linux Node 20/22/24/26 and macOS Node 24. | `test/package-managers.js`, `.github/workflows/ci.yml` |
| R9 ownership | Cooperating mutators acquire an exclusive workspace lock before reading/planning and release it after success or failure. | cross-process lock/recovery test |
| R10 cost | Existing directories are not recursively snapshotted just to ensure they exist. Markdown, CLI options, Git evidence, HTTP imports, and locking have typed modules. | inaccessible-history regression; `test/history-benchmark.js` |

## Safety and recovery

`.agentos-write.lock` is an exclusive lock for cooperating AgentOS commands. It does not lock editors, older AgentOS versions, Git operations, or external engines. A second writer fails immediately with owner information. The lock is not automatically stolen: after a crash, confirm the reported process/host is no longer writing, inspect workspace state, preserve any recovery evidence, and only then remove the stale lock manually. PID reuse and remote-host ownership mean a PID alone is not proof that deletion is safe.

Atomic replacement protects individual files. Multi-file rollback handles caught in-process failures; it is not a durable transaction journal and cannot guarantee all-or-nothing recovery after power loss or forced termination. Migration backups remain in `.claude/*.agentos-legacy-<timestamp>` destinations shown by the migration plan; inspect the actual backup paths before manually restoring native files. Do not overwrite newer edits during recovery.

`agentos run handoff` records a pause, not task completion. It preserves original text even if an unclosed fence makes the appended metadata render as code. Inspect the run file directly in that case. Skill removal retains unrelated prose and fenced examples; native engine copies remain untouched.

Handoff excludes common environment, credential, private-key, and production paths from diff snippets. Additional workspace-relative paths can be declared in `.agentos/project.yaml`:

```yaml
handoff:
  exclude_paths:
    - sensitive
    - internal/customer-export.json
```

This is path filtering, not secret detection. File names and diff statistics may still appear. Review notes before sharing: sensitive values in an ordinary source file cannot be inferred from its path. Untracked file contents are not collected. Git commands have a five-second timeout and one-MiB output limit; capture failures are surfaced, not presented as a clean working tree.

Remote template fetches permit HTTP(S), at most five redirects, a 15-second total deadline, and 100,000 bytes. URL credentials and HTTPS-to-HTTP redirects are rejected. HTTP content is unauthenticated; prefer HTTPS or a local reviewed file. Preview prints the source SHA256. Apply using `--yes --expected-sha256 <reviewed-hash>` to reject changed source. `--yes --dry-run` stays read-only, including blocked imports. A blocked accepted import may persist quarantine evidence but never activates the card.

## Catalogs and configuration

`agents list` and `skills list` describe built-in sources. `templates list` describes the file registry; these are deliberately distinct surfaces, not guaranteed equivalent versions. `agents list --installed` and `skills list --installed` inspect workspace cards, compare known source content, and label unmatched content `custom-or-imported`; that label does not infer provenance. Agent inventory also reports activation in YAML. Files under `templates/schemas/` are examples, not executable validators.

Adapter policy accepts `child_repo_pointer_files: true|false` and `child_repo_gitignore_policy: ignore|none`. Disabling pointers stops their generation/repair; it does not delete existing user-visible files. Re-init retains the existing agent profile; use explicit agent additions or review YAML separately to change selection. Refresh is additive discovery, not automatic reconciliation/deletion.

Obsidian relinking preserves custom knowledge prose and replaces only its marked configuration. Ambiguous markers fail closed. Noninteractive linking requires a vault path (or the supported environment setting); it does not choose a personal vault. External vault ingestion is not performed.

## Verification procedure

Run `bun run release:check`, `bun run test:metadata`, `bun pm pack --dry-run`, `node dist/cli.js doctor --json`, and `git diff --check`. Keep committed `dist/` synchronized with `src/`. Package verification requires all three managers and network access for their isolated installs. Run `bun run benchmark:history` for an advisory 500-file, 57-MB history fixture; timings are machine-dependent and are not a performance guarantee.

For each supported external engine, perform an owner-observed smoke in a disposable initialized workspace, first from the root and then a nested child: ask it to identify the root, assigned repo scope, allowed engine, selected agent card and one on-demand skill; verify actual cited paths and that unassigned repo/vault content was not loaded. Record engine version and pass/fail evidence. This manual gate has not been executed by automated CLI tests. Windows behavior is not covered by the current matrix.
