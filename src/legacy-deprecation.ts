/** Deprecation of the legacy upgrade paths (0.9.0; removal planned for 0.10.0).
 *
 * Nothing here changes behavior. A notice appears only when a legacy path actually triggers, or when a
 * deprecated flag or command is used, so a clean workspace's output is unchanged. The text always names
 * the release that can still do the migration, so removal never strands a workspace: run that version
 * once, then upgrade.
 */
export const REMOVED_IN = '0.10.0';
export const LAST_SUPPORTING = '0.9';
export const RUN_LAST_SUPPORTING = `npx agentos-for-projects@${LAST_SUPPORTING}`;

export type DeprecationArea = 'adapters' | 'retired-cards' | 'repo-ids' | 'migrate-claude';

export interface Deprecation {
  area: DeprecationArea;
  message: string;
  removed_in: string;
  last_supporting: string;
  why: string;
}

const WHAT: Record<DeprecationArea, string> = {
  adapters: 'Recognising and migrating adapter files written before the managed-block format (including `--adopt-custom-adapters`)',
  'retired-cards': 'Detecting, migrating and pruning retired pre-0.4.0 agent and skill cards (including `--prune-retired`)',
  'repo-ids': 'Normalising unsafe repository IDs (`--normalize-repo-ids`)',
  'migrate-claude': '`agentos migrate claude`',
};

export function deprecation(area: DeprecationArea, why: string): Deprecation {
  return {
    area,
    why,
    removed_in: REMOVED_IN,
    last_supporting: LAST_SUPPORTING,
    message: `Deprecated: ${WHAT[area]} will be removed in ${REMOVED_IN}. ${why} To migrate an older workspace first, run \`${RUN_LAST_SUPPORTING} doctor --fix\` once (that release keeps this path), then upgrade.`,
  };
}

export function mergeDeprecations(...lists: Deprecation[][]): Deprecation[] {
  const seen = new Map<DeprecationArea, Deprecation>();
  for (const list of lists) for (const d of list) if (!seen.has(d.area)) seen.set(d.area, d);
  return [...seen.values()].sort((a, b) => a.area.localeCompare(b.area));
}

export function renderDeprecations(list: Deprecation[]): string {
  return list.length ? `\nDeprecations:\n${list.map((d) => `- ${d.message.replace(/^Deprecated: /, '')}`).join('\n')}` : '';
}

/** One notice line for the commands that print a single text block. */
export function noticeLine(area: DeprecationArea, why: string): string {
  return deprecation(area, why).message;
}
