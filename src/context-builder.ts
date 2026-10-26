/** Task-specific context builder behind `agentos context`. Read-only: it reads AgentOS state and never writes.
 *
 * Pipeline: collect candidate records -> filter (project root, read scope, superseded) -> rank by term overlap
 * with the task, then freshness -> place mandatory records (objective, constraints, scope, role) first and never
 * truncate them -> add optional records by rank until the token budget is reached. Every omission keeps a reason.
 */
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { recognizeSections, resolveObjective, sectionText, type SectionRole } from './context-sections.js';
import { markdownHeadings } from './markdown.js';
import { assertRelativeBoundaryPath, validateTaskScope } from './task-scope.js';
import { effectiveEditScope, parseAgentCard, ROLE_ID } from './agents.js';

export const TOKEN_LABEL = 'estimate (chars/4)';
export const DEFAULT_BUDGET = 24000;
/** Tokens reserved for what the engine reads before this context (its bootloader file, system prompt, tool
 *  scaffolding). Assumptions, not measurements; see docs/context-builder.md. */
export const ENGINE_OVERHEAD: Record<string, number> = { 'claude-code': 2000, codex: 1500, opencode: 1500, hermes: 2000 };
const GENERIC_OVERHEAD = 1000;
/** The project overview is `.agentos/memory.md` (the authoritative summary), cut at this many characters. */
export const OVERVIEW_CHARS = 1500;
const REASONS = ['budget', 'superseded', 'out-of-scope', 'no-match', 'covered'] as const;
type OmitReason = typeof REASONS[number];

export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export interface ContextItem { id: string; kind: string; source: string; reason: string; tokens: number }
export interface ContextBundle {
  ok: boolean;
  engine: string;
  task: string | null;
  role: string | null;
  scope: { repos: string[]; read: string[]; edit: string[] };
  budget: { limit: number; estimate: number; overhead: number; label: string };
  included: ContextItem[];
  omitted: Array<{ id: string; kind: string; reason: OmitReason; via?: string }>;
  conflicts: Array<{ subject: string; ids: string[] }>;
  missing: string[];
  warnings: string[];
  overflow?: { needed: number; budget: number; mandatory: Array<{ id: string; kind: string; tokens: number }> };
  text: string;
}

export interface ContextInput {
  root: string;
  engine: string;
  /** Prompt-style header lines (Follow AgentOS..., Project..., Read...). */
  header: string[];
  /** Generated rule lines that join the handoff protected paths as required constraints. */
  rules: string[];
  project: any;
  repos: Array<{ name: string; path: string; commands: Record<string, string> }>;
  enabledAgents: string[];
  defaultRole?: string;
  task?: string;
  role?: string;
  scope?: string;
  budget?: string | number;
  includeSuperseded?: boolean;
  /** Current checkpoint summary for the task (`.agentos/checkpoints/<task>/current.json`), when one exists. */
  checkpoint?: { source: string; text: string };
  /** Valid Project Brain records (src/brain.ts brainContextRecords); rendered by reference, never as rules. */
  brain?: Array<{ id: string; kind: string; status: string; scope: string; title: string; path: string; changed: boolean; location?: 'workspace' | 'vault' }>;
  /** Known-unreadable inputs (e.g. `vault unavailable: <dir>`); listed under Missing, so the bundle never reads as complete. */
  missing?: string[];
  /** Diagnostics that do not make the bundle incomplete (e.g. an optional Obsidian viewer that is off or gone). */
  warnings?: string[];
}

