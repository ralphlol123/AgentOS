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
    classification: {
        handoff: SectionPlan[];
        tasks: SectionPlan[];
    };
    /** Constraint lines carried forward verbatim from archived history sections. */
    carriedForward: string[];
    /** Canonical sections with no source material, as `<canonical> (<file>.md)`; omitted from the output. */
    missing: string[];
    archiveRelPath: string;
    sizes: {
        handoffBefore: number;
        handoffAfter: number;
        tasksBefore: number;
        tasksAfter: number;
        before: number;
        after: number;
        delta: number;
    };
}
/**
 * Plan a structural rewrite of `.agentos/handoff.md` and `.agentos/tasks.md`.
 * Pure: performs no I/O, and returns empty proposals when the rewrite is blocked.
 */
export declare function planCompactRewrite(input: CompactRewriteInput): CompactRewritePlan;
