/** Agent manifests and lifecycle (`agentos agents show|enable|disable|remove|manifest`). See docs/agents.md.
 *
 * `.agentos/agents/<id>.md` stays the readable instruction card. Its YAML frontmatter, when present, is the
 * validated manifest (same pattern as Brain records: one file, the frontmatter is authoritative). A card without
 * frontmatter is `legacy`: it keeps working exactly as before; only `doctor --fix` rewrites one, and only when its
 * bytes match the catalog card (the same rule as `agents manifest <id> --from-catalog`).
 *
 * `source_hash` = sha256 of the body (every byte after the frontmatter). A manifest card whose body no longer
 * hashes to it was edited after install (`modified`); `custom: true` marks a card the owner owns. Neither is ever
 * overwritten without an explicit `agents add <id> --replace`.
 *
 * Scope: the task decides (task_scope / --scope). A manifest can only narrow it: `permission_intent: read-only`
 * empties the edit scope; `edit_request` entries outside the task's edit scope are ignored with a warning.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument, stringify as stringifyYaml } from 'yaml';
import { diffLines, loadBrain, splitFrontmatter } from './brain.js';
import { checkpointTasks, loadCurrent } from './checkpoint.js';
import { markdownSection } from './markdown.js';
import { patchProjectYaml } from './project-yaml-edit.js';
import { assertProjectYamlWellFormed, mkdirTracked, parseProjectYaml, removeTracked, withMutationTransaction, writeFileAtomic, writeFileExclusiveAtomic } from './core.js';

export const PACKAGE_VERSION: string = createRequire(import.meta.url)('../package.json').version;
export const PERMISSION_INTENTS = ['read-only', 'edit-in-scope', 'release'] as const;
export type PermissionIntent = typeof PERMISSION_INTENTS[number];
/** Required manifest keys, in the order they are written. */
export const MANIFEST_REQUIRED = ['id', 'name', 'purpose', 'responsibilities', 'knowledge_selectors', 'skills', 'tools_requested', 'permission_intent', 'expected_output', 'provenance', 'custom'];
/** Optional: workspace paths/repo IDs the role asks to edit. Advisory; it can never widen the task's edit scope. */
export const MANIFEST_OPTIONAL = ['edit_request'];
export const MANIFEST_KEYS = [...MANIFEST_REQUIRED, ...MANIFEST_OPTIONAL];
export const PROVENANCE_KEYS = ['installed_from', 'version', 'source_hash', 'installed_at'];
const LIST_KEYS = ['responsibilities', 'knowledge_selectors', 'skills', 'tools_requested', 'edit_request'];
const SOURCE = /^(catalog:[a-z0-9][a-z0-9-]*|template:\S.*|import:https?:\/\/\S+)$/;
export const ROLE_ID = /^[a-z0-9][a-z0-9-]*$/;
const READ_ONLY_CATALOG = new Set(['planner', 'reviewer', 'security-reviewer']);
const EXPECTED_OUTPUT = 'Report files changed, verification run (real command output or inspected state), failures, and the next action.';

