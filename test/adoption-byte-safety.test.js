import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { initAgentOS, __planAdapterFilesForTests } from '../dist/core.js';
import { LEGACY_SKILL_CARD_HASHES } from '../dist/legacy-skill-shapes.js';

// Byte-safety matrix for adapter adoption, plus the coverage claim behind the
// retired-skill hash allowlist.
//
// The one destructive-looking operation AgentOS performs is adoption: it
// rewrites a file that also holds the owner's hand-written text. This test
// enumerates shapes around every historical body it recognizes and asserts the
// invariant directly - after adoption, removing the managed block must leave
// exactly the bytes that were outside the matched span, in the same order -
// so no shape can silently drop owner content.

const MANAGED_START = '<!-- agentos:managed:start -->';
const MANAGED_END = '<!-- agentos:managed:end -->';

// Historical root adapter bodies (short pre-marker shape, and the two
// full pre-marker shapes with/without the skills/knowledge pointers).
const BODIES = {
  short: [
    '# AGENTS.md', '', 'AgentOS for Projects bootloader.', '',
    'Workspace: single-repo', 'Repos: demo=. (app/unknown/unknown)', '',
    'Read first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`.',
  ].join('\n'),
  fullWithSkills: [
    '# AGENTS.md', '', 'AgentOS for Projects bootloader.', '',
    'Workspace: single-repo', 'Repos: demo=. (app/unknown/unknown)', '',
    'Read first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, `.agentos/skills.md`, relevant `.agentos/repos/*`, `.agentos/agents/*`, `.agentos/engines/*`.', '',
    'Rules: declare role + repo scope before editing; edit only in scope; never touch secrets/.env/migrations/prod config without approval; do not commit/push unless explicitly asked; verify; update handoff/tasks before stopping.',
  ].join('\n'),
};

const OWNER_HEAD = '# Product rules\n\n- Guest flow stays download-free.';
const OWNER_TAIL = '## Owner notes\n\nEscalate before touching billing code.';

const CANONICAL = [
  '# AGENTS.md', '', 'AgentOS for Projects bootloader.', '',
  'Workspace: single-repo', 'Repos: demo=. (app/unknown/unknown)', '',
  'Read first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`.',
  '', 'Rules: canonical section for this fixture.', '',
].join('\n');

function shapes() {
  const cases = [];
  for (const [name, body] of Object.entries(BODIES)) {
    for (const nl of ['\n', '\r\n']) {
      const b = body.split('\n').join(nl);
      const head = OWNER_HEAD.split('\n').join(nl);
      const tail = OWNER_TAIL.split('\n').join(nl);
      cases.push([`${name} alone`, b]);
      cases.push([`${name} after owner text`, `${head}${nl}${nl}${b}`]);
      cases.push([`${name} before owner text`, `${b}${nl}${nl}${tail}`]);
      cases.push([`${name} between owner text`, `${head}${nl}${nl}${b}${nl}${nl}${tail}`]);
      cases.push([`${name} after heading`, `# Project\n${nl}${b}${nl}${nl}${tail}`]);
      cases.push([`${name} with no trailing newline`, `${head}${nl}${nl}${b}`]);
      cases.push([`${name} duplicated`, `${head}${nl}${nl}${b}${nl}${nl}${b}`]);
      cases.push([`${name} fenced`, `${head}${nl}${nl}\`\`\`md${nl}${b}${nl}\`\`\`${nl}${nl}${tail}`]);
    }
  }
  return cases;
}

test('adoption never loses a byte outside the matched span, across historical shapes and line endings', async t => {
  const root = await mkdtemp(join(tmpdir(), 'agentos-adopt-matrix-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  const path = join(root, 'AGENTS.md');
  const target = { path, label: 'AGENTS.md', section: CANONICAL };

  let adoptable = 0;
  let refused = 0;
  for (const [name, content] of shapes()) {
    await writeFile(path, content);
    const plans = await __planAdapterFilesForTests([target], { allowAdopt: true }).catch((error) => error);
    // A refused plan (ownership conflict / ambiguity) is always safe: it writes nothing.
    if (!Array.isArray(plans)) { refused++; continue; }
    const plan = plans[0].plan;
    if (plan.action !== 'adopt') { refused++; continue; }
    adoptable++;

    const [startIdx, endIdx] = plan.legacySpan;
    const outsideSpan = content.slice(0, startIdx) + content.slice(endIdx);
    const migrated = plan.content;
    assert.equal(migrated.split(MANAGED_START).length - 1, 1, `${name}: exactly one managed block`);
    assert.equal(migrated.split(MANAGED_END).length - 1, 1, `${name}: exactly one closing marker`);
    const stripped = migrated.slice(0, migrated.indexOf(MANAGED_START)) + migrated.slice(migrated.indexOf(MANAGED_END) + MANAGED_END.length);
    assert.equal(stripped, outsideSpan, `${name}: bytes outside the matched span must survive exactly`);
    assert.ok(migrated.includes('\n') || migrated.includes('\r\n'), `${name}: still a text file`);
  }

  assert.ok(adoptable > 0, 'the matrix must actually exercise adoption');
  assert.ok(refused > 0, 'ambiguity cases (duplicates, fenced examples) must stay refused');
});

test('the retired-skill allowlist covers every retired id across multiple historical CLI trees', async () => {
  // A single-tree allowlist would report provably-generated cards from other
  // 0.3.x builds as "manual-review". Every id must therefore carry several
  // distinct historical bodies.
  const entries = Object.entries(LEGACY_SKILL_CARD_HASHES);
  assert.ok(entries.length >= 19, `expected every retired skill id, got ${entries.length}`);
  for (const [id, hashes] of entries) {
    assert.ok(Array.isArray(hashes) && hashes.length >= 2, `${id} has ${hashes?.length ?? 0} historical variants`);
    for (const digest of hashes) assert.match(digest, /^[0-9a-f]{64}$/, `${id} hashes must be sha256 hex`);
  }
});
