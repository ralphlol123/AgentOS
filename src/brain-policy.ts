/** Opt-in workflow policy, not authentication or a sandbox. A caller with file access can bypass it. */
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCurrent, slugTask, workspaceState } from './checkpoint.js';
import { assertRelativeBoundaryPath, isWithin } from './task-scope.js';
import type { BrainCtx, BrainRecord } from './brain.js';

export const AUTO_APPEND_BYTES = 4000;
export const AUTO_RECORD_BYTES = 32000;
export const AUTONOMOUS_RECORD_BYTES = 64000;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export type ApprovalMode = 'manual' | 'auto-append' | 'autonomous';
export interface ApprovalPolicy { mode: ApprovalMode; actors: string[]; records: string[]; exclude: string[] }
export interface ApprovalDecision {
  eligible: boolean; mode: ApprovalMode; actor: string | null;
  policy_hash: string | null; reasons: string[];
}

export function parseApprovalPolicy(value: unknown): { policy: ApprovalPolicy; errors: string[]; warnings: string[]; hash: string } {
  const policy: ApprovalPolicy = { mode: 'manual', actors: [], records: [], exclude: [] };
  const errors: string[] = [], warnings: string[] = [];
  const at = 'knowledge.brain.approval';
  if (value !== undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push(`${at} must be a mapping`);
    else {
      const data = value as Record<string, unknown>;
      for (const key of Object.keys(data)) if (!['mode', 'actors', 'records', 'exclude'].includes(key)) errors.push(`${at}: unknown key ${key}`);
      if (!['manual', 'auto-append', 'autonomous'].includes(String(data.mode))) errors.push(`${at}.mode must be manual, auto-append or autonomous`);
      else policy.mode = data.mode as ApprovalMode;
      for (const key of ['actors', 'records', 'exclude'] as const) {
        // A leftover `exclude` (say, after switching back from autonomous) is ignored, not fatal: the policy stays valid.
        if (key === 'exclude' && data.exclude !== undefined && data.mode !== 'autonomous') { warnings.push(`${at}.exclude is ignored: it applies only to mode autonomous`); continue; }
        const list = data[key] ?? [];
        const pattern = key === 'actors' ? /^[a-z0-9][a-z0-9._-]{0,63}$/ : /^brain:[a-z0-9][a-z0-9-]{0,127}$/;
        if (!Array.isArray(list) || list.length > 50 || list.some((entry) => typeof entry !== 'string' || !pattern.test(entry))) {
          errors.push(`${at}.${key} must be a list of at most 50 exact ${key === 'actors' ? 'actor names' : 'brain:<id> values'} (no wildcards)`);
        } else policy[key] = [...new Set(list)].sort();
      }
      if (policy.mode === 'auto-append' && (!policy.actors.length || !policy.records.length)) errors.push(`${at}: auto-append needs nonempty actors and records lists`);
      if (policy.mode === 'autonomous' && !policy.actors.length) errors.push(`${at}: autonomous needs a nonempty actors list`);
    }
  }
  // `exclude` joins the hash only when set, so policies written before autonomous mode keep their hash.
  const { exclude, ...hashed } = policy;
  return { policy, errors, warnings, hash: hash(JSON.stringify(exclude.length ? policy : hashed)) };
}

/** True only for a valid autonomous policy: generated agent instructions switch on this. */
export const isAutonomous = (value: unknown) => { const { policy, errors } = parseApprovalPolicy(value); return !errors.length && policy.mode === 'autonomous'; };

/** Autonomous scope: `records` (empty = every workspace record) minus `exclude`. */
export const inAutonomousScope = (policy: ApprovalPolicy, id: string | null) => Boolean(id) && !policy.exclude.includes(id) && (!policy.records.length || policy.records.includes(id));

export function approvalGuidance(value: unknown) {
  const { policy, errors } = parseApprovalPolicy(value);
  if (errors.length) return 'Brain approval policy is invalid; automatic application is disabled. Run `agentos brain policy`; leave proposals for owner review.';
  if (policy.mode === 'autonomous') return 'Brain approval: autonomous. Allowed agents (`agentos brain policy`) stage one focused proposal, then `agentos brain apply <proposal> --auto --by <self>`. Cite only facts from files you read; leave unknowns unknown. A refusal stays pending for owner review. Rollback: `agentos brain revert <id> --last --by <name>`. Never impersonate another actor or change the policy.';
  return policy.mode === 'manual'
    ? 'Brain approval: manual (default). Agents propose; the owner applies. Only the owner may change knowledge.brain.approval.'
    : 'Brain approval: auto-append. Run `agentos brain policy` for the owner-approved actors and records. Agents use only `brain apply --auto --by <self>`; a refusal stays pending for owner review. Never impersonate the owner or change the policy.';
}

