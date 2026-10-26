/** Checkpoints and resume (`agentos checkpoint`, `agentos resume`). See docs/checkpoints.md.
 *
 * A checkpoint is an immutable JSON record under `.agentos/checkpoints/<task>/<ISO-ts>-<hash>.json` plus a
 * `current.json` pointer and one bounded managed section in `.agentos/handoff.md`. Git evidence comes from
 * collectRunHandoffGitState (same sensitive-path exclusions and size bounds as `run handoff`). Receipts say what
 * was observed, claimed or never run, and which working-tree state they tested.
 *
 * Writes: per-file atomic (temp + rename/link) inside one in-process mutation transaction. Not a crash-safe
 * multi-file transaction: a crash between files can leave a record without its pointer, which `resume` reports
 * as `incomplete`.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { collectRunHandoffGitState, runReadOnlyGit } from './git-evidence.js';
import { assertRelativeBoundaryPath, isWithin } from './task-scope.js';
import type { ContextBundle } from './context-builder.js';
import { locateManagedBlock, mkdirTracked, withMutationTransaction, writeFileAtomic, writeFileExclusiveAtomic } from './core.js';

export const CHECKPOINT_SCHEMA = 'agentos.checkpoint/1';
export const POINTER_SCHEMA = 'agentos.checkpoint-pointer/1';
export const RECEIPT_STATUSES = ['observed-pass', 'observed-fail', 'claimed', 'not-run', 'unavailable'] as const;
export type ReceiptStatus = typeof RECEIPT_STATUSES[number];
export const UNKNOWN_PROGRESS = '(unknown: engine stopped without a summary)';
export const UNKNOWN_NEXT = '(unknown)';
export const BLOCK_START = '<!-- agentos:checkpoint:start -->';
export const BLOCK_END = '<!-- agentos:checkpoint:end -->';
export const SINGLE_WRITER = 'One active writer per workspace; concurrent engines are not supported.';
const CHECK_TIMEOUT_MS = 10 * 60 * 1000;
const EVIDENCE_CAP = 32 * 1024; // per stream, tail kept
const SUMMARY_CAP = 300;
const ID_PATTERN = /^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z-[a-f0-9]{8}$/;

export interface Receipt {
  status: ReceiptStatus; command: string; cwd: string; exit_code: number | null; observed_at: string | null;
  evidence: string | null; state_tested: string | null; note?: string;
}
export interface RepoState {
  name: string; path: string; worktree: string; available: boolean; reason?: string;
  /** Set when the repo path is a directory inside an enclosing git work tree (HEAD/branch are the enclosing repo's). */
  state?: 'enclosing-worktree';
  branch: string | null; head: string | null; fingerprint: string | null; changed_paths: string[]; omitted_paths: number;
}
export interface Checkpoint {
  schema: string; id: string; created_at: string; recovered: boolean;
  project: { name: string; root: string }; task: { id: string; source: string }; run_id: string | null;
  engine: string | null; role: string | null; objective: { id: string; text: string } | null;
  acceptance: { source: string; text: string } | null; scope: { repos: string[]; read: string[]; edit: string[] };
  repos: RepoState[]; state: string; progress: string; blockers: string[]; next: string;
  knowledge_refs: Array<{ id: string; source: string }>; receipts: Receipt[];
}

/** What core.ts prepares from project.yaml, handoff/tasks and the context builder. */
export interface CheckpointContext {
  root: string; projectName: string; engine: string | null;
  repos: Array<{ name: string; path: string; commands: Record<string, string> }>;
  excluded: string[];
  handoffText: string;
  objective: { id: string; text: string } | null;
  acceptance: { source: string; text: string } | null;
  bundle: ContextBundle | null;
  task: { id: string; source: string };
}

export const slugTask = (text: string) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '');
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const oneLine = (text: string, max = SUMMARY_CAP) => { const flat = String(text).replace(/\s+/g, ' ').trim(); return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat; };
const posix = (path: string) => path.replace(/^\.\/(?=.)/, '').replace(/\/+$/, '') || '.';
async function exists(path: string) { try { await stat(path); return true; } catch { return false; } }

/** Task id: slug of --task, else slug of the first line of the current objective. */
export function resolveTask(task: string | undefined, objective: { text: string } | null): { id: string; source: string } {
  if (task !== undefined) {
    const id = slugTask(task);
    if (!id) throw new Error('--task must contain letters or digits.');
    return { id, source: '--task' };
  }
  const first = objective?.text.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const id = slugTask(first);
  if (!id) throw new Error('No --task given and the current objective could not be resolved; pass --task <id>.');
  return { id, source: 'objective' };
}

// --- git state ------------------------------------------------------------------------------------

/** Branch, HEAD and working-tree fingerprint for one repo. Paths under `.agentos/` are AgentOS state (checkpoint
 *  writes them), not engine work, so they are left out of the fingerprint and the changed paths.
 *  A repo path that is a directory inside an enclosing work tree (web/ in a root repo) uses that work tree, limited
 *  to the directory by pathspec; its changed paths are relative to the directory and `state` is `enclosing-worktree`. */
