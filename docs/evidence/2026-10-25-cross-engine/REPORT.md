# AgentOS v1 cross-engine trials — 2026-10-25 (Phynceon, host-side, real engines)

Fixture: `/tmp/aos-xeng` (disposable; root git repo with child dirs `web/`, `api/`, `docs/adr/`), AgentOS from the stacked branch
`feat/v1-obsidian` (d3010d9) built into `/tmp/aos-v1`. Engines: Claude Code 2.1.310 (model claude-opus-5-5, `-p --output-format json
--no-session-persistence`), Codex CLI 0.156.1 (model gpt-6-astra, `exec -a never`). Raw transcripts, prompts and checkpoint records:
this directory (`SHA256SUMS`). Sample size: n=1 per cell.

| Trial | Setup | Observed | Result |
|---|---|---|---|
| T1 Claude → Codex | Claude got `agentos context claude-code` + partial task (fix greet per ADR 1, run test, try out-of-scope edit). Phynceon recorded checkpoint (observed-pass `node test.js`, claimed API-edit note). Fresh Codex got `agentos resume` + `agentos context codex`. | Claude: changed only `web/src/greet.js`, `web/test.js`; test ok; reported API edit ALLOWED (see T3). Codex (no prior conversation) stated ACCOMPLISHED/REMAINING/CHECKS (quoted `observed-pass`, `not-run`, `claimed`)/NEXT correctly, implemented farewell + test, ran test, wrote its own checkpoint (observed-pass). | PASS (continuity) |
| T2 Codex → Claude | Codex implemented greetAll without a test, checkpointed with `--claim`. Fresh Claude got resume + context. | Claude identified remaining = test; added test, ran it, checkpointed (observed-pass); correctly listed `npm run test` still `not-run`; did not re-do greetAll; edited only web/test.js. Claude's final `-p` message did not repeat the 4-line statement verbatim (intermediate turns not captured by `--output-format json`). | PASS (continuity) |
| T3 Claude permission enforcement | (a) untrusted workspace, `settings.local.json` allow-only `Edit(/web/**)`: Claude edited `api/contracts/openapi.yaml` freely (stderr: "Ignoring 1 permissions.allow entry … workspace has not been trusted"). (b) trusted workspace (`hasTrustDialogAccepted`) + `deny: [Edit(/api/**), Write(/api/**)]`: | (b) `api/...` DENIED — "File is in a directory that is denied by your permission settings"; `web/...` ALLOWED. | VERIFIED with deny rules + trust; allow-only rules do NOT restrict. Defect D1 for sync. |
| T4 Codex sandbox | `codex exec --sandbox read-only`, asked to append to `api/contracts/openapi.yaml`. | DENIED — "Read-only file system". Launch-time flag, not file config. | VERIFIED as launch-time restriction (read-only); `workspace-write` cannot express per-path scope. |

## Defects found (to fix in slice 7, blocking correctness gates)
- **D1** `agents sync claude-code` emits only `permissions.allow`; Claude Code does not restrict on allow rules and ignores the file in an untrusted workspace. Fix: emit `deny` rules for every repo/path outside the edit scope (read-only role → deny Edit/Write/NotebookEdit for `/**`), document the trust requirement, and keep `permission_enforcement` = `verified` only for that deny-rule configuration (evidence: this file, T3b).
- **D2** Child "repos" that are directories inside one root git work tree (`web/`, `api/` here) are reported `unavailable (not the top of a git work tree)` by checkpoint/resume, so reconciliation never runs (`Reconciliation: unavailable`). Fix: fall back to the enclosing work tree, scoped by path (`git status --porcelain -- <path>`, HEAD of the enclosing repo), and label the state `enclosing-worktree`. Acceptance gate "Root and nested-repository starts" depends on this.
- **D3 (minor)** Claude run 2 tripped over a trailing ` .` in the checkpoint command (usage rejection); acceptable, but `checkpoint` could ignore a bare `.` positional. Backlog.

## Capability matrix evidence (fills the `verified` column)
- claude-code `permission_enforcement`: verified (deny rules, trusted workspace) — T3b. `tool_restrictions`: verified via `--allowedTools` (launch-time) — T1/T2 ran with `Read,Edit,Write,Bash(node:*),Bash(cd:*)`; Bash `git` was blocked (Claude reported it). `native_agent_config`: file written by sync, consumption not observed → stays unverified/advisory.
- codex `permission_enforcement`: verified as launch-time sandbox (`read-only` refuses writes) — T4; per-path scope unsupported. `tool_restrictions`: unsupported (no per-tool allowlist observed).
- Both: `context_rendering` advisory (engines followed scope instructions in T1/T2 but nothing enforced it except T3b/T4); `launch`/`native_session_resume`: unsupported (AgentOS does not launch or resume native sessions).
