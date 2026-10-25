# v1 acceptance matrix

State on `feat/v1-final` (stacked on `feat/v1-obsidian` / PR #51). One row per priority (A–F) and per verification scenario of the v1 goal. The goal document itself was not available in the developer sandbox; the scenario list is the one the slice-7 card enumerates.

Status: **PASS** = a named test passes on the final commit and/or a recorded trial section shows it. **FAIL** = shown not to work. **BLOCKED** = cannot be shown from here (needs an engine run on a host, or an owner decision). Evidence kinds: *test* = `test/<file>` › test title (synthetic fixtures under the OS temp dir); *trial* = [`evidence/2026-10-25-cross-engine/REPORT.md`](evidence/2026-10-25-cross-engine/REPORT.md) section (real engines, n=1); *reviewer* = Phynceon's independent re-run recorded on the slice's PR (#46–#51) / card.

Summary: **26 rows — 24 PASS, 0 FAIL, 2 partially BLOCKED (S19: Codex half; S20: sibling-enumeration half, host re-trial pending)** (6 priorities, 20 scenarios). Every test-backed PASS rests on synthetic fixtures; the engine-backed rows (S1–S3, S17, S18) are n=1.

## Priorities

| # | Priority | Status | Evidence | Limits | Owner action still required |
|---|---|---|---|---|---|
| A | Correctness fixes + cleanup (objective parity, broken-state prompts, task scope, engine preference, dead code, docs truth) | PASS | test: `v1-slice1.test.js` (8 tests, e.g. › "prompt prints the objective from a dated …", › "doctor --fix leaves a user-limited engines.allowed byte-identical"); `v1-slice7-docs.test.js` › "every top-level command in the help text has a handler …", › "relative links in README.md and docs/*.md resolve"; reviewer: PR #46 | Deprecated migration writers stay **GATED** (unchanged; see [migration.md](migration.md#keep--simplify--remove-inventory)) | Merge PR #46; decide the 0.10.0 removal gate |
| B | Task-specific context builder (`agentos context`) | PASS | test: `v1-slice2-context.test.js` (16); trial T1/T2 (both engines worked from `agentos context` output); reviewer: PR #47 | Ranking is term overlap; overhead constants unmeasured ([improve-later.md](improve-later.md)) | Merge PR #47 |
| C | Checkpoints + resume | PASS | test: `v1-slice3-checkpoint.test.js` (17), `v1-slice7.test.js` › "D2: web/ and api/ inside one root work tree …", › "D2: sensitive paths stay omitted …", › "D3: checkpoint ignores a bare `.` positional"; trial T1/T2; reviewer: PR #48 | Trial reconciliation was `unavailable` (D2, fixed after the trial; fix proven on a synthetic fixture only) | Merge PR #48 |
| D | Managed Project Brain | PASS | test: `v1-slice4-brain.test.js` (16); trial T1 (record `brain:0001-greeting` listed as a knowledge ref in the checkpoint); reviewer: PR #49 | Exact-text dedup and heading-subject conflicts only | Merge PR #49 |
| E | Agent manifests, lifecycle, engine capability matrix | PASS | test: `v1-slice5-agents.test.js` (13), `v1-slice7.test.js` › "D1: …" (3), › "matrix: claude-code and codex rows match the 2026-10-25 trial …"; trial T3, T4; reviewer: PR #50 | `native_agent_config` unverified for both engines (row E-native below) | Merge PR #50 |
| F | Optional Obsidian on Brain storage | PASS | test: `v1-slice6-obsidian.test.js` (6); reviewer: PR #51 | Temp vault folders only; never a real vault | Merge PR #51 |

## Scenarios

| # | Scenario | Status | Evidence | Limits | Owner action still required |
|---|---|---|---|---|---|
| S1 | Fresh Claude Code → Codex continuation | PASS | trial T1 (Codex with no prior conversation stated ACCOMPLISHED/REMAINING/CHECKS/NEXT from `resume` + `context`, continued, checkpointed `observed-pass`); records in `evidence/…/checkpoints/greeting/` | n=1; Claude Code 2.1.310 / Codex 0.156.1 only | — |
| S2 | Fresh Codex → Claude Code continuation (reverse) | PASS | trial T2 (Claude added only the missing test, kept `npm run test` `not-run`, did not redo work); `evidence/…/checkpoints/greetall/` | n=1; Claude's final message did not repeat the 4-line statement verbatim (REPORT T2) | — |
| S3 | Root start (engine and AgentOS run from the workspace root) | PASS | trial T1/T2 (both engines launched at the fixture root); test: `v1-slice3-checkpoint.test.js` › "resume right after a checkpoint is clean; …" (separate child repos), `v1-slice7.test.js` › "D2: web/ and api/ inside one root work tree …" (one root work tree) | Trial reconciliation predates the D2 fix | — |
| S4 | Nested start (AgentOS run from inside a child directory) | PASS | test: `v1-slice7.test.js` › "nested start: context, checkpoint and resume run from inside a child directory …"; dogfood: `context codex` from `web/` of a 0.9.0-initialised workspace (plan, slice 7 evidence) | No engine was launched inside a child directory in the trial | — |
| S5 | Cross-repo contract reading (read another repo's contract without edit rights) | PASS | test: `v1-slice1.test.js` › "prompt lets a frontend task read a backend contract without granting backend edit scope"; `v1-slice2-context.test.js` › "records outside read scope are omitted out-of-scope; the backend contract in read is included; edit stays web"; `v1-slice7.test.js` › "D1: sync claude-code denies every repo and read path outside the edit scope …"; trial T1 (task scope `read: [web, api/contracts/openapi.yaml, docs/adr]`, `edit: [web]`) | Engines are only *told* the scope unless T3b/T4 conditions hold | — |
| S6 | Superseded / conflicting knowledge | PASS | test: `v1-slice2-context.test.js` › "a task naming a decision subject selects it; the superseded sibling is omitted as superseded", › "two current decisions on the same subject are listed under conflicts"; `v1-slice4-brain.test.js` › "supersedes: the old record becomes superseded; …", › "validate flags (but does not reject) an ambiguous conflict …" | Conflict = same heading subject (heuristic) | — |
| S7 | Source changed after verification | PASS | test: `v1-slice4-brain.test.js` › "check: a human body edit is reported as changed, …", › "stale write: a human body edit after the proposal also rejects the apply …"; `v1-slice6-obsidian.test.js` › "external vault edit -> changed; …" | — | — |
| S8 | Mandatory context exceeds the budget | PASS | test: `v1-slice2-context.test.js` › "mandatory content over budget: ok:false with overflow, exit 1, nothing rendered or truncated" | Token counts are `chars/4` estimates | — |
| S9 | Engine stops without a summary | PASS | test: `v1-slice3-checkpoint.test.js` › "recovered checkpoint: --recover writes a record with recovered:true …", › "resume after an interruption reports incomplete …" | Not reproduced with a real engine crash | — |
| S10 | Two updates from the same revision | PASS | test: `v1-slice4-brain.test.js` › "stale write: a second proposal on the old base_hash is rejected after the first applied, with zero writes"; `v1-slice3-checkpoint.test.js` › "records are immutable: …" | One writer per workspace (lock), no concurrent engines | — |
| S11 | Custom agent upgrade | PASS | test: `v1-slice5-agents.test.js` › "a hand-edited card survives doctor --fix and agents add byte for byte; …", › "legacy cards: a byte-matched card gets its manifest …" | — | This repo's three legacy cards (developer, tester, release-manager): choose `agents manifest <id> --custom` or `agents add <id> --replace` |
| S12 | Custom agent disable | PASS | test: `v1-slice5-agents.test.js` › "disable edits only agents.enabled (comments and layout kept, card kept); …" | — | — |
| S13 | Custom agent remove | PASS | test: `v1-slice5-agents.test.js` › "remove refuses while referenced (enabled, capabilities, current checkpoint role, Brain tag) …" | Vault records are not scanned for references | — |
| S14 | Existing vault | PASS | test: `v1-slice6-obsidian.test.js` › "obsidian link creates only <dest>/ and its index note; every byte elsewhere in the vault is identical", › "register/propose of a vault note outside <dest> is refused with zero writes" | Temp vaults only | — |
| S15 | No vault | PASS | test: `v1-slice6-obsidian.test.js` › "obsidian init creates a plain knowledge folder …"; every slice 2–5 test runs without Obsidian | — | — |
| S16 | Unavailable source | PASS | test: `v1-slice6-obsidian.test.js` › "external vault edit -> changed; vault removed -> unavailable in check, missing in context, doctor warning; …"; `v1-slice3-checkpoint.test.js` › "a repo that disappeared is unavailable"; `v1-slice7.test.js` › "D2: … a dir outside any work tree stays unavailable" | EACCES on a mounted vault reads as empty | — |
| S17 | Edit scope enforced by Claude Code | PASS | trial T3b; test: `v1-slice7.test.js` › "D1: …" (sync now writes deny rules of the T3b shape) | n=1; only with deny rules **and** a trusted workspace; T3b used hand-written rules — sync's exact output not re-run | — |
| S18 | Writes blocked for Codex | PASS | trial T4 | Launch-time `--sandbox read-only` only; no per-path scope | — |
| S19 | Engine-native agent config is consumed (`.claude/agents/<id>.md`, Codex role block) | PASS (Claude Code) / BLOCKED (Codex) | Claude Code listed the synced `developer` agent from `.claude/agents` — [REPORT.md T5](evidence/2026-10-25-cross-engine/REPORT.md), n=1, discovery only (invocation not tested); Codex role-block consumption not observed | Matrix: claude-code `native_agent_config: verified (discovery)`; codex stays `unverified` | Codex host trial still open (Phynceon); see [engines.md](engines.md#repeating-the-trial) |
| S20 | Sync-generated deny rules re-trialled end to end | PASS (listed paths) / BLOCKED (sibling enumeration: host re-trial pending) | [REPORT.md T5](evidence/2026-10-25-cross-engine/REPORT.md): deny rules exactly as the D1-fixed `agents sync claude-code` writes them; `api/package.json` DENIED, `web/package.json` ALLOWED (Claude Code 2.1.310, trusted workspace, n=1). Boundary probe (Phynceon, Claude Code 2.1.310, trusted workspace, 2026-10-25; reported on the closure card, transcript not in the evidence folder) on `task_scope: {read: [web, api/contracts/openapi.yaml, docs/adr], edit: [web/src]}` with the pre-fix deny list `Edit\|Write\|NotebookEdit(/api/**, /api/contracts/openapi.yaml, /docs/adr/**)` — see the probe table below. Sibling enumeration added 2026-10-25 (test: `v1-claude-deny-siblings.test.js`); not yet run against Claude Code | Listed-path denies verified (T3b, T5). Sibling denies (incl. `Edit/Write(/*)`): **re-trial pending**. Shell writes: advisory (blocked only where Claude Code recognises a file write). Trusted workspace required | Phynceon: re-run the probe below on the fix commit, plus one in-scope edit (`web/src/a.js`) to confirm `/*` does not over-match |
| S21 | Release | — | not part of v1 acceptance: no version bump, `CHANGELOG.md` entry is `[Unreleased]` | — | Owner: review and merge PRs #46–#51 and this branch, then decide version and publish |

S21 is listed for the owner and not counted in the summary.

### S20 boundary probe (2026-10-25, pre-fix deny list)

Observations in the order the closure card lists them (the card names files `probe6.txt` and `probe10.md` but gives nine observations; the original item numbering was not on the card). "Fix" = what the sibling enumeration changes; every row is **re-trial pending** on the fix commit.

| # | Action (Claude Code) | Observed (pre-fix) | Fix targets it? | Expected after fix (not yet observed) |
|---|---|---|---|---|
| 1 | Edit `api/contracts/openapi.yaml` | DENIED | no (listed path, already denied) | DENIED (`/api/**`, `/api/contracts/openapi.yaml`) |
| 2 | Edit `docs/adr/0001.md` | DENIED | no (listed path, already denied) | DENIED (`/docs/**`, `/docs/adr/**`) |
| 3 | Bash `echo >> api/package.json` | DENIED | no | DENIED (`/api/**`); shell writes stay advisory |
| 4 | Edit `web/tests/t.js` | ALLOWED (gap) | **yes** | DENIED (`/web/tests/**`) |
| 5 | Edit `web/package.json` | ALLOWED (gap) | **yes** | DENIED (`/web/package.json`) |
| 6 | Write root `probe6.txt` (new file) | ALLOWED (gap) | **yes** | DENIED (`Write(/*)`) |
| 7 | Edit `.env.example` | ALLOWED (gap) | **yes** | DENIED (`/.env.example`) |
| 8 | Write `.agentos/probe10.md` | ALLOWED | no, by design (`.agentos/` is the state channel; only `project.yaml` and `agents/**` are denied) | ALLOWED |
| 9 | Bash `echo >> web/src/a.js` (in scope) | ALLOWED | no (in scope) | ALLOWED — also confirms `/*` does not over-match the edit scope |