export async function repoState(root: string, repo: { name: string; path: string }, excluded: string[]): Promise<RepoState> {
  const worktree = resolve(root, repo.path);
  const base = { name: repo.name, path: posix(repo.path), worktree, branch: null, head: null, fingerprint: null, changed_paths: [], omitted_paths: 0 };
  if (!await exists(worktree)) return { ...base, available: false, reason: 'path does not exist' };
  const top = await runReadOnlyGit(worktree, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return { ...base, available: false, reason: 'not inside a git work tree' };
  const topDir = top.stdout.trim();
  let prefix = '';
  if (await realpath(topDir).catch(() => '') !== await realpath(worktree)) {
    const show = await runReadOnlyGit(worktree, ['rev-parse', '--show-prefix']);
    prefix = show.ok ? show.stdout.trim().replace(/\/+$/, '') : '';
    if (!prefix) return { ...base, available: false, reason: 'git work tree prefix could not be resolved' };
  }
  const cwd = prefix ? topDir : worktree;
  const [head, branch, numstat, git] = await Promise.all([
    runReadOnlyGit(cwd, ['rev-parse', 'HEAD']),
    runReadOnlyGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
    runReadOnlyGit(cwd, prefix ? ['--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', '--numstat', 'HEAD', '--', prefix] : ['diff', '--no-ext-diff', '--no-textconv', '--numstat', 'HEAD']),
    collectRunHandoffGitState(cwd, excluded, prefix || undefined),
  ]);
  const rel = (path: string) => prefix && path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : path;
  const state = (path: string) => !(path === '.agentos' || path.startsWith('.agentos/'));
  const statusLines = git.status.split('\n').filter((line) => !line.startsWith('##') && !/^.{3}"\.agentos[/"]/.test(line));
  const numstatLines = (numstat.ok ? numstat.stdout : '').split('\n').filter((line) => line && state(line.split('\t').slice(2).join('\t')));
  const omitted = new Set(git.omittedFiles.map(rel));
  const changed = git.changedFiles.map(rel).filter(state).sort();
  return {
    ...base, available: true, ...(prefix ? { state: 'enclosing-worktree' as const } : {}),
    branch: branch.ok ? branch.stdout.trim() : null,
    head: head.ok ? head.stdout.trim() : null,
    // sha256 over porcelain status (staged, unstaged, untracked), changed names and per-file line counts
    fingerprint: sha256(JSON.stringify({ status: statusLines, changed, numstat: numstatLines, errors: git.errors.length })),
    changed_paths: changed.filter((path) => !omitted.has(path)),
    omitted_paths: changed.filter((path) => omitted.has(path)).length,
  };
}

const combinedState = (repos: RepoState[]) => sha256(repos.map((repo) => `${repo.name}\0${repo.available}\0${repo.head}\0${repo.fingerprint}`).join('\n'));
export async function workspaceState(ctx: Pick<CheckpointContext, 'root' | 'repos' | 'excluded'>) {
  const repos = await Promise.all(ctx.repos.map((repo) => repoState(ctx.root, repo, ctx.excluded)));
  return { repos, state: combinedState(repos) };
}

// --- receipts -------------------------------------------------------------------------------------

/** argv split with single/double quotes. ponytail: no shell (no pipes, &&, globbing, $VARS); wrap those in a
 *  script. Running without a shell is what lets a missing binary be told apart from a failing one. */
export function splitCommand(command: string): string[] {
  const out: string[] = [];
  let current = '', quote = '', open = false;
  for (const ch of command) {
    if (quote) { if (ch === quote) quote = ''; else current += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; open = true; continue; }
    if (/\s/.test(ch)) { if (open) { out.push(current); current = ''; open = false; } continue; }
    current += ch; open = true;
  }
  if (quote) throw new Error(`Unterminated quote in --check: ${command}`);
  if (open) out.push(current);
  return out;
}

const tail = (text: string) => (text.length > EVIDENCE_CAP ? `[${text.length - EVIDENCE_CAP} earlier characters omitted]\n${text.slice(-EVIDENCE_CAP)}` : text);

