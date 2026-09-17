/** Canonical section recognition for AgentOS live state.
 *
 * AgentOS handoff/tasks files are written by agents, so headings drift:
 * `## Current objective — 2026-09-15 (latest): AUM work merged` is the same
 * section as `## Current objective`. Recognition is deliberately bounded:
 * a documented delimiter must separate the canonical title from a suffix, so
 * `## Previous objective` and `## Current objectives backlog` never match.
 */
import { createHash } from 'node:crypto';
import { markdownHeadings } from './markdown.js';
/** Section roles that belong to live `.agentos/handoff.md`. */
export const HANDOFF_ROLES = [
    { role: 'current-objective', canonical: 'Current objective' },
    { role: 'next-exact-action', canonical: 'Next exact action' },
];
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Match a heading title against a canonical AgentOS section title.
 * Accepts case and whitespace differences plus a documented suffix delimiter
 * (em dash, en dash, spaced hyphen, or colon). Returns the suffix as data.
 */
export function matchSectionTitle(rawTitle, canonical) {
    const base = escapeRegExp(canonical).replace(/\s+/g, '\\s+');
    const pattern = new RegExp('^(?:'
        + `\\s*${base}\\s*`
        + `|\\s*${base}\\s*(?:—|–)\\s*(.*)`
        + `|\\s*${base}\\s+-\\s+(.*)`
        + `|\\s*${base}\\s*:\\s*(.*)`
        + ')$', 'i');
    const match = rawTitle.match(pattern);
    if (!match)
        return null;
    const suffix = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    return { suffix };
}
function lineNumberAt(text, offset) {
    let line = 1;
    for (let i = 0; i < offset && i < text.length; i++)
        if (text[i] === '\n')
            line++;
    return line;
}
/**
 * Find every recognized section for the requested roles.
 * Only real level-2 headings outside fenced code blocks are considered, and a
 * single heading is attributed to at most one role (first role wins).
 */
export function recognizeSections(text, roles) {
    const headings = markdownHeadings(text);
    const sections = [];
    headings.forEach((heading, index) => {
        if (heading.level !== 2)
            return;
        for (const { role, canonical } of roles) {
            const matched = matchSectionTitle(heading.title, canonical);
            if (!matched)
                continue;
            const next = headings.slice(index + 1).find((candidate) => candidate.level === heading.level);
            const sectionEnd = next?.start ?? text.length;
            sections.push({
                role,
                canonical,
                suffix: matched.suffix,
                headingText: heading.title,
                level: heading.level,
                line: lineNumberAt(text, heading.start),
                start: heading.start,
                end: heading.end,
                raw: text.slice(heading.start, sectionEnd).trimEnd(),
                body: text.slice(heading.end, sectionEnd).trim(),
            });
            break;
        }
    });
    return sections;
}
/** Objective/section text including content that lives in the heading suffix. */
export function sectionText(section) {
    return [section.suffix, section.body].filter((part) => part && part.trim()).join('\n\n').trim();
}
/** A present heading with no suffix text and no body text is empty, not missing. */
export function isEmptySection(section) {
    return sectionText(section).length === 0;
}
/** Discover current-objective candidates with stable IDs bound to source bytes. */
export function discoverObjectives(text) {
    return recognizeSections(text, [HANDOFF_ROLES[0]]).map((section) => ({
        id: `obj-${createHash('sha256').update(section.raw).digest('hex').slice(0, 10)}`,
        heading: section.headingText,
        line: section.line,
        text: sectionText(section),
        section,
    }));
}
/** Resolve the one objective all read-only and compaction consumers should use. */
export function resolveObjective(text, requestedId) {
    const candidates = discoverObjectives(text);
    const requested = requestedId?.trim();
    if (requested) {
        const selected = candidates.find((candidate) => candidate.id === requested);
        if (!selected) {
            const valid = candidates.length ? `; valid candidates are ${candidates.map((candidate) => candidate.id).join(', ')}` : '';
            return { kind: 'invalid-selector', candidates, diagnostic: `.agentos/handoff.md: unknown --objective ${requested}${valid}.` };
        }
        if (!selected.text)
            return { kind: 'empty', candidates, diagnostic: '.agentos/handoff.md ## Current objective is empty.' };
        return { kind: 'resolved', candidates, selected };
    }
    if (!candidates.length) {
        return { kind: 'missing', candidates, diagnostic: '.agentos/handoff.md has no recognized ## Current objective section.' };
    }
    if (candidates.length > 1) {
        return {
            kind: 'ambiguous',
            candidates,
            diagnostic: `.agentos/handoff.md contains ${candidates.length} current-objective headings (lines ${candidates.map((candidate) => candidate.line).join(', ')}); explicit objective selection is required.`,
        };
    }
    const [selected] = candidates;
    if (!selected.text)
        return { kind: 'empty', candidates, diagnostic: '.agentos/handoff.md ## Current objective is empty.' };
    return { kind: 'resolved', candidates, selected };
}
//# sourceMappingURL=context-sections.js.map