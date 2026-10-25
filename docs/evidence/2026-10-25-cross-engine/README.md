# Evidence: AgentOS v1 cross-engine trials, 2026-10-25

Copied unchanged from Phynceon's host-side trial folder (`agentos-v1-xengine-20261025`). Start with [REPORT.md](REPORT.md).

- Included: `REPORT.md`, `SHA256SUMS`, the prompts (`claude-prompt.txt`, `claude-prompt2.txt`, `codex-prompt.txt`, `codex-prompt2.txt`), the raw transcripts that contain no host home paths (`claude-run1.json`, `claude-run2.json`, `claude-run3.json`, `claude-run2.err` (empty), `codex-run{1,2,3}.log`, `codex-run{1,2,3}.out`), and `checkpoints/` (the AgentOS records and evidence logs written during T1/T2).
- Omitted: `claude-run1.err` — it names the trial host's home directory (the path of the Claude Code user config). Its content is the T3a stderr line quoted in REPORT.md ("Ignoring 1 permissions.allow entry … workspace has not been trusted").

Verify the copied files with `sha256sum -c --ignore-missing SHA256SUMS` (14 OK; the omitted file is the only line skipped). `SHA256SUMS` does not cover `checkpoints/`.

## closure/ — closure re-trials T6–T8 (Phynceon, host, 2026-10-25)

Copied unchanged and complete (22 files, nothing omitted) from the host trial folder `agentos-v1-xengine-20261025/closure/`. Start with [closure/REPORT-closure.md](closure/REPORT-closure.md). Checked before copying: no credentials, tokens or host home paths (paths are the `/tmp/aos-t2` fixture; `secret` is the placeholder content of the fixture's `.env.example`; session ids are engine run ids).

- `REPORT-closure.md` — T6a–T6d (Claude boundary probe, read-only role), T7 (Codex role block), T8 (Claude subagent invocation).
- `b1.txt`, `b2.txt` — probe prompts (10 and 14 items); `b1.json` (T6a, 856b61f rules), `b2.json` (T6b, 71cdb19 incl. `Edit/Write(/*)`), `b3.json` (T6c, 71cdb19 minus `/*`), `b4.json` (T6d, read-only role) — Claude Code JSON transcripts.
- `cl-sub.json` — T8 transcript; `claude-agent-developer.md.generated` — the synced subagent file used (role marker appended for the trial).
- `cx-role1.log/.out`, `cx-role2.log/.out` (launched in `web/`), `cx-ctrl2.log/.out` (root control), `cx-role.log/.out`, `cx-ctrl.out` (earlier runs, incl. the "Nothing else" prompt) — Codex logs for T7; `web-AGENTS.md.generated` — the synced role block with the marker.
- `settings.local.json.generated` (the 856b61f listed-path fragment), `settings.readonly.generated` (T6d) — generated settings.
- `SHA256SUMS` — `sha256sum -c SHA256SUMS` in `closure/`: 21 OK, 1 FAILED — the line for `SHA256SUMS` itself (it hashes the empty file, written before the list was filled); every other file matches.

## demo/ — connected-workflow demonstration on the final build (2026-10-25)
`REPORT-demo.md` walks init → role/scope → context → Claude Code → checkpoint → fresh Codex → Brain propose/apply → Obsidian folder, with prompts (`demo-claude.txt`, `demo-codex.txt`), transcripts (`demo-claude.json`, `demo-codex.log/.out`), checkpoint and Brain records, the generated settings and the vault index note. `SHA256SUMS` covers the folder. Host home paths in the Codex log are replaced by `<host-path>`.
