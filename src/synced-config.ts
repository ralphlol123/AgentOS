/** Sync record + freshness of engine-native config written by `agentos agents sync` (1.1).
 *
 * `agents sync <engine>` records exactly what it generated in `.agentos/synced/<engine>.json`. `syncFreshness` is the
 * one pure check shared by `context --require-synced-config` and `doctor`: it compares (a) the installed files with
 * the record (hand edits/deletions of generated entries) and (b) the record with what sync would generate now for
 * the *recorded* role/scope (tree, scope or manifest drift). Owner-added entries in a JSON file are not drift.
 * Configuration presence only: says nothing about enforcement.
 */
import { createHash } from 'node:crypto';
import type { NativeFile } from './engines.js';

export const SYNC_RECORD_DIR = '.agentos/synced';
export const syncRecordPath = (engine: string) => `${SYNC_RECORD_DIR}/${engine}.json`;

type Entries = Record<string, string[]>;
export interface SyncRecordFile { path: string; merge: NativeFile['merge']; sha256: string; entries?: Entries }
export interface SyncRecord {
  engine: string; role: string; agentos_version: string;
  /** `flag` = the --scope argument sync was given (null: project.yaml task_scope); edit/read = the effective scope. */
  scope: { flag: string | null; edit: string[]; read: string[] };
  files: SyncRecordFile[];
}
/** Installed state of one synced file, as read by the caller: `text` (whole file, or the role block for
 *  managed-block files), `json` (parsed, json-add-keys files), `missing`, or `error` (unreadable/invalid). */
export type Installed = { missing: true } | { error: string } | { text: string } | { json: unknown };
export type Now = { error: string } | { edit: string[]; read: string[]; files: NativeFile[] };
export type Freshness = { status: 'ok' | 'stale' | 'invalid'; reasons: string[]; userEntries: number };

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
/** Managed blocks are hashed without trailing whitespace: the block may sit at EOF without its final newline. */
const generatedSha = (file: Pick<NativeFile, 'merge' | 'content'>) => sha(file.merge === 'managed-block' ? file.content.trimEnd() : file.content);
export const installedSha = (merge: NativeFile['merge'], text: string) => sha(merge === 'managed-block' ? text.trimEnd() : text);

/** String arrays of a JSON fragment keyed by dotted path, e.g. { 'permissions.deny': [...] }. */
function arrays(value: any, at = '', out: Entries = {}): Entries {
  if (Array.isArray(value)) out[at] = value.map(String);
  else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) arrays(inner, at ? `${at}.${key}` : key, out);
  return out;
}
const at = (json: any, path: string) => path.split('.').reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), json);

export function syncRecord(engine: string, role: string, scope: SyncRecord['scope'], files: NativeFile[], version: string): SyncRecord {
  return {
    engine, role, agentos_version: version, scope,
    files: files.map((file) => ({ path: file.path, merge: file.merge, sha256: generatedSha(file), ...(file.merge === 'json-add-keys' ? { entries: arrays(JSON.parse(file.content)) } : {}) })),
  };
}

/** Parse and shape-check a record; throws with a short reason. */
export function parseSyncRecord(text: string, engine: string): SyncRecord {
  let record: any;
  try { record = JSON.parse(text); } catch (error) { throw new Error(`invalid JSON (${(error as Error).message})`); }
  const strings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === 'string');
  const fileOk = (f: any) => f && typeof f.path === 'string' && f.path && !f.path.startsWith('/') && !f.path.split(/[\\/]/).includes('..')
    && ['whole-file', 'json-add-keys', 'managed-block'].includes(f.merge) && /^[0-9a-f]{64}$/.test(f.sha256)
    && (f.merge !== 'json-add-keys' || (f.entries && typeof f.entries === 'object' && Object.values(f.entries).every(strings)));
  if (!record || record.engine !== engine || typeof record.role !== 'string' || !record.scope || !strings(record.scope.edit) || !strings(record.scope.read)
    || !(record.scope.flag === null || typeof record.scope.flag === 'string') || !Array.isArray(record.files) || !record.files.length || !record.files.every(fileOk)) {
    throw new Error(`not a valid sync record for ${engine}`);
  }
  return record;
}

/** The one "hand-edited?" classifier (freshness and re-sync): the recorded generated entries/bytes that are no longer
 *  installed as generated, named; [] = intact. Call only for an installed (not missing/error) file. */
