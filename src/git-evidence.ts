import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export interface GitResult { ok: boolean; stdout: string; stderr: string; args: string[] }
export async function runReadOnlyGit(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const { stdout, stderr } = await exec('git', args, { cwd, timeout: 5000, maxBuffer: 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } });
    return { ok: true, stdout, stderr, args };
  } catch (error) { return { ok: false, stdout: error.stdout || '', stderr: error.stderr || error.message, args }; }
}
export function gitErrorText(result: GitResult): string { return [`$ git ${result.args.join(' ')}`, result.stderr || result.stdout || 'Git command failed.'].join('\n').trim(); }
export function protectedEvidencePath(path: string, excluded: string[] = []): boolean {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').some(part => /^(?:\.env(?:\..*)?|secrets?|credentials?|id_(?:rsa|ed25519)|production|prod)$/i.test(part))
    || /(?:\.(?:pem|key|p12|pfx)|(?:^|[./_-])(?:prod|production)[._-].*(?:config|settings)|(?:^|\/)(?:credentials|secrets)[._-])/i.test(normalized)
    || excluded.map(prefix => prefix.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/\/$/, '')).some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`));
}
export async function collectRunHandoffGitState(worktree: string, excluded: string[] = []) {
  const [status, stats, cachedStats, names, cachedNames] = await Promise.all([
    runReadOnlyGit(worktree, ['status', '--porcelain=v1', '-z', '--branch']),
    runReadOnlyGit(worktree, ['diff', '--no-ext-diff', '--no-textconv', '--stat']),
    runReadOnlyGit(worktree, ['diff', '--no-ext-diff', '--no-textconv', '--cached', '--stat']),
    runReadOnlyGit(worktree, ['diff', '--name-only', '-z']), runReadOnlyGit(worktree, ['diff', '--cached', '--name-only', '-z']),
  ]);
  const statusLines: string[] = [], statusFiles: string[] = [], blockedRenames = new Set<string>();
  const tokens = (status.ok ? status.stdout : '').split('\0').filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]; if (token.startsWith('##')) { statusLines.push(token); continue; }
    const path = token.slice(3); if (path === '.agentos-write.lock') continue;
    const old = /^[RC]|^.[RC]/.test(token.slice(0, 2)) ? tokens[++i] : undefined;
    statusFiles.push(path); if (old && protectedEvidencePath(old, excluded)) blockedRenames.add(path);
    statusLines.push(`${token.slice(0, 3)}${JSON.stringify(path)}${old ? ` (from ${JSON.stringify(old)})` : ''}`);
  }
  const changedFiles = [...new Set([...(names.ok ? names.stdout : '').split('\0'), ...(cachedNames.ok ? cachedNames.stdout : '').split('\0'), ...statusFiles].filter(Boolean))];
  const omittedFiles = changedFiles.filter(path => protectedEvidencePath(path, excluded) || blockedRenames.has(path)), omitted = new Set(omittedFiles);
  const errors = [status, stats, cachedStats, names, cachedNames].filter(r => !r.ok).map(gitErrorText);
  const snippets: Array<{ file: string; diff: string }> = []; let remaining = 12000;
  for (const file of changedFiles.filter(path => !omitted.has(path)).slice(0, 8)) {
    const [unstaged, staged] = await Promise.all([
      runReadOnlyGit(worktree, ['--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', '--', file]),
      runReadOnlyGit(worktree, ['--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', '--cached', '--', file]),
    ]);
    for (const r of [unstaged, staged]) if (!r.ok) errors.push(gitErrorText(r));
    const body = [staged, unstaged].filter(r => r.ok).map(r => r.stdout).join('\n');
    if (body.trim()) { snippets.push({ file, diff: body.slice(0, remaining) + (body.length > remaining ? '\n[diff truncated]' : '') }); remaining -= Math.min(remaining, body.length); }
    if (remaining <= 0) break;
  }
  return { status: status.ok ? statusLines.join('\n') : gitErrorText(status), diffStat: [stats, cachedStats].map(r => r.ok ? r.stdout : gitErrorText(r)).filter(Boolean).join('\n'), changedFiles, snippets, errors, omittedFiles };
}