interface Candidate {
  id: string; kind: string; title: string; source: string; text: string;
  mandatory?: boolean; always?: boolean; match?: string; outOfScope?: boolean; superseded?: boolean; fresh: number; penalty?: number; label?: string;
  score?: number; reason?: string;
}

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'into', 'from', 'this', 'that', 'are', 'was', 'not', 'all', 'any', 'its', 'our', 'your', 'use', 'via', 'per', 'should', 'must']);
const words = (text: string) => (text.toLowerCase().match(/[a-z0-9]+/g) || []).map((word) => word.replace(/s$/, ''));
/** Task terms and term hits: the one matcher shared by the context builder and `agentos brain search`. */
export const taskTerms = (text: string) => [...new Set(words(text))].filter((term) => term.length >= 3 && !STOPWORDS.has(term));
export const termHits = (terms: string[], text: string) => { const haystack = new Set(words(text)); return terms.filter((term) => haystack.has(term)); };
/** Decision subject: the heading minus a leading date, up to ':' (conflict detection here and in brain validate). */
export const subjectOf = (title: string) => title.replace(/^\s*\d{4}-\d{2}-\d{2}\s*(?:[—–:-]\s*)?/, '').split(':')[0].trim().toLowerCase();
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SUPERSEDED_HEADING = /\b(superseded|deprecated)\b/i;
const SUPERSEDED_STATUS = /^\s*(?:[-*]\s*)?\**status\**\s*:\s*\**\s*(superseded|deprecated)\b/im;
const isSuperseded = (title: string, body: string) => SUPERSEDED_HEADING.test(title) || SUPERSEDED_STATUS.test(body);