export function editedEntries(file: SyncRecordFile, got: Installed): string[] {
  if (file.entries) {
    return Object.entries(file.entries).flatMap(([key, list]) => {
      const have = 'json' in got ? at(got.json, key) : undefined;
      return !Array.isArray(have) ? [`${key} (missing or not a list)`] : list.filter((entry) => !have.includes(entry)).map((entry) => `${key}: ${entry}`);
    });
  }
  return 'text' in got && installedSha(file.merge, got.text) === file.sha256 ? [] : [file.merge === 'managed-block' ? 'role block' : 'whole file'];
}

const plain = (v: unknown): v is Record<string, any> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
/** Re-sync of a json-add-keys file: per key path, drop `mine` (the entries AgentOS owns) and insert the generated
 *  `fragment` entries at the first dropped position (else at the end). Owner entries keep their place and order; every
 *  other key is untouched; a key left empty that AgentOS no longer generates is deleted. Returns `conflict` when a key
 *  path is not a list/object as expected (never overwritten).
 *  ponytail: a generated entry the owner already has is not inserted twice, but the record then claims it. */
export function replaceRecordedEntries(json: Record<string, any>, mine: Entries, fragment: Entries) {
  const out = structuredClone(json);
  const added: string[] = [], removed: string[] = [], conflict: string[] = [];
  for (const key of [...new Set([...Object.keys(mine), ...Object.keys(fragment)])]) {
    const parts = key.split('.'), last = parts.pop()!;
    let node: any = out;
    for (const part of parts) { if (node[part] === undefined) node[part] = {}; node = node[part]; if (!plain(node)) break; }
    if (!plain(node) || (node[last] !== undefined && !Array.isArray(node[last]))) { conflict.push(`${key} is not a list`); continue; }
    const have: unknown[] = node[last] ?? [], own = mine[key] ?? [], gen = fragment[key] ?? [];
    const first = have.findIndex((entry) => own.includes(String(entry)));
    const kept = have.filter((entry) => !own.includes(String(entry)));
    const insert = gen.filter((entry) => !kept.some((k) => String(k) === entry));
    const pos = first < 0 ? kept.length : first;
    const next = [...kept.slice(0, pos), ...insert, ...kept.slice(pos)];
    removed.push(...have.map(String).filter((entry) => own.includes(entry) && !gen.includes(entry)).map((entry) => `${key}: ${entry}`));
    added.push(...gen.filter((entry) => !have.some((h) => String(h) === entry)).map((entry) => `${key}: ${entry}`));
    if (next.length || gen.length) node[last] = next; else delete node[last];
  }
  return { json: out, added, removed, conflict };
}
/** Serialize like the file was written: its indent (2 spaces if unknown; none for a one-line file) and its trailing newline (or none). */
export const serializeJsonLike = (text: string, json: unknown) => JSON.stringify(json, null, text.trim().includes('\n') ? /^([ \t]+)"/m.exec(text)?.[1] ?? 2 : 0) + (text.endsWith('\n') ? '\n' : '');
export { arrays as jsonArrays, at as jsonAt };

export function syncFreshness(record: SyncRecord, installed: Record<string, Installed>, now: Now): Freshness {
  const invalid = (reason: string): Freshness => ({ status: 'invalid', reasons: [reason], userEntries: 0 });
  if ('error' in now) return invalid(now.error);
  const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
  const scopeChanged = !same(record.scope.edit, now.edit) || !same(record.scope.read, now.read);
  const reasons: string[] = [];
  let userEntries = 0;
  for (const file of record.files) {
    const got = installed[file.path] ?? { missing: true };
    if ('error' in got) return invalid(`${file.path}: ${got.error}`);
    let drift: string | null = null;
    // (a) installed vs record
    if ('missing' in got) drift = 'generated file missing';
    else if (editedEntries(file, got).length) drift = 'generated entry edited';
    else for (const [key, list] of Object.entries(file.entries ?? {})) userEntries += (at((got as { json: unknown }).json, key) as unknown[]).filter((entry) => !list.includes(entry as string)).length;
    // (b) record vs what sync would generate now
    if (!drift) {
      const generated = now.files.find((f) => f.path === file.path);
      if (!generated || generatedSha(generated) !== file.sha256) drift = scopeChanged ? 'scope changed' : file.entries ? 'tree changed' : 'manifest changed';
    }
    if (drift) reasons.push(`${file.path}: ${drift}`);
  }
  for (const generated of now.files) if (!record.files.some((f) => f.path === generated.path)) reasons.push(`${generated.path}: ${scopeChanged ? 'scope changed' : 'manifest changed'}`);
  return { status: reasons.length ? 'stale' : 'ok', reasons, userEntries };
}

/** Short fingerprint of a record (the OK line and --json). */
export const recordDigest = (record: SyncRecord) => sha(record.files.map((f) => `${f.path}\0${f.sha256}`).join('\n')).slice(0, 8);
