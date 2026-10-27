import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { initAgentOS, doctorAgentOS, adaptersAgentOS } from '../dist/core.js';

// Slice 3: adopting custom-content adapters.
//
// The recorded real-world failure: a root AGENTS.md holding custom project
// knowledge with a stale AgentOS bootloader section *interleaved* in it. The
// classifier refused it as an ownership conflict, so `doctor --fix` could not
// migrate it and a human had to strip and re-add content by hand.
//
// Such a file is classified `adopt` and reported precisely. Adoption itself
// (`--adopt-custom-adapters`) was removed in 3.0.0: `doctor --fix` refuses the
// file with zero writes and names the 2.x command that still adopts it.

// Byte-exact historical root adapter body (the short pre-marker shape:
// heading, bootloader line, workspace/repos summary, "Read first" line).
const LEGACY_AGENTS_BODY = [
  '# AGENTS.md',
  '',
  'AgentOS for Projects bootloader.',
  '',
  'Workspace: single-repo',
  'Repos: demo=. (app/unknown/unknown)',
  '',
  'Read first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`.',
].join('\n');

const CUSTOM_BEFORE = [
  '# Product rules',
  '',
  '- Keep the guest flow download-free.',
  '- Operator edits stay event-scoped.',
  '',
].join('\n');

const CUSTOM_AFTER = [
  '',
  'Do not rename the print queue folder. Ask before touching print code.',
  '',
].join('\n');

function interleaved(nl = '\n') {
  const body = LEGACY_AGENTS_BODY.split('\n').join(nl);
  const before = CUSTOM_BEFORE.split('\n').join(nl);
  const after = CUSTOM_AFTER.split('\n').join(nl);
  return `${before}${body}${nl}${after}`;
}

async function workspace(t, agents = 'minimal') {
  const root = await mkdtemp(join(tmpdir(), 'agentos-adopt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents });
  return root;
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

test('an interleaved custom adapter is classified for adoption, not as an ownership conflict', async t => {
  const root = await workspace(t);
  const original = interleaved();
  await writeFile(join(root, 'AGENTS.md'), original);

  const result = await doctorAgentOS({ cwd: root, json: true });
  const entry = result.migration.adapters.find((adapter) => adapter.label === 'AGENTS.md');

  assert.equal(entry.classification, 'adopt', `expected adopt, got ${entry.classification}`);
  assert.equal(entry.requiresOptIn, true);
  assert.equal(entry.safe, false, 'a consumer must not treat an adopt entry as safe to apply by default');
  assert.ok(result.problems.some((problem) => /adopt-custom-adapters/.test(problem)), 'doctor must name the opt-in flag');
  assert.ok(result.problems.some((problem) => /AGENTS\.md/.test(problem)), 'doctor must name the file');
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), original, 'reporting must not write');
  assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), false);
});

test('doctor --fix refuses to adopt (removed in 3.0.0), names the 2.x command, with zero writes', async t => {
  const root = await workspace(t);
  const original = interleaved();
  await writeFile(join(root, 'AGENTS.md'), original);

  const result = await doctorAgentOS({ cwd: root, fix: true, json: true });

  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /npx agentos-for-projects@2 doctor --fix --adopt-custom-adapters/.test(problem)), 'the refusal must name the 2.x command');
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), original, 'a refused run must change nothing');
  assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), false, 'no backup may be written by a refused run');
});

test('doctor --fix --dry-run previews the adoption plan without writing', async t => {
  const root = await workspace(t);
  const original = interleaved();
  await writeFile(join(root, 'AGENTS.md'), original);

  const preview = await doctorAgentOS({ cwd: root, fix: true, dryRun: true });

  assert.match(preview.text, /DRY RUN/i);
  assert.match(preview.text, /AGENTS\.md/);
  assert.match(preview.text, /adopt/i);
  assert.match(preview.text, /bytes \d+-\d+/, 'the preview must show the legacy byte span');
  assert.match(preview.text, /refuses them: adoption was removed in 3\.0\.0/);
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), original, 'a preview must not write');
  assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), false);
});

test('two legacy sections in one file stay ambiguous and are never adopted', async t => {
  const root = await workspace(t);
  const original = `${CUSTOM_BEFORE}${LEGACY_AGENTS_BODY}\n\nsome notes\n\n${LEGACY_AGENTS_BODY}\n${CUSTOM_AFTER}`;
  await writeFile(join(root, 'AGENTS.md'), original);

  const result = await doctorAgentOS({ cwd: root, json: true });
  const entry = result.migration.adapters.find((adapter) => adapter.label === 'AGENTS.md');
  assert.equal(entry.classification, 'conflict', 'two candidate sections cannot be told apart');

  const fixed = await doctorAgentOS({ cwd: root, fix: true, json: true });
  assert.equal(fixed.ok, false);
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), original, 'the file must be untouched');
});

test('a legacy section shown inside a fenced code block is not adopted', async t => {
  const root = await workspace(t);
  const original = `${CUSTOM_BEFORE}\`\`\`md\n${LEGACY_AGENTS_BODY}\n\`\`\`\n${CUSTOM_AFTER}`;
  await writeFile(join(root, 'AGENTS.md'), original);

  const result = await doctorAgentOS({ cwd: root, json: true });
  const entry = result.migration.adapters.find((adapter) => adapter.label === 'AGENTS.md');
  assert.equal(entry.classification, 'conflict', 'a documentation example is never an owned section');

  await doctorAgentOS({ cwd: root, fix: true, json: true });
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), original);
});

test('doctor --explain reports the legacy byte span for an adoptable file', async t => {
  const root = await workspace(t);
  await writeFile(join(root, 'AGENTS.md'), interleaved());

  const explained = await adaptersAgentOS({ cwd: root, explain: 'AGENTS.md' });

  assert.equal(explained.ok, true);
  assert.match(explained.text, /Classification: adopt/);
  assert.match(explained.text, /Legacy section: bytes \d+-\d+/);
  assert.match(explained.text, /adopt-custom-adapters/);
});
