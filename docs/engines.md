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

The verified cells come from one host-side trial on 2026-10-25 (Claude Code 2.1.310, Codex CLI 0.156.1, a disposable root-repo fixture with `web/`, `api/`, `docs/adr/`): [`evidence/2026-10-25-cross-engine/REPORT.md`](evidence/2026-10-25-cross-engine/REPORT.md) (T1–T5), plus the closure re-trials the same day (boundary probe T6a–T6e, Codex role block T7, Claude subagent T8, subagent `tools:` T9): [`evidence/2026-10-25-cross-engine/closure/REPORT-closure.md`](evidence/2026-10-25-cross-engine/closure/REPORT-closure.md). Sample size n=1 per probe item (T7: n=2 plus two controls). This repository's sandbox cannot run either engine; nothing in the table was observed here.

## Startup loop in each engine's bootloader

Each engine's auto-loaded file names the same short loop with its own engine id, and points to `.agentos/guide.md` for everything else (bootloaders stay ~1.1–1.2 KB):

| File | Engines | Loop line |
|---|---|---|
| `CLAUDE.md` | claude-code | `agentos status` → `agentos context claude-code --task <id>` → work → `agentos checkpoint --task <id> …`; next session or engine: `agentos resume --task <id>` |
| `AGENTS.md` | codex, opencode (and generic) | same, `agentos context codex\|opencode --task <id>` |
| `.hermes.md` | hermes | same, `agentos context hermes --task <id>` |

The task id is the one identity across engines: a checkpoint written by one engine is what `resume --task <id>` shows another (`test/project-brain-slice3.test.js`). This is generated instruction, not proof that an engine reads or follows it; observed consumption is the Slice 4 trial (acceptance row A16). Phynceon's Hermes project-start workflow lives outside this repository; the proposed change is [`evidence/hermes-start-workflow-proposal.md`](evidence/hermes-start-workflow-proposal.md).

```bash
agentos doctor --engines            # the table below
agentos doctor --engines --json     # { ok, rows, matrix: { <engine>: { <row>: { status, evidence, edit_scope? } } } }
```

## Matrix

Generated from `src/engines.ts` (a test keeps this table in step with it).

