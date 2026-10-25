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
export type Freshness = { status: 'ok' | 'stale' | 'invalid'; reasons: string[]; userEntries: number; staleFiles: SyncRecordFile[] };

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

export function syncFreshness(record: SyncRecord, installed: Record<string, Installed>, now: Now): Freshness {
  const invalid = (reason: string): Freshness => ({ status: 'invalid', reasons: [reason], userEntries: 0, staleFiles: [] });
  if ('error' in now) return invalid(now.error);
  const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
  const scopeChanged = !same(record.scope.edit, now.edit) || !same(record.scope.read, now.read);
  const reasons: string[] = [];
  const staleFiles: SyncRecordFile[] = [];
  let userEntries = 0;
  for (const file of record.files) {
    const got = installed[file.path] ?? { missing: true };
    if ('error' in got) return invalid(`${file.path}: ${got.error}`);
    let drift: string | null = null;
    // (a) installed vs record
    if ('missing' in got) drift = 'generated file missing';
    else if (file.entries) {
      for (const [key, list] of Object.entries(file.entries)) {
        const have = 'json' in got ? at(got.json, key) : undefined;
        if (!Array.isArray(have) || list.some((entry) => !have.includes(entry))) drift = 'generated entry edited';
        else userEntries += have.filter((entry) => !list.includes(entry)).length;
      }
    } else if (!('text' in got) || installedSha(file.merge, got.text) !== file.sha256) drift = 'generated entry edited';
    // (b) record vs what sync would generate now
    if (!drift) {
      const generated = now.files.find((f) => f.path === file.path);
      if (!generated || generatedSha(generated) !== file.sha256) drift = scopeChanged ? 'scope changed' : file.entries ? 'tree changed' : 'manifest changed';
    }
    if (drift) { reasons.push(`${file.path}: ${drift}`); staleFiles.push(file); }
  }
  for (const generated of now.files) if (!record.files.some((f) => f.path === generated.path)) reasons.push(`${generated.path}: ${scopeChanged ? 'scope changed' : 'manifest changed'}`);
  return { status: reasons.length ? 'stale' : 'ok', reasons, userEntries, staleFiles };
}

/** Short fingerprint of a record (the OK line and --json). */
export const recordDigest = (record: SyncRecord) => sha(record.files.map((f) => `${f.path}\0${f.sha256}`).join('\n')).slice(0, 8);
