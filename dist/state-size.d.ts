/**
 * A live state file over this many characters is reported by `doctor` and `status`.
 * Every engine is told to read these files first, and 50,000 chars is roughly 12k tokens.
 * Observed healthy workspaces are well under it (3k to 30k); the one that prompted this was at 385k.
 */
export declare const STATE_SIZE_WARN_CHARS = 50000;
export interface SectionSize {
    title: string;
    /** 1-based line of the `## ` heading. */
    line: number;
    /** Characters from the start of the heading to the start of the next level-2 heading (or EOF). */
    chars: number;
}
/** Level-2 sections of a Markdown document, fence-aware, with exact sizes. Text before the first section is not counted. */
export declare function sectionSizes(text: string): SectionSize[];
export declare function largestSections(text: string, limit: number): SectionSize[];