| Engine | Row | Status | Evidence |
|---|---|---|---|
| claude-code | context_rendering | advisory | Rendered as text (CLAUDE.md + `agentos context`); the engine may ignore instructions. In the 2026-10-25 trial it followed the scope instructions, unenforced (docs/evidence/2026-10-25-cross-engine/REPORT.md#T1, T2, n=1). |
| claude-code | native_agent_config | verified | Verified for discovery, invocation and instruction-following: after `agentos agents sync claude-code`, Claude Code 2.1.310 listed the synced agent from .claude/agents/<id>.md in a trusted workspace (docs/evidence/2026-10-25-cross-engine/REPORT.md#T5, n=1); a Task-invoked subagent used a marker present only in its card, named its role and refused out-of-scope edits by instruction (docs/evidence/2026-10-25-cross-engine/closure/REPORT-closure.md#T8, n=1). tools: consumption VERIFIED afterwards (closure T9: the subagent reported exactly the rendered list and had no Bash). |
| claude-code | tool_restrictions | verified | Verified (launch-time --allowedTools; see T1/T2): `claude -p --allowedTools Read,Edit,Write,Bash(node:*),Bash(cd:*)` blocked Bash git in Claude Code 2.1.310 (docs/evidence/2026-10-25-cross-engine/REPORT.md#T1, n=1). AgentOS passes no launch flags. Manifest tools_requested -> .claude/agents/<id>.md tools: (read-only roles default to Read, Grep, Glob): VERIFIED for the Task-invoked subagent, which reported exactly Read, Grep, Glob, Edit and had no Bash tool (docs/evidence/2026-10-25-cross-engine/closure/REPORT-closure.md#T9, n=1); it does not restrict the top-level session. |
| claude-code | permission_enforcement | verified | Verified in a trusted workspace (Claude Code 2.1.310, n=1 per probe): listed-path deny rules refused an edit under api/ and allowed web/ (docs/evidence/2026-10-25-cross-engine/REPORT.md#T3, T3b) and, as sync wrote them, refused api/package.json (docs/evidence/2026-10-25-cross-engine/REPORT.md#T5); the sibling denies from `agentos agents sync claude-code` refused Edit in web/tests, web/package.json, api/contracts, docs/adr, .env.example, .agentos/project.yaml and .claude/settings.local.json and a Bash redirect into api/package.json, while Edit, Write and a Bash redirect in web/src stayed allowed (docs/evidence/2026-10-25-cross-engine/closure/REPORT-closure.md#T6c); a read-only role (deny Edit/Write/NotebookEdit(/**)) refused Edit, Write and a Bash redirect and allowed Read (docs/evidence/2026-10-25-cross-engine/closure/REPORT-closure.md#T6d). Allow-only rules or an untrusted workspace do not restrict (T3a). Residual, advisory: root files/dirs created after sync (uncovered until re-sync; --require-synced-config reports STALE), .agentos/ state files (writable by design), shell writes Claude Code does not recognise as a write to a denied path. |
| claude-code | launch | unsupported | AgentOS never launches an engine process; the user starts the engine. |
| claude-code | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |
| codex | context_rendering | advisory | Rendered as text (AGENTS.md + `agentos context`); the engine may ignore instructions. In the 2026-10-25 trial it followed the scope instructions, unenforced (docs/evidence/2026-10-25-cross-engine/REPORT.md#T1, T2, n=1). |
| codex | native_agent_config | verified | Verified for instruction-following (advisory; the user prompt wins): a marker instruction present only in the role block that `agentos agents sync codex` wrote into web/AGENTS.md was followed 2/2 by Codex 0.156.1 launched in web/, 0/1 at the root (control) and 0/1 when the user prompt said "Nothing else" (docs/evidence/2026-10-25-cross-engine/closure/REPORT-closure.md#T7). The block is instructions, not enforcement. |
| codex | tool_restrictions | unsupported | Codex has no per-tool allowlist that AgentOS writes; sandbox modes are launch-time flags (`--sandbox`), not file config AgentOS generates. |
| codex | permission_enforcement | verified | Verified (launch-time sandbox: --sandbox read-only refuses writes; per-path scope unsupported): `codex exec --sandbox read-only` refused an append to api/contracts/openapi.yaml with "Read-only file system" in Codex 0.156.1 (docs/evidence/2026-10-25-cross-engine/REPORT.md#T4, n=1). The user picks the sandbox at launch; AgentOS passes no flags and workspace-write cannot express AgentOS edit paths. |
| codex | launch | unsupported | AgentOS never launches an engine process; the user starts the engine. |
| codex | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |
| opencode | context_rendering | advisory | Rendered as text (AGENTS.md + `agentos context`); the engine may ignore instructions. |
| opencode | native_agent_config | unsupported | AgentOS generates no native OpenCode agent config. |
| opencode | tool_restrictions | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| opencode | permission_enforcement | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| opencode | launch | unsupported | AgentOS never launches an engine process; the user starts the engine. |
| opencode | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |
| hermes | context_rendering | advisory | Rendered as text (.hermes.md + `agentos context`); the engine may ignore instructions. |
| hermes | native_agent_config | unsupported | AgentOS generates no native Hermes agent config. |
| hermes | tool_restrictions | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| hermes | permission_enforcement | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| hermes | launch | unsupported | AgentOS never launches an engine process; the user starts the engine. |
| hermes | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |
| generic | context_rendering | advisory | Rendered as text (AGENTS.md + `agentos context`); the engine may ignore instructions. |
| generic | native_agent_config | unsupported | AgentOS generates no native engine agent config. |
| generic | tool_restrictions | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| generic | permission_enforcement | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| generic | launch | unsupported | AgentOS never launches an engine process; the user starts the engine. |
| generic | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |

An unknown engine name gets the `generic` adapter, labelled with the requested name.

`permission_enforcement` also carries `edit_scope`, how far the verified mechanism covers the AgentOS edit scope:

- **claude-code**: enforced only by the deny rules from `agentos agents sync claude-code` in a **trusted** workspace; otherwise instruction-only. Allow-only rules did not restrict, and Claude Code ignored `.claude/settings.local.json` entirely while the workspace was untrusted (T3a). `verified` covers the **listed-path** denies (T3b, T5), the **sibling** denies and a **Bash redirect** into a denied path (T6c), and the read-only deny-all (T6d), n=1 per probe. **Residual (advisory)**: root-level files and directories created after the sync (T6c: a new root file via Write and a new root dir via Bash `mkdir` were allowed) until a re-sync, `.agentos/` state files (writable by design), and shell writes Claude Code does not recognise as a write to a denied path.
- **codex**: instruction-only per path. Only the launch-time sandbox is enforced; `--sandbox read-only` refuses every write (T4), and `workspace-write` cannot express AgentOS edit paths.

## Enforcement vs synced configuration

AgentOS keeps five claims apart. A matching synced config is **configuration presence, not proof of enforcement** (owner review of PR #53).

| Claim | Meaning | AgentOS can check it? | Observed in |
|---|---|---|---|
| **configuration** | what `agents sync` writes (`.claude/agents/<id>.md`, `.claude/settings.local.json`, the Codex role block) | yes, every generated file against its sync record: `doctor` and `context <engine> --require-synced-config` ([freshness](#synced-config-freshness)) | tests (`test/sync-freshness.test.js`, `test/v1-enforcement-contract.test.js`) |
| **discovery** | the engine lists the synced agent/file | no (needs the engine) | Claude T5 |
| **invocation** | the synced subagent runs when called | no | Claude T8, T9 |
| **instruction-following** | an instruction only in the synced config is obeyed | no | Codex T7, Claude T8 |
| **enforcement** | the engine refuses the action (deny rule) or the tool is absent (`tools:`) | no: `--require-enforcement` exits 1 for every engine in v1 | Claude deny rules T3b, T5, T6c–T6e (trusted workspace); Claude subagent `tools:` T9; Claude launch-time `--allowedTools` T1; Codex `--sandbox read-only` T4 |

### Synced config freshness

`agents sync <engine>` (not `--dry-run`) also writes a sync record, `.agentos/synced/<engine>.json`, in the same mutation transaction as the engine files: `engine`, `role`, `agentos_version`, `scope` (`flag` = the `--scope` argument or `null` for `task_scope`, plus the effective `edit`/`read`) and, per generated file, `path`, `merge`, `sha256` and, for `.claude/settings.local.json`, the generated `entries` (`permissions.allow`, `permissions.deny`). It has no timestamp, so a re-sync with nothing changed writes nothing. One check reads it, used by both `agentos doctor` and `agentos context <engine> --require-synced-config`; it regenerates with the **recorded** role and scope (not the role or scope of the current `context` call) and compares per file:

1. installed vs record: a generated deny/allow entry missing or changed, `.claude/agents/<role>.md` edited, or the Codex role block edited → `generated entry edited` (a deleted file → `generated file missing`). Entries the owner added to a JSON file that are not in the record are **not** drift; they are counted as `user entries: N`.
2. record vs what sync would generate now → `scope changed` (effective edit/read scope differs, e.g. a `task_scope` edit), `tree changed` (settings differ with the same scope, e.g. a new top-level directory), `manifest changed` (the role card or its manifest, e.g. `tools_requested`).

| Status | When | `context --require-synced-config` | `doctor` |
|---|---|---|---|
| OK | everything matches | exit 0, context rendered | silent |
| STALE | drift (reasons per file), or a 1.0.0 sync without a record | exit 1 | one warning |
| INVALID | broken record, unreadable/invalid JSON settings, ambiguous role-block markers, malformed `project.yaml`, card without manifest — with the reason | exit 1 | one warning |
| MISSING | never synced (no record, no generated files) | exit 1 | silent |
| UNSUPPORTED | opencode, hermes, generic | exit 1 | — |

The lines (identical in both commands; doctor prefixes `- ` under `Warnings:`):

```text
Synced config: OK (claude-code, role developer, sha256 0bb513df)
Synced config: OK (claude-code, role developer, sha256 0bb513df; user entries: 1)
Synced config: STALE — re-run agentos agents sync claude-code --role developer (.claude/settings.local.json: tree changed)
Synced config: STALE — re-run agentos agents sync claude-code --role developer --scope 'web/src,api/contracts' (.claude/settings.local.json: tree changed)
Synced config: STALE — re-run agentos agents sync claude-code --role developer (.claude/agents/developer.md: manifest changed)
Synced config: STALE — re-run agentos agents sync codex --role developer --replace (web/AGENTS.md: generated entry edited)
Synced config: STALE — synced by 1.0.0 without a record; re-run agentos agents sync claude-code --replace
Synced config: INVALID — .claude/settings.local.json: invalid JSON (Unexpected end of JSON input); fix it, then re-run agentos agents sync claude-code --role developer
Synced config: MISSING — run agentos agents sync codex
Synced config: UNSUPPORTED — opencode has no synced config    (also hermes, generic)
```

The re-sync command carries `--scope '<flag>'` (single-quoted, pastes as-is) when the sync was given one, and adds `--replace` only when a plain re-sync would refuse: a generated entry was edited by hand, or a 1.0.0 sync left no record. Every other STALE reason (`tree changed`, `scope changed`, `manifest changed`, `generated file missing`) is fixed by the plain command. `doctor` adds warnings only (never `problems`), so its exit status does not change, and it never rewrites anything; a workspace that never ran `agents sync` gets byte-identical human output to 1.0.0. `doctor --json` carries an additive `synced_config` list, one entry per engine with native config:

```json
"synced_config": [
  { "engine": "claude-code", "status": "stale", "role": "developer", "files": [".claude/agents/developer.md", ".claude/settings.local.json"], "reason": ".claude/settings.local.json: tree changed", "user_entries": 0 },
  { "engine": "codex", "status": "missing", "role": null, "files": [], "reason": null, "user_entries": 0 }
]
```

(`sha256` is added on `ok`.) This is configuration presence only: OK says nothing about workspace trust or the residual writable paths.

### Re-sync and `--replace`

`agents sync <engine> [--role <id>] [--scope <a,b>] [--dry-run] [--replace]` takes ownership only from the sync record; it never guesses.

| Target | Plain re-sync | Refused with zero writes unless `--replace` | With `--replace` |
|---|---|---|---|
| `.claude/settings.local.json` `permissions.allow` / `permissions.deny` | Replaces exactly the recorded entries with the newly generated ones, inserted where the first recorded entry stood. Owner entries (not in the record) keep their place and order; every other key is untouched; the file keeps its indent and its trailing newline (or lack of one). | A recorded entry was removed or changed by hand: `generated entry edited (permissions.deny: Edit(/api/**), …)`. No record and an existing different list: `no sync record owns permissions.deny`. | Edited: the recorded entries still present are replaced; everything else, the hand-changed entries included, is kept as owner entries. No record: `allow`/`deny` are taken over wholesale. One backup. |
| `.claude/agents/<role>.md` | Replaced while its bytes still match the recorded sha256. | Hand-edited (`generated entry edited (whole file)`), or no record and different content. | Replaced; one backup. |
| Codex role block | Replaced in place; bytes outside the block kept. | Block edited by hand (`role block`). | Replaced; one backup. |
| File recorded for the previous role, no longer generated | Removed (a role block is stripped). | Hand-edited. | Removed; one backup. |

- Backups: `.agentos/runs/replaced-synced/<timestamp>/<path>`, written by the atomic no-clobber writer in the same mutation transaction as the engine files and the record; any failure rolls back every file, the backup and the record.
- A deleted generated file is recreated without `--replace`. Unreadable or invalid JSON and ambiguous role-block markers refuse even with `--replace`. A broken record refuses until `--replace`, which then treats the workspace as unrecorded.
- **One record per engine.** Syncing another role replaces the previous role's record, its generated entries and files; the output says so: `The sync record tracks one role per engine (now: tester); it replaced role developer, whose generated files are replaced or removed above.`
- Same preflight as the other mutating commands: root, workspace boundaries (symlinked `.claude/`, `.agentos/synced/`, `.agentos/runs/` refused before any write), `project.yaml`, then the whole plan, then the writes. `--dry-run` takes no writer lock.
- `--dry-run` prints, per file, its `+`/`-` entries, `whole file created|replaced|removed`, `role block added|replaced|removed`, or `Unchanged:`, and writes nothing (no lock, record, backup or temp file). `--dry-run --replace` previews the override.

```text
$ agentos agents sync claude-code --dry-run            # after mkdir newdir
Unchanged: .claude/agents/developer.md
Would update: .claude/settings.local.json
  + permissions.deny: Edit(/newdir/**)
  + permissions.deny: Write(/newdir/**)
  + permissions.deny: NotebookEdit(/newdir/**)
Would update: .agentos/synced/claude-code.json (sync record)

$ agentos agents sync claude-code                      # a generated deny entry edited by hand
REFUSED:
- .claude/settings.local.json: generated entry edited (permissions.deny: Edit(/api/**))
These would overwrite content the sync record does not own. Preview with `--dry-run --replace`; …
Nothing was written.
```

Limits: the JSON file is re-serialized (indent and trailing newline kept), so non-standard spacing inside it is normalised. A generated entry the owner already had is not inserted twice, but the record then claims it: a later re-sync that no longer generates it removes it.

`agentos context <engine> --require-enforcement` **always exits 1** in v1, for every engine; there is no partial-credit path:

```text
Enforcement: UNSUPPORTED — AgentOS cannot establish enforcement for claude-code: workspace trust is not verifiable from AgentOS; residual writable paths (new root-level files/dirs until re-sync, .agentos/ state, shell writes Claude Code does not recognise as file writes); deny rules apply only to Claude Code's own tools. --require-synced-config is the available check (configuration presence, not enforcement).
Enforcement: UNSUPPORTED — AgentOS cannot establish enforcement for codex: the launch-time sandbox is chosen outside AgentOS; no per-path scope. --require-synced-config is the available check (configuration presence, not enforcement).
```

opencode, hermes and generic give `permission_enforcement is unsupported for <engine>: edit scope and tool rules are instruction text only`. On any failure the output starts with `AgentOS context: FAIL`, prints the gate line(s) and renders no context. Both flags together print both lines and exit 1. With `--json`, a failure prints `{ ok: false, rendered: false, enforcement?, synced_config? }`; a rendered bundle carries `synced_config` when the flag was given. `enforcement` is `{ status: "unsupported", reasons: [...] }` (the reasons above as a list), `synced_config` is `{ status: "ok"|"stale"|"invalid"|"missing"|"unsupported", sha256?, role?, reason? }` (`sha256` on `ok`). Without either flag, `context` renders as before with the ADVISORY line.

`--require-enforcement` exited 0 on a matching synced deny set until closure 3 (`d7501a9`); that flag result is now `--require-synced-config`. A future hard-enforcement check is in [improve-later.md](improve-later.md).

## What the rows change

- `agentos context <engine>` ends with one ADVISORY line for the edit scope: `ADVISORY: edit scope is instruction-only for <engine>` for opencode, hermes and generic; for claude-code and codex the line is `ADVISORY: edit scope is <edit_scope>` (above). `--json` carries the same lines as `advisories`.
- `agentos context <engine> --require-synced-config` / `--require-enforcement`: see [Enforcement vs synced configuration](#enforcement-vs-synced-configuration). `--require-enforcement` always exits 1.
- `agentos agents sync claude-code|codex [--role] [--scope] [--dry-run]` is the only command that writes engine-native files. The role and edit scope come from the same builder as `agentos context` (task scope narrowed by the role manifest). Every target is preflighted; any conflict refuses the whole sync with zero writes. `--dry-run` prints the files and writes nothing.
  - **claude-code**: `.claude/agents/<role>.md` (subagent: `name`, `description` = manifest purpose, `tools`, body = the card body); `tools:` comes from `tools_requested`, mapped case-insensitively `read`→`Read`, `edit`→`Edit`, `write`→`Write`, `bash`→`Bash`, `grep`→`Grep`, `glob`→`Glob` (duplicates dropped); any other name is passed through verbatim and the sync prints `Warning: tools_requested "<name>" is not a known AgentOS tool name; …`. Without `tools_requested`, a read-only role gets `tools: Read, Grep, Glob` and other roles get no `tools:` line (Claude Code's default: all tools). A Task-invoked subagent honours `tools:` (closure T9: it reported exactly the rendered list and had no Bash tool; n=1); an existing file with different content is a conflict. `.claude/settings.local.json` gets:
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

    What the deny rules do **not** cover: new root-level files and entries created after the sync (re-run `agentos agents sync claude-code` after adding top-level directories; it replaces only the entries its sync record owns), new files created directly inside an ancestor of the edit path (e.g. `web/new.txt` for edit `web/src`), shell writes Claude Code does not recognise as file writes (advisory), and anything at all in an untrusted workspace.

    The first sync adds the keys to an existing file (other keys untouched; an identical existing list is accepted unchanged; a different one without a sync record refuses with zero writes until `--replace`); a re-sync replaces only the recorded entries ([Re-sync and `--replace`](#re-sync-and---replace)). `/path` is relative to the settings source. The sync prints the trust note ("Claude Code ignores `.claude/settings.local.json` until the workspace is trusted; run `claude` interactively once or set `projects[<root>].hasTrustDialogAccepted` in ~/.claude.json."), the re-sync instruction ("re-run `agentos agents sync claude-code` after adding top-level directories …") and `advisory: shell writes (Bash) are blocked only where Claude Code recognises a file write to a denied path; …`.
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
| Entries created after the sync | **no** — re-run `agentos agents sync claude-code` after adding top-level directories (`doctor` warns and `context --require-synced-config` says `STALE` until then) | — |
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
| [T6e](evidence/2026-10-25-cross-engine/closure/REPORT-closure.md) Claude, final generator | The 14-item probe on rules from `3316296` (no `/*`): identical to T6c. | claude-code `permission_enforcement` (as this release generates) |
| [T9](evidence/2026-10-25-cross-engine/closure/REPORT-closure.md) Claude subagent `tools:` | `tools_requested: [read, grep, glob, edit]` rendered as `tools: Read, Grep, Glob, Edit`; the `Task`-invoked subagent reported exactly those four and had no Bash tool. | claude-code `tool_restrictions` and `native_agent_config` (invoked subagent only, not the top-level session) |

The trial also found D2 (child directories of one root work tree were `unavailable` to checkpoint/resume, so reconciliation never ran; fixed: `state: enclosing-worktree`, see [checkpoints.md](checkpoints.md)) and D3 (a trailing `.` broke the checkpoint command; fixed: a bare `.` is ignored).

## What the trial did NOT prove

- **n=1 per probe** (T7: n=2 plus two controls). Each verified cell rests on one run of one engine version on one synthetic fixture. A different version, model, permission mode or settings source may behave differently.
- **Native agent config limits.** Both engines followed the synced role instructions (T7, T8), but that is instruction-following, not enforcement: a user prompt overrode the Codex block (T7 control), and the Claude subagent refused out-of-scope edits by instruction, not by a tool restriction. The rendered `tools:` list did restrict the invoked subagent's tool set (T9: exactly the listed tools, no Bash; n=1); that is a tool restriction for that subagent only, not for the top-level session, and not a path restriction.
- **Codex per-path scope.** Only the all-or-nothing `--sandbox read-only` was observed. Nothing restricts Codex to `web/` while allowing it; `workspace-write` cannot express AgentOS edit paths.
- **Deny rules as written by this release.** T6c ran the 71cdb19 rules minus `Edit/Write(/*)`, which is what this release generates for that fixture. Larger trees, file-level edit scopes and other settings sources were not probed. Settings synced by 71cdb19 still contain `/*` and must be re-synced ([migration.md](migration.md)).
- **Shell writes.** The probe saw `echo >> api/package.json` denied by a file deny rule; that is not a guarantee for other shell commands (`cp`, `sed -i`, scripts), so shell writes stay `advisory`.
- **Session resume.** Continuity came from `agentos resume`/`agentos context` text in a fresh session (`--no-session-persistence`); no engine-native session resume was tested, and AgentOS does not drive one.
- **Reconciliation on the trial layout.** The trial ran before D2 was fixed, so its resume output says `Reconciliation: unavailable`; the fix is covered by `test/v1-slice7.test.js` on a synthetic fixture only.
- **Other engines.** OpenCode, Hermes and generic were not part of the trial.

## Repeating the trial

Use a disposable fixture (never a client workspace), record engine version, exact command, transcript and `git status --short` before and after. A row becomes `verified` only for the engine, version and mode observed, with the report section as evidence; a failed observation becomes `unsupported`. The prompts used on 2026-10-25 are in the evidence folder (`claude-prompt*.txt`, `codex-prompt*.txt`), and the engine flags were `claude -p --output-format json --no-session-persistence --allowedTools …` and `codex exec -a never [--sandbox read-only]`. The closure probe prompt is `closure/b2.txt` (14 items). The subagent `tools:` re-trial (T9) result is `closure/b6-subagent-tools.json`, with the rendered agent file `closure/claude-agent-developer-with-tools.md.generated`.
