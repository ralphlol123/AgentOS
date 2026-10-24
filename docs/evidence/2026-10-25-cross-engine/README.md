# Evidence: AgentOS v1 cross-engine trials, 2026-10-25

Copied unchanged from Phynceon's host-side trial folder (`agentos-v1-xengine-20261025`). Start with [REPORT.md](REPORT.md).

- Included: `REPORT.md`, `SHA256SUMS`, the prompts (`claude-prompt.txt`, `claude-prompt2.txt`, `codex-prompt.txt`, `codex-prompt2.txt`), the raw transcripts that contain no host home paths (`claude-run1.json`, `claude-run2.json`, `claude-run3.json`, `claude-run2.err` (empty), `codex-run{1,2,3}.log`, `codex-run{1,2,3}.out`), and `checkpoints/` (the AgentOS records and evidence logs written during T1/T2).
- Omitted: `claude-run1.err` — it names the trial host's home directory (the path of the Claude Code user config). Its content is the T3a stderr line quoted in REPORT.md ("Ignoring 1 permissions.allow entry … workspace has not been trusted").

Verify the copied files with `sha256sum -c --ignore-missing SHA256SUMS` (14 OK; the omitted file is the only line skipped). `SHA256SUMS` does not cover `checkpoints/`.