async function readText(path: string) { try { return await readFile(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return ''; throw error; } }
async function exists(path: string) { try { await stat(path); return true; } catch { return false; } }

function roles(...titles: string[]): SectionRole[] { return titles.map((canonical) => ({ role: titles[0], canonical })); }
function section(text: string, titles: SectionRole[]) { return recognizeSections(text, titles)[0]; }

/** Acceptance criteria: `## Acceptance criteria` in tasks.md, else in handoff.md. */
export function findAcceptance(tasks: string, handoff: string): { source: string; text: string } | null {
  const inTasks = section(tasks, roles('Acceptance criteria'));
  const found = inTasks ?? section(handoff, roles('Acceptance criteria'));
  return found ? { source: `.agentos/${inTasks ? 'tasks' : 'handoff'}.md#${found.headingText}`, text: sectionText(found) || '(none recorded)' } : null;
}

export async function buildContextBundle(input: ContextInput): Promise<ContextBundle> {
  const { root, engine } = input;
  const limit = input.budget === undefined ? DEFAULT_BUDGET : Number(input.budget);
  if (!/^\d+$/.test(String(input.budget ?? DEFAULT_BUDGET)) || limit <= 0) throw new Error('--budget must be a positive whole number of tokens.');
  const overhead = ENGINE_OVERHEAD[engine] ?? GENERIC_OVERHEAD;
  const task = input.task?.trim() || null;
  const missing: string[] = [...(input.missing ?? [])];
  const warnings: string[] = [...(input.warnings ?? [])];

  // --- role ---------------------------------------------------------------------------------------
  if (input.role && !input.enabledAgents.includes(input.role)) {
    if (ROLE_ID.test(input.role) && await exists(join(root, '.agentos/agents', `${input.role}.md`))) {
      throw new Error(`--role ${input.role} is disabled (the card exists but ${input.role} is not in agents.enabled); run \`agentos agents enable ${input.role}\` first.`);
    }
    throw new Error(`--role ${input.role} is not an enabled agent (agents.enabled: ${input.enabledAgents.join(', ') || 'none'}).`);
  }
  const role = input.role ?? input.defaultRole ?? input.enabledAgents[0] ?? null;
  const cardPath = role ? `.agentos/agents/${role}.md` : '';
  const card = role ? parseAgentCard(role, await readText(join(root, cardPath))) : null;
  if (card?.state === 'invalid') warnings.push(`agent card manifest is invalid, so it narrows nothing: ${card.problems.join('; ')}`);

  // --- scope: explicit --scope narrows project.yaml task_scope; edit is never widened ---------------
  let projectScope;
  try { projectScope = validateTaskScope(input.project.task_scope, input.repos); } catch (error) { throw new Error(`.agentos/project.yaml ${error.message}`); }
  const repoPath = (entry: string) => {
    const repo = input.repos.find((candidate) => candidate.name === entry);
    return repo ? repo.path.replace(/^\.\/(?=.)/, '').replace(/\/+$/, '') : entry;
  };
  const covers = (entries: string[], target: string) => {
    const path = repoPath(target);
    return entries.some((entry) => { const base = repoPath(entry); return base === '.' || base === path || path.startsWith(`${base}/`); });
  };
  let read: string[], edit: string[], scopeSource: string;
  if (input.scope !== undefined) {
    let explicit;
    try { explicit = validateTaskScope({ read: String(input.scope).split(',').map((entry) => entry.trim()).filter(Boolean) }, input.repos); } catch (error) { throw new Error(`--scope: ${error.message.replace('task_scope.read ', '')}`); }
    read = explicit.read;
    edit = (projectScope?.edit ?? []).filter((entry) => covers(read, entry));
    scopeSource = '--scope';
  } else if (projectScope) {
    ({ read, edit } = projectScope);
    scopeSource = '.agentos/project.yaml#task_scope';
  } else {
    read = ['.'];
    edit = [];
    scopeSource = '(default: no task_scope declared)';
    warnings.push('No task_scope declared: read scope is the whole workspace; edit scope is not set until the owner declares project.yaml task_scope.');
  }

  // The task decides the scope; the role manifest can only narrow it (src/agents.ts).
  const narrowed = effectiveEditScope(edit, card?.manifest ?? null, covers);
  edit = narrowed.edit;
  warnings.push(...narrowed.warnings);
  const repoNames = new Set(input.repos.map((repo) => repo.name));
  const repoPaths = new Set(input.repos.map((repo) => repoPath(repo.name)));
  for (const entry of read) {
    if (entry !== '.' && !repoNames.has(entry) && !await exists(join(root, entry))) {
      missing.push(`scope path does not exist: ${entry}`);
      warnings.push(`scope path does not exist: ${entry}`);
    }
  }
  const childRepos = input.repos.filter((repo) => repoPath(repo.name) !== '.');
  // ponytail: a root repo ('.') counts as in scope when any read entry lies outside every child repo;
  // per-path repo membership would need a repo tree, add it if nested repos appear.
  const repoInScope = (repo: { name: string }) => covers(read, repo.name)
    || (repoPath(repo.name) === '.' && read.some((entry) => !childRepos.some((child) => covers([child.name], entry))));
  const readable = (path: string) => path.startsWith('.agentos/') || covers(read, path);
  const scope = { repos: input.repos.map((repo) => `${repo.name}=${repo.path}`), read, edit };

  // --- sources ------------------------------------------------------------------------------------
  const files: Record<string, string> = {};
  const mtimes: Record<string, number> = {};
  for (const name of ['memory.md', 'handoff.md', 'tasks.md', 'decisions.md', 'skills.md', 'knowledge.md']) {
    const path = join(root, '.agentos', name);
    files[name] = await readText(path);
    mtimes[name] = files[name] ? (await stat(path)).mtimeMs : 0;
  }
  const objective = resolveObjective(files['handoff.md']);
  const empty = (text: string): ContextBundle => finish({ ok: false, engine, task, role, scope, budget: { limit, estimate: 0, overhead, label: TOKEN_LABEL }, included: [], omitted: [], conflicts: [], missing, warnings, text });
  if (objective.kind !== 'resolved') {
    missing.unshift(objective.diagnostic);
    return empty(`AgentOS context: NEEDS ATTENTION\n- ${objective.diagnostic}\nNo context was generated. Fix the file above (see \`agentos doctor\`), then re-run.`);
  }

  const candidates: Candidate[] = [];
  const add = (candidate: Omit<Candidate, 'fresh'> & { fresh?: number }) => candidates.push({ fresh: 0, ...candidate });
  const handoffSource = (heading: string) => `.agentos/handoff.md#${heading}`;

  // F6: a bounded overview first (memory.md minus its frontmatter and title); detailed records stay selective below.
  const overview = files['memory.md'].replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').replace(/^\s*#[^\n]*\n/, '').trim();
  if (overview) add({ id: 'overview', kind: 'overview', title: 'Project overview', source: '.agentos/memory.md', mandatory: true,
    text: overview.length > OVERVIEW_CHARS ? `${overview.slice(0, OVERVIEW_CHARS)}…\n(cut at ${OVERVIEW_CHARS} of ${overview.length} chars; read .agentos/memory.md for the rest)` : overview });
  add({ id: 'objective', kind: 'objective', title: 'Objective', source: handoffSource(objective.selected.heading), text: objective.selected.text, mandatory: true });
  const protectedSection = section(files['handoff.md'], roles('Protected files / do not touch', 'Protected paths and constraints', 'Protected paths', 'Protected files', 'Do not touch', 'Constraints'));
  add({
    id: 'constraints', kind: 'constraints', title: 'Constraints', mandatory: true,
    source: protectedSection ? `${handoffSource(protectedSection.headingText)} + generated rules` : 'generated rules',
    text: [...input.rules, ...(protectedSection ? ['', 'Protected (handoff):', sectionText(protectedSection)] : [])].join('\n'),
  });
  add({
    id: 'scope', kind: 'scope', title: 'Scope', source: scopeSource, mandatory: true,
    text: [
      `Repos (inventory, not permission): ${scope.repos.join('; ') || '(none)'}`,
      `Read scope: ${read.join(', ') || '(none)'}`,
      // D5: unset is not "read-only": say so and what to do. No default edit scope is invented.
      projectScope ? `Edit scope: ${edit.join(', ') || '(none; read-only task)'}. Do not edit anything outside it.`
        : "Edit scope: not set (no task_scope in .agentos/project.yaml). Edit only the files the owner's task names; ask the owner to set task_scope.",
    ].join('\n'),
  });
  if (role) {
    const text = card!.body.trim();
    if (!text) { missing.push(`agent card ${cardPath} (role ${role}) is missing`); warnings.push(`agent card ${cardPath} is missing`); }
    const intent = card!.manifest ? `Permission intent: ${card!.manifest.permission_intent} (narrows the task scope only; see Scope).\n` : '';
    add({ id: `role:${role}`, kind: 'role', title: `Role: ${role}`, source: cardPath, text: text ? `${intent}${text}` : '(agent card missing)', mandatory: true });
  } else {
    missing.push('no agent role: agents.enabled is empty and no --role was given');
    warnings.push('no agent role selected');
  }

  const acceptance = findAcceptance(files['tasks.md'], files['handoff.md']);
  add({ id: 'acceptance', kind: 'acceptance', title: 'Acceptance criteria', always: true, fresh: mtimes['tasks.md'],
    source: acceptance?.source ?? '(none recorded)', text: acceptance?.text ?? '(none recorded)' });
  if (input.checkpoint) add({ id: 'checkpoint', kind: 'checkpoint', title: 'Checkpoint', source: input.checkpoint.source, text: input.checkpoint.text, always: true, fresh: Date.now() });
  for (const [id, title, titles] of [['handoff:current-state', 'Current state', roles('Current state', 'Current status')], ['handoff:next-exact-action', 'Next exact action', roles('Next exact action', 'Next action', 'Next step')]] as const) {
    const found = section(files['handoff.md'], titles as SectionRole[]);
    if (found && sectionText(found)) add({ id, kind: 'handoff', title, source: handoffSource(found.headingText), text: sectionText(found), always: true, fresh: mtimes['handoff.md'] });
  }
  for (const repo of input.repos) {
    const notePath = `.agentos/repos/${repo.name}.md`;
    const note = await readText(join(root, notePath));
    if (note) add({ id: `repo:${repo.name}`, kind: 'repo-note', title: `Repo note: ${repo.name}`, source: notePath, text: note.trim(), always: true, outOfScope: !repoInScope(repo), fresh: (await stat(join(root, notePath))).mtimeMs });
    const commands = Object.entries(repo.commands).filter(([, value]) => value && value !== 'unknown');
    if (commands.length) add({ id: `verify:${repo.name}`, kind: 'verification', title: `Verification: ${repo.name}`, source: `.agentos/project.yaml#repos.${repo.name}`, text: commands.map(([key, value]) => `- ${key}: ${value}`).join('\n'), always: true, outOfScope: !repoInScope(repo) });
  }
  for (const entry of read) {
    if (entry === '.' || repoNames.has(entry) || repoPaths.has(entry) || !await exists(join(root, entry))) continue;
    add({ id: `read:${entry}`, kind: 'read-path', title: `Read path: ${entry}`, source: '(scope)', text: `${entry} is in read scope for reference; edit it only if the edit scope covers it.`, always: true });
  }

  const decisionHeadings = markdownHeadings(files['decisions.md']).filter((heading) => heading.level === 2 || heading.level === 3);
  decisionHeadings.forEach((heading, index) => {
    const end = decisionHeadings[index + 1]?.start ?? files['decisions.md'].length;
    const body = files['decisions.md'].slice(heading.end, end).trim();
    const date = heading.title.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    add({ id: `decision:${slug(heading.title)}`, kind: 'decision', title: heading.title, source: `.agentos/decisions.md#${heading.title}`, text: body || '(empty)',
      match: heading.title, superseded: isSuperseded(heading.title, body), fresh: date ? Date.parse(date[1]) : mtimes['decisions.md'] });
  });

  const skills = new Map<string, Candidate>();
  let skillHeading = '';
  const skillLines = files['skills.md'].split(/\r?\n/);
  skillLines.forEach((line, index) => {
    const heading = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (heading) { skillHeading = heading[1]; return; }
    const bullet = line.match(/^- ([a-z0-9][a-z0-9-]*)\s+[—–-]\s+(.*)$/);
    if (!bullet) return;
    const block = [line];
    for (let next = index + 1; next < skillLines.length && /^\s+\S/.test(skillLines[next]); next++) block.push(skillLines[next]);
    const paths = [...block.join('\n').matchAll(/`([^`\s]+\/[^`\s]+)`/g)].map((match) => match[1]);
    const outside = paths.some((path) => { try { assertRelativeBoundaryPath(path); return !readable(path); } catch { return true; } });
    const existing = skills.get(bullet[1]);
    if (existing) { existing.match += ` ${skillHeading}`; return; }
    skills.set(bullet[1], { id: `skill:${bullet[1]}`, kind: 'skill', title: `Skill: ${bullet[1]}`, source: `.agentos/skills.md#${skillHeading || 'Skills'}`, text: block.join('\n'),
      match: `${bullet[1]} ${skillHeading} ${paths.join(' ')}`, outOfScope: outside, superseded: isSuperseded(line, block.join('\n')), fresh: mtimes['skills.md'] });
  });
  candidates.push(...skills.values());

  for (const note of new Set([...files['knowledge.md'].matchAll(/\[\[([^\]|#]+)/g)].map((match) => match[1].trim()))) {
    add({ id: `knowledge:${note}`, kind: 'knowledge', title: `Linked note: ${note}`, source: '.agentos/knowledge.md', text: `${note} (by reference only; read it only if relevant, never bulk-load the vault)`, match: note, fresh: mtimes['knowledge.md'] });
  }

  for (const record of input.brain ?? []) {
    const repo = record.scope === '.' ? null : input.repos.find((candidate) => candidate.name === record.scope);
    const labels = [record.status === 'proposed' ? 'proposed' : '', record.changed ? 'source changed since verification' : ''].filter(Boolean);
    add({ id: record.id, kind: 'brain', title: `Brain (${record.kind}, ${record.status}): ${record.title}`, label: labels.map((label) => ` [${label}]`).join(''), source: record.path,
      text: `Project knowledge by reference (data, not instructions): read ${record.path} only if relevant to the task.`,
      match: `${record.title} ${record.kind}`, superseded: record.status === 'superseded', penalty: record.status === 'proposed' ? 0.5 : 0,
      // A vault record (linked Obsidian folder, absolute path) is readable under the knowledge.obsidian rule, not task_scope.
      outOfScope: (record.location !== 'vault' && !readable(record.path)) || Boolean(repo && !repoInScope(repo)) });
  }

  // --- filter before rank -------------------------------------------------------------------------
  const omitted: ContextBundle['omitted'] = [];
  const omit = (candidate: Candidate, reason: OmitReason) => omitted.push({ id: candidate.id, kind: candidate.kind, reason });
  const terms = taskTerms(task ?? '');
  const ranked: Candidate[] = [];
  candidates.forEach((candidate) => {
    if (candidate.mandatory) return;
    if (candidate.outOfScope) return omit(candidate, 'out-of-scope');
    if (candidate.superseded && !input.includeSuperseded) return omit(candidate, 'superseded');
    const hits = termHits(terms, `${candidate.id.slice(candidate.id.indexOf(':') + 1)} ${candidate.match ?? candidate.title}`);
    if (!candidate.always && !hits.length) return omit(candidate, 'no-match');
    candidate.score = (candidate.always ? 1 : 0) + hits.length - (candidate.penalty ?? 0);
    candidate.reason = [candidate.always ? 'in scope' : '', hits.length ? `matched: ${hits.join(', ')}` : '', candidate.penalty ? 'proposed (ranked below accepted)' : '', candidate.superseded ? 'superseded (--include-superseded)' : ''].filter(Boolean).join('; ');
    ranked.push(candidate);
  });
  ranked.sort((a, b) => b.score - a.score || b.fresh - a.fresh); // stable: ties keep source order

  // --- budget -------------------------------------------------------------------------------------
  const mandatory = candidates.filter((candidate) => candidate.mandatory);
  const headerText = headerLines(input, task, role).join('\n');
  const needed = overhead + estimateTokens(headerText) + mandatory.reduce((sum, candidate) => sum + estimateTokens(renderSection(candidate)), 0);
  if (needed > limit) {
    return finish({
      ok: false, engine, task, role, scope, budget: { limit, estimate: needed, overhead, label: TOKEN_LABEL }, included: [], omitted: [], conflicts: [], missing, warnings,
      overflow: { needed, budget: limit, mandatory: mandatory.map((candidate) => ({ id: candidate.id, kind: candidate.kind, tokens: estimateTokens(renderSection(candidate)) })) },
      text: `AgentOS context: OVERFLOW\nMandatory context (overview, objective, constraints, scope, role) needs ${needed} tokens, ${TOKEN_LABEL}, but the budget is ${limit}. Nothing was truncated and no context was rendered; raise --budget or shorten the mandatory sources.`,
    });
  }
  const selected = [...mandatory];
  let running = needed;
  let full = false;
  for (const candidate of ranked) {
    const cost = estimateTokens(renderSection(candidate));
    if (full || running + cost > limit) { full = true; omit(candidate, 'budget'); continue; }
    running += cost;
    selected.push(candidate);
  }
  // D7: a Brain record that matched nothing but whose file is already shown section by section (e.g. brain:decisions vs the
  // decision:* sections of .agentos/decisions.md) is reported as covered by that section, not as no-match.
  const brainSource = new Map(candidates.filter((candidate) => candidate.kind === 'brain').map((candidate) => [candidate.id, candidate.source]));
  const relabel = () => omitted.map((item) => {
    const source = item.reason === 'no-match' ? brainSource.get(item.id) : undefined;
    const via = source && selected.find((candidate) => candidate.source.startsWith(`${source}#`))?.id;
    return via ? { ...item, reason: 'covered' as const, via } : item;
  });
  for (;;) {
    const conflicts = findConflicts(selected);
    const shown = relabel();
    const text = render(input, task, role, selected, shown, conflicts, missing);
    const estimate = overhead + estimateTokens(text);
    const last = selected.at(-1);
    if (estimate <= limit || last.mandatory) {
      if (estimate > limit) warnings.push(`estimate ${estimate} exceeds the budget ${limit} only because of the Omitted/Conflicts/Missing listing; mandatory records were kept whole.`);
      return finish({
        ok: true, engine, task, role, scope, budget: { limit, estimate, overhead, label: TOKEN_LABEL },
        included: selected.map((candidate) => ({ id: candidate.id, kind: candidate.kind, source: candidate.source, reason: candidate.mandatory ? 'mandatory' : candidate.reason, tokens: estimateTokens(renderSection(candidate)) })),
        omitted: shown, conflicts, missing, warnings, text,
      });
    }
    selected.pop(); // the trailer (omitted/conflicts/missing) pushed the total over the limit
    omitted.push({ id: last.id, kind: last.kind, reason: 'budget' });
  }
}

/** Two current (non-superseded) selected decisions with the same subject: the heading minus its date, up to ':'. */
function findConflicts(selected: Candidate[]) {
  const groups = new Map<string, string[]>();
  for (const candidate of selected) {
    if (candidate.kind !== 'decision' || candidate.superseded) continue;
    const subject = subjectOf(candidate.title);
    if (subject) groups.set(subject, [...(groups.get(subject) ?? []), candidate.id]);
  }
  return [...groups].filter(([, ids]) => ids.length > 1).map(([subject, ids]) => ({ subject, ids }));
}

function headerLines(input: ContextInput, task: string | null, role: string | null) {
  return [...input.header, `Task: ${task ?? '(none given; pass --task for task-specific selection)'}`, `Role: ${role ?? '(none)'}`];
}

function renderSection(candidate: Candidate) {
  return `## ${candidate.title}${candidate.label ?? ''}${candidate.superseded ? ' [superseded]' : ''}\nSource: ${candidate.source}\n${candidate.text}`;
}

function render(input: ContextInput, task: string | null, role: string | null, selected: Candidate[], omitted: ContextBundle['omitted'], conflicts: ContextBundle['conflicts'], missing: string[]) {
  const parts = [headerLines(input, task, role).join('\n'), ...selected.map(renderSection)];
  if (omitted.length) parts.push(`## Omitted (${omitted.length})\n${omitted.map((item) => `- ${item.id} (${item.kind}): ${item.via ? `covered by ${item.via} (same file, shown above)` : item.reason}`).join('\n')}`);
  if (conflicts.length) parts.push(`## Conflicts\n${conflicts.map((item) => `- ${item.subject}: ${item.ids.join(' vs ')}`).join('\n')}`);
  if (missing.length) parts.push(`## Missing\n${missing.map((item) => `- ${item}`).join('\n')}`);
  return parts.join('\n\n');
}

function finish(bundle: ContextBundle): ContextBundle {
  assertContextBundle(bundle);
  return bundle;
}

const isStrings = (value: unknown) => Array.isArray(value) && value.every((entry) => typeof entry === 'string');
const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;

/** Runtime contract for the bundle `agentos context --json` prints; plain checks, no schema dependency. */
export function assertContextBundle(value: any): asserts value is ContextBundle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ContextBundle must be an object');
  const fail = (field: string, expected: string) => { throw new Error(`ContextBundle.${field} must be ${expected}`); };
  if (typeof value.ok !== 'boolean') fail('ok', 'a boolean');
  if (typeof value.engine !== 'string' || !value.engine) fail('engine', 'a non-empty string');
  for (const key of ['task', 'role']) if (value[key] !== null && typeof value[key] !== 'string') fail(key, 'a string or null');
  if (!value.scope || !['repos', 'read', 'edit'].every((key) => isStrings(value.scope[key]))) fail('scope', '{repos, read, edit} string lists');
  const budget = value.budget;
  if (!budget || ![budget.limit, budget.estimate, budget.overhead].every(isCount) || budget.label !== TOKEN_LABEL) fail('budget', `{limit, estimate, overhead} counts with label "${TOKEN_LABEL}"`);
  if (!Array.isArray(value.included) || !value.included.every((item) => item && ['id', 'kind', 'source', 'reason'].every((key) => typeof item[key] === 'string') && isCount(item.tokens))) fail('included', 'a list of {id, kind, source, reason, tokens}');
  if (!Array.isArray(value.omitted) || !value.omitted.every((item) => item && typeof item.id === 'string' && typeof item.kind === 'string' && REASONS.includes(item.reason))) fail('omitted', `a list of {id, kind, reason in ${REASONS.join('|')}}`);
  if (!Array.isArray(value.conflicts) || !value.conflicts.every((item) => item && typeof item.subject === 'string' && isStrings(item.ids))) fail('conflicts', 'a list of {subject, ids}');
  if (!isStrings(value.missing)) fail('missing', 'a string list');
  if (!isStrings(value.warnings)) fail('warnings', 'a string list');
  if (value.overflow !== undefined && (!value.overflow || !isCount(value.overflow.needed) || !isCount(value.overflow.budget) || !Array.isArray(value.overflow.mandatory))) fail('overflow', '{needed, budget, mandatory}');
  if (value.ok && value.overflow) fail('ok', 'false when overflow is set');
  if (typeof value.text !== 'string') fail('text', 'a string');
}
