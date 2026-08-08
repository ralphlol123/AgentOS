export declare function initAgentOS(options?: any): Promise<{
    mode: any;
    workspaceKind: string;
    repos: any[];
    planned: string[];
    agents: {
        profile: any;
        enabled: any;
        capabilities: Record<string, string>;
        agents: any;
    };
    text: string;
} | {
    planned?: undefined;
    mode: any;
    workspaceKind: string;
    repos: any[];
    agents: {
        profile: any;
        enabled: any;
        capabilities: Record<string, string>;
        agents: any;
    };
    text: string;
}>;
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
export declare function compactAgentOS(options?: any): Promise<{
    ok: boolean;
    text: string;
    dryRun?: undefined;
    archivePath?: undefined;
    before?: undefined;
    after?: undefined;
} | {
    ok: boolean;
    dryRun: boolean;
    archivePath: string;
    before: number;
    after: number;
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
    root?: undefined;
    ok: boolean;
    text: string;
    mode?: undefined;
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
    root: any;
    skills: string[];
    text: string;
}>;
export declare function agentsAgentOS(options?: any): Promise<{
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
    review?: undefined;
} | {
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
export declare function handoffAgentOS(options?: any): Promise<{
    ok: boolean;
    text: string;
}>;
export declare function doctorAgentOS(options?: any): Promise<any>;
