/** Portable role cards remain authoritative. These are engine definitions, not a scheduler or a sandbox. */
import { stringify } from 'yaml';
import { manifestFor, type AgentCard } from './agents.js';
import type { NativeFile } from './engines.js';

const layouts = {
  'claude-code': ['.claude/agents/', '.md'],
  codex: ['.codex/agents/', '.toml'],
  opencode: ['.opencode/agents/', '.md'],
};
export function teamPathAllowed(engine: string, path: string): boolean {
  const layout = layouts[engine];
  if (!layout || !path.startsWith(`${layout[0]}agentos-`) || !path.endsWith(layout[1])) return false;
  return /^[a-z0-9][a-z0-9-]*$/.test(path.slice(`${layout[0]}agentos-`.length, -layout[1].length));
}

export function renderTeamAgent(engine: string, card: AgentCard): NativeFile {
  const layout = layouts[engine];
  if (!layout) throw new Error(`Unsupported team engine: ${engine}`);
  const manifest = card.manifest ?? manifestFor(card.id, card.body, 'unknown');
  const model = manifest.models?.[engine];
  const name = `agentos-${card.id}`;
  const readOnly = manifest.permission_intent === 'read-only';
  const instructions = [
    '# AgentOS assignment contract',
    'The main engine session coordinates work. Do not spawn a permanent team or delegate recursively.',
    'Before starting, obtain the workspace path, task ID, objective, allowed read/edit paths, acceptance criteria and expected output from the assignment. If scope is missing, ask the main session before editing.',
    'Read the project’s AGENTS.md and .agentos/project.yaml, then load AgentOS context with the same task ID and your role (ask the coordinator for the rendered context if shell access is unavailable). Load only relevant Brain records and skills; do not copy the entire Brain into every assignment.',
    'A role is not a permission grant. Inherit the engine session’s permissions and honor the assigned task scope.',
    ...(readOnly ? ['This assignment is read-only. Return findings to the main session; do not edit project files, checkpoints or Brain records.'] : []),
    'One session owns shared handoff/checkpoint updates. Return evidence and next actions to that coordinator; do not concurrently rewrite shared state.',
    'Independent review requires a fresh session that did not implement the change. Inspect the diff, acceptance criteria and test evidence; do not assume the author’s report is correct.',
    'Report changed files (if any), findings with sources, checks actually run, limitations and next action. Do not claim completion from another agent’s unverified summary.',
    'The role card below describes responsibilities; the assignment contract above governs delegation and shared-state writes.',
    '', card.body,
  ].join('\n');
  const warnings = [
    `${card.id}: ${model ? `explicit model ${model}; availability and cost not verified` : `inherits engine/session model; ${manifest.model_preference ?? 'standard'} preference is advisory`}.`,
    `${engine}: team configuration and role boundaries require a live engine trial; inherited session settings still apply.`,
    ...(manifest.tools_requested.length ? [`${card.id}: tools_requested is not exported in team mode; configure tools in the engine session.`] : []),
  ];
  let content: string;
  if (engine === 'codex') {
    // TOML basic strings: JSON escaping is compatible for these strings except control escapes \b/\f, also valid TOML.
    const fields = { name, description: manifest.purpose, ...(model ? { model } : {}), developer_instructions: instructions };
    content = Object.entries(fields).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n') + '\n';
    if (readOnly) warnings.push(`${card.id}: read-only is instruction-only in Codex team files; use a read-only parent sandbox for enforcement.`);
  } else {
    const fields = engine === 'claude-code'
      ? { name, description: manifest.purpose, ...(model ? { model } : {}), ...(readOnly ? { tools: 'Read, Grep, Glob, WebSearch, WebFetch' } : {}) }
      : { description: manifest.purpose, mode: 'subagent', ...(model ? { model } : {}), ...(readOnly ? { permission: { edit: 'deny', bash: 'deny' } } : {}) };
    content = `---\n${stringify(fields, { lineWidth: 0 })}---\n${instructions}\n`;
  }
  return { path: `${layout[0]}${name}${layout[1]}`, content, merge: 'whole-file', warnings };
}
