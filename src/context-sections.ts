/** Canonical section recognition for AgentOS live state.
 *
 * AgentOS handoff/tasks files are written by agents, so headings drift:
 * `## Current objective — 2026-09-15 (latest): AUM work merged` is the same
 * section as `## Current objective`. Recognition is deliberately bounded:
 * a documented delimiter must separate the canonical title from a suffix, so
 * `## Previous objective` and `## Current objectives backlog` never match.
 */
import { markdownHeadings } from './markdown.js';

export interface SectionRole {
  role: string;
  canonical: string;
}

export interface RecognizedSection {
  role: string;
  canonical: string;
  /** Text after the delimiter in the heading, e.g. `2026-09-15 (latest): AUM work merged`. */
  suffix: string;
  headingText: string;
  level: number;
  line: number;
  start: number;
  end: number;
  body: string;
}

/** Section roles that belong to live `.agentos/handoff.md`. */
export const HANDOFF_ROLES: SectionRole[] = [
  { role: 'current-objective', canonical: 'Current objective' },
  { role: 'next-exact-action', canonical: 'Next exact action' },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a heading title against a canonical AgentOS section title.
 * Accepts case and whitespace differences plus a documented suffix delimiter
 * (em dash, en dash, spaced hyphen, or colon). Returns the suffix as data.
 */
export function matchSectionTitle(rawTitle: string, canonical: string): { suffix: string } | null {
  const base = escapeRegExp(canonical).replace(/\s+/g, '\\s+');
  const pattern = new RegExp(
    '^(?:'
    + `\\s*${base}\\s*`
    + `|\\s*${base}\\s*(?:—|–)\\s*(.*)`
    + `|\\s*${base}\\s+-\\s+(.*)`
    + `|\\s*${base}\\s*:\\s*(.*)`
    + ')$',
    'i',
  );
  const match = rawTitle.match(pattern);
  if (!match) return null;
  const suffix = (match[1] ?? match[2] ?? match[3] ?? '').trim();
  return { suffix };
}

function lineNumberAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

/**
 * Find every recognized section for the requested roles.
 * Only real level-2 headings outside fenced code blocks are considered, and a
 * single heading is attributed to at most one role (first role wins).
 */
export function recognizeSections(text: string, roles: SectionRole[]): RecognizedSection[] {
  const headings = markdownHeadings(text);
  const sections: RecognizedSection[] = [];
  headings.forEach((heading, index) => {
    if (heading.level !== 2) return;
    for (const { role, canonical } of roles) {
      const matched = matchSectionTitle(heading.title, canonical);
      if (!matched) continue;
      const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
      sections.push({
        role,
        canonical,
        suffix: matched.suffix,
        headingText: heading.title,
        level: heading.level,
        line: lineNumberAt(text, heading.start),
        start: heading.start,
        end: heading.end,
        body: text.slice(heading.end, next?.start ?? text.length).trim(),
      });
      break;
    }
  });
  return sections;
}

/** Objective/section text including content that lives in the heading suffix. */
export function sectionText(section: RecognizedSection): string {
  return [section.suffix, section.body].filter((part) => part && part.trim()).join('\n\n').trim();
}

/** A present heading with no suffix text and no body text is empty, not missing. */
export function isEmptySection(section: RecognizedSection): boolean {
  return sectionText(section).length === 0;
}
