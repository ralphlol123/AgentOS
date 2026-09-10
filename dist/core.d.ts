export declare function writeFileAtomic(path: string, content: string | Buffer, options?: {
    mode?: number;
}): Promise<void>;
export declare function __setAtomicWriteFaultForTests(path: string, point: 'before-sync' | 'before-rename', onTrigger?: (context: any) => void): void;
export declare function __clearAtomicWriteFaultForTests(): void;
export declare function __writeFileExclusiveAtomicForTests(path: string, content: string): Promise<{
    created: boolean;
}>;
type AdapterTarget = {
    path: string;
    label: string;
    section: string;
};
type AdapterPlanEntry = {
    target: AdapterTarget;
    plan: any;
};
export declare function __planAdapterFilesForTests(targets: AdapterTarget[]): Promise<AdapterPlanEntry[]>;
export declare function __applyAdapterPlansForTests(plans: AdapterPlanEntry[]): Promise<void>;
export declare function statusAgentOS(options?: any): Promise<{
    ok: boolean;
    text: string;
}>;
export declare function promptAgentOS(options?: any): Promise<{
    ok: boolean;
    text: string;
    engine?: undefined;
} | {
    ok: boolean;
    engine: string;
    text: string;
}>;
export declare function handoffAgentOS(options?: any): Promise<{
    ok: boolean;
    text: string;
}>;
export declare function initAgentOS(options?: any): Promise<{
    mode: any;
    workspaceKind: any;
    repos: any[];
    planned: any[];
    plan: any[];
    agents: {
        profile: any;
        enabled: any;
        capabilities: Record<string, string>;
        agents: any;
    };
    text: string;
} | {
    planned?: undefined;
    plan?: undefined;
    mode: any;
    workspaceKind: any;
    repos: any[];
    agents: {
        profile: any;
        enabled: any;
        capabilities: Record<string, string>;
        agents: any;
    };
    text: string;
}>;
export declare function compactAgentOS(options?: any): Promise<{
    ok: boolean;
    text: string;
    dryRun?: undefined;
    changed?: undefined;
    archivePath?: undefined;
    before?: undefined;
    after?: undefined;
    proposed?: undefined;
} | {
    ok: boolean;
    dryRun: boolean;
    changed: boolean;
    archivePath: string;
    before: number;
    after: number;
    proposed: {
        handoff: string;
        tasks: string;
    };
    text: string;
}>;
export declare function linkObsidianAgentOS(options?: any): Promise<{
    ok: boolean;
    text: string;
    vault?: undefined;
    destination?: undefined;
    linked?: undefined;
} | {
    ok: boolean;
    vault: string;
    destination: string;
    linked: string[];
    text: string;
}>;
export declare function obsidianAgentOS(options?: any): Promise<{
    ok: boolean;
    vault: string;
    destination: string;
    linked: any;
    text: string;
    mode?: undefined;
    workspacePath?: undefined;
} | {
    vault?: undefined;
    destination?: undefined;
    mode?: undefined;
    ok: boolean;
    text: string;
} | {
    ok: boolean;
    mode: string;
    vault: string;
    destination: string;
    text: string;
}>;
export declare function migrateClaudeAgentOS(options?: any): Promise<{
    dryRun?: undefined;
    ok: boolean;
    text: string;
    root?: undefined;
} | {
    ok: boolean;
    root: string;
    dryRun: boolean;
    text: string;
}>;
export declare function skillsAgentOS(options?: any): Promise<{
    dryRun?: undefined;
    mode?: undefined;
    root?: undefined;
    ok: boolean;
    text: string;
    skills?: undefined;
} | {
    ok: boolean;
    root: string;
    mode: "full" | "summary";
    dryRun: boolean;
    skills: string[];
    text: string;
} | {
    ok: boolean;
    entries: any[];
    text: string;
} | {
    ok: boolean;
    root: any;
    skills: string[];
    text: string;
} | {
    ok: boolean;
    root: any;
    dryRun: boolean;
    removed: string[];
    text: string;
}>;
export declare function agentsAgentOS(options?: any): Promise<{
    ok: boolean;
    entries: any[];
    text: string;
} | {
    dryRun?: undefined;
    root?: undefined;
    ok: boolean;
    text: string;
    id?: undefined;
} | {
    ok: boolean;
    root: string;
    id: any;
    dryRun: boolean;
    text: string;
} | {
    ok: boolean;
    root: any;
    agents: string[];
    text: string;
}>;
export declare function templatesAgentOS(options?: any): Promise<{
    dryRun?: undefined;
    root?: undefined;
    ok: boolean;
    text: string;
    quarantine?: undefined;
    review?: undefined;
} | {
    ok: boolean;
    root: string;
    dryRun: boolean;
    text: string;
    quarantine?: undefined;
    review?: undefined;
} | {
    ok: boolean;
    root: string;
    dryRun: boolean;
    text: string;
    review: any[];
    quarantine: string;
} | {
    quarantine?: undefined;
    ok: boolean;
    root: string;
    dryRun: boolean;
    text: string;
    review: any[];
} | {
    ok: boolean;
    root: any;
    entries: any[];
    text: string;
} | {
    ok: boolean;
    root: any;
    text: string;
    entry?: undefined;
} | {
    ok: boolean;
    root: any;
    entry: any;
    text: string;
} | {
    ok: boolean;
    root: any;
    text: string;
    validation?: undefined;
} | {
    ok: boolean;
    root: any;
    text: string;
    validation: {
        ok: boolean;
        messages: string[];
    };
}>;
export declare function runHandoffAgentOS(options?: any): Promise<{
    reason?: undefined;
    engine?: undefined;
    dryRun?: undefined;
    root?: undefined;
    ok: boolean;
    text: string;
    handoffPath?: undefined;
    handoffRel?: undefined;
    git?: undefined;
} | {
    ok: boolean;
    dryRun: boolean;
    root: string;
    engine: string;
    reason: string;
    handoffPath: string;
    handoffRel: string;
    git: {
        status: string;
        diffStat: string;
        changedFiles: string[];
        snippets: {
            file: string;
            diff: string;
        }[];
        errors: string[];
        omittedFiles: string[];
    };
    text: string;
}>;
export declare function doctorAgentOS(options?: any): Promise<any>;
export {};
