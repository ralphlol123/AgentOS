import { readFile, readdir, lstat } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export const SKILL_CATEGORIES = ['core', 'frontend', 'backend', 'fullstack', 'github'] as const;
export type SkillCategory = typeof SKILL_CATEGORIES[number];
export interface SkillDefinition {
  id: string;
  category: SkillCategory;
  summary: string;
  content: string;
  references: { path: string; content: Buffer }[];
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

// Read only package-owned source cards. Never inspect or rewrite installed
// workspace cards here. IDs are filenames, not normalized display labels.
export async function loadCanonicalCatalog(packageRoot: string) {
  const entries: TemplateEntry[] = [];
  const skills: SkillDefinition[] = [];
  const agents: AgentDefinition[] = [];
  for (const category of SKILL_CATEGORIES) {
    const relDir = `templates/skills/${category}`;
    for (const file of (await readdir(join(packageRoot, relDir))).sort()) {
      if (!file.endsWith('.md')) continue;
      const id = basename(file, '.md');
      const relPath = `${relDir}/${file}`, absPath = join(packageRoot, relPath);
      const content = await readFile(absPath, 'utf8');
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content);
      const metadata = frontmatter && parseYaml(frontmatter[1]);
      if (!metadata || metadata.name !== id || metadata.category !== category || metadata.mode !== 'full' || typeof metadata.summary !== 'string' || !metadata.summary.trim()) {
        throw new Error(`Invalid canonical skill metadata: ${relPath}`);
      }
      if (skills.some(skill => skill.id === id)) throw new Error(`Duplicate canonical skill ID: ${id}`);
      const references = await loadSkillReferences(join(packageRoot, relDir, id, 'references'));
      skills.push({ id, category, summary: metadata.summary, content, references });
      entries.push({ id: `skill:${category}/${id}`, type: 'skill', name: id, category, relPath, absPath });
    }
  }
  for (const file of (await readdir(join(packageRoot, 'templates/agents'))).sort()) {
    if (!file.endsWith('.md')) continue;
    const id = basename(file, '.md');
    const relPath = `templates/agents/${file}`, absPath = join(packageRoot, relPath);
    const content = await readFile(absPath, 'utf8');
    const mandate = /^Mandate: (.+)$/m.exec(content)?.[1];
    if (!mandate) throw new Error(`Missing canonical agent mandate: ${relPath}`);
    agents.push({ id, mandate, planningOnly: content.includes('This is a planning-only role.'), content });
    entries.push({ id: `agent:${id}`, type: 'agent', name: id, relPath, absPath });
  }
  return { skills, agents, entries: entries.sort((a, b) => a.id.localeCompare(b.id)) };
}

// References are package-owned bytes, not independently registered cards.
async function loadSkillReferences(root: string) {
  const files: { path: string; content: Buffer }[] = [];
  async function visit(abs: string, path: string) {
    const info = await lstat(abs).catch(error => { if (error.code === 'ENOENT' && !path) return null; throw error; });
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error(`Canonical references must not be symlinks: ${abs}`);
    if (info.isDirectory()) {
      for (const name of (await readdir(abs)).sort()) await visit(join(abs, name), path ? `${path}/${name}` : name);
    } else if (info.isFile() && path) files.push({ path: `references/${path}`, content: await readFile(abs) });
    else throw new Error(`Invalid canonical reference: ${abs}`);
  }
  await visit(root, '');
  return files;
}

// One immutable-package snapshot per process, shared by all installation paths.
const catalog = await loadCanonicalCatalog(dirname(dirname(fileURLToPath(import.meta.url))));
export const SKILL_CATALOG: readonly SkillDefinition[] = catalog.skills;
export const SKILL_BY_ID: Record<string, SkillDefinition> = Object.fromEntries(catalog.skills.map(skill => [skill.id, skill]));
export const AGENT_DEFINITIONS: Record<string, AgentDefinition> = Object.fromEntries(catalog.agents.map(agent => [agent.id, agent]));
export const TEMPLATE_ENTRIES: readonly TemplateEntry[] = catalog.entries;

// Keep the public mode option, but never summarize mandatory workflow text.
// A future compact format may omit only explicitly optional reference material.
export function renderSkillTemplate(skill: SkillDefinition, mode: 'summary' | 'full') {
  return skill.content.replace(/^mode: full$/m, `mode: ${mode}`);
}
