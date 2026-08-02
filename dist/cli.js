#!/usr/bin/env node
import { compactAgentOS, doctorAgentOS, handoffAgentOS, initAgentOS, promptAgentOS, statusAgentOS } from './core.js';
async function main() {
    const [, , command = 'help', ...args] = process.argv;
    const flags = parseFlags(args);
    try {
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
    const flags = {};
    for (const arg of args) {
        if (arg.startsWith('--'))
            flags[arg.slice(2)] = true;
        else if (arg.startsWith('-'))
            flags[arg.slice(1)] = true;
    }
    return flags;
}
function printHelp() {
    console.log(`AgentOS for Projects v0.1\n\nUsage:\n  agentos init [--new|--existing] [--dry-run]\n  agentos status\n  agentos handoff\n  agentos doctor [--fix]\n  agentos compact [--dry-run]\n  agentos prompt [claude|codex|opencode|hermes]\n\nCore rule:\n  One AgentOS per product/workspace.\n  Many repos inside it.\n  Each task declares which repo(s) are in scope.`);
}
main();
//# sourceMappingURL=cli.js.map