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
/** Level-2 sections of a Markdown document, fence-aware, with exact sizes. Text before the first section is not counted. */
export function sectionSizes(text) {
    const headings = markdownHeadings(text).filter((heading) => heading.level === 2);
    const sections = [];
    let line = 1;
    let cursor = 0;
    headings.forEach((heading, index) => {
        for (let i = cursor; i < heading.start; i++)
            if (text.charCodeAt(i) === 10)
                line++;
        cursor = heading.start;
        sections.push({ title: heading.title, line, chars: (headings[index + 1]?.start ?? text.length) - heading.start });
    });
    return sections;
}
export function largestSections(text, limit) {
    return sectionSizes(text).sort((a, b) => b.chars - a.chars || a.line - b.line).slice(0, limit);
}
//# sourceMappingURL=state-size.js.map