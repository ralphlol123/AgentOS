/** Every form removed in 3.0.0 (one table: the CLI refuses them, the guard test keeps them out of user-facing text). */
const removedLine = (form: string, use: string) => `agentos ${form} was removed in 3.0.0; use ${use}`;
const LEGACY = (flags: string) => `npx agentos-for-projects@2 ${flags} once, then upgrade`;
/** Commands and subcommands removed in 3.0.0, looked up as `<command> <sub>` then `<command>`: [old form, replacement]. */
const REMOVED_COMMANDS: Record<string, [string, string]> = {
  handoff: ['handoff', 'agentos status --full'],
  run: ['run handoff', 'agentos checkpoint --task <id> and agentos resume --task <id>'],
  prompt: ['prompt', 'agentos context [engine] --brief'],
  adapters: ['adapters explain', 'agentos doctor --explain <file>'],
  engines: ['engines', 'agentos doctor --engines [--json]'],
  'link-obsidian': ['link-obsidian', 'agentos obsidian link --note <path>'],
  migrate: ['migrate claude', LEGACY('migrate claude --preserve')],
  'templates list': ['templates list', 'agentos agents list / agentos skills list'],
  'templates show': ['templates show', 'agentos agents show <id> / agentos skills show <id>'],
  'templates copy': ['templates copy', 'agentos agents add <id> / agentos skills add <id>'],
  'templates validate': ['templates validate', 'agentos agents add <file> --dry-run / agentos skills add <file> --dry-run'],
  'templates import': ['templates import', 'agentos agents add <url|file> / agentos skills add <url|file>'],
  templates: ['templates', 'agentos agents and agentos skills'],
  'obsidian link-workspace': ['obsidian link-workspace', 'agentos obsidian link --no-index'],
  'brain validate': ['brain validate', 'agentos brain preview <proposal>'],
};
type Opts = { has: (flag: string) => boolean; value: (flag: string) => string | undefined; sub?: string };
/** Removed flags, checked in order: [command, matches, old form, replacement]. */
const REMOVED_FLAGS: Array<[string, (o: Opts) => boolean, string, string]> = [
  ...['adopt-custom-adapters', 'prune-retired', 'normalize-repo-ids'].map((flag): [string, (o: Opts) => boolean, string, string] => ['doctor', (o) => o.has(flag), `doctor --fix --${flag}`, LEGACY(`doctor --fix --${flag}`)]),
  ['compact', (o) => o.has('checkpoint'), 'compact --checkpoint', 'agentos compact --archive-only'],
  ['compact', (o) => o.has('rewrite'), 'compact --rewrite', 'agentos compact'],
  ['skills', (o) => o.has('mode'), 'skills add --mode', 'agentos skills add <id|file|url> (no --mode; imports keep a summary excerpt)'],
  ['init', (o) => o.value('agents') === 'detected', 'init --agents detected', 'agentos init --agents minimal'],
  ['brain', (o) => o.sub === 'init' && o.value('location') !== 'vault', 'brain init', 'agentos init (brain init --location vault stays)'],
  ['agents', (o) => o.sub === 'manifest' && o.has('from-catalog'), 'agents manifest --from-catalog', 'agentos doctor --fix'],
];
/** The old forms (`brain init` stays valid with `--location vault`). */
export const REMOVED_FORMS: string[] = [...Object.values(REMOVED_COMMANDS).map(([form]) => form), ...REMOVED_FLAGS.map(([, , form]) => form)];

/** The one line a form removed in 3.0.0 prints (exit 1), or null. Reads raw args: removed flags no longer parse. */
export function removedForm(command: string, args: string[]): string | null {
  const end = args.indexOf('--');
  const opts = end < 0 ? args : args.slice(0, end);
  const value = (flag: string) => { const i = opts.findIndex((a) => a === `--${flag}` || a.startsWith(`--${flag}=`)); return i < 0 ? undefined : opts[i].includes('=') ? opts[i].slice(opts[i].indexOf('=') + 1) : opts[i + 1] ?? ''; };
  const o: Opts = { value, has: (flag) => value(flag) !== undefined, sub: opts.find((a) => !a.startsWith('-')) };
  const hit = REMOVED_COMMANDS[`${command} ${o.sub}`] ?? (Object.hasOwn(REMOVED_COMMANDS, command) ? REMOVED_COMMANDS[command] : undefined);
  if (hit) return removedLine(...hit);
  const flag = REMOVED_FLAGS.find(([cmd, matches]) => cmd === command && matches(o));
  return flag ? removedLine(flag[2], flag[3]) : null;
}
