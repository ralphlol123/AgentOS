export declare const AGENT_ALIASES: Readonly<Record<string, string>>;
export declare const RETIRED_AGENT_IDS: ReadonlySet<string>;
export declare const SKILL_ALIASES: Readonly<Record<string, string>>;
export declare const RETIRED_SKILL_IDS: ReadonlySet<string>;
export interface AliasResolution {
    id: string;
    deprecated: boolean;
    from?: string;
}
export declare function canonicalAgentId(value: unknown): string;
export declare function canonicalSkillId(value: unknown): string;
export declare function resolveAgentAlias(value: unknown): AliasResolution;
export declare function resolveSkillAlias(value: unknown): AliasResolution;
export declare function agentDeprecationNotice(token: string, canonical: string): string;
export declare function skillDeprecationNotice(token: string, canonical: string): string;