async function runCheck(root: string, check: { command: string; cwd?: string }, stateTested: string) {
  const argv = splitCommand(check.command);
  if (!argv.length) throw new Error('--check requires a command.');
  const cwd = posix(check.cwd ?? '.');
  if (cwd !== '.') assertRelativeBoundaryPath(cwd);
  const observed_at = new Date().toISOString();
  const receipt = (status: ReceiptStatus, exit_code: number | null, note?: string): Receipt => ({ status, command: check.command, cwd, exit_code, observed_at, evidence: null, state_tested: stateTested, ...(note ? { note } : {}) });
  if (!await exists(resolve(root, cwd))) return { receipt: receipt('unavailable', null, `cwd does not exist: ${cwd}`), log: `$ ${check.command}\n(cwd ${cwd})\ncwd does not exist\n` };
  const result: any = await new Promise((done) => execFile(argv[0], argv.slice(1), { cwd: resolve(root, cwd), timeout: CHECK_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
    (error: any, stdout, stderr) => done({ error, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })));
  const log = `$ ${check.command}\n(cwd ${cwd})\n--- stdout ---\n${tail(result.stdout)}\n--- stderr ---\n${tail(result.stderr)}\n`;
  const { error } = result;
  if (!error) return { receipt: receipt('observed-pass', 0), log };
  // spawn errors (ENOENT, EACCES) happen before the command runs: nothing was observed.
  if (String(error.syscall ?? '').startsWith('spawn')) return { receipt: receipt('unavailable', null, `${error.code}: ${argv[0]} could not be started`), log: `${log}${error.message}\n` };
  if (typeof error.code === 'number') return { receipt: receipt('observed-fail', error.code), log };
  return { receipt: receipt('observed-fail', null, error.killed ? `killed by ${error.signal ?? 'signal'} (timeout ${CHECK_TIMEOUT_MS / 1000}s)` : String(error.code ?? error.message)), log: `${log}${error.message}\n` };
}

/** Declared verification commands (build/test/check/lint) of in-scope repos that no --check ran. */
function notRunReceipts(ctx: CheckpointContext, checks: Array<{ command: string; cwd?: string }>): Receipt[] {
  const outOfScope = new Set((ctx.bundle?.omitted ?? []).filter((item) => item.reason === 'out-of-scope').map((item) => item.id));
  const ran = new Set(checks.map((check) => `${posix(check.cwd ?? '.')}\0${check.command}`));
  return ctx.repos.filter((repo) => !outOfScope.has(`verify:${repo.name}`)).flatMap((repo) => Object.entries(repo.commands)
    .filter(([key, value]) => /build|test|check|lint/.test(key) && value && value !== 'unknown' && !ran.has(`${posix(repo.path)}\0${value}`))
    .map(([key, value]) => ({ status: 'not-run' as const, command: value, cwd: posix(repo.path), exit_code: null, observed_at: null, evidence: null, state_tested: null, note: `declared ${repo.name}.${key}` })));
}

export const receiptCounts = (receipts: Receipt[]) => RECEIPT_STATUSES.map((status) => `${status} ${receipts.filter((receipt) => receipt.status === status).length}`).join(', ');

// --- record -----------------------------------------------------------------------------------------

export interface CheckpointOptions {
  task?: string; engine?: string; role?: string; progress?: string; blocker?: string; next?: string;
  checks?: Array<{ command: string; cwd?: string }>; claims?: string[]; dryRun?: boolean; recover?: boolean; json?: boolean; now?: Date;
}

/** `--cwd` is workspace-root-relative, never relative to the invocation dir (a nested invocation means the same
 *  thing as one at the root); an absolute path inside the workspace is normalized to that form, one outside is refused. */
async function checkCwd(root: string, value: string | undefined) {
  if (value === undefined) return '.';
  if (!isAbsolute(value)) { const cwd = posix(value); if (cwd !== '.') assertRelativeBoundaryPath(cwd); return cwd; }
  // Both sides canonical: the root may be reached through an alias of the --cwd path (a symlink, macOS
  // /var → /private/var, a Windows 8.3 short name such as C:\Users\RUNNER~1) and must still compare equal.
  const real = async (path: string) => realpath(path).catch(() => resolve(path));
  const [base, target] = [await real(root), await real(value)];
  const rel = relative(base, target);
  if (!isWithin(base, target)) throw new Error(`--cwd ${value} is outside the workspace ${root}; use a path inside it (workspace-relative or absolute).`);
  return posix(rel.split(sep).join('/'));
}

export async function buildRecord(ctx: CheckpointContext, options: CheckpointOptions): Promise<{ record: Checkpoint; logs: Array<{ path: string; content: string }> }> {
  const checks = await Promise.all((options.checks ?? []).map(async (check) => ({ command: check.command, cwd: await checkCwd(ctx.root, check.cwd) })));
  const logs: Array<{ path: string; content: string }> = [];
  const receipts: Receipt[] = [];
  const dir = `.agentos/checkpoints/${ctx.task.id}`;
  if (!options.recover) {
    for (const check of checks) {
      if (options.dryRun) { receipts.push({ status: 'not-run', command: check.command, cwd: posix(check.cwd ?? '.'), exit_code: null, observed_at: null, evidence: null, state_tested: null, note: 'dry run' }); continue; }
      const { receipt, log } = await runCheck(ctx.root, check, (await workspaceState(ctx)).state);
      receipt.evidence = `${dir}/evidence/${sha256(log).slice(0, 16)}.log`;
      logs.push({ path: receipt.evidence, content: log });
      receipts.push(receipt);
    }
  }
  const { repos, state } = await workspaceState(ctx);
  if (!options.recover) {
    for (const claim of options.claims ?? []) receipts.push({ status: 'claimed', command: claim, cwd: '.', exit_code: null, observed_at: null, evidence: null, state_tested: state, note: 'engine-reported; not observed by AgentOS' });
    receipts.push(...notRunReceipts(ctx, checks));
  }
  const now = options.now ?? new Date();
  const body = {
    created_at: now.toISOString(), recovered: Boolean(options.recover),
    project: { name: ctx.projectName, root: ctx.root }, task: ctx.task, run_id: process.env.AGENTOS_RUN_ID || null,
    engine: ctx.engine, role: ctx.bundle?.role ?? null, objective: ctx.objective, acceptance: ctx.acceptance,
    scope: ctx.bundle?.scope ?? { repos: ctx.repos.map((repo) => `${repo.name}=${repo.path}`), read: ['.'], edit: [] },
    repos, state,
    progress: options.recover ? UNKNOWN_PROGRESS : options.progress?.trim() || '(none recorded)',
    blockers: options.recover || !options.blocker?.trim() ? [] : [options.blocker.trim()],
    next: options.recover ? UNKNOWN_NEXT : options.next?.trim() || '(none recorded)',
    knowledge_refs: (ctx.bundle?.included ?? []).filter((item) => item.kind === 'decision' || item.kind === 'knowledge' || item.kind === 'brain').map((item) => ({ id: item.id, source: item.source })),
    receipts,
  };
  // The id is content-addressed: the same content at the same instant is the same record (and is refused).
  const id = `${now.toISOString().replace(/[:.]/g, '-')}-${sha256(JSON.stringify(body)).slice(0, 8)}`;
  const record = { schema: CHECKPOINT_SCHEMA, id, ...body };
  assertCheckpoint(record);
  return { record, logs };
}

// --- handoff.md managed section ---------------------------------------------------------------------

function repoLine(repos: RepoState[]) {
  return oneLine(repos.map((repo) => repo.available ? `${repo.name}${repo.state ? ' (enclosing work tree)' : ''} ${repo.branch ?? '?'}@${repo.head?.slice(0, 7) ?? '(no commits)'} (${repo.changed_paths.length + repo.omitted_paths} changed)` : `${repo.name} unavailable`).join('; ') || '(none)', 600);
}

export function summaryLines(record: Checkpoint, recordPath: string) {
  return [
    `- Task: ${record.task.id}`,
    `- Record: \`${recordPath}\`${record.recovered ? ' (recovered from git evidence)' : ''}`,
    `- Repos: ${repoLine(record.repos)}`,
    `- Progress: ${oneLine(record.progress)}`,
    `- Blockers: ${oneLine(record.blockers.join('; ') || 'none')}`,
    `- Next: ${oneLine(record.next)}`,
    `- Receipts: ${receiptCounts(record.receipts)}`,
    `- Resume: \`agentos resume --task ${record.task.id}\``,
  ];
}

/** Replace (or insert once at the end) the single checkpoint block; every byte outside it is kept. */
export function replaceCheckpointBlock(content: string, lines: string[]) {
  const nl = content.includes('\r\n') ? '\r\n' : '\n';
  const block = [BLOCK_START, '## Checkpoint (managed)', '', ...lines, BLOCK_END].join(nl);
  const located = locateManagedBlock(content, BLOCK_START, BLOCK_END);
  if (located.kind === 'conflict') throw new Error(`.agentos/handoff.md checkpoint section is ambiguous: ${located.reason}. Fix the ${BLOCK_START} / ${BLOCK_END} lines by hand; nothing was written.`);
  if (located.kind === 'valid') return content.slice(0, located.startIdx) + block + content.slice(located.endIdx + BLOCK_END.length);
  if (!content) return `${block}${nl}`;
  return content.endsWith('\n') ? `${content}${nl}${block}${nl}` : `${content}${nl}${nl}${block}`;
}

// --- write ------------------------------------------------------------------------------------------

/** The knowledge-review step (goal Slice 5). An instruction the engine reads and acts on; AgentOS decides nothing. */
export const knowledgeLine = (task: string) => `Knowledge: did this work change durable project knowledge (architecture, a decision, a convention)? If yes, stage one focused proposal: \`agentos brain propose <record-id> --from <file> --task ${task}\` (ids: \`agentos brain list\`). Progress only: stage nothing. The owner applies.`;

export async function writeCheckpoint(ctx: CheckpointContext, options: CheckpointOptions) {
  if (options.recover && (options.progress || options.next || options.blocker || options.checks?.length || options.claims?.length)) {
    throw new Error('--recover records git evidence only; it cannot be combined with --progress, --next, --blocker, --check or --claim.');
  }
  const handoffPath = join(ctx.root, '.agentos/handoff.md');
  replaceCheckpointBlock(ctx.handoffText, []); // refuse an ambiguous block before running any check
  const { record, logs } = await buildRecord(ctx, options);
  const dir = `.agentos/checkpoints/${ctx.task.id}`;
  const recordRel = `${dir}/${record.id}.json`;
  const handoff = replaceCheckpointBlock(ctx.handoffText, summaryLines(record, recordRel));
  const taskLine = `Task: ${ctx.task.id} ${ctx.task.source === 'objective' ? '(default: slug of the current objective; pass --task to choose)' : '(from --task)'}`;
  const text = (verb: string) => [
    `AgentOS checkpoint${options.dryRun ? ' (dry run)' : ''}${record.recovered ? ' — recovered from git evidence' : ''}`,
    taskLine,
    `${verb}: ${recordRel}`,
    `${options.dryRun ? 'Would update' : 'Updated'}: ${dir}/current.json, .agentos/handoff.md (## Checkpoint (managed))`,
    `Repos: ${repoLine(record.repos)}`,
    `Receipts: ${receiptCounts(record.receipts)}`,
    ...record.receipts.map(receiptLine),
    ...(record.recovered ? [] : [knowledgeLine(ctx.task.id)]),
    SINGLE_WRITER,
  ].join('\n');
  const result = (ok: boolean, body: string) => ({ ok, dryRun: Boolean(options.dryRun), path: recordRel, record, text: options.json ? JSON.stringify({ ok, dryRun: Boolean(options.dryRun), path: recordRel, record }, null, 2) : body });
  if (options.dryRun) return result(true, text('Would write'));
  const recordPath = join(ctx.root, recordRel);
  const refused = () => result(false, `AgentOS checkpoint: FAIL\n${recordRel} already exists; checkpoint records are immutable. Nothing was written.`);
  if (await exists(recordPath)) return refused();
  try {
    await withMutationTransaction(async () => {
      await mkdirTracked(join(ctx.root, dir, 'evidence'));
      for (const log of logs) await writeFileExclusiveAtomic(join(ctx.root, log.path), Buffer.from(log.content)); // content-addressed: an existing file has these bytes
      if (!(await writeFileExclusiveAtomic(recordPath, Buffer.from(`${JSON.stringify(record, null, 2)}\n`))).created) throw Object.assign(new Error('exists'), { code: 'ECHECKPOINTEXISTS' });
      await writeFileAtomic(join(ctx.root, dir, 'current.json'), `${JSON.stringify({ schema: POINTER_SCHEMA, task: ctx.task.id, id: record.id, record: `${record.id}.json`, updated_at: record.created_at }, null, 2)}\n`);
      await writeFileAtomic(handoffPath, handoff);
    });
  } catch (error) {
    if (error.code === 'ECHECKPOINTEXISTS') return refused();
    throw error;
  }
  return result(true, text('Wrote'));
}

function receiptLine(receipt: Receipt & { stale?: boolean }) {
  const detail = [`cwd ${receipt.cwd}`, receipt.exit_code !== null ? `exit ${receipt.exit_code}` : '', receipt.note ?? '', receipt.evidence ? `evidence ${receipt.evidence}` : ''].filter(Boolean).join(', ');
  return `- ${receipt.status}: \`${receipt.command}\` (${detail})${receipt.stale ? ' [stale (recheck)]' : ''}`;
}

// --- read -------------------------------------------------------------------------------------------

type Loaded =
  | { kind: 'none' }
  | { kind: 'incomplete'; evidence: { reason: string; error?: string; files: Array<{ name: string; size: number }> } }
  | { kind: 'ok'; record: Checkpoint; path: string };

async function listFiles(dir: string) {
  const files: Array<{ name: string; size: number }> = [];
  for (const name of (await readdir(dir).catch(() => [])).sort()) {
    const info = await stat(join(dir, name));
    files.push({ name: info.isDirectory() ? `${name}/` : name, size: info.isDirectory() ? 0 : info.size });
  }
  return files;
}

/** Load the record `current.json` points at. Anything short of a valid record is `incomplete`, with evidence. */
export async function loadCurrent(root: string, task: string): Promise<Loaded> {
  const dir = join(root, '.agentos/checkpoints', task);
  const files = await listFiles(dir);
  if (!files.length) return { kind: 'none' };
  const incomplete = (reason: string, error?: string): Loaded => ({ kind: 'incomplete', evidence: { reason, ...(error ? { error } : {}), files } });
  const records = files.filter((file) => file.name.endsWith('.json') && file.name !== 'current.json');
  if (!files.some((file) => file.name === 'current.json')) return incomplete(`current.json is missing; ${records.length} record file(s) present`);
  let pointer;
  try { pointer = JSON.parse(await readFile(join(dir, 'current.json'), 'utf8')); } catch (error) { return incomplete('current.json is unreadable', error.message); }
  if (!pointer || pointer.schema !== POINTER_SCHEMA || typeof pointer.id !== 'string' || !ID_PATTERN.test(pointer.id)) return incomplete('current.json is not a valid checkpoint pointer', JSON.stringify(pointer)?.slice(0, 200));
  const name = `${pointer.id}.json`;
  if (!files.some((file) => file.name === name)) return incomplete(`current.json points at missing record ${name}`);
  let record;
  try { record = JSON.parse(await readFile(join(dir, name), 'utf8')); assertCheckpoint(record); } catch (error) { return incomplete(`record ${name} is invalid`, error.message); }
  if (record.id !== pointer.id || record.task.id !== task) return incomplete(`record ${name} does not match its pointer`);
  return { kind: 'ok', record, path: `.agentos/checkpoints/${task}/${name}` };
}

/** Evidence a knowledge proposal cites: changed paths (workspace-relative) and every receipt with its state.
 *  Empty `changed` and no `observed-pass` = progress only: nothing worth a durable-knowledge proposal. */
export function checkpointEvidence(record: Checkpoint) {
  const changed = record.repos.flatMap((repo) => repo.changed_paths.map((path) => (posix(repo.path) === '.' ? path : `${posix(repo.path)}/${path}`)));
  const omitted = record.repos.reduce((sum, repo) => sum + repo.omitted_paths, 0);
  const lines = [
    ...changed.slice(0, 20).map((path) => `changed: ${path}`), ...(changed.length > 20 ? [`changed: … ${changed.length - 20} more`] : []),
    ...(omitted ? [`changed: ${omitted} protected path(s) not listed`] : []),
    ...record.receipts.map((receipt) => `${receipt.status}: ${receipt.command} (cwd ${receipt.cwd})`),
  ];
  return { lines, meaningful: changed.length + omitted > 0 || record.receipts.some((receipt) => receipt.status === 'observed-pass') };
}

export async function checkpointTasks(root: string) {
  return (await readdir(join(root, '.agentos/checkpoints'), { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

/** Doctor: a present current.json that does not lead to a valid record is a problem. */
export async function checkpointProblems(root: string) {
  const problems: string[] = [];
  for (const task of await checkpointTasks(root)) {
    if (!await exists(join(root, '.agentos/checkpoints', task, 'current.json'))) continue;
    const loaded = await loadCurrent(root, task);
    if (loaded.kind === 'incomplete') problems.push(`.agentos/checkpoints/${task}/current.json: ${loaded.evidence.reason}${loaded.evidence.error ? ` (${oneLine(loaded.evidence.error, 160)})` : ''}; run \`agentos resume --task ${task}\` for the recovery evidence`);
  }
  return problems;
}

/** Context: the current checkpoint for a task as text, or null when there is none. */
export async function checkpointContextRecord(root: string, task: string) {
  const loaded = await loadCurrent(root, task);
  if (loaded.kind === 'none') return null;
  const source = `.agentos/checkpoints/${task}/current.json`;
  if (loaded.kind === 'incomplete') return { source, text: `Checkpoint incomplete: ${loaded.evidence.reason}. Run \`agentos resume --task ${task}\` before continuing.` };
  return { source, text: summaryLines(loaded.record, loaded.path).join('\n') };
}

// --- resume -----------------------------------------------------------------------------------------

function reconcile(saved: RepoState[], current: RepoState[]) {
  const repos = saved.map((before) => {
    const now = current.find((repo) => repo.name === before.name);
    if (!now || !now.available) return { name: before.name, status: 'unavailable', reason: now?.reason ?? 'repo no longer declared in project.yaml', head_moved: null, branch_changed: null, fingerprint_changed: false, new_changed_paths: [], resolved_paths: [] };
    const head_moved = before.head !== now.head ? { from: before.head, to: now.head } : null;
    const branch_changed = before.branch !== now.branch ? { from: before.branch, to: now.branch } : null;
    const fingerprint_changed = before.fingerprint !== now.fingerprint;
    const new_changed_paths = now.changed_paths.filter((path) => !before.changed_paths.includes(path));
    const resolved_paths = before.changed_paths.filter((path) => !now.changed_paths.includes(path));
    const drifted = !before.available || head_moved || branch_changed || fingerprint_changed;
    return { name: before.name, status: drifted ? 'drifted' : 'clean', ...(before.available ? {} : { reason: 'was unavailable at checkpoint time' }), head_moved, branch_changed, fingerprint_changed, new_changed_paths, resolved_paths };
  });
  const status = repos.some((repo) => repo.status === 'drifted') ? 'drifted' : repos.some((repo) => repo.status === 'unavailable') ? 'unavailable' : 'clean';
  return { status, repos };
}

export async function resumeCheckpoint(ctx: CheckpointContext, options: { engine?: string; json?: boolean }) {
  const task = ctx.task.id;
  const loaded = await loadCurrent(ctx.root, task);
  const out = (ok: boolean, data: any, lines: string[]) => ({ ok, ...data, text: options.json ? JSON.stringify({ ok, ...data }, null, 2) : lines.join('\n') });
  if (loaded.kind === 'incomplete') {
    const { evidence } = loaded;
    return out(false, { status: 'incomplete', task: ctx.task, evidence }, [
      `AgentOS resume: ${task}`, 'Status: incomplete — the checkpoint was interrupted or damaged; nothing is assumed done.',
      `Reason: ${evidence.reason}`, ...(evidence.error ? [`Error: ${oneLine(evidence.error)}`] : []),
      `Files in .agentos/checkpoints/${task}/:`, ...evidence.files.map((file) => `- ${file.name}${file.name.endsWith('/') ? '' : ` (${file.size} bytes)`}`),
      'Recover: inspect the files above and the repos with git, then write a fresh record (`agentos checkpoint --task …` or `agentos checkpoint --recover --task …`). Never edit or delete a record by hand to make resume pass.',
    ]);
  }
  const engine = options.engine ?? (loaded.kind === 'ok' ? loaded.record.engine : null) ?? 'generic';
  const nextCommand = `agentos context ${engine} --task ${task}`;
  if (loaded.kind === 'none') {
    const runs = (await readdir(join(ctx.root, '.agentos/runs')).catch(() => [])).filter((name) => name.endsWith('.md') && name !== 'README.md');
    const { record } = await buildRecord(ctx, { recover: true });
    if (!runs.length && !record.repos.some((repo) => repo.changed_paths.length || repo.omitted_paths)) {
      return out(true, { status: 'none', task: ctx.task, next_command: nextCommand }, [`AgentOS resume: ${task}`, `Status: clean start — no checkpoint for task ${task}, no run notes and no changed files. No prior work is assumed; start with \`${nextCommand}\`.`]);
    }
    return out(true, { status: 'recovered', task: ctx.task, record, run_notes: runs, next_command: nextCommand }, [
      `AgentOS resume: ${task}`, `Status: recovered — no checkpoint exists; this view is built from git evidence only (recovered: true). Nothing is assumed done.`,
      `Progress: ${record.progress}`, `Next: ${record.next}`, `Repos: ${repoLine(record.repos)}`,
      ...record.repos.filter((repo) => repo.changed_paths.length).map((repo) => `- ${repo.name}: changed paths: ${repo.changed_paths.join(', ')}`),
      ...(runs.length ? [`Run notes: ${runs.map((name) => `.agentos/runs/${name}`).join(', ')}`] : []),
      `Persist it: agentos checkpoint --recover --task ${task}`, `Next: ${nextCommand}`,
    ]);
  }
  const { record, path } = loaded;
  const { repos, state } = await workspaceState(ctx);
  const reconciliation = reconcile(record.repos, repos);
  const receipts = record.receipts.map((receipt) => ({ ...receipt, stale: receipt.state_tested !== null && receipt.state_tested !== state }));
  const done = receipts.filter((receipt) => receipt.status === 'observed-pass' && !receipt.stale);
  const left = receipts.filter((receipt) => !done.includes(receipt));
  const data = {
    status: reconciliation.status, task: ctx.task, record_path: path, record, reconciliation,
    accomplished: { progress: record.progress, receipts: done },
    remaining: { next: record.next, blockers: record.blockers, receipts: left },
    next_command: nextCommand,
  };
  const short = (sha: string | null) => sha?.slice(0, 7) ?? '(none)';
  const drift = reconciliation.repos.flatMap((repo) => repo.status === 'unavailable' ? [`- ${repo.name}: unavailable (${repo.reason})`] : [
    ...(repo.head_moved ? [`- ${repo.name}: HEAD moved ${short(repo.head_moved.from)} -> ${short(repo.head_moved.to)}`] : []),
    ...(repo.branch_changed ? [`- ${repo.name}: branch ${repo.branch_changed.from} -> ${repo.branch_changed.to}`] : []),
    ...(repo.fingerprint_changed ? [`- ${repo.name}: working-tree fingerprint differs`] : []),
    ...(repo.new_changed_paths.length ? [`- ${repo.name}: new changed paths: ${repo.new_changed_paths.join(', ')}`] : []),
    ...(repo.resolved_paths.length ? [`- ${repo.name}: no longer changed: ${repo.resolved_paths.join(', ')}`] : []),
  ]);
  return out(true, data, [
    `AgentOS resume: ${task}`,
    `Record: ${path} (created ${record.created_at}; engine ${record.engine ?? 'unknown'}; role ${record.role ?? 'none'}${record.recovered ? '; recovered: true' : ''})`,
    `Objective: ${record.objective ? oneLine(record.objective.text) : '(unresolved at checkpoint time)'}`,
    `Reconciliation: ${reconciliation.status}`, ...drift,
    'Accomplished:', `- Progress: ${record.progress}`, ...done.map(receiptLine),
    'Remaining:', `- Next: ${record.next}`, `- Blockers: ${record.blockers.join('; ') || 'none'}`, ...left.map(receiptLine),
    ...(left.some((receipt) => receipt.stale) ? ['Receipts marked stale (recheck) tested a different working-tree state; re-run them before relying on them.'] : []),
    `Next: ${nextCommand}`,
  ]);
}

// --- list / show ------------------------------------------------------------------------------------

export async function listCheckpoints(root: string, options: { task?: string; json?: boolean }) {
  const tasks = [];
  for (const task of options.task ? [slugTask(options.task)] : await checkpointTasks(root)) {
    const files = await listFiles(join(root, '.agentos/checkpoints', task));
    const loaded = await loadCurrent(root, task);
    tasks.push({ task, current: loaded.kind === 'ok' ? loaded.record.id : null, status: loaded.kind, records: files.filter((file) => file.name.endsWith('.json') && file.name !== 'current.json').map((file) => file.name.replace(/\.json$/, '')) });
  }
  const text = options.json ? JSON.stringify({ ok: true, tasks }, null, 2)
    : tasks.length ? tasks.map((entry) => [`${entry.task} (${entry.status === 'ok' ? `current: ${entry.current}` : entry.status})`, ...entry.records.map((id) => `  - ${id}${id === entry.current ? ' *' : ''}`)].join('\n')).join('\n') : 'No checkpoints.';
  return { ok: true, tasks, text };
}

export async function showCheckpoint(root: string, id: string | undefined, options: { json?: boolean }) {
  if (!id || !ID_PATTERN.test(id)) return { ok: false, text: 'Usage: agentos checkpoint show <id> [--json]  (ids: agentos checkpoint list)' };
  for (const task of await checkpointTasks(root)) {
    const path = join(root, '.agentos/checkpoints', task, `${id}.json`);
    if (!await exists(path)) continue;
    let record;
    try { record = JSON.parse(await readFile(path, 'utf8')); assertCheckpoint(record); }
    catch (error) { return { ok: false, text: `.agentos/checkpoints/${task}/${id}.json is invalid: ${error.message}` }; }
    const rel = `.agentos/checkpoints/${task}/${id}.json`;
    return { ok: true, record, text: options.json ? JSON.stringify(record, null, 2) : [`Checkpoint ${id}`, ...summaryLines(record, rel), ...record.receipts.map(receiptLine)].join('\n') };
  }
  return { ok: false, text: `No checkpoint record ${id}.` };
}

// --- runtime contract -------------------------------------------------------------------------------

const isStrings = (value: unknown) => Array.isArray(value) && value.every((entry) => typeof entry === 'string');
const isStr = (value: unknown) => typeof value === 'string';
const isOptStr = (value: unknown) => value === null || typeof value === 'string';

/** Runtime contract for checkpoint records; plain checks, no schema dependency. */
export function assertCheckpoint(value: any): asserts value is Checkpoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Checkpoint must be an object');
  const fail = (field: string, expected: string) => { throw new Error(`Checkpoint.${field} must be ${expected}`); };
  if (value.schema !== CHECKPOINT_SCHEMA) fail('schema', `"${CHECKPOINT_SCHEMA}"`);
  if (!isStr(value.id) || !ID_PATTERN.test(value.id)) fail('id', '<ISO-ts>-<8 hex>');
  if (!isStr(value.created_at) || Number.isNaN(Date.parse(value.created_at))) fail('created_at', 'an ISO timestamp');
  if (typeof value.recovered !== 'boolean') fail('recovered', 'a boolean');
  if (!value.project || !isStr(value.project.name) || !isStr(value.project.root)) fail('project', '{name, root}');
  if (!value.task || !isStr(value.task.id) || !value.task.id || !isStr(value.task.source)) fail('task', '{id, source}');
  for (const key of ['run_id', 'engine', 'role']) if (!isOptStr(value[key])) fail(key, 'a string or null');
  if (value.objective !== null && (!value.objective || !isStr(value.objective.id) || !isStr(value.objective.text))) fail('objective', '{id, text} or null');
  if (value.acceptance !== null && (!value.acceptance || !isStr(value.acceptance.source) || !isStr(value.acceptance.text))) fail('acceptance', '{source, text} or null');
  if (!value.scope || !['repos', 'read', 'edit'].every((key) => isStrings(value.scope[key]))) fail('scope', '{repos, read, edit} string lists');
  if (!Array.isArray(value.repos) || !value.repos.every((repo) => repo && isStr(repo.name) && isStr(repo.path) && isStr(repo.worktree) && typeof repo.available === 'boolean'
    && ['branch', 'head', 'fingerprint'].every((key) => isOptStr(repo[key])) && isStrings(repo.changed_paths) && Number.isInteger(repo.omitted_paths))) fail('repos', 'a list of {name, path, worktree, available, branch, head, fingerprint, changed_paths, omitted_paths}');
  if (!isStr(value.state)) fail('state', 'a string');
  if (!isStr(value.progress) || !isStr(value.next)) fail('progress/next', 'strings');
  if (!isStrings(value.blockers)) fail('blockers', 'a string list');
  if (!Array.isArray(value.knowledge_refs) || !value.knowledge_refs.every((ref) => ref && isStr(ref.id) && isStr(ref.source))) fail('knowledge_refs', 'a list of {id, source}');
  if (!Array.isArray(value.receipts) || !value.receipts.every((receipt) => receipt && RECEIPT_STATUSES.includes(receipt.status) && isStr(receipt.command) && isStr(receipt.cwd)
    && (receipt.exit_code === null || Number.isInteger(receipt.exit_code)) && ['observed_at', 'evidence', 'state_tested'].every((key) => isOptStr(receipt[key])))) {
    fail('receipts', `a list of {status in ${RECEIPT_STATUSES.join('|')}, command, cwd, exit_code, observed_at, evidence, state_tested}`);
  }
}
