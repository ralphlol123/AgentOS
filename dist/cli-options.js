const booleans = new Set(['new', 'existing', 'dry-run', 'yes', 'y', 'detected', 'replace', 'preserve', 'fix', 'json', 'create', 'refresh', 'installed']);
const values = new Set(['agents', 'engine', 'role', 'repo', 'worktree', 'phase', 'reason', 'vault', 'dest', 'link', 'mode', 'name', 'type', 'expected-sha256']);
export function parseFlagsAndPositionals(args) {
    const flags = {}, positionals = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--') {
            positionals.push(...args.slice(i + 1));
            break;
        }
        if (!arg.startsWith('-')) {
            positionals.push(arg);
            continue;
        }
        const token = arg.replace(/^--?/, ''), equals = token.indexOf('=');
        const key = equals < 0 ? token : token.slice(0, equals), explicit = equals < 0 ? undefined : token.slice(equals + 1);
        if (booleans.has(key)) {
            if (explicit !== undefined && !['true', 'false'].includes(explicit))
                throw new Error(`--${key} requires true or false.`);
            flags[key] = explicit === undefined || explicit === 'true';
        }
        else if (values.has(key)) {
            const value = explicit ?? args[++i];
            if (!value || value.startsWith('-'))
                throw new Error(`--${key} requires a value.`);
            flags[key] = value;
        }
        else
            throw new Error(`Unknown option: ${arg}`);
    }
    return { flags, positionals };
}
export function validateCommandFlags(command, flags) {
    const allowed = {
        init: ['new', 'existing', 'agents', 'dry-run', 'yes', 'y', 'refresh'], status: [], handoff: [], prompt: [],
        run: ['engine', 'role', 'repo', 'worktree', 'phase', 'reason', 'dry-run'], doctor: ['fix', 'json'], compact: ['dry-run'],
        'link-obsidian': ['vault', 'dest', 'link', 'create', 'dry-run'], obsidian: ['vault', 'dest', 'create', 'dry-run'],
        skills: ['detected', 'mode', 'dry-run', 'replace', 'installed'], agents: ['name', 'dry-run', 'replace', 'installed'],
        templates: ['type', 'name', 'mode', 'dry-run', 'yes', 'replace', 'expected-sha256'], migrate: ['preserve', 'dry-run'],
    };
    for (const key of Object.keys(flags))
        if (allowed[command] && !allowed[command].includes(key))
            throw new Error(`--${key} is not supported by ${command}.`);
    if (flags.new && flags.existing)
        throw new Error('Choose either --new or --existing.');
    if (flags.mode && !['summary', 'full'].includes(String(flags.mode)))
        throw new Error('--mode must be summary or full.');
}
//# sourceMappingURL=cli-options.js.map