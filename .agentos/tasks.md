# Tasks

Active scope: AgentOS simplification audit. Plan, findings, decisions, evidence and queue: `.agentos/plans/2026-10-02-simplification-audit.md`. Four slices are merged on `main` (PRs #27–#30); nothing is released (`main` is 0.7.0 with six unreleased CHANGELOG entries). The long 0.4–0.7 delivery history that used to live here is in git: `git show e2575c6:.agentos/tasks.md`.

## Done

- [x] Catalog cleanup (0.4.0), migration UX (0.5.0), compaction rewrite and its fixes (0.5.1, 0.6.0) and simple-safe default compaction (0.7.0, PR #26): all merged and published; 0.7.0 is npm latest.
- [x] Engine discovery (PR #27, `5abdff4`): `.agentos/guide.md`, self-sufficient `status`/`handoff` in a child repo, CLI-first child pointers. Ablation evidence archived at `/home/hermes/agentos-archive/2026-10-02-engine-discovery-ablation/`.
- [x] Regenerated this repo's own adapters (PR #28, `208e44a`) after #27 left CI red.
- [x] State-size visibility (PR #29, `efc260f`): `doctor`/`status` warn over 50,000 chars; `compact --dry-run` lists the largest sections.
- [x] Engine stubs no longer generated (PR #30, `e2575c6`); existing stubs tolerated, never deleted.
- [x] Housekeeping (2026-10-02): dev checkout on `main` and built; merged worktree archived (`~/.hermes/backups/agentos-worktrees-20261002/`) and removed; dead `/tmp` worktree entries pruned.

## Now

- [ ] **Simplify AgentOS: pack a `0.8.0` candidate for the `app` user** (minor bump: six unreleased CHANGELOG entries). Install the exact tarball into a throwaway prefix, confirm `--version`, quote the shasum, check the `app` user can read the artifact. Publishing is the owner's call. Then the owner runs `agentos compact --dry-run` in KargaX and sends the "Largest sections" block, which decides the state-growth fix.

## Next

- [ ] Preserve `project.yaml` formatting on the `doctor --fix` regeneration path when the `repos:` mapping is not line-editable (flow style, comments). Slice 2 made workspaces with a non-canonical repo ID reach `fixAgentOSAdapters` instead of failing validation, and that path re-dumps the whole file (`stringifyYaml`), so comments/flow style are lost where the dedicated `--normalize-repo-ids` path deliberately refuses to edit. Content is preserved and no bytes are lost inside `.agentos/` semantics; this is a formatting-fidelity gap, not data loss. Minimal change: mirror `renameRepoIdKey`'s "refuse when not line-editable" rule in the regeneration path.
- [ ] State-growth fix, once the KargaX section titles are known: either recognise more heading shapes in `compact` or change how state is written (overwrite `handoff.md`, history to `runs/`, which is never auto-loaded). No new heuristics before that evidence.
- [ ] Untrack `dist/` (about 39 generated files): needs a `prepare` script, a `.gitignore` entry and a README change, and the `hermes` user's `agentos` is a symlink into a checkout so it must still build. Own slice.
- [ ] `agentos prompt`: deprecate (it duplicates the bootloaders and the guide), remove in a later release.
- [ ] Read the code before proposing merges: the three Obsidian entry points, `handoff` vs `run handoff`, `templates copy` vs `skills add`, `decisions.md`/`knowledge.md` into `memory.md`, constants in `project.yaml`.
- [ ] Upgrade-machinery deletion, gated on the support-horizon decision (keep every path the owner's workspaces have passed through; the owner runs `agentos doctor --json` in KargaX and Labahub first).
- [ ] **Follow-up, pre-existing and not a regression:** `refilterCarriedBlock` is line-based, so a fenced code sample inside `## Preserved context` that quotes `### Constraints carried forward from archived history` loses its heading and its bullet. Byte-identical to the shipped 0.5.1 build, recoverable from the run archive, and now documented as a known limit in `docs/compaction.md`.
- [ ] **Recorded decision (considered, rejected, not a defect):** archiving a block archives whatever is nested inside it — ride-along — mirroring the shipped level-2 rule. Per-descendant `## History` entries were considered and rejected: they would either bloat History with an entry per nested heading or block archival whenever a history block contains subheadings. Independent review accepted this after failing to construct material harm (412 adversarial unchecked-task cases, 0 leaks).
- [ ] **Documented limits of the slice C carry rule** (all deliberate, all pinned by tests in `test/compact-rewrite-carry-fragments.test.js`, all stated in `docs/compaction.md`): a line that opens on a code span reads as a continuation of the previous line; a line ending on a conjunction reads as truncated; the subject-before-modal window is six words, so `Accounts, locations and trips in the production database must not be modified without approval` (modal at token 9) stays in the archive. Widening the window past six words was measured to buy 3 more constructed obligations at the cost of admitting narrative, and the accepted false-positive class is a line that opens as an obligation and then continues as reported speech (`Guards must not be relied on here, the ticket explained …`) — carried, and harmless in a heuristic safety net.
- [ ] **Advisory to investigate:** two test suites running concurrently in one checkout leak fixture files into `templates/` — observed `templates/skills/core/debugging.md` losing its YAML frontmatter, `templates/agents/developer.md` losing a line, and a `name: wrong-id` card appearing at `templates/skills/github/debugging.md`. A single sequential run leaves the tree clean (verified). Consider forcing template fixtures under a temp root, or a pre-commit check that `templates/` is unmodified.
- [ ] Non-blocking doc nit from review: in the repeat-run sentence, the example "a deeper block above a later sibling" is attached to the "shallowest nested block is not itself archivable" condition, though in that shape the shallowest block *is* archivable and the later-pass archival is covered by the lead clause. Every asserted behaviour is true; the reviewer supplied exact tightening text if the sentence is touched again.
- [ ] Resume `agentos run` Phase 2 after release.
- [ ] Add richer local skill authoring/import UX.

## Later

- [ ] Add more specialized reusable agent templates when real projects justify them.
