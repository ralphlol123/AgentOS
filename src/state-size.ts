/** Size reporting for the live state files (`.agentos/handoff.md`, `.agentos/tasks.md`).
 *
 * Pure and read-only. Compaction can only archive history it recognises by heading, so a file whose
 * bulk sits in a few large or unrecognised sections cannot shrink, and nothing used to say so. These
 * helpers let `compact`, `doctor` and `status` name the largest sections instead of staying silent.
 */
import { markdownHeadings, unfencedLines } from './markdown.js';

/**
 * A live state file over this many characters is reported by `doctor` and `status`.
 * Every engine is told to read these files first, and 50,000 chars is roughly 12k tokens.
 * Observed healthy workspaces are well under it (3k to 30k); the one that prompted this was at 385k.
 */
export const STATE_SIZE_WARN_CHARS = 50_000;

/** Title of the entry for any text that precedes the first heading. */
const START_OF_FILE = 'start of file';

export interface SectionSize {
  title: string;
  /** 1-based line of the `# ` or `## ` heading, or 1 for the start-of-file entry. */
  line: number;
  /** Characters from the start of the block to the start of the next block (or EOF). */
  chars: number;
}

/**
 * Blocks of a Markdown document, fence-aware, with exact sizes that sum to `text.length`.
 * A block runs from a level-1 or level-2 heading to the next one. Deeper headings stay inside their
 * block, and text before the first heading is its own "start of file" block.
 */
export function sectionSizes(text: string): SectionSize[] {
  const blocks = markdownHeadings(text)
    .filter((heading) => heading.level <= 2)
    .map((heading) => ({ title: heading.title, start: heading.start }));
  if ((blocks[0]?.start ?? text.length) > 0) blocks.unshift({ title: START_OF_FILE, start: 0 });
  const sections: SectionSize[] = [];
  let line = 1;
  let cursor = 0;
  blocks.forEach((block, index) => {
    for (let i = cursor; i < block.start; i++) if (text.charCodeAt(i) === 10) line++;
    cursor = block.start;
    sections.push({ title: block.title, line, chars: (blocks[index + 1]?.start ?? text.length) - block.start });
  });
  return sections;
}

const TASK_ITEM = /^ {0,3}[-*+][ \t]+\[([ xX])\](.*)$/;
const COMPLETION_WORD = /\b(?:DONE|MERGED|DELIVERED|COMPLETED|CLOSED|SHIPPED)\b/;
const COPY_FIRST = 'copy them to `.agentos/runs/` first';

/**
 * Shape warnings for `.agentos/tasks.md` (doctor only, never a problem): checkbox items above the first
 * `##` section, more than one level-1 heading, and unchecked items whose lead claims completion.
 * Fence-aware. An item runs from its top-level checkbox line to the next item or heading.
 */
export function tasksShapeWarnings(text: string): string[] {
  const headings = markdownHeadings(text);
  const items = unfencedLines(text).flatMap((l) => {
    const m = l.text.match(TASK_ITEM);
    return m ? [{ line: l.line, start: l.start, checked: m[1] !== ' ', body: m[2].trim() }] : [];
  });
  const stops = [...items.map((i) => i.start), ...headings.map((h) => h.start), text.length].sort((a, b) => a - b);
  const sized = items.map((i) => ({ ...i, chars: stops.find((s) => s > i.start)! - i.start }));
  const sum = (list: typeof sized) => list.reduce((n, i) => n + i.chars, 0);
  const lines = (nums: number[], max = nums.length) => `line${nums.length > 1 ? 's' : ''} ${nums.slice(0, max).join(', ')}${nums.length > max ? ', ...' : ''}`;
  const warnings: string[] = [];

  const firstSection = headings.find((h) => h.level === 2)?.start ?? text.length;
  const above = sized.filter((i) => i.start < firstSection);
  if (above.length) warnings.push(`.agentos/tasks.md has ${above.length} task item(s) (${sum(above)} chars) above the first ## section; move them under ## Now/Next/Later or delete finished ones (${COPY_FIRST}).`);

  const level1 = headings.filter((h) => h.level === 1);
  if (level1.length > 1) warnings.push(`.agentos/tasks.md has ${level1.length} level-1 headings (${lines(level1.map((h) => h.line))}); keep one and put tasks under ## Now/Next/Later.`);

  const claims = sized.filter((i) => !i.checked && COMPLETION_WORD.test(i.body.match(/^\*\*(.+?)\*\*/)?.[1] ?? i.body.slice(0, 120)));
  if (claims.length) warnings.push(`.agentos/tasks.md has ${claims.length} unchecked item(s) (${sum(claims)} chars) whose lead uses a completion word such as DONE or MERGED (${lines(claims.map((i) => i.line), 3)}); check them off or delete finished ones (${COPY_FIRST}).`);
  return warnings;
}

export function largestSections(text: string, limit: number): SectionSize[] {
  return sectionSizes(text).sort((a, b) => b.chars - a.chars || a.line - b.line).slice(0, limit);
}
