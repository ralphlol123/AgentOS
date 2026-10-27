#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { parseFlagsAndPositionals, validateCommandFlags } from './cli-options.js';
import { createRequire } from 'node:module';
import { enginesReport } from './engines.js';
import { formDeprecation, type Deprecation } from './legacy-deprecation.js';
import { adaptersAgentOS, agentsAgentOS, BRAIN_USAGE, brainAgentOS, checkpointAgentOS, compactAgentOS, contextAgentOS, doctorAgentOS, handoffAgentOS, initAgentOS, linkObsidianAgentOS, migrateClaudeAgentOS, normalizeRepoIdsAgentOS, obsidianAgentOS, promptAgentOS, resumeAgentOS, runHandoffAgentOS, skillsAgentOS, statusAgentOS, templatesAgentOS } from './core.js';

const require = createRequire(import.meta.url);
const VERSION = require('../package.json').version;

async function main() {
  const [, , command = 'help', ...args] = process.argv;
  try {
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
    notice = formNotice(command, args, flags);
    json = Boolean(flags.json);
    if (notice && !json) console.error(notice.message);
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
      say(result.text);
      return;
    }
    if (command === 'status') {
      const result = await statusAgentOS({ cwd: process.cwd() });
      // --full appends what `agentos handoff` printed (the reading list and the handoff excerpt).
      const full = flags.full ? await handoffAgentOS({ cwd: process.cwd() }) : null;
      say(full ? `${result.text}\n\n${full.text}` : result.text);
      process.exitCode = result.ok && (!full || full.ok) ? 0 : 1;
      return;
    }
    if (command === 'handoff') {
      const result = await handoffAgentOS({ cwd: process.cwd() });
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'run') {
      const [sub, ...rest] = args;
      if (sub !== 'handoff') {
        console.log('Usage: agentos run handoff [--engine name] [--role role] [--repo repo] [--worktree path] [--phase slug] [--reason reason] [--dry-run]');
        process.exitCode = sub ? 1 : 0;
        return;
      }
      const { flags: subFlags } = parseFlagsAndPositionals(rest);
      const result = await runHandoffAgentOS({
        cwd: process.cwd(),
        engine: subFlags.engine,
        role: subFlags.role,
        repo: subFlags.repo,
        worktree: subFlags.worktree,
        phase: subFlags.phase,
        reason: subFlags.reason,
        dryRun: subFlags['dry-run'],
      });
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'doctor') {
      if (flags.explain !== undefined || flags.engines) {
        const extra = Object.keys(flags).filter((key) => !['explain', 'engines'].includes(key) && !(key === 'json' && flags.engines));
        if ((flags.explain !== undefined && flags.engines) || extra.length) throw new Error('doctor --explain <file> and doctor --engines [--json] are read-only views; use one on its own.');
        const result = flags.engines ? enginesReport({ json: Boolean(flags.json) }) : await adaptersAgentOS({ cwd: process.cwd(), explain: flags.explain });
        say(result.text);
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      if (flags['normalize-repo-ids'] && !flags.fix) {
        console.log('Usage: agentos doctor --fix --normalize-repo-ids [--dry-run]\n--normalize-repo-ids only runs together with --fix (migrations are never implicit).');
        process.exitCode = 1;
        return;
      }
      if (flags['normalize-repo-ids']) {
        const result = await normalizeRepoIdsAgentOS({ cwd: process.cwd(), dryRun: flags['dry-run'] });
        say(result.text);
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      if (flags['adopt-custom-adapters'] && !flags.fix) {
        console.log('Usage: agentos doctor --fix --adopt-custom-adapters\n--adopt-custom-adapters only runs together with --fix (migrations are never implicit).');
        process.exitCode = 1;
        return;
      }
      if (flags['prune-retired'] && !flags.fix) {
        console.log('Usage: agentos doctor --fix --prune-retired\n--prune-retired only runs together with --fix (migrations are never implicit).');
        process.exitCode = 1;
        return;
      }
      const result = await doctorAgentOS({
        cwd: process.cwd(),
        fix: flags.fix,
        json: flags.json,
        dryRun: flags['dry-run'],
        adoptCustomAdapters: flags['adopt-custom-adapters'],
        pruneRetired: flags['prune-retired'],
      });
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'adapters') {
      const [sub, ...rest] = args;
      if (sub !== 'explain') {
        console.log('Usage: agentos adapters explain <file>');
        process.exitCode = sub ? 1 : 0;
        return;
      }
      const file = rest.find((arg) => !arg.startsWith('-'));
      const result = await adaptersAgentOS({ cwd: process.cwd(), explain: file });
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'compact') {
      const result = await compactAgentOS({ cwd: process.cwd(), dryRun: flags['dry-run'], diff: flags.diff, rewrite: flags.rewrite, checkpoint: flags.checkpoint, archiveOnly: flags['archive-only'], objective: flags.objective, expectState: flags['expect-state'] });
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'link-obsidian') {
      const setup = await resolveObsidianOptions(flags);
      const result = await linkObsidianAgentOS({ cwd: process.cwd(), ...setup });
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'obsidian') {
      const [sub = 'status', ...rest] = args;
      const { flags: subFlags, positionals } = parseFlagsAndPositionals(rest);
      if (sub !== 'link' && (subFlags.note !== undefined || subFlags['no-index'])) throw new Error('--note and --no-index belong to agentos obsidian link.');
      if (sub === 'link' && subFlags.note !== undefined) {
        // Exact-note, link-only mode (what `agentos link-obsidian --link <note>` does, prompts included on a TTY).
        if (subFlags['no-index'] || subFlags.canonical) throw new Error('obsidian link --note links one exact note; it does not combine with --no-index or --canonical.');
        const { note, ...linkFlags } = subFlags;
        const result = await linkObsidianAgentOS({ cwd: process.cwd(), ...(await resolveObsidianOptions({ ...linkFlags, link: note })) });
        say(result.text);
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
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'skills') {
      const [sub, ...rest] = args;
      if (sub === 'list') {
        const result = await skillsAgentOS({ cwd: process.cwd(), list: true, installed: flags.installed });
        say(result.text);
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
        say(result.text);
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
        mode: subFlags.mode,
        replace: subFlags.replace,
        dryRun: subFlags['dry-run'],
      });
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'agents') {
      const [sub, ...rest] = args;
      if (sub === 'list') {
        const result = await agentsAgentOS({ cwd: process.cwd(), list: true, installed: flags.installed });
        say(result.text);
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
          role: subFlags.role, scope: subFlags.scope, json: subFlags.json, dryRun: subFlags['dry-run'], replace: subFlags.replace, fromCatalog: subFlags['from-catalog'], custom: subFlags.custom,
        });
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'templates') {
      const [sub, ...rest] = args;
      if (sub === 'list') {
        const result = await templatesAgentOS({ cwd: process.cwd(), command: 'list' });
        say(result.text);
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      if (sub === 'show') {
        const result = await templatesAgentOS({ cwd: process.cwd(), command: 'show', id: rest[0] });
        say(result.text);
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      if (sub === 'copy') {
        const { flags: subFlags, positionals } = parseFlagsAndPositionals(rest);
        const result = await templatesAgentOS({ cwd: process.cwd(), command: 'copy', id: positionals[0], dryRun: subFlags['dry-run'], replace: subFlags.replace });
        say(result.text);
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      if (sub === 'validate') {
        const { flags: subFlags, positionals } = parseFlagsAndPositionals(rest);
        const result = await templatesAgentOS({ cwd: process.cwd(), command: 'validate', source: positionals[0], type: subFlags.type });
        say(result.text);
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      if (sub !== 'import') {
        console.log('Usage: agentos templates list | show <id> | copy <id> [--dry-run] | validate <file> --type agent|skill | import <url-or-file> --type agent|skill --name <id> [--mode summary|full] [--dry-run] [--yes]');
        process.exitCode = sub ? 1 : 0;
        return;
      }
      const { flags: subFlags, positionals } = parseFlagsAndPositionals(rest);
      const result = await templatesAgentOS({ cwd: process.cwd(), command: 'import', source: positionals[0], type: subFlags.type, name: subFlags.name, mode: subFlags.mode, dryRun: subFlags['dry-run'], yes: subFlags.yes, replace: subFlags.replace, expectedSha256: subFlags['expected-sha256'] });
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'migrate') {
      const [target] = args;
      if (target !== 'claude') {
        console.log('Usage: agentos migrate claude --preserve [--dry-run]');
        process.exitCode = target ? 1 : 0;
        return;
      }
      const result = await migrateClaudeAgentOS({ cwd: process.cwd(), preserve: flags.preserve, dryRun: flags['dry-run'] });
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'prompt') {
      const engine = args.find((arg) => !arg.startsWith('-')) || 'generic';
      const result = await promptAgentOS({ cwd: process.cwd(), engine });
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'context') {
      const { positionals } = parseFlagsAndPositionals(args);
      if (flags.brief) {
        // The short generic start prefix, byte-identical to what `agentos prompt [engine]` printed.
        const extra = Object.keys(flags).filter((key) => key !== 'brief');
        if (extra.length) throw new Error(`context --brief takes only an engine name, not --${extra[0]}.`);
        const result = await promptAgentOS({ cwd: process.cwd(), engine: positionals[0] || 'generic' });
        say(result.text);
        process.exitCode = result.ok ? 0 : 1;
        return;
      }
      const strict = Boolean(flags.strict); // --strict = all three --require-* gates
      const result = await contextAgentOS({ cwd: process.cwd(), engine: positionals[0] || 'generic', task: flags.task, role: flags.role, scope: flags.scope, budget: flags.budget, json: flags.json, includeSuperseded: flags['include-superseded'], requireEnforcement: strict || flags['require-enforcement'], requireSyncedConfig: strict || flags['require-synced-config'], requireComplete: strict || flags['require-complete'] });
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'engines') {
      const result = enginesReport({ json: Boolean(flags.json) });
      say(result.text);
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
      say(result.text);
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
      say(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'resume') {
      const result = await resumeAgentOS({ cwd: process.cwd(), task: flags.task, engine: flags.engine, json: flags.json });
      say(result.text);
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

let notice: Deprecation | null = null;
let json = false;

/** Print a command's output. An old form's deprecation goes to stderr, or into a `deprecations` field of --json output. */
function say(text: string) {
  if (notice && json) {
    try {
      const data = JSON.parse(text);
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        data.deprecations = [...(Array.isArray(data.deprecations) ? data.deprecations : []), notice];
        text = `${JSON.stringify(data, null, 2)}${text.endsWith('\n') ? '\n' : ''}`;
      } else console.error(notice.message);
    } catch { console.error(notice.message); }
  }
  console.log(text);
}

const TEMPLATES_NEW: Record<string, string> = {
  list: '`agentos agents list` and `agentos skills list`',
  show: '`agentos agents show <id>` or `agentos skills show <id>`',
  copy: '`agentos agents add <id>` or `agentos skills add <id>`',
  validate: '`agentos agents add <file> --dry-run` or `agentos skills add <file> --dry-run`',
  import: '`agentos agents add <url|file>` or `agentos skills add <url|file>`',
};

/** The one notice a form deprecated in 2.1.0 prints; null for current forms and silent aliases (`compact --rewrite`,
 *  `init --agents detected`, `skills add --mode`). The legacy migrations carry their own notice (legacy-deprecation.ts). */
function formNotice(command: string, args: string[], flags: Record<string, any>): Deprecation | null {
  const [sub] = parseFlagsAndPositionals(args).positionals;
  if (command === 'handoff') return formDeprecation('handoff', '`agentos status --full`');
  if (command === 'prompt') return formDeprecation('prompt', '`agentos context [engine] --brief`');
  if (command === 'adapters') return formDeprecation('adapters explain', '`agentos doctor --explain <file>`');
  if (command === 'engines') return formDeprecation('engines', '`agentos doctor --engines`');
  if (command === 'run') return formDeprecation('run handoff', '`agentos checkpoint` and `agentos resume`');
  if (command === 'link-obsidian') return formDeprecation('link-obsidian', '`agentos obsidian link --note <path>`');
  if (command === 'obsidian' && sub === 'link-workspace') return formDeprecation('obsidian link-workspace', '`agentos obsidian link --no-index`');
  if (command === 'brain' && sub === 'validate') return formDeprecation('brain validate', '`agentos brain preview`');
  if (command === 'brain' && sub === 'init' && flags.location !== 'vault') return formDeprecation('brain init', '`agentos init` (it sets up the Brain; `brain init --location vault` stays)');
  if (command === 'agents' && sub === 'manifest' && flags['from-catalog']) return formDeprecation('agents manifest --from-catalog', '`agentos doctor --fix` (custom cards: keep using `agentos agents manifest <id> --custom` until 3.0 decides)');
  if (command === 'templates') return formDeprecation(TEMPLATES_NEW[sub] ? `templates ${sub}` : 'templates', TEMPLATES_NEW[sub] ?? '`agentos agents` and `agentos skills`');
  if (command === 'compact' && flags.checkpoint) return formDeprecation('compact --checkpoint', '`agentos compact --archive-only`');
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
  '       agentos agents manifest <id> --custom [--dry-run]   (--from-catalog: deprecated, use agentos doctor --fix)',
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
  '  agentos skills add <file|url> [--name id] [--mode summary|full] [--dry-run] [--yes] [--replace] [--expected-sha256 hash]',
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
  'Deprecated (removed in 3.0.0; each still works and prints one notice naming its replacement):',
  '  agentos handoff  ->  agentos status --full',
  '  agentos prompt [claude|codex|opencode|hermes]  ->  agentos context [engine] --brief',
  '  agentos adapters explain <file>  ->  agentos doctor --explain <file>',
  '  agentos engines [--json]  ->  agentos doctor --engines [--json]',
  '  agentos run handoff [--engine name] [--role role] [--repo repo] [--worktree path] [--phase slug] [--reason reason] [--dry-run]  ->  agentos checkpoint / agentos resume',
  '  agentos link-obsidian [--vault <path> --dest <folder> --link <note> --create]  ->  agentos obsidian link --note <path>',
  '  agentos obsidian link-workspace --vault <path> --dest <folder> [--create] [--dry-run]  ->  agentos obsidian link --no-index',
  '  agentos brain validate <proposal>  ->  agentos brain preview <proposal>',
  '  agentos brain init  ->  agentos init   (agentos brain init --location vault stays)',
  '  agentos agents manifest <id> --from-catalog  ->  agentos doctor --fix',
  '  agentos templates list  ->  agentos agents list, agentos skills list',
  '  agentos templates show <id>  ->  agentos agents show <id>, agentos skills show <id>',
  '  agentos templates copy <id> [--dry-run] [--replace]  ->  agentos agents add <id>, agentos skills add <id>',
  '  agentos templates validate <file> --type agent|skill  ->  agentos agents add <file> --dry-run, agentos skills add <file> --dry-run',
  '  agentos templates import <url-or-file> --type agent|skill --name <id> [--mode summary|full] [--dry-run] [--yes] [--replace] [--expected-sha256 hash]  ->  agentos agents add <url|file>, agentos skills add <url|file>',
  '  agentos compact --checkpoint [--dry-run]  ->  agentos compact --archive-only',
  '  agentos doctor --fix [--dry-run] [--adopt-custom-adapters] [--prune-retired]   (legacy migration)',
  '  agentos doctor --fix --normalize-repo-ids [--dry-run]   (legacy migration)',
  '  agentos migrate claude --preserve [--dry-run]   (legacy migration)',
  `  To migrate an older workspace with the legacy paths, run them with any 2.x release (npx agentos-for-projects@2).`,
  '',
  'Core rule:',
  '  One AgentOS per product/workspace.',
  '  Many repos inside it.',
  '  Each task declares which repo(s) are in scope.',
].join('\n');

main();
