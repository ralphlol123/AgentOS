#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { parseFlagsAndPositionals, validateCommandFlags } from './cli-options.js';
import { createRequire } from 'node:module';
import { enginesReport } from './engines.js';
import { adaptersAgentOS, agentsAgentOS, BRAIN_USAGE, brainAgentOS, checkpointAgentOS, compactAgentOS, contextAgentOS, doctorAgentOS, handoffAgentOS, initAgentOS, linkObsidianAgentOS, obsidianAgentOS, promptAgentOS, resumeAgentOS, skillsAgentOS, statusAgentOS } from './core.js';

const require = createRequire(import.meta.url);
const VERSION = require('../package.json').version;

async function main() {
  const [, , command = 'help', ...args] = process.argv;
  try {
    const removed = removedForm(command, args);
    if (removed) { console.error(removed); process.exitCode = 1; return; }
    // `<command> --help|-h` anywhere before `--` prints that command's usage and runs nothing (no option parsing).
    const end = args.indexOf('--');
    if (!['help', '--help', '-h'].includes(command) && (end < 0 ? args : args.slice(0, end)).some((arg) => arg === '--help' || arg === '-h')) {
      const usage = commandUsage(command);
      if (usage) console.log(usage);
      else { console.error(`Unknown command: ${command}`); printHelp(); process.exitCode = 1; }
      return;
    }
    const { flags } = parseFlagsAndPositionals(args);
    validateCommandFlags(command, flags);
    if (command === 'help' || command === '--help' || command === '-h') {
      printHelp();
      return;
    }
    if (command === 'version' || command === '--version' || command === '-v') {
      console.log(VERSION);
      return;
    }
    if (command === 'init') {
      const mode = flags.new ? 'new' : flags.existing ? 'existing' : undefined;
      const result = await initAgentOS({ cwd: process.cwd(), mode, dryRun: flags['dry-run'], yes: flags.yes || flags.y, agents: flags.agents, refresh: flags.refresh });
      console.log(result.text);
      return;
    }
    if (command === 'status') {
      const result = await statusAgentOS({ cwd: process.cwd() });
      // --full appends what `agentos handoff` printed (the reading list and the handoff excerpt).
      const full = flags.full ? await handoffAgentOS({ cwd: process.cwd() }) : null;
      console.log(full ? `${result.text}\n\n${full.text}` : result.text);
      process.exitCode = result.ok && (!full || full.ok) ? 0 : 1;
      return;
    }
    if (command === 'doctor') {
      if (flags.explain !== undefined || flags.engines) {
        const extra = Object.keys(flags).filter((key) => !['explain', 'engines'].includes(key) && !(key === 'json' && flags.engines));
        if ((flags.explain !== undefined && flags.engines) || extra.length) throw new Error('doctor --explain <file> and doctor --engines [--json] are read-only views; use one on its own.');
        const result = flags.engines ? enginesReport({ json: Boolean(flags.json) }) : await adaptersAgentOS({ cwd: process.cwd(), explain: flags.explain });
        console.log(result.text);
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      const result = await doctorAgentOS({
        cwd: process.cwd(),
        fix: flags.fix,
        json: flags.json,
        dryRun: flags['dry-run'],
      });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'compact') {
      const result = await compactAgentOS({ cwd: process.cwd(), dryRun: flags['dry-run'], diff: flags.diff, archiveOnly: flags['archive-only'], objective: flags.objective, expectState: flags['expect-state'] });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'obsidian') {
      const [sub = 'status', ...rest] = args;
      const { flags: subFlags, positionals } = parseFlagsAndPositionals(rest);
      if (sub !== 'link' && (subFlags.note !== undefined || subFlags['no-index'])) throw new Error('--note and --no-index belong to agentos obsidian link.');
      if (sub === 'link' && subFlags.note !== undefined) {
        // Exact-note, link-only mode (prompts included on a TTY).
        if (subFlags['no-index'] || subFlags.canonical) throw new Error('obsidian link --note links one exact note; it does not combine with --no-index or --canonical.');
        const { note, ...linkFlags } = subFlags;
        const result = await linkObsidianAgentOS({ cwd: process.cwd(), ...(await resolveObsidianOptions({ ...linkFlags, link: note })) });
        console.log(result.text);
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      const result = await obsidianAgentOS({
        cwd: process.cwd(),
        command: sub === 'link' && subFlags['no-index'] ? 'link-workspace' : sub,
        subcommand: positionals[0],
        note: positionals[1],
        vault: subFlags.vault,
        dest: subFlags.dest,
        create: Boolean(subFlags.create),
        dryRun: subFlags['dry-run'],
        canonical: subFlags.canonical,
        dir: subFlags.dir,
      });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'skills') {
      const [sub, ...rest] = args;
      if (sub === 'list') {
        const result = await skillsAgentOS({ cwd: process.cwd(), list: true, installed: flags.installed });
        console.log(result.text);
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      if (sub !== 'add' && sub !== 'remove' && sub !== 'show') {
        console.log('Usage: agentos skills list | agentos skills show <skill-id> | agentos skills add [--detected] [skill-id|category-pack,...] [--dry-run] | agentos skills add <file|url> [--name id] [--yes] [--dry-run] | agentos skills remove <skill-id> [--dry-run]');
        process.exitCode = sub ? 1 : 0;
        return;
      }
      const { flags: subFlags, positionals } = parseFlagsAndPositionals(rest);
      if (sub === 'show') {
        const result = await skillsAgentOS({ cwd: process.cwd(), show: positionals[0] ?? '' });
        console.log(result.text);
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      const result = await skillsAgentOS({
        cwd: process.cwd(),
        name: subFlags.name,
        yes: subFlags.yes,
        expectedSha256: subFlags['expected-sha256'],
        detected: sub === 'add' ? Boolean(subFlags.detected) : false,
        add: sub === 'add' && positionals.length ? positionals.join(',') : undefined,
        remove: sub === 'remove' && positionals.length ? positionals.join(',') : undefined,
        replace: subFlags.replace,
        dryRun: subFlags['dry-run'],
      });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'agents') {
      const [sub, ...rest] = args;
      if (sub === 'list') {
        const result = await agentsAgentOS({ cwd: process.cwd(), list: true, installed: flags.installed });
        console.log(result.text);
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      const lifecycle = ['show', 'enable', 'disable', 'remove', 'manifest', 'sync'];
      if (sub !== 'add' && !lifecycle.includes(sub)) {
        console.log(AGENTS_USAGE);
        process.exitCode = sub ? 1 : 0;
        return;
      }
      const { flags: subFlags, positionals } = parseFlagsAndPositionals(rest);
      const result = sub === 'add'
        ? await agentsAgentOS({ cwd: process.cwd(), add: positionals[0], name: subFlags.name, replace: subFlags.replace, dryRun: subFlags['dry-run'], yes: subFlags.yes, expectedSha256: subFlags['expected-sha256'] })
        : await agentsAgentOS({
          cwd: process.cwd(), command: sub, id: sub === 'sync' ? undefined : positionals[0], engine: sub === 'sync' ? positionals[0] : undefined,
          role: subFlags.role, scope: subFlags.scope, json: subFlags.json, dryRun: subFlags['dry-run'], replace: subFlags.replace, custom: subFlags.custom,
        });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'context') {
      const { positionals } = parseFlagsAndPositionals(args);
      if (flags.brief) {
        // The short generic start prefix (what `agentos prompt [engine]` printed before 3.0.0).
        const extra = Object.keys(flags).filter((key) => key !== 'brief');
        if (extra.length) throw new Error(`context --brief takes only an engine name, not --${extra[0]}.`);
        const result = await promptAgentOS({ cwd: process.cwd(), engine: positionals[0] || 'generic' });
        console.log(result.text);
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      const strict = Boolean(flags.strict); // --strict = all three --require-* gates
      const result = await contextAgentOS({ cwd: process.cwd(), engine: positionals[0] || 'generic', task: flags.task, role: flags.role, scope: flags.scope, budget: flags.budget, json: flags.json, includeSuperseded: flags['include-superseded'], requireEnforcement: strict || flags['require-enforcement'], requireSyncedConfig: strict || flags['require-synced-config'], requireComplete: strict || flags['require-complete'] });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'checkpoint') {
      const { positionals, checks, claims } = parseFlagsAndPositionals(args);
      // A bare `.` (habit from `git add .`) means "this workspace"; checkpoint always covers it.
      const [sub, id] = positionals.filter((value) => value !== '.');
      if (sub && sub !== 'list' && sub !== 'show') {
        console.log(CHECKPOINT_USAGE);
        process.exitCode = 1;
        return;
      }
      const result = await checkpointAgentOS({
        cwd: process.cwd(), subcommand: sub, id, task: flags.task, engine: flags.engine, role: flags.role,
        progress: flags.progress, blocker: flags.blocker, next: flags.next, checks, claims,
        json: flags.json, dryRun: flags['dry-run'], recover: flags.recover,
      });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'brain') {
      const { positionals } = parseFlagsAndPositionals(args);
      const [sub, ...rest] = positionals;
      if (!sub) { console.log(BRAIN_USAGE); return; }
      const result = await brainAgentOS({
        cwd: process.cwd(), subcommand: sub, args: rest, kind: flags.kind, scope: flags.scope, status: flags.status, by: flags.by, from: flags.from,
        summary: flags.summary, supersedes: flags.supersedes, append: flags.append, auto: flags.auto, to: flags.to, last: flags.last, force: flags.force, task: flags.task, json: flags.json, dryRun: flags['dry-run'], location: flags.location, adopt: flags.adopt, stdin: readStdin,
      });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'resume') {
      const result = await resumeAgentOS({ cwd: process.cwd(), task: flags.task, engine: flags.engine, json: flags.json });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
  } catch (error) {
    console.error(`agentos ${command} failed: ${error.message}`);
    process.exitCode = 1;
  }
}

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

/** The one line a form removed in 3.0.0 prints (exit 1), or null. Reads raw args: removed flags no longer parse. */
function removedForm(command: string, args: string[]): string | null {
  const end = args.indexOf('--');
  const opts = end < 0 ? args : args.slice(0, end);
  const value = (flag: string) => { const i = opts.findIndex((a) => a === `--${flag}` || a.startsWith(`--${flag}=`)); return i < 0 ? undefined : opts[i].includes('=') ? opts[i].slice(opts[i].indexOf('=') + 1) : opts[i + 1] ?? ''; };
  const has = (flag: string) => value(flag) !== undefined;
  const sub = opts.find((a) => !a.startsWith('-'));
  const hit = REMOVED_COMMANDS[`${command} ${sub}`] ?? (Object.hasOwn(REMOVED_COMMANDS, command) ? REMOVED_COMMANDS[command] : undefined);
  if (hit) return removedLine(...hit);
  if (command === 'doctor') for (const flag of ['adopt-custom-adapters', 'prune-retired', 'normalize-repo-ids']) if (has(flag)) return removedLine(`doctor --fix --${flag}`, LEGACY(`doctor --fix --${flag}`));
  if (command === 'compact' && has('checkpoint')) return removedLine('compact --checkpoint', 'agentos compact --archive-only');
  if (command === 'compact' && has('rewrite')) return removedLine('compact --rewrite', 'agentos compact');
  if (command === 'skills' && has('mode')) return removedLine('skills add --mode', 'agentos skills add <id|file|url> (no --mode; imports keep a summary excerpt)');
  if (command === 'init' && value('agents') === 'detected') return removedLine('init --agents detected', 'agentos init --agents minimal');
  if (command === 'brain' && sub === 'init' && value('location') !== 'vault') return removedLine('brain init', 'agentos init (brain init --location vault stays)');
  if (command === 'agents' && sub === 'manifest' && has('from-catalog')) return removedLine('agents manifest --from-catalog', 'agentos doctor --fix');
  return null;
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); } catch { throw new Error('stdin is not valid UTF-8.'); }
}

const AGENTS_USAGE = [
  'Usage: agentos agents list [--installed]',
  '       agentos agents add <agent-id|file|url> [--name id] [--replace] [--dry-run] [--yes] [--expected-sha256 hash]',
  '       agentos agents show <id> [--json]',
  '       agentos agents enable|disable <id> [--dry-run]',
  '       agentos agents remove <id> [--dry-run]',
  '       agentos agents manifest <id> --custom [--dry-run]',
  '       agentos agents sync claude-code|codex [--role <id>] [--scope <repo-or-path>,...] [--dry-run] [--replace]',
].join('\n');

const CHECKPOINT_USAGE = 'Usage: agentos checkpoint [--task <id>] [--engine <e>] [--role <r>] [--progress "<text>"] [--blocker "<text>"] [--next "<text>"] [--check "<cmd>" [--cwd <dir>]]... [--claim "<text>"]... [--json] [--dry-run] | agentos checkpoint --recover [--task <id>] [--dry-run] | agentos checkpoint list [--task <id>] [--json] | agentos checkpoint show <id> [--json]';

async function resolveObsidianOptions(flags: Record<string, any>) {
  if (!process.stdin.isTTY) {
    const vault = flags.vault || process.env.OBSIDIAN_VAULT_PATH;
    if (!vault) throw new Error('Non-interactive Obsidian setup requires --vault <path> or OBSIDIAN_VAULT_PATH.');
    return { vault, dest: flags.dest, link: flags.link, create: flags.create ?? false, dryRun: flags['dry-run'] };
  }
  const provided = Boolean(flags.vault && flags.dest) || flags['dry-run'];
  if (provided && (flags.vault || !process.stdin.isTTY)) {
    return { vault: flags.vault, dest: flags.dest, link: flags.link, create: flags.create ?? true, dryRun: flags['dry-run'] };
  }
  const rl = createInterface({ input, output });
  try {
    console.log('AgentOS Obsidian Link Setup');
    console.log('Mode: link-only. AgentOS will not bulk-load your vault.');
    const vaultDefault = String(flags.vault || process.env.OBSIDIAN_VAULT_PATH || '');
    const vault = await askDefault(rl, 'Path to your Obsidian vault', vaultDefault);
    const destDefault = String(flags.dest || 'Projects/AgentOS');
    const dest = await askDefault(rl, 'Where should AgentOS project knowledge live inside the vault?', destDefault);
    const link = await askDefault(rl, 'Existing note/folder to link? Leave blank to create default project notes', String(flags.link || ''));
    const createAnswer = await askDefault(rl, 'Create missing notes/folders?', flags.create === false ? 'n' : 'Y');
    return { vault, dest, link: link || undefined, create: !/^n(o)?$/i.test(createAnswer), dryRun: flags['dry-run'] };
  } finally {
    rl.close();
  }
}

async function askDefault(rl: any, question: string, defaultValue: string) {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = await rl.question(`${question}${suffix}: `);
  return answer.trim() || defaultValue;
}

function printHelp() {
  console.log(`AgentOS for Projects v${VERSION}\n\n${HELP}`);
}

/** One command's usage: its lines of the global help (`brain`: the detailed BRAIN_USAGE); null for an unknown command. */
function commandUsage(command: string) {
  if (command === 'brain') return BRAIN_USAGE;
  const lines = HELP.split('\n').filter((line) => line === `  agentos ${command}` || line.startsWith(`  agentos ${command} `));
  return lines.length ? `Usage:\n${lines.join('\n')}` : null;
}

const HELP = [
  'Usage:',
  '',
  'Setup & health',
  '  agentos init [--new|--existing] [--agents minimal|<agent-id>,...] [--refresh] [--dry-run] [--yes]',
  '  agentos status [--full]',
  '  agentos doctor [--fix] [--dry-run] [--json]',
  '  agentos doctor --explain <file>',
  '  agentos doctor --engines [--json]',
  '',
  'Work loop (agents run these)',
  '  agentos context [claude|codex|opencode|hermes] [--task "<text>"] [--role <agent-id>] [--scope <repo-or-path>,...] [--budget <tokens>] [--json] [--strict] [--include-superseded]',
  '  agentos context [claude|codex|opencode|hermes] --brief',
  '  agentos checkpoint [--task <id>] [--engine <e>] [--role <r>] [--progress "<text>"] [--blocker "<text>"] [--next "<text>"] [--check "<cmd>" [--cwd <dir>]]... [--claim "<text>"]... [--json] [--dry-run]',
  '  agentos checkpoint --recover [--task <id>] [--dry-run]',
  '  agentos checkpoint list [--task <id>] [--json] | agentos checkpoint show <id> [--json]',
  '  agentos resume [--task <id>] [--engine <e>] [--json]',
  '',
  'Knowledge',
  '  agentos brain list|show|search|check|register|propose|preview|apply|revert|log|policy|verify|index ...  (agentos brain for details)',
  '',
  'Team',
  '  agentos agents list [--installed]',
  '  agentos agents show <id> [--json] | enable <id> | disable <id> | remove <id> [--dry-run]',
  '  agentos agents add <agent-id|file|url> [--name id] [--dry-run] [--replace] [--yes] [--expected-sha256 hash]',
  '  agentos agents manifest <id> --custom [--dry-run]',
  '  agentos agents sync claude-code|codex [--role <id>] [--scope <repo-or-path>,...] [--dry-run] [--replace]',
  '  agentos skills list [--installed]',
  '  agentos skills show <skill-id>',
  '  agentos skills add [--detected] [skill-id|category-pack,...] [--dry-run] [--replace]',
  '  agentos skills add <file|url> [--name id] [--dry-run] [--yes] [--replace] [--expected-sha256 hash]',
  '  agentos skills remove <skill-id> [--dry-run]',
  '',
  'Optional & maintenance',
  '  agentos obsidian init [--dir <path>] [--dry-run]',
  '  agentos obsidian link --vault <abs-path> --dest <sub/folder> [--canonical workspace|vault] [--no-index] [--create] [--dry-run]',
  '  agentos obsidian link --note <path> [--vault <path> --dest <folder> --create] [--dry-run]',
  '  agentos obsidian status',
  '  agentos compact [--objective <id>] [--expect-state <sha256>]',
  '  agentos compact [--objective <id>] --dry-run [--diff]',
  '  agentos compact --archive-only [--dry-run]',
  '',
  'Removed in 3.0.0: the 2.x old forms and legacy migrations exit 1 naming their replacement (docs/migration-3.0-cli.md).',
  'Older workspaces that still need a legacy migration: run npx agentos-for-projects@2 doctor --fix once first.',
  '',
  'Core rule:',
  '  One AgentOS per product/workspace.',
  '  Many repos inside it.',
  '  Each task declares which repo(s) are in scope.',
].join('\n');

main();
