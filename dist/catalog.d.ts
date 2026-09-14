export declare const SKILL_CATEGORIES: readonly ['core', 'frontend', 'backend', 'fullstack', 'github'];
export type SkillCategory = typeof SKILL_CATEGORIES[number];
export interface SkillDefinition {
    id: string;
    category: SkillCategory;
    summary: string;
    content: string;
    references: {
        path: string;
        content: Buffer;
    }[];
}
export interface AgentDefinition {
    id: string;
    mandate: string;
    planningOnly: boolean;
    content: string;
}
export interface TemplateEntry {
    id: string;
    type: 'skill' | 'agent';
    name: string;
    category?: SkillCategory;
    relPath: string;
    absPath: string;
}
export declare function loadCanonicalCatalog(packageRoot: string): Promise<{
    skills: SkillDefinition[];
    agents: AgentDefinition[];
    entries: TemplateEntry[];
}>;
export declare const SKILL_CATALOG: readonly SkillDefinition[];
export declare const SKILL_BY_ID: Record<string, SkillDefinition>;
export declare const AGENT_DEFINITIONS: Record<string, AgentDefinition>;
export declare const TEMPLATE_ENTRIES: readonly TemplateEntry[];
export declare function renderSkillTemplate(skill: SkillDefinition, mode: 'summary' | 'full'): string;
