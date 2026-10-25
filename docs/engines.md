# Engine adapters and the capability matrix

AgentOS renders the same project context for every engine. What differs is what an engine can be made to *enforce*. `src/engines.ts` describes each engine as an adapter:

```ts
interface EngineAdapter {
  id: string;                                   // claude-code | codex | opencode | hermes | generic
  render(context: ContextBundle): string;       // agentos context text + ADVISORY lines
  nativeConfig?(input): { path, content }[];    // only claude-code and codex; written only by `agentos agents sync`
  capabilities: CapabilityMatrix;               // the six rows below
  syncNote?: string;                            // printed by `agents sync <engine>`
}
```

Statuses: `verified` (observed in a recorded engine trial; the evidence names the report section), `advisory` (delivered as text the engine may ignore), `unverified` (AgentOS generates the configuration, but no trial observed it being used), `unsupported` (AgentOS does nothing for this engine, or the engine has no such mechanism).

The verified cells come from one host-side trial on 2026-10-25 (Claude Code 2.1.310, Codex CLI 0.156.1, a disposable root-repo fixture with `web/`, `api/`, `docs/adr/`): [`evidence/2026-10-25-cross-engine/REPORT.md`](evidence/2026-10-25-cross-engine/REPORT.md) (T1–T5), plus the closure re-trials the same day (boundary probe T6a–T6d, Codex role block T7, Claude subagent T8): [`evidence/2026-10-25-cross-engine/closure/REPORT-closure.md`](evidence/2026-10-25-cross-engine/closure/REPORT-closure.md). Sample size n=1 per probe item (T7: n=2 plus two controls). This repository's sandbox cannot run either engine; nothing in the table was observed here.

```bash
agentos engines            # the table below
agentos engines --json     # { ok, rows, matrix: { <engine>: { <row>: { status, evidence, edit_scope? } } } }
```

## Matrix

Generated from `src/engines.ts` (a test keeps this table in step with it).

