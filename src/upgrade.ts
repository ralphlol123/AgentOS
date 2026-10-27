// `agentos upgrade`: install a newer agentos-for-projects with the package manager that installed this
// CLI, then run the *new* binary's `doctor --fix` in the current workspace. No dependencies: fetch + spawn.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { findAgentOSRoot } from './core.js';

const PACKAGE = 'agentos-for-projects';
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const HINT = 'Run `agentos doctor --fix` in each workspace.';

export type Method = 'bun' | 'pnpm' | 'npm' | 'local' | 'unknown';
export const METHOD_LABEL: Record<Method, string> = { bun: 'bun global', pnpm: 'pnpm global', npm: 'npm global', local: 'project-local', unknown: 'unknown' };

/** How the CLI at `cliPath` (a real path) was installed. `project` is the project dir of a local install. */
export function detectInstall(cliPath: string, env: NodeJS.ProcessEnv = process.env): { method: Method; project?: string } {
  const p = cliPath.replace(/\\/g, '/');
  const under = (dir?: string) => Boolean(dir) && p.toLowerCase().startsWith(`${dir!.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()}/`);
  if (p.includes('/.bun/install/global/') || under(env.BUN_INSTALL && `${env.BUN_INSTALL}/install/global`)) return { method: 'bun' };
  if (p.includes('/pnpm/global/') || under(env.PNPM_HOME)) return { method: 'pnpm' };
  // npm global: <prefix>/lib/node_modules (POSIX), %APPDATA%\npm\node_modules (Windows), or an explicit prefix.
  if (p.includes(`/lib/node_modules/${PACKAGE}/`) || p.toLowerCase().includes(`/npm/node_modules/${PACKAGE}/`) || under(env.npm_config_prefix && `${env.npm_config_prefix}/lib/node_modules`)) return { method: 'npm' };
  // The first node_modules is the project's own (pnpm's .pnpm store and nested deps sit below it).
  if (p.includes(`/node_modules/${PACKAGE}/`)) return { method: 'local', project: cliPath.slice(0, p.indexOf('/node_modules/')) };
  return { method: 'unknown' };
}

export function installCommand(method: Method, version: string, project?: string): string[] {
  const spec = `${PACKAGE}@${version}`;
  if (method === 'bun') return ['bun', 'add', '-g', spec];
  if (method === 'pnpm') return ['pnpm', 'add', '-g', spec];
  if (method === 'npm') return ['npm', 'install', '-g', spec];
  // project-local: the project's own manager, without -g (we print it, never run it).
  const has = (file: string) => Boolean(project) && existsSync(join(project!, file));
  if (has('bun.lock') || has('bun.lockb')) return ['bun', 'add', spec];
  if (has('pnpm-lock.yaml')) return ['pnpm', 'add', spec];
  return ['npm', 'install', spec];
}

function parse(version: string) {
  const m = SEMVER.exec(version);
  if (!m) throw new Error(`Not a semver version: ${version}`);
  return m;
}

/** -1/0/1. A prerelease sorts before its release; prerelease tags compare as strings (enough for x.y.z-rc.N). */
export function compareVersions(a: string, b: string) {
  const x = parse(a), y = parse(b);
  for (let i = 1; i <= 3; i++) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) < Number(y[i]) ? -1 : 1;
  if (x[4] === y[4]) return 0;
  if (!x[4]) return 1;
  if (!y[4]) return -1;
  return x[4] < y[4] ? -1 : 1;
}

export async function latestVersion(registry = process.env.AGENTOS_REGISTRY_URL || 'https://registry.npmjs.org', timeoutMs = 10_000) {
  const url = `${registry.replace(/\/$/, '')}/${PACKAGE}/latest`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  } catch (error: any) {
    const reason = error?.name === 'TimeoutError' ? `timed out after ${timeoutMs / 1000}s` : error?.cause?.code ?? error?.cause?.message ?? error?.message;
    throw new Error(`Could not reach the npm registry (${url}): ${reason}.`);
  }
  if (!response.ok) throw new Error(`The npm registry answered ${response.status} for ${url}.`);
  const version = ((await response.json().catch(() => ({}))) as any)?.version;
  if (typeof version !== 'string' || !SEMVER.test(version)) throw new Error(`The npm registry returned no valid version for ${PACKAGE} (${url}).`);
  return version;
}

/** Runs a package-manager or agentos command; `.cmd` shims on Windows need a shell (args are validated). */
function run(argv: string[], options: { capture?: boolean; json?: boolean } = {}) {
  const stdio: any = options.capture ? 'pipe' : ['inherit', options.json ? 2 : 'inherit', 'inherit'];
  return spawnSync(argv[0], argv.slice(1), { stdio, encoding: 'utf8', shell: process.platform === 'win32' });
}

type Options = { cliPath: string; current: string; cwd: string; check?: boolean; to?: string; dryRun?: boolean; yes?: boolean; json?: boolean };

