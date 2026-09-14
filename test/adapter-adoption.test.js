import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { initAgentOS, doctorAgentOS, adaptersAgentOS } from '../dist/core.js';

// Slice 3: adopting custom-content adapters.
//
// The recorded real-world failure: a root AGENTS.md holding custom project
// knowledge with a stale AgentOS bootloader section *interleaved* in it. The
// classifier refused it as an ownership conflict, so `doctor --fix` could not
// migrate it and a human had to strip and re-add content by hand.
//
// These tests pin the new behavior: such a file is classified `adopt` and
// reported precisely; migration happens only under the explicit
// `--adopt-custom-adapters` opt-in; and only the legacy AgentOS byte span is
// replaced - every custom byte before and after it survives, with one
// `.agentos.bak` of the original.

const execFileAsync = promisify(execFile);
const CLI = resolve('dist/cli.js');
const MANAGED_START = '<!-- agentos:managed:start -->';
const MANAGED_END = '<!-- agentos:managed:end -->';

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

function segmentBefore(file, marker) {
  return file.slice(0, file.indexOf(marker));
}

function segmentAfter(file, marker) {
  return file.slice(file.lastIndexOf(marker) + marker.length);
}

test('an interleaved custom adapter is classified for adoption, not as an ownership conflict', async t => {
  const root = await workspace(t);
  const original = interleaved();
  await writeFile(join(root, 'AGENTS.md'), original);

  const result = await doctorAgentOS({ cwd: root, json: true });
  const entry = result.migration.adapters.find((adapter) => adapter.label === 'AGENTS.md');

  assert.equal(entry.classification, 'adopt', `expected adopt, got ${entry.classification}`);
  assert.equal(entry.requiresOptIn, true);
  assert.ok(result.problems.some((problem) => /adopt-custom-adapters/.test(problem)), 'doctor must name the opt-in flag');
  assert.ok(result.problems.some((problem) => /AGENTS\.md/.test(problem)), 'doctor must name the file');
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), original, 'reporting must not write');
  assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), false);
});

test('doctor --fix refuses to adopt unless the opt-in flag is given, with zero writes', async t => {
  const root = await workspace(t);
  const original = interleaved();
  await writeFile(join(root, 'AGENTS.md'), original);

  const result = await doctorAgentOS({ cwd: root, fix: true, json: true });

  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /adopt-custom-adapters/.test(problem)), 'the refusal must name the flag');
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), original, 'a refused run must change nothing');
  assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), false, 'no backup may be written by a refused run');
});

test('doctor --fix --dry-run previews the adoption plan without writing', async t => {
  const root = await workspace(t);
  const original = interleaved();
  await writeFile(join(root, 'AGENTS.md'), original);

  const preview = await doctorAgentOS({ cwd: root, fix: true, dryRun: true });
  const alsoWithFlag = await doctorAgentOS({ cwd: root, fix: true, dryRun: true, adoptCustomAdapters: true });

  assert.match(preview.text, /DRY RUN/i);
  assert.match(preview.text, /AGENTS\.md/);
  assert.match(preview.text, /adopt/i);
  assert.match(alsoWithFlag.text, /bytes \d+-\d+/, 'the preview must show the legacy byte span');
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), original, 'a preview must not write');
  assert.equal(await exists(join(root, 'AGENTS.md.agentos.bak')), false);
});