/** Re-evaluated at application, under the existing workspace writer lock. Nothing here executes checks. */
export async function automaticApproval(ctx: BrainCtx, proposal: { fields: Record<string, any>; body: string }, target: BrainRecord | null,
  newBody: string | null, actor: string | undefined, validation: { rejections: unknown[]; flags: unknown[]; incomplete: boolean; supersede?: BrainRecord[] }): Promise<ApprovalDecision> {
  const parsed = parseApprovalPolicy(ctx.approval);
  const { policy } = parsed;
  const reasons = [...parsed.errors];
  const result = (): ApprovalDecision => ({ eligible: reasons.length === 0, mode: policy.mode, actor: actor || null, policy_hash: parsed.errors.length ? null : parsed.hash, reasons });
  const autonomous = policy.mode === 'autonomous' && !parsed.errors.length;
  if (policy.mode !== 'auto-append' && !autonomous) reasons.push('Automatic application is disabled; the owner reviews and applies this proposal.');
  if (!actor || !policy.actors.includes(actor)) reasons.push('The applying actor must be explicitly allowed by the owner policy.');
  if (proposal.fields.proposed_by !== actor) reasons.push('Automatic application is limited to the same declared proposer and applier.');
  if (autonomous) {
    // Any kind, replace or append, supersession included: every record written must be in scope and workspace-canonical.
    for (const record of [target, ...(validation.supersede ?? [])].filter(Boolean)) {
      if (policy.exclude.includes(record.id)) reasons.push(`${record.id} is excluded from autonomous application by the owner policy.`);
      else if (!inAutonomousScope(policy, record.id)) reasons.push(`${record.id} is not in the owner policy's records list.`);
      if (record.location !== 'workspace') reasons.push(`${record.id} is vault-canonical; vault records need owner review.`);
    }
    if (target?.status === 'superseded') reasons.push('The target record is superseded; reviving it needs owner review.');
    if (Buffer.byteLength(newBody ?? '') > AUTONOMOUS_RECORD_BYTES) reasons.push(`Autonomous updates are limited to ${AUTONOMOUS_RECORD_BYTES} body bytes; ask the owner to curate larger records.`);
  } else {
    if (!target || !policy.records.includes(target.id)) reasons.push('The target record is not explicitly allowed by the owner policy.');
    if (target && (!['note', 'feature'].includes(target.kind) || !['accepted', 'verified'].includes(target.status) || target.location !== 'workspace')) {
      reasons.push('Automatic application requires an existing accepted/verified workspace note or feature record; architecture, decisions, ADRs, conventions and vault records need owner review.');
    }
    if (proposal.fields.mode !== 'append' || proposal.fields.supersedes !== undefined) reasons.push('Only append proposals without supersession are eligible; replacements and deletions need owner review.');
    if (Buffer.byteLength(proposal.body) > AUTO_APPEND_BYTES || Buffer.byteLength(newBody ?? '') > AUTO_RECORD_BYTES) reasons.push(`Automatic updates are limited to ${AUTO_APPEND_BYTES} appended bytes and ${AUTO_RECORD_BYTES} total body bytes; ask the owner to curate larger records.`);
  }
  if (validation.rejections.length || validation.flags.length) reasons.push('Validation rejections or conflict flags require owner review.');
  if (validation.incomplete) reasons.push('Missing, unreadable or invalid Brain records require owner review.');
  const task = proposal.fields.task;
  if (typeof task !== 'string' || !task || slugTask(task) !== task || typeof proposal.fields.checkpoint !== 'string') reasons.push('Automatic application requires a proposal tied to a checkpoint with --task.');
  if (reasons.length) return result();
  try {
    const loaded = await loadCurrent(ctx.root, task);
    if (loaded.kind !== 'ok' || loaded.record.id !== proposal.fields.checkpoint) {
      reasons.push('The proposal must cite the current, readable checkpoint for its task; stage again after a new checkpoint.');
      return result();
    }
    const checkpoint = loaded.record;
    if (autonomous) {
      // Docs-only fills may record no checks; only an observed failure blocks.
      if (checkpoint.receipts.some((receipt) => receipt.status === 'observed-fail')) reasons.push('The checkpoint records an observed-fail check; fix it, checkpoint again and stage again (unrun checks are fine).');
      return result();
    }
    if (checkpoint.recovered || checkpoint.blockers.length) reasons.push('Recovered work or an unresolved blocker needs owner review.');
    if (!ctx.evidence) throw new Error('Current repository evidence is unavailable');
    const excluded = ctx.evidence.excluded;
    if (!Array.isArray(excluded) || excluded.some((path) => typeof path !== 'string')) throw new Error('handoff.exclude_paths must be a list of relative paths');
    for (const path of excluded) assertRelativeBoundaryPath(path);
    const current = await workspaceState({ root: ctx.root, ...ctx.evidence });
    if (!current.repos.length || current.repos.some((repo) => !repo.available || !repo.head || !repo.fingerprint || repo.omitted_paths)
      || current.state !== checkpoint.state || checkpoint.repos.length !== current.repos.length
      || checkpoint.repos.some((saved) => !current.repos.some((repo) => repo.name === saved.name && repo.path === saved.path && repo.branch === saved.branch))) {
      reasons.push('Repository evidence is unavailable, incomplete or changed since the checkpoint; recheck and stage again.');
    }
    if (!checkpoint.receipts.length || checkpoint.receipts.some((receipt) => receipt.status !== 'observed-pass' || receipt.exit_code !== 0 || !receipt.observed_at || receipt.state_tested !== current.state)) {
      reasons.push('Every recorded check must be observed-pass for the current state; failed, claimed, missing or unrun checks need review or rechecking.');
    }
    if (reasons.length) return result();
    for (const receipt of checkpoint.receipts) {
      const prefix = `.agentos/checkpoints/${task}/evidence/`;
      if (!receipt.evidence?.startsWith(prefix) || !/^[a-f0-9]{16}\.log$/.test(receipt.evidence.slice(prefix.length))) throw new Error('Receipt evidence path is invalid');
      const path = join(ctx.root, receipt.evidence);
      const info = await lstat(path);
      if (!info.isFile() || info.size > 256 * 1024 || !isWithin(await realpath(ctx.root), await realpath(path))) throw new Error('Receipt evidence is not a bounded local file');
      if (hash(await readFile(path, 'utf8')).slice(0, 16) !== receipt.evidence.slice(prefix.length, -4)) throw new Error('Receipt evidence hash changed');
    }
  } catch (error) {
    reasons.push(`Checkpoint evidence cannot be verified: ${error.message}`);
  }
  return result();
}
