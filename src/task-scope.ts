/** Task scope contract: what a task may READ versus EDIT, kept apart from the repo inventory.
 *
 * `repos:` in project.yaml lists what exists in the workspace; it grants nothing. The optional
 * `task_scope:` mapping declares permission for the current task:
 *
 *   task_scope:
 *     read: [api/contracts/openapi.yaml]   # repo IDs or workspace-relative paths
 *     edit: [web]                          # edit implies read
 *
 * so a frontend task can read a backend contract without gaining backend edit scope.
 */

export interface TaskScope {
  /** Repo inventory as `id=path`; information only, not permission. */
  repos: string[];
  read: string[];
  edit: string[];
}

export function assertRelativeBoundaryPath(value: string) {
  // Validate the original token, before normalizing away absolute/traversal syntax.
  if (!value || value.includes('\0') || value.includes('\\') || value.startsWith('/') || /^[a-z]:/i.test(value) || value.split('/').includes('..')) {
    throw new Error(`Unsafe boundary path; expected a workspace-relative path: ${value}`);
  }
}

const KEYS = ['read', 'edit'];

function entries(raw: any, key: string): string[] {
  const value = raw[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`task_scope.${key} must be a list`);
  return value.map((entry) => {
    if (typeof entry !== 'string' || !entry.trim()) throw new Error(`task_scope.${key} entries must be non-empty strings`);
    const path = entry.trim().replace(/^\.\/(?=.)/, '').replace(/\/+$/, '');
    try { assertRelativeBoundaryPath(path); } catch { throw new Error(`task_scope.${key} entry "${entry}" must be a repo ID or a workspace-relative path`); }
    return path;
  });
}

/** Returns null when `task_scope` is absent; throws a precise message when it is malformed. */
export function validateTaskScope(raw: unknown, repos: { name: string, path: string }[]): TaskScope | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('task_scope must be a mapping with optional read/edit lists');
  const unknown = Object.keys(raw).find((key) => !KEYS.includes(key));
  if (unknown) throw new Error(`task_scope has unknown key "${unknown}"; expected read and/or edit`);
  const edit = entries(raw, 'edit');
  const read = [...new Set([...edit, ...entries(raw, 'read')])];
  return { repos: repos.map((repo) => `${repo.name}=${repo.path}`), read, edit };
}
