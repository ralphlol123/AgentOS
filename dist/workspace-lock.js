import { open, readFile, lstat, unlink, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
const held = new AsyncLocalStorage();
/** Cooperating writers acquire ownership before planning, including read/modify/write reads. */
export async function withWorkspaceWriter(root, action) {
    const canonical = await realpath(root);
    if (held.getStore()?.has(canonical))
        return action();
    const path = join(canonical, '.agentos-write.lock');
    let handle;
    try {
        handle = await open(path, 'wx', 0o600);
    }
    catch (error) {
        if (error.code !== 'EEXIST')
            throw error;
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 4096)
            throw new Error(`Unsafe writer lock: ${path}; inspect manually.`);
        let owner = {};
        try {
            owner = JSON.parse(await readFile(path, 'utf8'));
        }
        catch { /* incomplete locks are not stolen */ }
        let state = 'owner unknown';
        if (owner.host === hostname() && Number.isInteger(owner.pid) && owner.pid > 0) {
            try {
                process.kill(owner.pid, 0);
                state = `process ${owner.pid} is still running`;
            }
            catch (error) {
                state = error.code === 'ESRCH' ? `process ${owner.pid} is no longer running` : `process ${owner.pid} could not be inspected`;
            }
        }
        throw new Error(`Workspace writer lock exists (${state}): ${path}. Wait for the current command. After a crash, verify no AgentOS writer is active, inspect affected files with doctor/Git, then remove only this lock file and retry. Locks are never stolen automatically.`);
    }
    const identity = await handle.stat();
    try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), started: new Date().toISOString() }) + '\n');
        await handle.sync();
        return await held.run(new Set([...(held.getStore() ?? []), canonical]), action);
    }
    finally {
        await handle.close();
        const current = await lstat(path).catch(error => { if (error.code === 'ENOENT')
            return null; throw error; });
        if (current && current.dev === identity.dev && current.ino === identity.ino)
            await unlink(path);
    }
}
//# sourceMappingURL=workspace-lock.js.map