/** Source-preserving Markdown helpers. Only real headings outside fences are interpreted. */
export declare function literalMarkdown(content: string, language?: string): string;
export declare function markdownHeadings(text: string): Array<{
    level: number;
    title: string;
    start: number;
    end: number;
}>;
export declare function markdownSection(text: string, title: string): string | undefined;
export declare function appendContextRecord(original: string, title: string, body: string): string;
