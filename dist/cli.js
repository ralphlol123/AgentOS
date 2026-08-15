#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createRequire } from 'node:module';
import { agentsAgentOS, compactAgentOS, doctorAgentOS, handoffAgentOS, initAgentOS, linkObsidianAgentOS, migrateClaudeAgentOS, obsidianAgentOS, promptAgentOS, runHandoffAgentOS, skillsAgentOS, statusAgentOS, templatesAgentOS } from './core.js';
const require = createRequire(import.meta.url);
const VERSION = require('../package.json').version;
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
            const result = await initAgentOS({ cwd: process.cwd(), mode, dryRun: flags['dry-run'], yes: flags.yes || flags.y, agents: flags.agents });
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
            console.log(result.text);
            process.exitCode = result.ok ? 0 : 1;
            return;
        }
        if (command === 'doctor') {
            const result = await doctorAgentOS({ cwd: process.cwd(), fix: flags.fix, json: flags.json });
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
        if (command === 'obsidian') {
            const [sub = 'status', ...rest] = args;
            const { flags: subFlags, positionals } = parseFlagsAndPositionals(rest);
            const result = await obsidianAgentOS({
                cwd: process.cwd(),
                command: sub,
                subcommand: positionals[0],
                note: positionals[1],
                vault: subFlags.vault,
                dest: subFlags.dest,
                create: Boolean(subFlags.create),
                dryRun: subFlags['dry-run'],
            });
            console.log(result.text);
            process.exitCode = result.ok ? 0 : 1;
            return;
        }
        if (command === 'skills') {
            const [sub, ...rest] = args;
            if (sub === 'list') {
                const result = await skillsAgentOS({ cwd: process.cwd(), list: true });
                console.log(result.text);
                process.exitCode = result.ok ? 0 : 1;
                return;
            }
            if (sub !== 'add' && sub !== 'remove') {
                console.log('Usage: agentos skills list | agentos skills add [--detected] [skill-id|category-pack,...] [--mode summary|full] [--dry-run] | agentos skills remove <skill-id> [--dry-run]');
                process.exitCode = sub ? 1 : 0;
                return;
            }
            const { flags: subFlags, positionals } = parseFlagsAndPositionals(rest);
            const result = await skillsAgentOS({
                cwd: process.cwd(),
                detected: sub === 'add' ? Boolean(subFlags.detected) : false,
                add: sub === 'add' && positionals.length ? positionals.join(',') : undefined,
                remove: sub === 'remove' && positionals.length ? positionals.join(',') : undefined,
                mode: subFlags.mode,
                dryRun: subFlags['dry-run'],
            });
            console.log(result.text);
            process.exitCode = result.ok ? 0 : 1;
            return;
        }
        if (command === 'agents') {
            const [sub, ...rest] = args;
            if (sub === 'list') {
                const result = await agentsAgentOS({ cwd: process.cwd(), list: true });
                console.log(result.text);
                process.exitCode = result.ok ? 0 : 1;
                return;
            }
            if (sub !== 'add') {
                console.log('Usage: agentos agents list | agentos agents add <agent-id|template-file> [--name id] [--dry-run]');
                process.exitCode = sub ? 1 : 0;
                return;
            }
            const { flags: subFlags, positionals } = parseFlagsAndPositionals(rest);
            const result = await agentsAgentOS({ cwd: process.cwd(), add: positionals[0], name: subFlags.name, dryRun: subFlags['dry-run'] });
            console.log(result.text);
            process.exitCode = result.ok ? 0 : 1;
            return;
        }
        if (command === 'templates') {
            const [sub, ...rest] = args;
            if (sub === 'list') {
                const result = await templatesAgentOS({ cwd: process.cwd(), command: 'list' });
                console.log(result.text);
                process.exitCode = result.ok ? 0 : 1;
                return;
            }
            if (sub === 'show') {
                const result = await templatesAgentOS({ cwd: process.cwd(), command: 'show', id: rest[0] });
                console.log(result.text);
                process.exitCode = result.ok ? 0 : 1;
                return;
            }
            if (sub === 'copy') {
                const { flags: subFlags, positionals } = parseFlagsAndPositionals(rest);
                const result = await templatesAgentOS({ cwd: process.cwd(), command: 'copy', id: positionals[0], dryRun: subFlags['dry-run'], replace: subFlags.replace });
                console.log(result.text);
                process.exitCode = result.ok ? 0 : 1;
                return;
            }
            if (sub === 'validate') {
                const { flags: subFlags, positionals } = parseFlagsAndPositionals(rest);
                const result = await templatesAgentOS({ cwd: process.cwd(), command: 'validate', source: positionals[0], type: subFlags.type });
                console.log(result.text);
                process.exitCode = result.ok ? 0 : 1;
                return;
            }
            if (sub !== 'import') {
                console.log('Usage: agentos templates list | show <id> | copy <id> [--dry-run] | validate <file> --type agent|skill | import <url-or-file> --type agent|skill --name <id> [--mode summary|full] [--dry-run] [--yes]');
                process.exitCode = sub ? 1 : 0;
                return;
            }
            const { flags: subFlags, positionals } = parseFlagsAndPositionals(rest);
            const result = await templatesAgentOS({ cwd: process.cwd(), command: 'import', source: positionals[0], type: subFlags.type, name: subFlags.name, mode: subFlags.mode, dryRun: subFlags['dry-run'], yes: subFlags.yes, replace: subFlags.replace });
            console.log(result.text);
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
    }
    catch (error) {
        console.error(`agentos ${command} failed: ${error.message}`);
        process.exitCode = 1;
    }
}
function parseFlags(args) {
    return parseFlagsAndPositionals(args).flags;
}
function parseFlagsAndPositionals(args) {
    const flags = {};
    const positionals = [];
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const raw = arg.slice(2);
            if (raw.includes('=')) {
                const [key, ...rest] = raw.split('=');
                flags[key] = rest.join('=');
            }
            else if (args[i + 1] && !args[i + 1].startsWith('-')) {
                flags[raw] = args[i + 1];
                i += 1;
            }
            else {
                flags[raw] = true;
            }
        }
        else if (arg.startsWith('-')) {
            flags[arg.slice(1)] = true;
        }
        else {
            positionals.push(arg);
        }
    }
    return { flags, positionals };
}
async function resolveObsidianOptions(flags) {
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
    }
    finally {
        rl.close();
    }
}
async function askDefault(rl, question, defaultValue) {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = await rl.question(`${question}${suffix}: `);
    return answer.trim() || defaultValue;
}
function printHelp() {
    console.log(`AgentOS for Projects v${VERSION}\n\nUsage:\n  agentos init [--new|--existing] [--agents minimal|detected|frontend,qa,release] [--dry-run]\n  agentos status\n  agentos handoff\n  agentos run handoff [--engine name] [--role role] [--repo repo] [--worktree path] [--phase slug] [--reason reason] [--dry-run]\n  agentos doctor [--fix] [--json]\n  agentos compact [--dry-run]\n  agentos link-obsidian [--vault <path> --dest <folder> --link <note> --create]\n  agentos obsidian link-workspace --vault <path> --dest <folder> [--create] [--dry-run]\n  agentos obsidian status\n  agentos skills list\n  agentos skills add [--detected] [skill-id|category-pack,...] [--mode summary|full] [--dry-run]\n  agentos agents list\n  agentos agents add <agent-id|template-file> [--name id] [--dry-run]\n  agentos templates list\n  agentos templates show <id>\n  agentos templates copy <id> [--dry-run] [--replace]\n  agentos templates validate <file> --type agent|skill\n  agentos templates import <url-or-file> --type agent|skill --name <id> [--mode summary|full] [--dry-run] [--yes] [--replace]\n  agentos migrate claude --preserve [--dry-run]\n  agentos prompt [claude|codex|opencode|hermes]\n\nCore rule:\n  One AgentOS per product/workspace.\n  Many repos inside it.\n  Each task declares which repo(s) are in scope.`);
}
main();
//# sourceMappingURL=cli.js.map