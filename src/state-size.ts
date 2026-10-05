/** Size reporting for the live state files (`.agentos/handoff.md`, `.agentos/tasks.md`).
 *
 * Pure and read-only. Compaction can only archive history it recognises by heading, so a file whose
 * bulk sits in a few large or unrecognised sections cannot shrink, and nothing used to say so. These
 * helpers let `compact`, `doctor` and `status` name the largest sections instead of staying silent.
 */
import { markdownHeadings } from './markdown.js';

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

export function largestSections(text: string, limit: number): SectionSize[] {
  return sectionSizes(text).sort((a, b) => b.chars - a.chars || a.line - b.line).slice(0, limit);
}
