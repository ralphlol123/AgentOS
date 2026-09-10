export interface GitResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    args: string[];
}
export declare function runReadOnlyGit(cwd: string, args: string[]): Promise<GitResult>;
export declare function gitErrorText(result: GitResult): string;
export declare function protectedEvidencePath(path: string, excluded?: string[]): boolean;
export declare function collectRunHandoffGitState(worktree: string, excluded?: string[]): Promise<{
    status: string;
    diffStat: string;
    changedFiles: string[];
    snippets: {
        file: string;
        diff: string;
    }[];
    errors: string[];
    omittedFiles: string[];
}>;
