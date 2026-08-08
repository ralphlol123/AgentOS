# Safe Template Imports

AgentOS can import useful agent or skill material from local files or web URLs, but imports are review-first and project-local by default.

## Command

```bash
agentos templates import <url-or-file> --type agent|skill --name <id> [--mode summary|full] [--dry-run] [--yes] [--replace]
```

## Default behavior

Imports are dry-run by default unless `--yes` is provided.

Dry-run:

```bash
agentos templates import ./external-skill.md --type skill --name external-skill --dry-run
```

Equivalent safe default:

```bash
agentos templates import ./external-skill.md --type skill --name external-skill
```

Write after review:

```bash
agentos templates import ./external-skill.md --type skill --name external-skill --yes
```

## What dry-run shows

The importer prints:

```text
Root
Source
Detected type
Name
SHA256
Bytes
Review findings
Target path
```

## Safety review

The MVP scanner reports:

- secret-like words, such as `api_key`, `secret`, `token`, `password`, or `private_key`;
- dangerous command patterns, such as `rm -rf`, `sudo`, `curl | sh`, `wget | bash`, `git push`, `npm publish`, `kubectl apply`, or `terraform apply`;
- prompt-injection-like text that attempts to override prior instructions or reveal secrets;
- permissive license hints, currently MIT/Apache/BSD/ISC pattern hints;
- missing license hints;
- large content over the compact threshold.

Prompt-injection-like content blocks runtime materialization:

```text
BLOCK: prompt-injection-like instruction detected.
```

Blocked imports are written to a quarantine review file under:

```text
.agentos/imports/quarantine/
```

The quarantine file preserves the original content, source, SHA256, and review findings so the source can be inspected and cleaned without creating `.agentos/agents/` or `.agentos/skills/` runtime files.

Warnings do not block import, but they are intended to force human/agent review before `--yes`.

## Import destinations

Imported agent:

```text
.agentos/agents/<name>.md
```

Imported skill:

```text
.agentos/skills/imported/<name>/SKILL.md
```

Skill imports also update:

```text
.agentos/skills.md
```

## Overwrite protection

AgentOS refuses to overwrite existing project-local template files by default. This protects local edits made after a template was copied or imported.

If the target already exists, the command fails with recovery text and no file is changed. Replace only after review:

```bash
agentos templates import ./external-skill.md --type skill --name external-skill --yes --replace
```

The same rule applies to registry copies:

```bash
agentos templates copy agent:project-manager --replace
```

## Attribution metadata

Generated imports preserve:

```text
source
sha256
```

Skill imports include this metadata in frontmatter. Agent imports include it in the imported agent file.

## Summary vs full skill mode

Summary mode, the default, keeps imported skill content compact:

```bash
agentos templates import ./external.md --type skill --name external --mode summary --yes
```

Full mode preserves a larger excerpt:

```bash
agentos templates import ./external.md --type skill --name external --mode full --yes
```

Use full mode only when the extra detail is worth the token cost.

## Recommended workflow

1. Import with dry-run.
2. Review source, license, SHA256, target path, and warnings.
3. If the source is safe and reuse is allowed, rerun with `--yes`.
4. Run `agentos doctor`.
5. Commit the project-local imported file only if the team wants it versioned.

Example:

```bash
agentos templates import ./react-review.md --type skill --name react-review --dry-run
agentos templates import ./react-review.md --type skill --name react-review --yes
agentos doctor
```

## Current limitations

The MVP scanner uses conservative pattern checks. It is not a full malware scanner, license scanner, or legal review.

Do not import sensitive, proprietary, or license-unclear content into shared repositories without owner approval.
