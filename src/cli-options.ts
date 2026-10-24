export type FlagValue = string | boolean;
const booleans = new Set(['new', 'existing', 'dry-run', 'yes', 'y', 'detected', 'replace', 'preserve', 'fix', 'json', 'create', 'refresh', 'installed', 'normalize-repo-ids', 'adopt-custom-adapters', 'prune-retired', 'rewrite', 'checkpoint', 'diff', 'include-superseded', 'recover', 'append', 'from-catalog', 'custom', 'require-enforcement', 'require-complete']);
const values = new Set(['agents', 'engine', 'role', 'repo', 'worktree', 'phase', 'reason', 'vault', 'dest', 'link', 'mode', 'name', 'type', 'expected-sha256', 'objective', 'expect-state', 'task', 'scope', 'budget', 'progress', 'blocker', 'next', 'check', 'cwd', 'claim', 'kind', 'status', 'by', 'from', 'summary', 'supersedes', 'canonical', 'dir', 'location']);
/** `--check` and `--claim` repeat; each `--cwd` belongs to the `--check` right before it. */
export function parseFlagsAndPositionals(args: string[]): { flags: Record<string, FlagValue>; positionals: string[]; checks: Array<{ command: string; cwd?: string }>; claims: string[] } {
  const flags: Record<string, FlagValue> = {}, positionals: string[] = [], checks: Array<{ command: string; cwd?: string }> = [], claims: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') { positionals.push(...args.slice(i + 1)); break; }
    if (!arg.startsWith('-')) { positionals.push(arg); continue; }
    const token = arg.replace(/^--?/, ''), equals = token.indexOf('=');
    const key = equals < 0 ? token : token.slice(0, equals), explicit = equals < 0 ? undefined : token.slice(equals + 1);
    if (booleans.has(key)) {
      if (explicit !== undefined && !['true', 'false'].includes(explicit)) throw new Error(`--${key} requires true or false.`);
      flags[key] = explicit === undefined || explicit === 'true';
    } else if (values.has(key)) {
      const value = explicit ?? args[++i];
      if (!value || (value !== '-' && value.startsWith('-'))) throw new Error(`--${key} requires a value.`);
      flags[key] = value;
      if (key === 'check') checks.push({ command: value });
      if (key === 'claim') claims.push(value);
      if (key === 'cwd') {
        const last = checks.at(-1);
        if (!last || last.cwd !== undefined) throw new Error('--cwd must follow a --check "<command>" (one --cwd per check).');
        last.cwd = value;
      }
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return { flags, positionals, checks, claims };
}
export function validateCommandFlags(command: string, flags: Record<string, FlagValue>): void {
  const allowed: Record<string, string[]> = {
    init: ['new', 'existing', 'agents', 'dry-run', 'yes', 'y', 'refresh'], status: [], handoff: [], prompt: [],
    context: ['task', 'role', 'scope', 'budget', 'json', 'include-superseded', 'require-enforcement', 'require-complete'], engines: ['json'],
    checkpoint: ['task', 'engine', 'role', 'progress', 'blocker', 'next', 'check', 'cwd', 'claim', 'json', 'dry-run', 'recover'],
    resume: ['task', 'engine', 'json'],
    brain: ['kind', 'scope', 'status', 'by', 'from', 'summary', 'supersedes', 'append', 'json', 'dry-run', 'location'],
    run: ['engine', 'role', 'repo', 'worktree', 'phase', 'reason', 'dry-run'], doctor: ['fix', 'json', 'normalize-repo-ids', 'adopt-custom-adapters', 'prune-retired', 'dry-run'], compact: ['dry-run', 'rewrite', 'checkpoint', 'objective', 'expect-state', 'diff'],
    'link-obsidian': ['vault', 'dest', 'link', 'create', 'dry-run'], obsidian: ['vault', 'dest', 'create', 'dry-run', 'canonical', 'dir'], adapters: [],
    skills: ['detected', 'mode', 'dry-run', 'replace', 'installed'], agents: ['name', 'dry-run', 'replace', 'installed', 'json', 'from-catalog', 'custom', 'role', 'scope'],
    templates: ['type', 'name', 'mode', 'dry-run', 'yes', 'replace', 'expected-sha256'], migrate: ['preserve', 'dry-run'],
  };
  for (const key of Object.keys(flags)) if (allowed[command] && !allowed[command].includes(key)) throw new Error(`--${key} is not supported by ${command}.`);
  if (flags.new && flags.existing) throw new Error('Choose either --new or --existing.');
  if (flags.mode && !['summary', 'full'].includes(String(flags.mode))) throw new Error('--mode must be summary or full.');
  if (command === 'compact') resolveCompactMode(flags);
  if (flags['expect-state'] && !/^[a-f0-9]{64}$/.test(String(flags['expect-state']))) {
    throw new Error('--expect-state requires the sha256 source state printed by compact --dry-run.');
  }
}

export type CompactMode = 'structural' | 'checkpoint';

/** Resolve compact's public mode using only explicitly-active boolean flags. */
export function resolveCompactMode(options: Record<string, any>): CompactMode {
  for (const key of ['rewrite', 'checkpoint', 'diff']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') {
      throw new Error(`--${key} requires true or false.`);
    }
  }
  const dryRun = options['dry-run'] ?? options.dryRun;
  if (options.checkpoint === true) {
    const conflicts = [
      options.rewrite === true ? '--rewrite' : null,
      options.objective !== undefined ? '--objective' : null,
      options['expect-state'] !== undefined || options.expectState !== undefined ? '--expect-state' : null,
      options.diff === true ? '--diff' : null,
    ].filter(Boolean);
    if (conflicts.length) throw new Error(`Cannot combine --checkpoint with ${conflicts.join(', ')}.`);
    return 'checkpoint';
  }
  if (options.diff === true && dryRun !== true) throw new Error('--diff requires --dry-run.');
  return 'structural';
}
