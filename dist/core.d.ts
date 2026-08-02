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
    planned?: undefined;
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
export declare function handoffAgentOS(options?: any): Promise<{
    ok: boolean;
    text: string;
}>;
export declare function doctorAgentOS(options?: any): Promise<any>;