test('opting in replaces only the legacy section and preserves every custom byte', async t => {
  const root = await workspace(t);
  const original = interleaved();
  await writeFile(join(root, 'AGENTS.md'), original);

  const result = await doctorAgentOS({ cwd: root, fix: true, adoptCustomAdapters: true, json: true });

  assert.equal(result.ok, true, `expected doctor OK, got: ${result.problems.join(' | ')}`);
  const migrated = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.equal(migrated.split(MANAGED_START).length - 1, 1, 'exactly one managed block');
  assert.equal(migrated.split(MANAGED_END).length - 1, 1);
  assert.equal(segmentBefore(migrated, MANAGED_START), CUSTOM_BEFORE, 'custom text before the section is byte-identical');
  assert.equal(segmentAfter(migrated, MANAGED_END), `\n${CUSTOM_AFTER}`, 'custom text after the section is byte-identical');
  assert.doesNotMatch(migrated, /Repos: demo=/, 'the stale legacy body is gone');

  assert.equal(await readFile(join(root, 'AGENTS.md.agentos.bak'), 'utf8'), original, 'the one-time backup holds the pre-migration bytes');

  // Idempotent: nothing further to adopt, no second backup, still OK.
  const again = await doctorAgentOS({ cwd: root, fix: true, adoptCustomAdapters: true, json: true });
  assert.equal(again.ok, true);
  const entry = again.migration.adapters.find((adapter) => adapter.label === 'AGENTS.md');
  assert.equal(entry.classification, 'noop');
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), migrated, 'a second run must not rewrite the file');
});

test('adoption preserves CRLF line endings', async t => {
  const root = await workspace(t);
  const original = interleaved('\r\n');
  await writeFile(join(root, 'AGENTS.md'), original);

  await doctorAgentOS({ cwd: root, fix: true, adoptCustomAdapters: true, json: true });
  const migrated = await readFile(join(root, 'AGENTS.md'), 'utf8');

  assert.ok(migrated.includes(`${MANAGED_START}\r\n`), 'the managed block must use the file\'s CRLF convention');
  assert.equal(segmentBefore(migrated, MANAGED_START), CUSTOM_BEFORE.split('\n').join('\r\n'));
  assert.equal((migrated.match(/(^|[^\r])\n/g) || []).length, 0, 'no bare LF may be introduced into a CRLF file');
});

test('two legacy sections in one file stay ambiguous and are never adopted', async t => {
  const root = await workspace(t);
  const original = `${CUSTOM_BEFORE}${LEGACY_AGENTS_BODY}\n\nsome notes\n\n${LEGACY_AGENTS_BODY}\n${CUSTOM_AFTER}`;
  await writeFile(join(root, 'AGENTS.md'), original);

  const result = await doctorAgentOS({ cwd: root, json: true });
  const entry = result.migration.adapters.find((adapter) => adapter.label === 'AGENTS.md');
  assert.equal(entry.classification, 'conflict', 'two candidate sections cannot be told apart');

  const fixed = await doctorAgentOS({ cwd: root, fix: true, adoptCustomAdapters: true, json: true });
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

  await doctorAgentOS({ cwd: root, fix: true, adoptCustomAdapters: true, json: true });
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), original);
});

test('adapters explain reports the legacy byte span for an adoptable file', async t => {
  const root = await workspace(t);
  await writeFile(join(root, 'AGENTS.md'), interleaved());

  const explained = await adaptersAgentOS({ cwd: root, explain: 'AGENTS.md' });

  assert.equal(explained.ok, true);
  assert.match(explained.text, /Classification: adopt/);
  assert.match(explained.text, /Legacy section: bytes \d+-\d+/);
  assert.match(explained.text, /adopt-custom-adapters/);
});

test('CLI requires --fix alongside --adopt-custom-adapters', async t => {
  const root = await workspace(t);
  await writeFile(join(root, 'AGENTS.md'), interleaved());

  const refused = await execFileAsync('node', [CLI, 'doctor', '--adopt-custom-adapters'], { cwd: root }).catch((error) => error);
  assert.equal(refused.code, 1);
  assert.match(refused.stdout, /--fix/);

  const applied = await execFileAsync('node', [CLI, 'doctor', '--fix', '--adopt-custom-adapters'], { cwd: root });
  assert.match(applied.stdout, /AgentOS doctor: OK/);
  assert.equal((await readFile(join(root, 'AGENTS.md'), 'utf8')).split(MANAGED_START).length - 1, 1);
});
