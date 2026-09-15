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
export declare const HANDOFF_ROLES: SectionRole[];
/**
 * Match a heading title against a canonical AgentOS section title.
 * Accepts case and whitespace differences plus a documented suffix delimiter
 * (em dash, en dash, spaced hyphen, or colon). Returns the suffix as data.
 */
export declare function matchSectionTitle(rawTitle: string, canonical: string): {
    suffix: string;
} | null;
/**
 * Find every recognized section for the requested roles.
 * Only real level-2 headings outside fenced code blocks are considered, and a
 * single heading is attributed to at most one role (first role wins).
 */
export declare function recognizeSections(text: string, roles: SectionRole[]): RecognizedSection[];
/** Objective/section text including content that lives in the heading suffix. */
export declare function sectionText(section: RecognizedSection): string;
/** A present heading with no suffix text and no body text is empty, not missing. */
export declare function isEmptySection(section: RecognizedSection): boolean;
