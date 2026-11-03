# Handoff

## Current objective

Obsidian must open project Brain records from the index note. With `canonical: workspace` and an index note in a vault, every valid record outside the vault root gets a generated read-only copy at `<note folder>/Records/<slug>.md` (frontmatter `agentos_mirror_of`, `source`, `source_hash`, `mirror_hash`, `tags: [agentos-mirror]`, no `id:`), and the index links to it. No generated link may leave the vault. An edited copy is never overwritten or deleted and is warned about; in-workspace `knowledge/` gets `Records/.gitignore` (`*`). `canonical: vault`, `context`, checkpoints and clones without `.agentos/local.yaml` stay unchanged.

## Scope

- Repo: `agentos-for-projects`, single-repo workspace.
- Baseline: `main` at `d0b4160` (PR #80 merged), package 3.2.0. Unreleased; no version bump or release.
- Branch: `fix/obsidian-readonly-mirrors`; task id: `obsidian-readonly-mirrors`.
- Allowed changes: `src/brain.ts` (index note, mirrors, `brain check`), `src/core.ts` (`obsidian init|link`, `doctor`, output wording), tests, `docs/obsidian.md`, `README.md`, `docs/migration-project-brain.md`, `docs/project-brain-acceptance.md`, CHANGELOG Unreleased and this repository's AgentOS state.

## Current state

- `cfc9496`: RED. New `test/obsidian-mirrors.test.js`: at `d0b4160` 8 of 11 fail (links leave the vault: `../../../../p1-project/...`; no `Records/`), 3 pass (record count, idempotence, boundary guards).
- `baba3d8`: fix. `planMirrors` (read-only plan) + `writeMirrors` (inside the caller's mutation transaction) in `src/brain.ts`; `syncNote` writes copies before the note, so every Brain write and `brain index` refresh both; `obsidian init|link` write them with the note. `noteBlock` links out-of-vault records to their copy, or plain text plus the path when no copy can be written (`Records` not a folder, or a write failure). `brain check` and `doctor` warn about edited copies. Two more tests (plain-text fallback; `canonical: vault` unchanged); the first fails at `d0b4160`. Five older tests asserted the old out-of-vault links and were updated.
- `873062e`: docs and a CHANGELOG Unreleased `### Fixed` line.
- Real CLI on rebuilt stand-ins for Ralph's originals (`/mnt/c` is absent in this sandbox): both flows, upgrade of a `d0b4160` note, edit and propose/apply round trip, clone without the vault (`context --about tangerine` byte-identical to `d0b4160`), in-workspace `knowledge/` (nothing in `git status`), `canonical: vault` note byte-identical to `d0b4160`. Evidence outside the repo, in the task folder.
- All commits are local; nothing pushed.
- Previous state: `.agentos/runs/2026-11-04-before-obsidian-readonly-mirrors.md`.

## Next exact action

Phynceon reviews the local commits on `fix/obsidian-readonly-mirrors`, then pushes and opens a PR against `main`. Ralph runs the desktop check per flow (task report).

## Protected files / do not touch

- Secrets, .env files, migrations and production config.
- `.github/workflows/`, client workspaces, external Obsidian vaults and Hermes configuration.
- `package.json` version and CHANGELOG release headings (release PR).

## Open decisions

- Release version and merge remain separate from this implementation.
- `brain propose --from <copy>` refuses the copy (frontmatter); stripping the banner itself is a follow-up.
- `doctor` FAILs in a clone without `.agentos/local.yaml` (pre-existing); the `obsidian link` failure label says `--no-index`; WSL rejects `C:\` paths. All out of scope here.

<!-- agentos:checkpoint:start -->
## Checkpoint (managed)

- Task: obsidian-readonly-mirrors
- Record: `.agentos/checkpoints/obsidian-readonly-mirrors/2026-11-03T16-44-59-570Z-20556dd3.json`
- Repos: agentos-for-projects fix/obsidian-readonly-mirrors@f325ce2 (0 changed)
- Progress: Read-only copies for out-of-vault Brain records (canonical: workspace): RED cfc9496, fix baba3d8, docs 873062e, state commit. New test/obsidian-mirrors.test.js 13/13; full suite green; real CLI both flows on rebuilt originals: no index link leaves the vault, edited copy kept and warned, propose/app…
- Blockers: none
- Next: Phynceon reviews the local commits on fix/obsidian-readonly-mirrors, pushes and opens a PR against main; Ralph runs the desktop check per flow.
- Receipts: observed-pass 2, observed-fail 0, claimed 0, not-run 3, unavailable 0
- Resume: `agentos resume --task obsidian-readonly-mirrors`
<!-- agentos:checkpoint:end -->
