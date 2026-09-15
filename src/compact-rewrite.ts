/** Pure planner for `agentos compact --rewrite`.
 *
 * Compaction must not treat "archived" as "safe to forget". This module
 * classifies live state into three decisions — `live`, `preserved`, `archived`
 * — using source text only: it never summarizes prose, never invents missing
 * fields, and blocks the rewrite whenever it cannot establish which objective
 * is current. Callers archive the originals byte-for-byte before replacing
 * anything on disk.
 */
import { createHash } from 'node:crypto';
import { hasUnclosedFence, markdownHeadings } from './markdown.js';
import { matchSectionTitle } from './context-sections.js';

export type SectionDecision = 'live' | 'preserved' | 'archived';
export type SourceFile = 'handoff' | 'tasks';

export interface SectionPlan {
  file: SourceFile;
  heading: string;
  line: number;
  role: string;
  decision: SectionDecision;
  reason: string;
}

export interface ObjectiveCandidate {
  id: string;
  heading: string;
  line: number;
  text: string;
}

export interface CompactRewriteInput {
  handoff: string;
  tasks: string;
  objectiveId?: string;
  archiveRelPath?: string;
}

export interface CompactRewritePlan {
  ok: boolean;
  blockedReasons: string[];
  objectiveCandidates: ObjectiveCandidate[];
  selectedObjectiveId?: string;
  handoff: string;
  tasks: string;
  classification: { handoff: SectionPlan[]; tasks: SectionPlan[] };
  /** Constraint lines carried forward verbatim from archived history sections. */
  carriedForward: string[];
  /** Canonical sections with no source material, as `<canonical> (<file>.md)`; omitted from the output. */
  missing: string[];
  archiveRelPath: string;
  sizes: {
    handoffBefore: number; handoffAfter: number;
    tasksBefore: number; tasksAfter: number;
    before: number; after: number; delta: number;
  };
}

interface RoleDef {
  role: string;
  canonical: string;
  aliases: string[];
}

/** Canonical handoff roles, in the order the rewrite emits them. */
const HANDOFF_SECTION_ROLES: RoleDef[] = [
  { role: 'current-objective', canonical: 'Current objective', aliases: ['Current objective'] },
  { role: 'scope', canonical: 'Scope', aliases: ['Scope'] },
  { role: 'current-state', canonical: 'Current state', aliases: ['Current state', 'Current status'] },
  { role: 'next-exact-action', canonical: 'Next exact action', aliases: ['Next exact action', 'Next action', 'Next step'] },
  {
    role: 'protected',
    canonical: 'Protected paths and constraints',
    aliases: ['Protected paths and constraints', 'Protected paths', 'Protected files / do not touch', 'Protected files', 'Protected branches', 'Do not touch', 'Constraints'],
  },
  {
    role: 'blockers',
    canonical: 'Blockers and warnings',
    aliases: ['Blockers and warnings', 'Known failures', 'Known warnings / failures', 'Known warnings', 'Warnings', 'Blocked'],
  },
  { role: 'decisions', canonical: 'Open decisions', aliases: ['Open decisions', 'Decisions'] },
  { role: 'preserved', canonical: 'Preserved context', aliases: ['Preserved context'] },
  { role: 'history', canonical: 'History', aliases: ['History'] },
];

const TASKS_SECTION_ROLES: RoleDef[] = [
  { role: 'now', canonical: 'Now', aliases: ['Now'] },
  { role: 'next', canonical: 'Next', aliases: ['Next'] },
  { role: 'later', canonical: 'Later', aliases: ['Later'] },
  { role: 'blocked', canonical: 'Blocked', aliases: ['Blocked'] },
  { role: 'preserved', canonical: 'Preserved context', aliases: ['Preserved context'] },
  { role: 'history', canonical: 'History', aliases: ['History'] },
];

const HISTORY_WORDS = /^(previous|superseded|past|old|historic|archived|earlier)$/i;
const HISTORY_HEADINGS = /^(history|done|completed|completed work|archived work|archive|run log|run logs)$/i;
const HISTORY_NOUNS = /^(objective|objectives|state|status|scope|work|notes|note|run|runs|sprint|session|iteration|step|log|logs|context|tasks|next exact action|next action)$/i;

/**
 * Standing constraints are not history, even when they were written inside a
 * historical section. Lines matching this heuristic are carried forward
 * verbatim when their section is archived; the rest of the section is archived.
 * This is a conservative safety net, not a semantic classifier.
 */
