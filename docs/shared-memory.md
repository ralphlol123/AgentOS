# Unified Brain: agent-guided setup (opt-in pilot)

AgentOS owns the portable project mapping and workflow. The engine owns its MCP
connection and tool calls. Unified Brain owns the vault registry and Markdown
entries. Obsidian is the human interface. This milestone adds no MCP client,
background synchronization, automatic engine configuration editing or vault migration.

Use this document as the ready-made setup playbook for Claude Code, Codex,
OpenCode or a compatible Hermes installation. The companion script installs the
workspace mapping only. Unified Brain is installed separately; it is not bundled
or downloaded by AgentOS. Use a reviewed package and its matching engine guide.

## Authority

- Working plans and repository-owned ADRs stay authoritative in the repository.
- Curated knowledge without another canonical document can be vault-owned.
- Shared plan/ADR summaries point to repository path and revision, not another
  editable copy. Each document has one authoritative home.
- Current tasks, verification receipts, recovery checkpoints and pending work
  stay in `.agentos/`. A vault checkpoint is a summary, not current test evidence.
- Existing `knowledge.brain.approval` policy still applies to its records. MCP
  access never grants permission to bypass that policy. Establish an explicit
  workflow for accepting vault-owned decisions before publishing them as settled.

## Setup procedure for the agent

1. Locate the existing AgentOS workspace, including from a child repo. Read its
   project.yaml, knowledge, handoff, tasks and instructions. For a new workspace,
   initialize AgentOS normally first. Do not modify a parent project by accident.
2. If `knowledge.shared_memory` exists, reuse it. Clones and worktrees share the
   committed ID. Never derive a new ID from a branch or directory name. A project
   fork intended to have independent knowledge needs an explicit identity choice.
3. Inspect the active engine's existing MCP connection and supported setup
   mechanism. Connection names alone are not store identity. Reuse a matching
   connection; never add a duplicate or overwrite unrelated configuration.
4. When no vault is selected, inspect configured connections and candidate vault
   locations accessible to this runtime. This is best-effort discovery by the
   engine, not a feature of the mapping script. Present existing/new/other-path
   choices to the user. No visible vault does not mean no vault exists.
5. After the user selects a new vault, create only that chosen directory. For an
   existing vault, leave its organization and notes intact. Follow Unified Brain's
   additive initialization instructions; do not copy a starter vault over it.
6. Inspect the existing Unified Brain registration. Reuse its exact project ID,
   brain_root and documents_root. For a new project, preview `projects.py setup`
   from the installed Unified Brain package, then apply within the selected scope.
   Do not move plans, rewrite reports or create duplicate project folders. Changing
   a registry is a separate migration; this script does not change it.
7. Configure the active engine using its installed help and the matching Unified
   Brain guide. Preserve other servers, comments, permissions and instructions.
   Keep host paths and credentials out of project.yaml. Engine setup can require
   a session restart; report that precisely rather than claiming connection success.
8. Discover the six v0.2 tools and verify `brain_projects` matches the intended
   registry. Read the project overview. Then preview the mapping script below.
   Apply only the reviewed mapping. It refuses a different existing mapping.
9. Inspect `agentos context <engine> --task <task-id>`. For older generated
   instructions, review `agentos doctor --fix --dry-run`, then `agentos doctor --fix`
   to update AgentOS-owned blocks. Do not replace whole instruction files.
10. Run the actual-engine acceptance steps below. Record connection failures
    and unknowns. Do not mark a connection verified just because configuration exists.

## Portable mapping and script

This is a fictional example; do not register Sample Project for a real project.
Run from the target workspace (or pass `--cwd`). `<agentos-package>` is the
installed package directory containing `dist/`, `scripts/` and `docs/`; in a
source checkout run `npm run build` first. The script also ships in the npm package.

```sh
node <agentos-package>/scripts/setup-shared-memory.mjs \
  --project-id sample-project --store-id personal-brain \
  --connection obsidian-brain \
  --brain-root Brain/Projects/Sample-Project \
  --documents-root Projects/Sample-Project
```

Default: preview, no writes. Repeat with `--apply` to add only this block to
`.agentos/project.yaml`, preserving other configuration. Existing identical
mappings are a no-op; conflicting mappings are refused. The workspace writer
lock and atomic write protect cooperating AgentOS writers. Vault notes, global
engine config and user instructions are never changed by this script.

```yaml
knowledge:
  shared_memory:
    contract_version: 1
    provider: unified-brain
    project_id: sample-project
    store_id: personal-brain
    connection: obsidian-brain
    brain_root: Brain/Projects/Sample-Project
    documents_root: Projects/Sample-Project
```

`store_id` is a declared portable label. Unified Brain v0.2 has no store-identity
handshake, so it is NOT server-verified identity. Check the actual configured
vault and readback before use. Folder spelling must match the registry, including
case. This contract restricts components to letters, numbers, spaces, `_` and `-`;
unsupported existing layouts require review, never automatic relocation.

