export interface UnifiedDiffFile {
    path: string;
    before: string;
    after: string;
}
/** Render a deterministic, in-process unified diff with three lines of context. */
export declare function renderUnifiedDiff(files: UnifiedDiffFile[], context?: number): string;