const CONSTRAINT_LINE = /\b(?:do not|don't|never|must not|must never|requires? (?:explicit )?approval|without (?:explicit )?approval|only with approval|await(?:s|ing)? (?:approval|explicit approval)|before (?:touching|merging|deploying|committing|pushing|releasing)|protected(?: path| file| files| branch| repo)?|do not touch|no secrets|no migrations)\b/i;

const CARRIED_HEADING = 'Constraints carried forward from archived history';
const HISTORY_NOTE = 'Archived material is preserved verbatim, with byte hashes, under `.agentos/runs/` archives.';

interface SourceSection {
  heading: string;
  line: number;
  raw: string;
  body: string;
  role?: string;
  suffix: string;
  history: boolean;
}

interface Outcome { decision: SectionDecision; reason: string }

function lineNumberAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

function splitDocument(text: string): { preamble: string; nl: string; sections: SourceSection[] } {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const headings = markdownHeadings(text).filter((heading) => heading.level === 2);
  const preamble = headings.length ? text.slice(0, headings[0].start) : text;
  const sections: SourceSection[] = headings.map((heading, index) => {
    const end = headings[index + 1]?.start ?? text.length;
    return {
      heading: heading.title,
      line: lineNumberAt(text, heading.start),
      raw: text.slice(heading.start, end).trimEnd(),
      body: text.slice(heading.end, end).trim(),
      suffix: '',
      history: false,
    };
  });
  return { preamble, nl, sections };
}

function roleFor(title: string, roles: RoleDef[]): { role: string; suffix: string } | null {
  for (const def of roles) {
    for (const alias of def.aliases) {
      const matched = matchSectionTitle(title, alias);
      if (matched) return { role: def.role, suffix: matched.suffix };
    }
  }
  return null;
}

function isHistoryHeading(title: string): boolean {
  const plain = title.trim().replace(/\s+/g, ' ');
  if (HISTORY_HEADINGS.test(plain)) return true;
  const [first, ...rest] = plain.split(' ');
  if (!HISTORY_WORDS.test(first ?? '')) return false;
  const remainder = rest.join(' ').replace(/[—–:.,].*$/, '').trim();
  if (!remainder) return false;
  return HISTORY_NOUNS.test(remainder);
}

function classify(sections: SourceSection[], roles: RoleDef[]): void {
  for (const section of sections) {
    const matched = roleFor(section.heading, roles);
    if (matched) {
      section.role = matched.role;
      section.suffix = matched.suffix;
    }
    // Live containers (`## Preserved context`, `## History`) are part of the
    // canonical shape, so their headings are never read as history sections.
    const container = section.role === 'preserved' || section.role === 'history';
    section.history = !container && isHistoryHeading(section.heading);
  }
}

function hasUnresolvedWork(text: string): boolean {
  return /^\s*(?:[-*+]|\d+\.)\s+\[ \]/m.test(text);
}

/** Constraint-looking lines outside fenced code blocks, in source order. */
function constraintLines(body: string): string[] {
  const lines: string[] = [];
  let fence: { char: string; length: number } | undefined;
  for (const raw of body.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const line = raw.replace(/\r?\n$/, '');
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (marker) { fence = { char: marker[1][0], length: marker[1].length }; continue; }
    if (line.trim() && CONSTRAINT_LINE.test(line)) lines.push(line.trim());
  }
  return lines;
}

function objectiveIdFor(section: SourceSection): string {
  return `obj-${createHash('sha256').update(section.raw).digest('hex').slice(0, 10)}`;
}

function sectionText(section: SourceSection): string {
  return [section.suffix, section.body].filter((part) => part && part.trim()).join('\n\n').trim();
}

function renderEntries(entries: { heading: string; body: string }[], nl: string): string {
  return entries.map((entry) => `## ${entry.heading}${nl}${nl}${entry.body}`.trimEnd()).join(`${nl}${nl}`);
}

/**
 * Plan a structural rewrite of `.agentos/handoff.md` and `.agentos/tasks.md`.
 * Pure: performs no I/O, and returns empty proposals when the rewrite is blocked.
 */
export function planCompactRewrite(input: CompactRewriteInput): CompactRewritePlan {
  const handoffText = input.handoff ?? '';
  const tasksText = input.tasks ?? '';
  const archiveRelPath = input.archiveRelPath ?? '';
  const blocked: string[] = [];

  if (hasUnclosedFence(handoffText)) blocked.push('.agentos/handoff.md has an unclosed Markdown fence; --rewrite cannot classify sections reliably. Repair the fence first.');
  if (hasUnclosedFence(tasksText)) blocked.push('.agentos/tasks.md has an unclosed Markdown fence; --rewrite cannot classify sections reliably. Repair the fence first.');
  if (!handoffText.trim()) blocked.push('.agentos/handoff.md is empty; there is no live context to rewrite.');
  if (!tasksText.trim()) blocked.push('.agentos/tasks.md is empty; there is no live task state to rewrite.');

  const documents = { handoff: splitDocument(handoffText), tasks: splitDocument(tasksText) };
  classify(documents.handoff.sections, HANDOFF_SECTION_ROLES);
  classify(documents.tasks.sections, TASKS_SECTION_ROLES);

  const objectiveSections = documents.handoff.sections.filter((section) => section.role === 'current-objective' && !section.history);
  const candidates: ObjectiveCandidate[] = objectiveSections.map((section) => ({
    id: objectiveIdFor(section),
    heading: section.heading,
    line: section.line,
    text: sectionText(section),
  }));

  let selected: SourceSection | undefined;
  if (!objectiveSections.length) {
    blocked.push('.agentos/handoff.md has no recognized ## Current objective section; --rewrite requires an explicit objective selection.');
  } else if (objectiveSections.length === 1) {
    [selected] = objectiveSections;
  } else {
    const requested = input.objectiveId?.trim();
    const index = requested ? candidates.findIndex((candidate) => candidate.id === requested) : -1;
    if (requested && index < 0) {
      blocked.push(`.agentos/handoff.md: unknown --objective ${requested}; valid candidates are ${candidates.map((candidate) => candidate.id).join(', ')}.`);
    } else if (!requested) {
      blocked.push(`.agentos/handoff.md has ${objectiveSections.length} current-objective headings; --rewrite requires an explicit objective selection (--objective <id>): ${candidates.map((candidate) => `${candidate.id} (line ${candidate.line})`).join(', ')}.`);
    } else {
      selected = objectiveSections[index];
    }
  }

  if (selected && !sectionText(selected)) {
    blocked.push('.agentos/handoff.md ## Current objective is empty; --rewrite will not invent an objective.');
    selected = undefined;
  }

  const sizes = (handoffAfter: number, tasksAfter: number) => ({
    handoffBefore: handoffText.length, handoffAfter,
    tasksBefore: tasksText.length, tasksAfter,
    before: handoffText.length + tasksText.length, after: handoffAfter + tasksAfter,
    delta: handoffAfter + tasksAfter - (handoffText.length + tasksText.length),
  });

  if (blocked.length) {
    return {
      ok: false,
      blockedReasons: blocked,
      objectiveCandidates: candidates,
      handoff: '',
      tasks: '',
      classification: { handoff: [], tasks: [] },
      carriedForward: [],
      missing: [],
      archiveRelPath,
      sizes: sizes(0, 0),
    };
  }

  const selectedId = objectiveIdFor(selected);
  const outcomes = new Map<SourceSection, Outcome>();
  const carriedByFile: Record<SourceFile, string[]> = { handoff: [], tasks: [] };
  const classification: { handoff: SectionPlan[]; tasks: SectionPlan[] } = { handoff: [], tasks: [] };
  const missing: string[] = [];

  for (const file of ['handoff', 'tasks'] as const) {
    for (const section of documents[file].sections) {
      let outcome: Outcome;
      if (section.role === 'current-objective' && !section.history) {
        if (section === selected) outcome = { decision: 'live', reason: 'selected current objective' };
        else if (hasUnresolvedWork(section.raw)) outcome = { decision: 'preserved', reason: 'superseded objective kept live: contains unresolved task blocks' };
        else outcome = { decision: 'archived', reason: 'superseded objective; explicit selection resolved which objective is live' };
      } else if (section.role === 'preserved') {
        outcome = { decision: 'preserved', reason: 'live preserved-context container re-emitted verbatim' };
      } else if (section.role === 'history') {
        outcome = { decision: 'preserved', reason: 'live history container re-emitted with new archive entries' };
      } else if (section.history) {
        outcome = hasUnresolvedWork(section.raw)
          ? { decision: 'preserved', reason: 'history section kept live: contains unresolved task blocks' }
          : { decision: 'archived', reason: 'explicit history section with no unresolved task blocks' };
      } else if (section.role) {
        outcome = { decision: 'live', reason: 'canonical live section' };
      } else {
        outcome = { decision: 'preserved', reason: 'unclassified section preserved verbatim' };
      }
      if (outcome.decision === 'archived') {
        const lines = constraintLines(section.body);
        if (lines.length) {
          for (const line of lines) if (!carriedByFile[file].includes(line)) carriedByFile[file].push(line);
          outcome = { ...outcome, reason: `${outcome.reason}; ${lines.length} constraint line(s) carried forward verbatim` };
        }
      }
      outcomes.set(section, outcome);
      classification[file].push({ file, heading: section.heading, line: section.line, role: section.role ?? (section.history ? 'history' : 'unknown'), ...outcome });
    }
  }

  const rendered: Record<SourceFile, string> = { handoff: '', tasks: '' };
  for (const [file, roles] of [['handoff', HANDOFF_SECTION_ROLES], ['tasks', TASKS_SECTION_ROLES]] as const) {
    const document = documents[file];
    const entries: { heading: string; body: string }[] = [];
    const renderedSections = new Set<SourceSection>();

    for (const def of roles) {
      if (def.role === 'preserved' || def.role === 'history') continue;
      const sections = document.sections.filter((section) => section.role === def.role && !section.history);
      const live = sections.filter((section) => outcomes.get(section)?.decision === 'live');
      if (!live.length) {
        missing.push(`${def.canonical} (${file}.md)`);
        continue;
      }
      for (const section of live) renderedSections.add(section);
      const heading = live[0].heading;
      // The selected objective keeps its original heading (including any suffix),
      // so only its body is re-emitted: the suffix is never duplicated into prose.
      const body = live.map((section) => section.body).filter(Boolean).join(`${document.nl}${document.nl}`);
      entries.push({ heading, body });
    }

    const preservedBlocks: string[] = [];
    for (const section of document.sections) {
      if (outcomes.get(section)?.decision !== 'preserved') continue;
      if (renderedSections.has(section)) continue;
      if (section.role === 'history') continue;
      // The `## Preserved context` container itself is re-emitted with its own body below.
      preservedBlocks.push(section.role === 'preserved'
        ? section.body
        : `### ${section.heading}${document.nl}${document.nl}${section.body}`);
    }
    if (carriedByFile[file].length) {
      preservedBlocks.push(`### ${CARRIED_HEADING}${document.nl}${document.nl}${carriedByFile[file].map((line) => `- ${line}`).join(document.nl)}`);
    }
    const preservedBody = preservedBlocks.filter(Boolean).join(`${document.nl}${document.nl}`);
    if (preservedBody) entries.push({ heading: 'Preserved context', body: preservedBody });

    const archived = classification[file].filter((plan) => plan.decision === 'archived');
    const existingHistory = document.sections
      .filter((section) => section.role === 'history' && !section.history)
      .map((section) => section.body)
      .filter(Boolean)
      .join(document.nl);
    const keptHistoryLines = existingHistory.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && line !== HISTORY_NOTE);
    const freshEntries = archived
      .map((plan) => `- Archived \`${plan.heading}\` (line ${plan.line}): ${plan.reason}.`)
      .filter((entry) => !keptHistoryLines.includes(entry));
    if (keptHistoryLines.length || freshEntries.length) {
      entries.push({ heading: 'History', body: [...keptHistoryLines, ...freshEntries, HISTORY_NOTE].join(document.nl) });
    }

    const body = renderEntries(entries, document.nl);
    const preamble = document.preamble.trim() ? document.preamble.trimEnd() : `# ${file === 'handoff' ? 'Handoff' : 'Tasks'}`;
    rendered[file] = `${preamble}${document.nl}${body ? `${document.nl}${body}` : ''}${document.nl}`;
  }

  return {
    ok: true,
    blockedReasons: [],
    objectiveCandidates: candidates,
    selectedObjectiveId: selectedId,
    handoff: rendered.handoff,
    tasks: rendered.tasks,
    classification,
    carriedForward: [...new Set([...carriedByFile.handoff, ...carriedByFile.tasks])],
    missing,
    archiveRelPath,
    sizes: sizes(rendered.handoff.length, rendered.tasks.length),
  };
}