export async function upgradeAgentOS(options: Options): Promise<{ text: string; exitCode: number }> {
  const { current, json } = options;
  const out: Record<string, any> = { current };
  const lines: string[] = [];
  const done = (status: string, exitCode: number, message?: string) => {
    out.status = status;
    if (message) { out.message = message; lines.push(message); }
    return { text: json ? JSON.stringify(out, null, 2) : lines.join('\n'), exitCode };
  };
  try {
    if (options.to !== undefined) parse(String(options.to));
    const target = options.to ? String(options.to) : await latestVersion();
    const { method, project } = detectInstall(options.cliPath);
    const root = await findAgentOSRoot(options.cwd);
    const command = method === 'unknown' ? null : installCommand(method, target, project);
    const major = Number(parse(target)[1]) !== Number(parse(current)[1]);
    Object.assign(out, { target, pinned: Boolean(options.to), method, installPath: options.cliPath, ...(project ? { project } : {}), upgradeCommand: command?.join(' ') ?? null, workspace: root, refreshCommand: root ? 'agentos doctor --fix' : null, major });
    lines.push(`Current: ${current}`, `${options.to ? 'Target (--to)' : 'Latest'}: ${target}`, `Install: ${METHOD_LABEL[method]} (${options.cliPath})`);

    const order = compareVersions(target, current);
    if (order === 0 || (order < 0 && !options.to)) {
      lines.push(order === 0 ? `AgentOS ${current} is the latest.` : `AgentOS ${current} is newer than the registry's latest ${target}; nothing to do.`);
      return done('up-to-date', 0, root ? `Refresh this workspace anyway: agentos doctor --fix` : HINT);
    }
    lines.push(`Upgrade: ${command?.join(' ') ?? '(install method unknown)'}${method === 'local' ? `  (run in ${project})` : ''}`);
    lines.push(`Refresh: ${root ? `agentos doctor --fix (workspace ${root}), with the newly installed binary` : HINT}`);
    if (major) {
      out.migration = `CHANGELOG.md and docs/migration-*.md of ${PACKAGE}@${target}`;
      lines.push(`Major: ${parse(current)[1]}.x → ${target} has breaking changes; read ${out.migration} first.`);
    }
    if (options.check) return done('update-available', 10);
    if (method === 'unknown') {
      out.commands = ['bun', 'pnpm', 'npm'].map((m) => installCommand(m as Method, target).join(' '));
      return done('refused', 1, `Could not tell how this AgentOS was installed; upgrade it with the manager you used:\n  ${out.commands.join('\n  ')}`);
    }
    if (method === 'local') return done('refused', 1, `AgentOS is installed inside the project ${project}; agentos upgrade does not edit a project's package.json. Run there: ${command!.join(' ')}`);
    if (options.dryRun) return done('planned', 0, 'Dry run: nothing installed or written.');

    if (!options.yes) {
      if (!process.stdin.isTTY || !process.stdout.isTTY || json) return done('refused', 1, `Not installing without confirmation: re-run with --yes${major ? ' (required for a major upgrade)' : ''}.`);
      console.log(lines.join('\n'));
      lines.length = 0;
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(major ? `Install ${target}, a MAJOR upgrade? Type "yes" to continue: ` : `Install ${target}? [y/N] `).finally(() => rl.close());
      if (!(major ? /^yes$/i : /^y(es)?$/i).test(answer.trim())) return done('refused', 1, 'Cancelled; nothing installed.');
    }

    if (!json) { console.log(lines.join('\n')); lines.length = 0; }
    const install = run(command!, { json });
    if (install.error || install.status !== 0) {
      return done('failed', 1, `${command!.join(' ')} ${install.error ? `could not start (${(install.error as any).code ?? install.error.message})` : `exited ${install.status}`}; stopped, nothing else done.`);
    }
    const probe = run(['agentos', '--version'], { capture: true });
    const installed = String(probe.stdout ?? '').trim();
    out.installed = installed || null;
    if (installed !== target) {
      return done('mismatch', 1, `Installed ${target}, but \`agentos --version\` on PATH reports ${installed || '(nothing)'}; PATH likely points at another install (check \`which agentos\`). Workspace not refreshed.`);
    }
    lines.push(`Installed AgentOS ${target}.`);
    if (!root) return done('upgraded', 0, HINT);
    if (!json) { console.log(lines.join('\n')); lines.length = 0; }
    const doctor = run(['agentos', 'doctor', '--fix'], { json });
    out.refreshed = doctor.status === 0;
    return doctor.status === 0
      ? done('upgraded', 0, `Workspace ${root} refreshed with AgentOS ${target}.`)
      : done('refresh-failed', 1, `AgentOS ${target} is installed, but \`agentos doctor --fix\` failed in ${root} (exit ${doctor.status ?? 'error'}); fix the reported problems and re-run it.`);
  } catch (error: any) {
    return done('error', 1, `agentos upgrade failed: ${error.message}`);
  }
}
