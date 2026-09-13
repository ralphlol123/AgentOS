import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
export const SKILL_CATEGORIES = ['core', 'frontend', 'backend', 'fullstack', 'github'];
// Read only package-owned source cards. Never inspect or rewrite installed
// workspace cards here. IDs are filenames, not normalized display labels.
export async function loadCanonicalCatalog(packageRoot) {
    const entries = [];
    const skills = [];
    const agents = [];
    for (const category of SKILL_CATEGORIES) {
        const relDir = `templates/skills/${category}`;
        for (const file of (await readdir(join(packageRoot, relDir))).sort()) {
            if (!file.endsWith('.md'))
                continue;
            const id = basename(file, '.md');
            const relPath = `${relDir}/${file}`, absPath = join(packageRoot, relPath);
            const content = await readFile(absPath, 'utf8');
            const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content);
            const metadata = frontmatter && parseYaml(frontmatter[1]);
            if (!metadata || metadata.name !== id || metadata.category !== category || metadata.mode !== 'full' || typeof metadata.summary !== 'string' || !metadata.summary.trim()) {
                throw new Error(`Invalid canonical skill metadata: ${relPath}`);
            }
            if (skills.some(skill => skill.id === id))
                throw new Error(`Duplicate canonical skill ID: ${id}`);
            skills.push({ id, category, summary: metadata.summary, content });
            entries.push({ id: `skill:${category}/${id}`, type: 'skill', name: id, category, relPath, absPath });
        }
    }
    for (const file of (await readdir(join(packageRoot, 'templates/agents'))).sort()) {
        if (!file.endsWith('.md'))
            continue;
        const id = basename(file, '.md');
        const relPath = `templates/agents/${file}`, absPath = join(packageRoot, relPath);
        const content = await readFile(absPath, 'utf8');
        const mandate = /^Mandate: (.+)$/m.exec(content)?.[1];
        if (!mandate)
            throw new Error(`Missing canonical agent mandate: ${relPath}`);
        agents.push({ id, mandate, planningOnly: content.includes('This is a planning-only role.'), content });
        entries.push({ id: `agent:${id}`, type: 'agent', name: id, relPath, absPath });
    }
    return { skills, agents, entries: entries.sort((a, b) => a.id.localeCompare(b.id)) };
}
// One immutable-package snapshot per process, shared by all installation paths.
const catalog = await loadCanonicalCatalog(dirname(dirname(fileURLToPath(import.meta.url))));
export const SKILL_CATALOG = catalog.skills;
export const SKILL_BY_ID = Object.fromEntries(catalog.skills.map(skill => [skill.id, skill]));
export const AGENT_DEFINITIONS = Object.fromEntries(catalog.agents.map(agent => [agent.id, agent]));
export const TEMPLATE_ENTRIES = catalog.entries;
// Keep the public mode option, but never summarize mandatory workflow text.
// A future compact format may omit only explicitly optional reference material.
export function renderSkillTemplate(skill, mode) {
    return skill.content.replace(/^mode: full$/m, `mode: ${mode}`);
}
//# sourceMappingURL=catalog.js.map