There is no implicit default mapping. `enabled: false` disables this integration
without deleting its config or notes. Invalid configuration is reported by
status/doctor and remains missing in context; local Brain/checkpoint/resume remain
available. The script refuses to silently replace or re-enable an existing mapping.

## Runtime paths and scope

MCP uses the Python executable, server.py and vault path visible to the engine's
runtime. Windows/WSL/container paths may differ while referring to the same files.
For Docker, bind the chosen vault explicitly and install dependencies in the
container; a missing mount is not a reason to create an independent vault copy.
Hermes instructions apply to the actual compatible installation, not to a presumed
OS or container layout. Unified Brain v0.2 uses stdio, not an HTTP endpoint.

`BRAIN_SCOPES` controls tool access independently of project filtering. A `Brain`
scope includes other projects. Do not widen it to fix discovery without explaining
the access change. Reports/Plans outside Brain require explicit scopes.

## Retrieval, failures and completeness

Before planning, verify the mapping with `brain_projects`, search with the exact
project ID, read relevant results and inspect actual code. Use checkpoint listings
as candidates; match task/branch/repository before resuming. Do not bulk-load a vault.

`status`, `doctor --json` and `context --json` distinguish invalid, disabled and
configured-unverified mappings. They do not inspect an engine's MCP session.
`context` renders the contract as mandatory instructions within its token budget
and lists external knowledge as missing. Consequently `--require-complete` fails
while shared memory is enabled in this milestone, even after a manual tool trial.
No receipt ingestion or proof-of-retrieval gate is implemented yet. Do not disable
memory just to make that flag pass or interpret local diagnostics as external health.

Without MCP support or on connection failure, record local progress and state that
shared knowledge is unavailable. Continue only work independent of that knowledge;
stop dependent decisions until it is available. Keep unpublished summaries in a
local run note with the task/checkpoint reference. There is no automatic retry queue.
Do not fall back to unrestricted vault writes or claim successful publication.

## Backend versions and remaining limits

Use Unified Brain v0.2.1 for new pilots and inspect the actual tool schema after
restarting the engine. The separately tested patch rejects unknown project IDs,
fixes discovery with individual registry-file scopes, validates all checkpoint
supersession paths, adds task identity and supports keyed retries. It is not
bundled with AgentOS; AgentOS cannot detect that the installed server has it.

Pass the repository task ID as `task_id` to `brain_checkpoint` and optionally
filter `brain_checkpoints` by it. Supersession requires the same project, explicit
task ID and test status. Legacy checkpoints without task IDs stay readable; do
not invent IDs or supersede them. A newest timestamp is still not repository truth.

Before a logical write, retain a unique `request_id` in local task state. Reuse
it with the unchanged payload after a timeout/restart. v0.2.1 returns the original
entry; a changed payload is refused. Keys are scoped by project and memory kind.
This requires unchanged registry mappings and retained notes. Calls without keys
can duplicate; different keys do not provide semantic deduplication. There is no
automatic conflict resolution or consolidation.

The original v0.2 backend has none of these protections: unknown project IDs can
route to global folders, narrow registry scopes break discovery, generic checkpoint
writes bypass validation, supersession can hide another task and retries duplicate.
For older or unknown servers, use `brain_checkpoint`, avoid supersession and
reconcile uncertain writes by search/read before retrying. Upgrade before rollout.

Neither version verifies store identity or ensures an engine follows instructions.
Full registry visibility is required for setup overlap checks; narrow scopes may
be reused for normal operations. Engine-specific snippets must be checked against
installed versions, not treated as universal schemas.

## Acceptance and migration

Automated tests cover new/existing workspace mapping, preservation, repeated setup,
invalid/disabled config, nested workspace lookup, context completeness and local
continuity without an external service. Context rendering for different engine
names is not an actual-engine trial.

For each real engine: discover all six tools; verify mapping and overview; write a
unique marked test checkpoint (`is_test=true`, `task_id`, retained `request_id`); search/read its returned path;
retry the same request ID and verify the same path is returned; confirm default listings exclude it; restart and retrieve it without pasting its
contents. Inspect skipped/truncated results. Record engine version, task, source
path and observed result, never credentials.

For a real handoff: engine A completes a small repository task, saves its local
checkpoint and a marked shared trial summary. A fresh engine B receives only the
task identity, retrieves the relevant summary, inspects current Git/files, and
performs the next action. Repeat in reverse and with changed repository state:
old test results must not be treated as current. Test an unavailable connection,
wrong project/store mapping, and a failed write; local recovery must remain usable.

Keep `knowledge.obsidian`, vault-backed records and all old commands supported.
Both integrations may coexist, with a warning to prevent duplicate publication.
Inventory legacy records, mirrors (including edited copies), plans and pending
proposals before opting out. Never disable a vault-canonical reader before a tested
replacement retrieves its records. No commands are removed or formally deprecated
in this milestone. Future deprecation follows real-engine validation and a
reviewable per-project migration; no automatic note moves or deletions.
