export type FlagValue = string | boolean;
export declare function parseFlagsAndPositionals(args: string[]): {
    flags: Record<string, FlagValue>;
    positionals: string[];
};
export declare function validateCommandFlags(command: string, flags: Record<string, FlagValue>): void;
