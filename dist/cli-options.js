const booleans = new Set(['new', 'existing', 'dry-run', 'yes', 'y', 'detected', 'replace', 'preserve', 'fix', 'json', 'create', 'refresh', 'installed', 'normalize-repo-ids', 'adopt-custom-adapters', 'prune-retired', 'rewrite', 'checkpoint', 'diff']);
const values = new Set(['agents', 'engine', 'role', 'repo', 'worktree', 'phase', 'reason', 'vault', 'dest', 'link', 'mode', 'name', 'type', 'expected-sha256', 'objective', 'expect-state']);
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
        run: ['engine', 'role', 'repo', 'worktree', 'phase', 'reason', 'dry-run'], doctor: ['fix', 'json', 'normalize-repo-ids', 'adopt-custom-adapters', 'prune-retired', 'dry-run'], compact: ['dry-run', 'rewrite', 'checkpoint', 'objective', 'expect-state', 'diff'],
        'link-obsidian': ['vault', 'dest', 'link', 'create', 'dry-run'], obsidian: ['vault', 'dest', 'create', 'dry-run'], adapters: [],
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
    if (command === 'compact')
        resolveCompactMode(flags);
    if (flags['expect-state'] && !/^[a-f0-9]{64}$/.test(String(flags['expect-state']))) {
        throw new Error('--expect-state requires the sha256 source state printed by compact --dry-run.');
    }
}
/** Resolve compact's public mode using only explicitly-active boolean flags. */
export function resolveCompactMode(options) {
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
        if (conflicts.length)
            throw new Error(`Cannot combine --checkpoint with ${conflicts.join(', ')}.`);
        return 'checkpoint';
    }
    if (options.diff === true && dryRun !== true)
        throw new Error('--diff requires --dry-run.');
    return 'structural';
}
//# sourceMappingURL=cli-options.js.map