| Engine | Row | Status | Evidence |
|---|---|---|---|
| claude-code | context_rendering | advisory | Rendered as text (CLAUDE.md + `agentos context`); the engine may ignore instructions. In the 2026-10-25 trial it followed the scope instructions, unenforced (docs/evidence/2026-10-25-cross-engine/REPORT.md#T1, T2, n=1). |
| claude-code | native_agent_config | verified | Verified for discovery, invocation and instruction-following: after `agentos agents sync claude-code`, Claude Code 2.1.310 listed the synced agent from .claude/agents/<id>.md in a trusted workspace (docs/evidence/2026-10-25-cross-engine/REPORT.md#T5, n=1); a Task-invoked subagent used a marker present only in its card, named its role and refused out-of-scope edits by instruction (docs/evidence/2026-10-25-cross-engine/closure/REPORT-closure.md#T8, n=1). tools: consumption untested: T8 ran before tools_requested was rendered and the subagent reported the full tool set. |
| claude-code | tool_restrictions | verified | Verified (launch-time --allowedTools; see T1/T2): `claude -p --allowedTools Read,Edit,Write,Bash(node:*),Bash(cd:*)` blocked Bash git in Claude Code 2.1.310 (docs/evidence/2026-10-25-cross-engine/REPORT.md#T1, n=1). AgentOS passes no launch flags. manifest tools: rendering added 2026-10-25; consumption by the subagent untested (host re-trial pending). Rendering: tools_requested -> .claude/agents/<id>.md tools:, read-only roles default to Read, Grep, Glob. |
| claude-code | permission_enforcement | verified | Verified in a trusted workspace (Claude Code 2.1.310, n=1 per probe): listed-path deny rules refused an edit under api/ and allowed web/ (docs/evidence/2026-10-25-cross-engine/REPORT.md#T3, T3b) and, as sync wrote them, refused api/package.json (docs/evidence/2026-10-25-cross-engine/REPORT.md#T5); the sibling denies from `agentos agents sync claude-code` refused Edit in web/tests, web/package.json, api/contracts, docs/adr, .env.example, .agentos/project.yaml and .claude/settings.local.json and a Bash redirect into api/package.json, while Edit, Write and a Bash redirect in web/src stayed allowed (docs/evidence/2026-10-25-cross-engine/closure/REPORT-closure.md#T6c); a read-only role (deny Edit/Write/NotebookEdit(/**)) refused Edit, Write and a Bash redirect and allowed Read (docs/evidence/2026-10-25-cross-engine/closure/REPORT-closure.md#T6d). Allow-only rules or an untrusted workspace do not restrict (T3a). Residual, advisory: root files/dirs created after sync (uncovered until re-sync; --require-enforcement reports STALE), .agentos/ state files (writable by design), shell writes Claude Code does not recognise as a write to a denied path. |
| claude-code | launch | unsupported | AgentOS does not start engines (there is no `agentos run`); the user launches the engine. |
| claude-code | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |
| codex | context_rendering | advisory | Rendered as text (AGENTS.md + `agentos context`); the engine may ignore instructions. In the 2026-10-25 trial it followed the scope instructions, unenforced (docs/evidence/2026-10-25-cross-engine/REPORT.md#T1, T2, n=1). |
| codex | native_agent_config | verified | Verified for instruction-following (advisory; the user prompt wins): a marker instruction present only in the role block that `agentos agents sync codex` wrote into web/AGENTS.md was followed 2/2 by Codex 0.156.1 launched in web/, 0/1 at the root (control) and 0/1 when the user prompt said "Nothing else" (docs/evidence/2026-10-25-cross-engine/closure/REPORT-closure.md#T7). The block is instructions, not enforcement. |
| codex | tool_restrictions | unsupported | Codex has no per-tool allowlist that AgentOS writes; sandbox modes are launch-time flags (`--sandbox`), not file config AgentOS generates. |
| codex | permission_enforcement | verified | Verified (launch-time sandbox: --sandbox read-only refuses writes; per-path scope unsupported): `codex exec --sandbox read-only` refused an append to api/contracts/openapi.yaml with "Read-only file system" in Codex 0.156.1 (docs/evidence/2026-10-25-cross-engine/REPORT.md#T4, n=1). The user picks the sandbox at launch; AgentOS passes no flags and workspace-write cannot express AgentOS edit paths. |
| codex | launch | unsupported | AgentOS does not start engines (there is no `agentos run`); the user launches the engine. |
| codex | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |
| opencode | context_rendering | advisory | Rendered as text (AGENTS.md + `agentos context`); the engine may ignore instructions. |
| opencode | native_agent_config | unsupported | AgentOS generates no native OpenCode agent config. |
| opencode | tool_restrictions | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| opencode | permission_enforcement | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| opencode | launch | unsupported | AgentOS does not start engines (there is no `agentos run`); the user launches the engine. |
| opencode | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |
| hermes | context_rendering | advisory | Rendered as text (.hermes.md + `agentos context`); the engine may ignore instructions. |
| hermes | native_agent_config | unsupported | AgentOS generates no native Hermes agent config. |
| hermes | tool_restrictions | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| hermes | permission_enforcement | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| hermes | launch | unsupported | AgentOS does not start engines (there is no `agentos run`); the user launches the engine. |
| hermes | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |
| generic | context_rendering | advisory | Rendered as text (AGENTS.md + `agentos context`); the engine may ignore instructions. |
| generic | native_agent_config | unsupported | AgentOS generates no native engine agent config. |
| generic | tool_restrictions | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| generic | permission_enforcement | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| generic | launch | unsupported | AgentOS does not start engines (there is no `agentos run`); the user launches the engine. |
| generic | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |

An unknown engine name gets the `generic` adapter, labelled with the requested name.

`permission_enforcement` also carries `edit_scope`, how far the verified mechanism covers the AgentOS edit scope:

- **claude-code**: enforced only by the deny rules from `agentos agents sync claude-code` in a **trusted** workspace; otherwise instruction-only. Allow-only rules did not restrict, and Claude Code ignored `.claude/settings.local.json` entirely while the workspace was untrusted (T3a). `verified` covers the **listed-path** denies (T3b, T5), the **sibling** denies and a **Bash redirect** into a denied path (T6c), and the read-only deny-all (T6d), n=1 per probe. **Residual (advisory)**: root-level files and directories created after the sync (T6c: a new root file via Write and a new root dir via Bash `mkdir` were allowed) until a re-sync, `.agentos/` state files (writable by design), and shell writes Claude Code does not recognise as a write to a denied path.
- **codex**: instruction-only per path. Only the launch-time sandbox is enforced; `--sandbox read-only` refuses every write (T4), and `workspace-write` cannot express AgentOS edit paths.

## What the rows change

- `agentos context <engine>` ends with one ADVISORY line for the edit scope: `ADVISORY: edit scope is instruction-only for <engine>` for opencode, hermes and generic; for claude-code and codex the line is `ADVISORY: edit scope is <edit_scope>` (above). `--json` carries the same lines as `advisories`.
- `agentos context <engine> --require-enforcement` exits 1 and renders nothing unless enforcement configuration can be confirmed:
  - **claude-code**: exits 0 only when `.claude/settings.local.json` has a `permissions.deny` set equal (sha256 of the sorted list) to what `agents sync claude-code` would generate now for the same role and scope; the output then ends with `Enforcement: enforcement configuration present: … (sha256 …)`. No deny list (or no manifest/role) → `AgentOS context: UNSUPPORTED`; a different deny list (the tree or scope changed since the sync) → `AgentOS context: STALE`. Trust and Claude Code's behaviour are still not confirmed by AgentOS.
  - **codex, opencode, hermes, generic**: always `AgentOS context: UNSUPPORTED` (Codex's sandbox is chosen at launch; the others have no enforcement).
- `agentos agents sync claude-code|codex [--role] [--scope] [--dry-run]` is the only command that writes engine-native files. The role and edit scope come from the same builder as `agentos context` (task scope narrowed by the role manifest). Every target is preflighted; any conflict refuses the whole sync with zero writes. `--dry-run` prints the files and writes nothing.
  - **claude-code**: `.claude/agents/<role>.md` (subagent: `name`, `description` = manifest purpose, `tools`, body = the card body); `tools:` comes from `tools_requested`, mapped case-insensitively `read`→`Read`, `edit`→`Edit`, `write`→`Write`, `bash`→`Bash`, `grep`→`Grep`, `glob`→`Glob` (duplicates dropped); any other name is passed through verbatim and the sync prints `Warning: tools_requested "<name>" is not a known AgentOS tool name; …`. Without `tools_requested`, a read-only role gets `tools: Read, Grep, Glob` and other roles get no `tools:` line (Claude Code's default: all tools). Whether a Task-invoked subagent honours `tools:` is untested (T8 ran before this rendering existed); an existing file with different content is a conflict. `.claude/settings.local.json` gets:
    - `permissions.allow`: `Edit(/<path>/**)` per edit path (`Edit(/**)` for `.`);
    - `permissions.deny`: everything outside the edit scope, enumerated, because deny wins over allow (a `deny /**` plus an allowed subset cannot work). For a directory `Edit(/<dir>/**)`, `Write(…)`, `NotebookEdit(…)`; for a file `Edit(/<file>)`, `Write(…)`, `NotebookEdit(…)`:
      - **listed paths**: every repo path and read-scope path outside the edit scope;
      - **siblings**: for each edit path, every entry at each ancestor level (workspace root down to the edit path's parent) that is not on the way to an edit path and not inside one. `.git`, `node_modules` and the AgentOS writer lock are skipped;
      - **no** `Edit(/*)`/`Write(/*)`: Claude Code matches `/*` recursively, and with those two rules every probe item was denied, including edits inside `web/src` (T6b). New root-level files are therefore not covered (see below);
      - always `Edit`/`Write` on `.claude/settings.local.json` and `.claude/settings.json` (a session must not lift its own rules), and `.claude/**` itself unless it is in the edit scope;
      - always `.agentos/project.yaml` and `.agentos/agents/**` (scope and role definitions). The rest of `.agentos/` is **not** denied: handoff, tasks and checkpoints are the state channel, written through the AgentOS workflow.

      Output is sorted by path. A path that contains an edit path (e.g. `web` when only `web/src` is editable) is never denied;
    - a read-only role (empty edit scope): `deny: [Edit(/**), Write(/**), NotebookEdit(/**)]`, no allow.

    Example, repos `web` and `api`, `task_scope: {read: [web, api/contracts/openapi.yaml, docs/adr], edit: [web/src]}`, tree `web/{src,tests,package.json}`, `api/contracts/`, `docs/adr/`, `.env.example` (each path below gets `Edit`, `Write`, `NotebookEdit` unless noted; `web/AGENTS.md` etc. are the pointer files `init` writes):

    ```text
    allow: Edit(/web/src/**)
    deny:  /.agentos/agents/**     /.agentos/project.yaml   /.claude/**
           /.claude/settings.json (Edit, Write)   /.claude/settings.local.json (Edit, Write)
           /.env.example  /.hermes.md  /AGENTS.md  /CLAUDE.md  /api/**  /api/contracts/openapi.yaml
           /docs/**  /docs/adr/**  /web/.gitignore  /web/AGENTS.md  /web/CLAUDE.md  /web/package.json  /web/tests/**
    ```

    What the deny rules do **not** cover: new root-level files and entries created after the sync (re-run `agentos agents sync claude-code` after adding top-level directories; since sync adds keys only, remove `permissions.allow`/`deny` from `.claude/settings.local.json` first), new files created directly inside an ancestor of the edit path (e.g. `web/new.txt` for edit `web/src`), shell writes Claude Code does not recognise as file writes (advisory), and anything at all in an untrusted workspace.

    Merged by adding missing keys only; a key that exists with a different value (arrays compared whole, so an existing different `deny` list) refuses the whole sync with zero writes; an identical value is accepted unchanged. `/path` is relative to the settings source. The sync prints the trust note ("Claude Code ignores `.claude/settings.local.json` until the workspace is trusted; run `claude` interactively once or set `projects[<root>].hasTrustDialogAccepted` in ~/.claude.json."), the re-sync instruction ("re-run `agentos agents sync claude-code` after adding top-level directories …") and `advisory: shell writes (Bash) are blocked only where Claude Code recognises a file write to a denied path; …`.
  - **codex**: a managed block `<!-- agentos:role:start -->` … `<!-- agentos:role:end -->` in the `AGENTS.md` of the single repo that holds the edit scope (else the root `AGENTS.md`), replaced in place on re-sync; bytes outside it are kept and `doctor --fix` leaves it alone. The sync prints `advisory: Codex enforces only its launch-time sandbox (…)`: AgentOS writes no sandbox configuration and passes no flags.
- `launch` and `native_session_resume` are `unsupported` everywhere: AgentOS never starts an engine, and `agentos resume` is engine-neutral checkpoint text.

## What the Claude Code deny rules cover / do not cover

| | Covered (trusted workspace only) | Status |
|---|---|---|
| Repo and read-scope paths outside the edit scope (listed paths) | yes | verified (T3b, T5, T6c) |
| Every other existing entry outside the edit scope, at each ancestor level of an edit path (siblings: `web/tests`, `web/package.json`, `.env.example`, …) | yes | verified (T6c) |
| Bash redirect into a denied path (`echo >> api/package.json`) | yes | verified (T6c); other shell writes advisory |
| Edit scope itself (`web/src`: Edit, Bash redirect, new nested file) | allowed | verified (T6c) |
| New root-level files and directories (`probe6.txt` via Write, `scratch/` via Bash `mkdir`) | **no** — no `/*` rule (it over-matches, T6b) | residual (T6c), advisory |
| `.claude/` incl. `settings.json` / `settings.local.json` | yes — a session cannot lift its own rules | verified for `settings.local.json` (T6c) |
| `.agentos/project.yaml`, `.agentos/agents/**` (scope and role definitions) | yes | verified for `project.yaml` (T6c) |
| Read-only role: `Edit/Write/NotebookEdit(/**)` | everything (Edit, Write, Bash redirect); Read allowed | verified (T6d) |
| The rest of `.agentos/` (handoff, tasks, checkpoints, runs) | **no**, by design: the state channel, written through the AgentOS workflow | residual (T6c: `.agentos/probe10.md` allowed) |
| Entries created after the sync | **no** — re-run `agentos agents sync claude-code` after adding top-level directories (`context --require-enforcement` says `STALE` until then) | — |
| New files directly inside an ancestor of the edit path (`web/new.txt` for edit `web/src`) | **no** | — |
| Shell (Bash) writes | only where Claude Code recognises a file write to a denied path | advisory |
| An untrusted workspace | **no** — Claude Code ignores `.claude/settings.local.json` (T3a) | — |

## Trial summary (2026-10-25)

| Trial | What was observed | Rows it supports |
|---|---|---|
| [T1](evidence/2026-10-25-cross-engine/REPORT.md) Claude → Codex | Claude Code (launched with `--allowedTools Read,Edit,Write,Bash(node:*),Bash(cd:*)`; Bash `git` blocked) fixed `greet` and checkpointed; a fresh Codex given only `agentos resume` + `agentos context codex` stated accomplished/remaining/checks/next correctly and continued. | continuity; claude-code `tool_restrictions` (launch-time); `context_rendering` stays advisory |
| [T2](evidence/2026-10-25-cross-engine/REPORT.md) Codex → Claude | Codex checkpointed with `--claim`; a fresh Claude Code added the missing test, kept `npm run test` as `not-run`, did not redo work. | continuity; `context_rendering` stays advisory |
| [T3](evidence/2026-10-25-cross-engine/REPORT.md) Claude permissions | (a) untrusted workspace, allow-only `Edit(/web/**)`: an edit under `api/` succeeded. (b) trusted + `deny: [Edit(/api/**), Write(/api/**)]`: the `api/` edit was denied, `web/` allowed. | claude-code `permission_enforcement` (deny rules + trust); defect D1 (fixed: sync now writes deny rules) |
| [T4](evidence/2026-10-25-cross-engine/REPORT.md) Codex sandbox | `codex exec --sandbox read-only`: the append to `api/contracts/openapi.yaml` failed with "Read-only file system". | codex `permission_enforcement` (launch-time sandbox only) |
| [T5](evidence/2026-10-25-cross-engine/REPORT.md) Claude, synced config | Claude Code listed the synced `.claude/agents/<id>.md`; the listed-path denies as sync wrote them refused `api/package.json`. | claude-code `native_agent_config` (discovery), `permission_enforcement` (listed paths) |
| [T6a–T6d](evidence/2026-10-25-cross-engine/closure/REPORT-closure.md) Claude boundary probe (14 items) | T6a (856b61f rules): only listed paths denied. T6b (71cdb19 incl. `Edit/Write(/*)`): all 14 denied, including `web/src` → `/*` removed. T6c (final rules): `web/src` allowed; siblings, listed paths, Bash redirect into `api/`, `project.yaml`, `settings.local.json` denied; new root file/dir and `.agentos/` allowed (residual). T6d: read-only role denied Edit, Write, Bash redirect; Read allowed. | claude-code `permission_enforcement` |
| [T7](evidence/2026-10-25-cross-engine/closure/REPORT-closure.md) Codex role block | A marker instruction only in the synced `web/AGENTS.md` block: followed 2/2 launched in `web/`, 0/1 at the root (control), 0/1 when the prompt said "Nothing else". | codex `native_agent_config` (instruction-following, advisory) |
| [T8](evidence/2026-10-25-cross-engine/closure/REPORT-closure.md) Claude subagent | `Task`-invoked `developer` from `.claude/agents` used the marker, named its role, refused out-of-scope edits by instruction; reported the full tool set (no `tools:` was rendered then). | claude-code `native_agent_config` (invocation + instruction-following) |

The trial also found D2 (child directories of one root work tree were `unavailable` to checkpoint/resume, so reconciliation never ran; fixed: `state: enclosing-worktree`, see [checkpoints.md](checkpoints.md)) and D3 (a trailing `.` broke the checkpoint command; fixed: a bare `.` is ignored).

## What the trial did NOT prove

- **n=1 per probe** (T7: n=2 plus two controls). Each verified cell rests on one run of one engine version on one synthetic fixture. A different version, model, permission mode or settings source may behave differently.
- **Native agent config limits.** Both engines followed the synced role instructions (T7, T8), but that is instruction-following, not enforcement: a user prompt overrode the Codex block (T7 control), and the Claude subagent refused out-of-scope edits by instruction, not by a tool restriction. Whether Claude Code applies the `tools:` list now rendered from `tools_requested` is untested.
- **Codex per-path scope.** Only the all-or-nothing `--sandbox read-only` was observed. Nothing restricts Codex to `web/` while allowing it; `workspace-write` cannot express AgentOS edit paths.
- **Deny rules as written by this release.** T6c ran the 71cdb19 rules minus `Edit/Write(/*)`, which is what this release generates for that fixture. Larger trees, file-level edit scopes and other settings sources were not probed. Settings synced by 71cdb19 still contain `/*` and must be re-synced ([migration.md](migration.md)).
- **Shell writes.** The probe saw `echo >> api/package.json` denied by a file deny rule; that is not a guarantee for other shell commands (`cp`, `sed -i`, scripts), so shell writes stay `advisory`.
- **Session resume.** Continuity came from `agentos resume`/`agentos context` text in a fresh session (`--no-session-persistence`); no engine-native session resume was tested, and AgentOS does not drive one.
- **Reconciliation on the trial layout.** The trial ran before D2 was fixed, so its resume output says `Reconciliation: unavailable`; the fix is covered by `test/v1-slice7.test.js` on a synthetic fixture only.
- **Other engines.** OpenCode, Hermes and generic were not part of the trial.

## Repeating the trial

Use a disposable fixture (never a client workspace), record engine version, exact command, transcript and `git status --short` before and after. A row becomes `verified` only for the engine, version and mode observed, with the report section as evidence; a failed observation becomes `unsupported`. The prompts used on 2026-10-25 are in the evidence folder (`claude-prompt*.txt`, `codex-prompt*.txt`), and the engine flags were `claude -p --output-format json --no-session-persistence --allowedTools …` and `codex exec -a never [--sandbox read-only]`. The closure probe prompt is `closure/b2.txt` (14 items). Still open: a re-trial of the Claude subagent with a rendered `tools:` list (does a `Task`-invoked subagent lose the tools not listed?).
