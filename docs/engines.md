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

The verified cells come from one host-side trial on 2026-10-25 (Claude Code 2.1.310, Codex CLI 0.156.1, a disposable root-repo fixture with `web/`, `api/`, `docs/adr/`): [`evidence/2026-10-25-cross-engine/REPORT.md`](evidence/2026-10-25-cross-engine/REPORT.md). Sample size n=1 per cell. This repository's sandbox cannot run either engine; nothing in the table was observed here.

```bash
agentos engines            # the table below
agentos engines --json     # { ok, rows, matrix: { <engine>: { <row>: { status, evidence, edit_scope? } } } }
```

## Matrix

Generated from `src/engines.ts` (a test keeps this table in step with it).

| Engine | Row | Status | Evidence |
|---|---|---|---|
| claude-code | context_rendering | advisory | Rendered as text (CLAUDE.md + `agentos context`); the engine may ignore instructions. In the 2026-10-25 trial it followed the scope instructions, unenforced (docs/evidence/2026-10-25-cross-engine/REPORT.md#T1, T2, n=1). |
| claude-code | native_agent_config | unverified | `agentos agents sync claude-code` writes .claude/agents/<id>.md; the 2026-10-25 trial did not observe Claude Code loading it (docs/evidence/2026-10-25-cross-engine/REPORT.md). |
| claude-code | tool_restrictions | verified | Verified (launch-time --allowedTools; see T1/T2): `claude -p --allowedTools Read,Edit,Write,Bash(node:*),Bash(cd:*)` blocked Bash git in Claude Code 2.1.310 (docs/evidence/2026-10-25-cross-engine/REPORT.md#T1, n=1). AgentOS passes no launch flags; the manifest tools_requested -> subagent tools: list is not covered (native_agent_config unverified). |
| claude-code | permission_enforcement | verified | Verified for deny rules in a trusted workspace: with hasTrustDialogAccepted and permissions.deny [Edit(/api/**), Write(/api/**)], Claude Code 2.1.310 refused an edit under api/ and allowed web/ (docs/evidence/2026-10-25-cross-engine/REPORT.md#T3, T3b, n=1). Allow-only rules or an untrusted workspace do not restrict (T3a). `agents sync claude-code` writes deny rules for every repo/read path outside the edit scope. |
| claude-code | launch | unsupported | AgentOS does not start engines (there is no `agentos run`); the user launches the engine. |
| claude-code | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |
| codex | context_rendering | advisory | Rendered as text (AGENTS.md + `agentos context`); the engine may ignore instructions. In the 2026-10-25 trial it followed the scope instructions, unenforced (docs/evidence/2026-10-25-cross-engine/REPORT.md#T1, T2, n=1). |
| codex | native_agent_config | unverified | `agentos agents sync codex` writes a managed role block into the in-scope AGENTS.md; Codex reads AGENTS.md, but the 2026-10-25 trial did not observe the role block being used (docs/evidence/2026-10-25-cross-engine/REPORT.md). |
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

- **claude-code**: enforced only by the deny rules from `agentos agents sync claude-code` in a **trusted** workspace; otherwise instruction-only. Allow-only rules did not restrict, and Claude Code ignored `.claude/settings.local.json` entirely while the workspace was untrusted (T3a).
- **codex**: instruction-only per path. Only the launch-time sandbox is enforced; `--sandbox read-only` refuses every write (T4), and `workspace-write` cannot express AgentOS edit paths.

## What the rows change

- `agentos context <engine>` ends with one ADVISORY line for the edit scope: `ADVISORY: edit scope is instruction-only for <engine>` for opencode, hermes and generic; for claude-code and codex the line is `ADVISORY: edit scope is <edit_scope>` (above). `--json` carries the same lines as `advisories`.
- `agentos context <engine> --require-enforcement` exits 1 with `AgentOS context: UNSUPPORTED` and renders nothing unless `permission_enforcement` is `verified` **without** a condition. Every engine fails it today: claude-code and codex are verified only conditionally, and AgentOS cannot confirm from `context` that the deny rules were synced and the workspace trusted, or how Codex was launched.
- `agentos agents sync claude-code|codex [--role] [--scope] [--dry-run]` is the only command that writes engine-native files. The role and edit scope come from the same builder as `agentos context` (task scope narrowed by the role manifest). Every target is preflighted; any conflict refuses the whole sync with zero writes. `--dry-run` prints the files and writes nothing.
  - **claude-code**: `.claude/agents/<role>.md` (subagent: `name`, `description` = manifest purpose, `tools` = `tools_requested` when non-empty, body = the card body); an existing file with different content is a conflict. `.claude/settings.local.json` gets:
    - `permissions.allow`: `Edit(/<path>/**)` per edit path (`Edit(/**)` for `.`);
    - `permissions.deny`: `Edit(…)`, `Write(…)`, `NotebookEdit(…)` for every repo path and every read-scope path outside the edit scope (`/<dir>/**` for a directory, `/<file>` for a file). A path that contains an edit path (e.g. `web` when only `web/src` is editable) is not denied, because deny wins over allow;
    - a read-only role (empty edit scope): `deny: [Edit(/**), Write(/**), NotebookEdit(/**)]`, no allow.

    Example, repos `web` and `api`, `task_scope: {read: [api/contracts/openapi.yaml], edit: [web]}`:

    ```json
    {"permissions": {"allow": ["Edit(/web/**)"],
      "deny": ["Edit(/api/**)", "Write(/api/**)", "NotebookEdit(/api/**)",
               "Edit(/api/contracts/openapi.yaml)", "Write(/api/contracts/openapi.yaml)", "NotebookEdit(/api/contracts/openapi.yaml)"]}}
    ```

    Merged by adding missing keys only; a key that exists with a different value (arrays compared whole, so an existing different `deny` list) refuses the whole sync with zero writes; an identical value is accepted unchanged. `/path` is relative to the settings source. The sync prints: "Claude Code ignores `.claude/settings.local.json` until the workspace is trusted; run `claude` interactively once or set `projects[<root>].hasTrustDialogAccepted` in ~/.claude.json."
  - **codex**: a managed block `<!-- agentos:role:start -->` … `<!-- agentos:role:end -->` in the `AGENTS.md` of the single repo that holds the edit scope (else the root `AGENTS.md`), replaced in place on re-sync; bytes outside it are kept and `doctor --fix` leaves it alone. The sync prints `advisory: Codex enforces only its launch-time sandbox (…)`: AgentOS writes no sandbox configuration and passes no flags.
- `launch` and `native_session_resume` are `unsupported` everywhere: AgentOS never starts an engine, and `agentos resume` is engine-neutral checkpoint text.

## Trial summary (2026-10-25)

| Trial | What was observed | Rows it supports |
|---|---|---|
| [T1](evidence/2026-10-25-cross-engine/REPORT.md) Claude → Codex | Claude Code (launched with `--allowedTools Read,Edit,Write,Bash(node:*),Bash(cd:*)`; Bash `git` blocked) fixed `greet` and checkpointed; a fresh Codex given only `agentos resume` + `agentos context codex` stated accomplished/remaining/checks/next correctly and continued. | continuity; claude-code `tool_restrictions` (launch-time); `context_rendering` stays advisory |
| [T2](evidence/2026-10-25-cross-engine/REPORT.md) Codex → Claude | Codex checkpointed with `--claim`; a fresh Claude Code added the missing test, kept `npm run test` as `not-run`, did not redo work. | continuity; `context_rendering` stays advisory |
| [T3](evidence/2026-10-25-cross-engine/REPORT.md) Claude permissions | (a) untrusted workspace, allow-only `Edit(/web/**)`: an edit under `api/` succeeded. (b) trusted + `deny: [Edit(/api/**), Write(/api/**)]`: the `api/` edit was denied, `web/` allowed. | claude-code `permission_enforcement` (deny rules + trust); defect D1 (fixed: sync now writes deny rules) |
| [T4](evidence/2026-10-25-cross-engine/REPORT.md) Codex sandbox | `codex exec --sandbox read-only`: the append to `api/contracts/openapi.yaml` failed with "Read-only file system". | codex `permission_enforcement` (launch-time sandbox only) |

The trial also found D2 (child directories of one root work tree were `unavailable` to checkpoint/resume, so reconciliation never ran; fixed: `state: enclosing-worktree`, see [checkpoints.md](checkpoints.md)) and D3 (a trailing `.` broke the checkpoint command; fixed: a bare `.` is ignored).

## What the trial did NOT prove

- **n=1 per cell.** Each verified cell rests on one run of one engine version on one synthetic fixture. A different version, model, permission mode or settings source may behave differently.
- **Native agent config consumption.** `.claude/agents/<id>.md` and the Codex role block were written by sync, but no run showed either engine loading or obeying them: `native_agent_config` stays `unverified` for both.
- **Codex per-path scope.** Only the all-or-nothing `--sandbox read-only` was observed. Nothing restricts Codex to `web/` while allowing it; `workspace-write` cannot express AgentOS edit paths.
- **Deny rules as written by this release.** T3b used a hand-written `deny: [Edit(/api/**), Write(/api/**)]`. The fixed `agents sync claude-code` writes the same rule shape (plus `NotebookEdit` and read-path entries), but its exact output has not been re-run against Claude Code.
- **Session resume.** Continuity came from `agentos resume`/`agentos context` text in a fresh session (`--no-session-persistence`); no engine-native session resume was tested, and AgentOS does not drive one.
- **Reconciliation on the trial layout.** The trial ran before D2 was fixed, so its resume output says `Reconciliation: unavailable`; the fix is covered by `test/v1-slice7.test.js` on a synthetic fixture only.
- **Other engines.** OpenCode, Hermes and generic were not part of the trial.

## Repeating the trial

Use a disposable fixture (never a client workspace), record engine version, exact command, transcript and `git status --short` before and after. A row becomes `verified` only for the engine, version and mode observed, with the report section as evidence; a failed observation becomes `unsupported`. The prompts used on 2026-10-25 are in the evidence folder (`claude-prompt*.txt`, `codex-prompt*.txt`), and the engine flags were `claude -p --output-format json --no-session-persistence --allowedTools …` and `codex exec -a never [--sandbox read-only]`. Still open: the `native_agent_config` rows (ask the subagent / role block to identify itself) and a re-run of T3b with the deny rules exactly as `agents sync claude-code` writes them.
