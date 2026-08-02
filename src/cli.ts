#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { compactAgentOS, doctorAgentOS, handoffAgentOS, initAgentOS, linkObsidianAgentOS, promptAgentOS, statusAgentOS } from './core.js';

const VERSION = '0.1.0';

async function main() {
  const [, , command = 'help', ...args] = process.argv;
  const flags = parseFlags(args);
  try {
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
      const result = await initAgentOS({ cwd: process.cwd(), mode, dryRun: flags['dry-run'], yes: flags.yes || flags.y });
      console.log(result.text);
      return;
    }
    if (command === 'status') {
      const result = await statusAgentOS({ cwd: process.cwd() });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'handoff') {
      const result = await handoffAgentOS({ cwd: process.cwd() });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'doctor') {
      const result = await doctorAgentOS({ cwd: process.cwd(), fix: flags.fix });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'compact') {
      const result = await compactAgentOS({ cwd: process.cwd(), dryRun: flags['dry-run'] });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'link-obsidian') {
      const setup = await resolveObsidianOptions(flags);
      const result = await linkObsidianAgentOS({ cwd: process.cwd(), ...setup });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    if (command === 'prompt') {
      const engine = args.find((arg) => !arg.startsWith('-')) || 'generic';
      const result = await promptAgentOS({ cwd: process.cwd(), engine });
      console.log(result.text);
      process.exitCode = result.ok ? 0 : 1;
      return;
    }
    printHelp();
  } catch (error) {
    console.error(`agentos ${command} failed: ${error.message}`);
    process.exitCode = 1;
  }
}

function parseFlags(args: string[]): Record<string, any> {
  const flags: Record<string, any> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const raw = arg.slice(2);
      if (raw.includes('=')) {
        const [key, ...rest] = raw.split('=');
        flags[key] = rest.join('=');
      } else if (args[i + 1] && !args[i + 1].startsWith('-')) {
        flags[raw] = args[i + 1];
        i += 1;
      } else {
        flags[raw] = true;
      }
    } else if (arg.startsWith('-')) flags[arg.slice(1)] = true;
  }
  return flags;
}

async function resolveObsidianOptions(flags: Record<string, any>) {
  const provided = Boolean(flags.vault && flags.dest) || flags['dry-run'];
  if (provided && (flags.vault || !process.stdin.isTTY)) {
    return { vault: flags.vault, dest: flags.dest, link: flags.link, create: flags.create ?? true, dryRun: flags['dry-run'] };
  }
  const rl = createInterface({ input, output });
  try {
    console.log('AgentOS Obsidian Link Setup');
    console.log('Mode: link-only. AgentOS will not bulk-load your vault.');
    const vaultDefault = String(flags.vault || process.env.OBSIDIAN_VAULT_PATH || '/mnt/c/_/Obsidian/Ralph');
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
  console.log(`AgentOS for Projects v${VERSION}\n\nUsage:\n  agentos init [--new|--existing] [--dry-run]\n  agentos status\n  agentos handoff\n  agentos doctor [--fix]\n  agentos compact [--dry-run]\n  agentos link-obsidian [--vault <path> --dest <folder> --link <note> --create]\n  agentos prompt [claude|codex|opencode|hermes]\n\nCore rule:\n  One AgentOS per product/workspace.\n  Many repos inside it.\n  Each task declares which repo(s) are in scope.`);
}

main();