export interface AgentManifest {
  id: string; name: string; purpose: string; responsibilities: string[]; knowledge_selectors: string[]; skills: string[];
  tools_requested: string[]; permission_intent: PermissionIntent; expected_output: string;
  provenance: 'unknown' | { installed_from: string; version: string; source_hash: string; installed_at: string };
  custom: boolean; edit_request?: string[];
}
export interface AgentCard {
  id: string; path: string; state: 'legacy' | 'manifest' | 'invalid'; manifest: AgentManifest | null; body: string;
  bodyHash: string; modified: boolean; problems: string[];
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const isStr = (value: unknown) => typeof value === 'string' && value.trim() !== '';
const isPlain = (value: unknown) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Plain runtime checks (no schema dependency). Returns the problems; an empty list means valid.
 *  Kept in step with templates/schemas/agent-manifest.schema.json by test/v1-slice5-agents.test.js. */
export function validateAgentManifest(value: any, expectedId?: string): string[] {
  if (!isPlain(value)) return ['manifest must be a mapping'];
  const problems: string[] = [];
  for (const key of Object.keys(value)) if (!MANIFEST_KEYS.includes(key)) problems.push(`unknown manifest key "${key}" (allowed: ${MANIFEST_KEYS.join(', ')})`);
  for (const key of MANIFEST_REQUIRED) if (!(key in value)) problems.push(`missing manifest key "${key}"`);
  if ('id' in value && (!isStr(value.id) || !ROLE_ID.test(value.id))) problems.push('id must be a lowercase-hyphen agent id');
  else if (expectedId && 'id' in value && value.id !== expectedId) problems.push(`id ${value.id} does not match the card file name (${expectedId})`);
  for (const key of ['name', 'purpose', 'expected_output']) if (key in value && !isStr(value[key])) problems.push(`${key} must be a non-empty string`);
  for (const key of LIST_KEYS) if (key in value && !(Array.isArray(value[key]) && value[key].every(isStr))) problems.push(`${key} must be a list of non-empty strings`);
  if ('permission_intent' in value && !PERMISSION_INTENTS.includes(value.permission_intent)) problems.push(`permission_intent must be one of ${PERMISSION_INTENTS.join('|')}; a manifest cannot widen the task scope (got ${JSON.stringify(value.permission_intent)})`);
  if ('custom' in value && typeof value.custom !== 'boolean') problems.push('custom must be true or false');
  if ('edit_request' in value && Array.isArray(value.edit_request)) {
    for (const entry of value.edit_request) if (typeof entry === 'string' && (entry.startsWith('/') || entry.includes('\\') || entry.split('/').includes('..'))) problems.push(`edit_request entry "${entry}" must be a repo id or a workspace-relative path`);
  }
  const p = value.provenance;
  if ('provenance' in value && p !== 'unknown') {
    if (!isPlain(p)) problems.push('provenance must be "unknown" or a mapping {installed_from, version, source_hash, installed_at}');
    else {
      for (const key of Object.keys(p)) if (!PROVENANCE_KEYS.includes(key)) problems.push(`unknown provenance key "${key}"`);
      for (const key of PROVENANCE_KEYS) if (!isStr(p[key])) problems.push(`provenance.${key} must be a non-empty string`);
      if (isStr(p.installed_from) && !SOURCE.test(p.installed_from)) problems.push('provenance.installed_from must be catalog:<id>, template:<path> or import:<url>');
      if (isStr(p.source_hash) && !/^[a-f0-9]{64}$/.test(p.source_hash)) problems.push('provenance.source_hash must be a sha256 hex digest');
      if (isStr(p.installed_at) && Number.isNaN(Date.parse(p.installed_at))) problems.push('provenance.installed_at must be an ISO timestamp');
    }
  }
  return problems;
}

export function parseAgentCard(id: string, text: string): AgentCard {
  const path = `.agentos/agents/${id}.md`;
  const split = splitFrontmatter(text);
  const base = { id, path, body: split.has ? split.body : text, bodyHash: sha256(split.has ? split.body : text), modified: false };
  if (!split.has) return { ...base, state: 'legacy', manifest: null, problems: [] };
  if (!split.closed) return { ...base, body: text, state: 'invalid', manifest: null, problems: [`${path}:1: frontmatter is not closed`] };
  const doc = parseDocument(split.fm);
  if (doc.errors.length) return { ...base, state: 'invalid', manifest: null, problems: doc.errors.map((error) => `${path}: ${error.message.split('\n')[0]}`) };
  const value = doc.toJS();
  const problems = validateAgentManifest(value, id).map((problem) => `${path}: ${problem}`);
  if (problems.length) return { ...base, state: 'invalid', manifest: null, problems };
  const manifest = value as AgentManifest;
  return { ...base, state: 'manifest', manifest, problems: [], modified: manifest.provenance !== 'unknown' && manifest.provenance.source_hash !== base.bodyHash };
}

/** Frontmatter (manifest) + the body bytes unchanged. */
export function renderCard(manifest: AgentManifest, body: string) {
  return `---\n${stringifyYaml(manifest, { lineWidth: 0 })}---\n${body}`;
}

/** Derive manifest fields from a card body: Mandate line (else H1) as purpose, `Responsibilities in` bullets. */
export function manifestFor(id: string, body: string, provenance: AgentManifest['provenance'], options: { custom?: boolean; catalog?: boolean } = {}): AgentManifest {
  const purpose = /^Mandate:\s*(.+)$/m.exec(body)?.[1]?.trim() || /^#\s+(.+)$/m.exec(body)?.[1]?.trim() || id;
  const responsibilities = (markdownSection(body, 'Responsibilities in') || '').split(/\r?\n/).map((line) => /^[-*]\s+(.+)$/.exec(line)?.[1]?.trim()).filter(Boolean) as string[];
  return {
    id, name: id, purpose, responsibilities, knowledge_selectors: [], skills: [], tools_requested: [],
    permission_intent: options.catalog && READ_ONLY_CATALOG.has(id) ? 'read-only' : options.catalog && id === 'release-manager' ? 'release' : 'edit-in-scope',
    expected_output: EXPECTED_OUTPUT, provenance, custom: Boolean(options.custom),
  };
}

export const provenanceFor = (installedFrom: string, body: string) => ({ installed_from: installedFrom, version: PACKAGE_VERSION, source_hash: sha256(body), installed_at: new Date().toISOString() });

/** Effective edit scope = the task's edit scope, narrowed (never widened) by the role manifest. */
export function effectiveEditScope(taskEdit: string[], manifest: AgentManifest | null, covers: (entries: string[], target: string) => boolean) {
  if (!manifest) return { edit: taskEdit, warnings: [] as string[] };
  const warnings: string[] = [];
  for (const entry of manifest.edit_request ?? []) {
    if (!covers(taskEdit, entry)) warnings.push(`role ${manifest.id} requests edit of ${entry}, which is outside the task edit scope (${taskEdit.join(', ') || 'none'}); ignored — a role manifest can only narrow the task scope`);
  }
  if (manifest.permission_intent === 'read-only') {
    if (taskEdit.length) warnings.push(`role ${manifest.id} is read-only (permission_intent): edit scope narrowed from ${taskEdit.join(', ')} to (none)`);
    return { edit: [] as string[], warnings };
  }
  return { edit: taskEdit, warnings };
}

// --- install planning (agents add) -------------------------------------------------------------------

export type InstallPlan = { action: 'create' | 'noop' | 'upgrade' | 'replace'; content: string; diff: string[]; reason: string };

/** What `agents add` may do to `.agentos/agents/<id>.md`. Throws (zero writes) when the card is owned by the user. */
export function planCardInstall(id: string, existing: string | null, body: string, installedFrom: string, options: { catalog: boolean; replace: boolean; raw: string }): InstallPlan {
  const fresh = () => renderCard(manifestFor(id, body, provenanceFor(installedFrom, body), { catalog: options.catalog }), body);
  if (existing === null) return { action: 'create', content: fresh(), diff: [], reason: 'new card' };
  const card = parseAgentCard(id, existing);
  const generated = card.state === 'legacy' ? existing === body
    : card.state === 'manifest' && !card.manifest!.custom && !card.modified;
  if (generated) {
    if (card.state === 'manifest' && card.body === body && card.manifest!.provenance !== 'unknown' && card.manifest!.provenance.installed_from === installedFrom) return { action: 'noop', content: existing, diff: [], reason: 'already installed and unmodified' };
    return { action: 'upgrade', content: fresh(), diff: card.body === body ? [] : diffLines(card.body, body), reason: card.state === 'legacy' ? 'byte-matched generated card: adding its manifest' : 'unmodified generated card' };
  }
  const why = card.state === 'invalid' ? `its manifest is invalid (${card.problems.join('; ')})`
    : card.state === 'legacy' ? 'it differs from the source and has no manifest'
    : card.manifest!.custom ? 'it is marked custom: true' : 'its body changed since install (hash != provenance.source_hash)';
  const diff = diffLines(card.body, body);
  if (!options.replace) {
    throw new Error(`Existing card differs: ${card.path} is not overwritten because ${why}. Review the change with \`agentos agents add ${options.raw} --replace --dry-run\` (prints a diff, writes nothing), then use --replace to overwrite local content (the old card is kept under .agentos/runs/replaced-agents/).`);
  }
  return { action: 'replace', content: fresh(), diff, reason: why };
}

export function diffSummary(diff: string[], max = 40) {
  if (!diff.length) return ['Diff summary: body unchanged (manifest only)'];
  const removed = diff.filter((line) => line.startsWith('-')).length, added = diff.filter((line) => line.startsWith('+')).length;
  return [`Diff summary: -${removed} +${added} lines (body)`, ...diff.slice(0, max).map((line) => `  ${line}`), ...(diff.length > max ? [`  … ${diff.length - max} more lines`] : [])];
}

// --- lifecycle -------------------------------------------------------------------------------------

export interface AgentsCtx { root: string; catalog: Record<string, { content: string }>; repos: string[] }

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
async function readText(path: string) { try { return await readFile(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
function requireId(id: string | undefined, usage: string): string {
  if (!id) throw new Error(usage);
  if (!ROLE_ID.test(id)) throw new Error(`Invalid agent id: ${id} (expected lowercase letters, digits and hyphens).`);
  return id;
}
async function loadCard(ctx: AgentsCtx, id: string) {
  const text = await readText(join(ctx.root, '.agentos/agents', `${id}.md`));
  if (text === null) throw new Error(`No agent card .agentos/agents/${id}.md. Install one with \`agentos agents add ${id}\`.`);
  return { text, card: parseAgentCard(id, text) };
}
async function projectAgents(root: string) {
  const path = join(root, '.agentos/project.yaml');
  await assertProjectYamlWellFormed(path);
  const text = (await readText(path)) ?? '';
  const data = parseProjectYaml(text);
  const agents = isPlain(data.agents) ? data.agents : {};
  return { path, text, enabled: Array.isArray(agents.enabled) ? agents.enabled.map(String) : [] as string[], capabilities: (isPlain(agents.capabilities) ? agents.capabilities : {}) as Record<string, any> };
}
const out = (json: boolean | undefined, ok: boolean, data: any, lines: string[]) => ({ ok, ...data, text: json ? JSON.stringify({ ok, ...data }, null, 2) : lines.join('\n') });

export async function showAgent(ctx: AgentsCtx, rawId: string | undefined, options: { json?: boolean }) {
  const id = requireId(rawId, 'Usage: agentos agents show <id> [--json]');
  const { card } = await loadCard(ctx, id);
  const { enabled, capabilities } = await projectAgents(ctx.root);
  const caps = Object.entries(capabilities).filter(([, value]) => String(value) === id).map(([key]) => key);
  const data = { id, path: card.path, state: card.state, enabled: enabled.includes(id), capabilities: caps, manifest: card.manifest, modified: card.modified, body_hash: card.bodyHash, problems: card.problems };
  const m = card.manifest;
  return out(options.json, card.state !== 'invalid', data, [
    `AgentOS agent ${id}`, `Path: ${card.path}`, `State: ${card.state}${card.modified ? ' (body changed since install)' : ''}; ${enabled.includes(id) ? 'enabled' : 'disabled'}${caps.length ? `; capabilities: ${caps.join(', ')}` : ''}`,
    ...(m ? [
      `Purpose: ${m.purpose}`, `Permission intent: ${m.permission_intent}`, `Custom: ${m.custom}`,
      `Provenance: ${m.provenance === 'unknown' ? 'unknown' : `${m.provenance.installed_from} @ ${m.provenance.version}, installed ${m.provenance.installed_at}`}`,
      ...(['responsibilities', 'knowledge_selectors', 'skills', 'tools_requested', 'edit_request'] as const).filter((key) => m[key]?.length).map((key) => `${key}: ${m[key]!.join('; ')}`),
    ] : []),
    ...(card.state === 'legacy' ? [`No manifest (legacy card). Add one with \`agentos doctor --fix\` (cards that match the catalog) or \`agentos agents manifest ${id} --custom\`.`] : []),
    ...card.problems.map((problem) => `- ${problem}`),
  ]);
}

export async function setAgentEnabled(ctx: AgentsCtx, rawId: string | undefined, enable: boolean, options: { dryRun?: boolean; json?: boolean }) {
  const verb = enable ? 'enable' : 'disable';
  const id = requireId(rawId, `Usage: agentos agents ${verb} <id> [--dry-run]`);
  await loadCard(ctx, id); // a disabled card stays on disk; enabling needs one
  const project = await projectAgents(ctx.root);
  const has = project.enabled.includes(id);
  if (enable === has) return out(options.json, true, { id, enabled: has, changed: false }, [`AgentOS agents ${verb}`, `${id} is already ${enable ? 'enabled' : 'disabled'}; nothing to do.`]);
  const next = enable ? [...project.enabled, id] : project.enabled.filter((value) => value !== id);
  if (!next.length) throw new Error(`Refusing to disable ${id}: it is the only enabled agent (agents.enabled would be empty). Enable another agent first.`);
  const patched = patchProjectYaml(project.text, (data) => { data.agents ??= {}; data.agents.enabled = next; });
  const stillMapped = Object.entries(project.capabilities).filter(([, value]) => String(value) === id).map(([key]) => `agents.capabilities.${key}`);
  if (!options.dryRun) await withMutationTransaction(async () => { await writeFileAtomic(project.path, patched); });
  return out(options.json, true, { id, enabled: enable, changed: true, dryRun: Boolean(options.dryRun) }, [
    `AgentOS agents ${verb}${options.dryRun ? ' dry run' : ''}`, `${options.dryRun ? 'Would patch' : 'Patched'}: .agentos/project.yaml agents.enabled (${enable ? '+' : '-'}${id}); the card .agentos/agents/${id}.md is unchanged`,
    ...(!enable && stillMapped.length ? [`Note: ${stillMapped.join(', ')} still point to ${id}; doctor will warn until you remap them.`] : []),
  ]);
}

/** Everything that still points at an agent id; `remove` refuses while this is non-empty. */
export async function agentReferences(ctx: AgentsCtx, id: string) {
  const refs: string[] = [];
  const project = await projectAgents(ctx.root);
  if (project.enabled.includes(id)) refs.push(`.agentos/project.yaml agents.enabled (run \`agentos agents disable ${id}\`)`);
  for (const [key, value] of Object.entries(project.capabilities)) if (String(value) === id) refs.push(`.agentos/project.yaml agents.capabilities.${key}`);
  for (const task of await checkpointTasks(ctx.root)) {
    const loaded: any = await loadCurrent(ctx.root, task);
    if (loaded.kind === 'ok' && loaded.record.role === id) refs.push(`.agentos/checkpoints/${task}/current.json (current checkpoint role)`);
  }
  for (const record of await loadBrain(ctx.root, ctx.repos)) {
    const tags = Array.isArray(record.fields.tags) ? record.fields.tags.map(String) : [];
    if (record.fields.scope === id || tags.includes(id) || tags.includes(`agent:${id}`)) refs.push(`${record.path} (Brain record ${record.fields.scope === id ? 'scope' : 'tag'})`);
  }
  return refs;
}

export async function removeAgent(ctx: AgentsCtx, rawId: string | undefined, options: { dryRun?: boolean; json?: boolean }) {
  const id = requireId(rawId, 'Usage: agentos agents remove <id> [--dry-run]');
  const { text } = await loadCard(ctx, id);
  const refs = await agentReferences(ctx, id);
  if (refs.length) return out(options.json, false, { id, references: refs }, [`AgentOS agents remove: REFUSED`, `${id} is still referenced:`, ...refs.map((ref) => `- ${ref}`), 'Nothing was written. Remove these references first.']);
  const dest = `.agentos/runs/removed-agents/${stamp()}-${id}.md`;
  if (!options.dryRun) {
    await withMutationTransaction(async () => {
      await mkdirTracked(join(ctx.root, '.agentos/runs/removed-agents'));
      const written = await writeFileExclusiveAtomic(join(ctx.root, dest), Buffer.from(text, 'utf8'));
      if (!written.created) throw new Error(`${dest} already exists; retry.`);
      await removeTracked(join(ctx.root, '.agentos/agents', `${id}.md`));
    });
  }
  return out(options.json, true, { id, moved_to: dest, dryRun: Boolean(options.dryRun) }, [`AgentOS agents remove${options.dryRun ? ' dry run' : ''}`, `${options.dryRun ? 'Would move' : 'Moved'}: .agentos/agents/${id}.md -> ${dest} (kept, not deleted)`]);
}

/** Add a manifest to a legacy card. Provenance is never inferred for a card that does not byte-match its source. */
export async function manifestAgent(ctx: AgentsCtx, rawId: string | undefined, options: { fromCatalog?: boolean; custom?: boolean; dryRun?: boolean; json?: boolean }) {
  const id = requireId(rawId, 'Usage: agentos agents manifest <id> --from-catalog|--custom [--dry-run]');
  if (Boolean(options.fromCatalog) === Boolean(options.custom)) throw new Error('agentos agents manifest needs exactly one of --from-catalog or --custom.');
  const { text, card } = await loadCard(ctx, id);
  if (card.state !== 'legacy') return out(options.json, card.state === 'manifest', { id, state: card.state, changed: false }, [`AgentOS agents manifest`, card.state === 'manifest' ? `${card.path} already has a manifest; nothing to do.` : `${card.path} has an invalid manifest; fix it by hand:`, ...card.problems.map((p) => `- ${p}`)]);
  let manifest: AgentManifest;
  if (options.fromCatalog) {
    const source = ctx.catalog[id];
    if (!source) return out(options.json, false, { id, changed: false }, [`AgentOS agents manifest: REFUSED`, `${id} is not a catalog agent. Use \`agentos agents manifest ${id} --custom\`.`, 'Nothing was written.']);
    if (source.content !== text) return out(options.json, false, { id, changed: false }, [`AgentOS agents manifest: REFUSED`, `${card.path} differs from catalog:${id}, so its provenance cannot be inferred.`, `Mark it as yours with \`agentos agents manifest ${id} --custom\` (provenance: unknown), or replace it with \`agentos agents add ${id} --replace\`.`, 'Nothing was written.']);
    manifest = catalogManifest(id, text);
  } else {
    manifest = manifestFor(id, text, 'unknown', { custom: true });
  }
  const content = renderCard(manifest, text);
  if (!options.dryRun) await withMutationTransaction(async () => { await writeFileAtomic(join(ctx.root, card.path), content); });
  return out(options.json, true, { id, changed: true, dryRun: Boolean(options.dryRun), manifest }, [`AgentOS agents manifest${options.dryRun ? ' dry run' : ''}`, `${options.dryRun ? 'Would add' : 'Added'} manifest frontmatter to ${card.path} (body byte-identical)`, ...stringifyYaml(manifest, { lineWidth: 0 }).trimEnd().split('\n').map((line) => `  ${line}`)]);
}

const catalogManifest = (id: string, text: string) => manifestFor(id, text, provenanceFor(`catalog:${id}`, text), { catalog: true });

/** `doctor --fix`: add the catalog manifest to every legacy card that byte-matches its catalog source (the
 *  `agents manifest <id> --from-catalog` rule; anything else is left alone). Runs inside doctor's transaction. */
export async function upgradeLegacyCatalogCards(root: string, catalog: Record<string, { content: string }>) {
  const notes: string[] = [];
  const files = (await readdir(join(root, '.agentos/agents')).catch(() => [] as string[])).filter((name) => name.endsWith('.md')).sort();
  for (const file of files) {
    const id = file.slice(0, -3), path = join(root, '.agentos/agents', file);
    if (!ROLE_ID.test(id)) continue;
    const text = (await readText(path)) ?? '';
    if (parseAgentCard(id, text).state !== 'legacy' || catalog[id]?.content !== text) continue;
    await writeFileAtomic(path, renderCard(catalogManifest(id, text), text));
    notes.push(`.agentos/agents/${file}: added its catalog manifest (body byte-identical)`);
  }
  return notes;
}

/** Doctor: legacy cards are reported (with the command), invalid manifests are problems. Read-only. */
export async function agentCardDoctor(root: string, catalog: Record<string, { content: string }>) {
  const problems: string[] = [], diagnostics: string[] = [];
  const files = (await readdir(join(root, '.agentos/agents')).catch(() => [] as string[])).filter((name) => name.endsWith('.md')).sort();
  for (const file of files) {
    const id = file.slice(0, -3);
    if (!ROLE_ID.test(id)) continue;
    const text = (await readText(join(root, '.agentos/agents', file))) ?? '';
    const card = parseAgentCard(id, text);
    if (card.state === 'invalid') problems.push(...card.problems);
    else if (card.state === 'legacy') {
      const fix = catalog[id]?.content === text ? '`agentos doctor --fix` (it matches the catalog card)'
        : `\`agentos agents manifest ${id} --custom\`${catalog[id] ? ` (it differs from catalog:${id}; or replace it with \`agentos agents add ${id} --replace\`)` : ''}`;
      diagnostics.push(`legacy agent card ${card.path} has no manifest; add one with ${fix}`);
    }
    else if (card.modified && !card.manifest!.custom) diagnostics.push(`agent card ${card.path} changed since install; \`agents add\` and \`doctor --fix\` will not overwrite it`);
  }
  return { problems, diagnostics };
}
