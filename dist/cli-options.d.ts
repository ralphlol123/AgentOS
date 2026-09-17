export type FlagValue = string | boolean;
export declare function parseFlagsAndPositionals(args: string[]): {
    flags: Record<string, FlagValue>;
    positionals: string[];
};
export declare function validateCommandFlags(command: string, flags: Record<string, FlagValue>): void;
export type CompactMode = 'structural' | 'checkpoint';
/** Resolve compact's public mode using only explicitly-active boolean flags. */
export declare function resolveCompactMode(options: Record<string, any>): CompactMode;
