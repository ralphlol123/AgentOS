/** Cooperating writers acquire ownership before planning, including read/modify/write reads. */
export declare function withWorkspaceWriter<T>(root: string, action: () => Promise<T>): Promise<T>;
