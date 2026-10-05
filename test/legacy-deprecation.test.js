import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { initAgentOS, doctorAgentOS, normalizeRepoIdsAgentOS, migrateClaudeAgentOS } from '../dist/core.js';

// 0.9.0 deprecates the legacy upgrade paths (removal planned for 0.10.0). Nothing is removed and no
// behavior changes: a notice appears only when a legacy path actually triggers, or when a deprecated
// flag/command is used. A clean workspace's output must stay byte-for-byte what it was.

const execFileAsync = promisify(execFile);
const CLI = resolve('dist/cli.js');
const NOTICE = /will be removed in 0\.10\.0/;
const LINE_NOTICE = /^Deprecated: .* will be removed in 0\.10\.0/m;
const LAST = 'npx agentos-for-projects@0.9';

const LEGACY_AGENTS_BODY = [
  '# AGENTS.md', '', 'AgentOS for Projects bootloader.', '', 'Workspace: single-repo', 'Repos: demo=. (app/unknown/unknown)', '',
  'Read first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`.',
].join('\n');
const CUSTOM_BEFORE = '# Product rules\n\n- Keep the guest flow download-free.\n\n';
const CUSTOM_AFTER = '\n\nDo not rename the print queue folder.\n';
const HISTORICAL_SUMMARY_CARD = '---\nname: systematic-debugging\ncategory: core\nmode: summary\nsummary: "use for unclear bugs or inconsistent reproduction."\n---\n\n# Systematic Debugging\n';

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-deprec-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  return root;
}
const cli = (root, ...args) => execFileAsync(process.execPath, [CLI, ...args], { cwd: root }).then(
  (r) => ({ status: 0, ...r }), (e) => ({ status: e.code, stdout: e.stdout, stderr: e.stderr }));
const areas = (result) => (result.migration?.deprecations ?? result.deprecations ?? []).map((d) => d.area).sort();

async function legacyAdapter(root) {
  await writeFile(join(root, 'AGENTS.md'), `${CUSTOM_BEFORE}${LEGACY_AGENTS_BODY}\n${CUSTOM_AFTER}`);
}
async function oldCard(root) {
  const dir = join(root, '.agentos/skills/core/systematic-debugging');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), HISTORICAL_SUMMARY_CARD);
}
async function unsafeRepoId(root) {
  const p = join(root, '.agentos/project.yaml');
  const text = await readFile(p, 'utf8');
  const next = text.replace(/^repos:\n(\s+)([a-z0-9-]+):/m, (_m, i) => `repos:\n${i}frontend_client:`);
  assert.notEqual(next, text, 'fixture must rename the repo key');
  await writeFile(p, next);
}

test('a clean workspace gets no notice anywhere and an empty deprecations list', async (t) => {
  const root = await workspace(t);
  for (const options of [{}, { fix: true }, { fix: true, dryRun: true }]) {
    const result = await doctorAgentOS({ cwd: root, ...options });
    assert.doesNotMatch(result.text, /Deprecated/, JSON.stringify(options));
  }
  const json = await doctorAgentOS({ cwd: root, json: true });
  assert.deepEqual(json.migration.deprecations, []);
});

test('doctor reports a legacy adapter, an old retired card and an unsafe repo ID, each as its own deprecation', async (t) => {
  const root = await workspace(t);
  await legacyAdapter(root);
  await oldCard(root);
  await unsafeRepoId(root);
  const result = await doctorAgentOS({ cwd: root, json: true });
  assert.deepEqual(areas(result), ['adapters', 'repo-ids', 'retired-cards']);
  const human = await doctorAgentOS({ cwd: root });
  assert.equal(human.text.match(/will be removed in 0\.10\.0/g).length, 3);
  assert.doesNotMatch(human.text, /- Deprecated:/, 'the section heading already says it');
  assert.ok(human.text.includes(LAST), 'names the release that can still do the migration');
  for (const d of result.migration.deprecations) {
    assert.equal(d.removed_in, '0.10.0');
    assert.equal(d.last_supporting, '0.9');
    assert.match(d.message, NOTICE);
  }
});

test('a plain doctor on a workspace with only a stale (not legacy) adapter does not warn', async (t) => {
  const root = await workspace(t);
  const text = await readFile(join(root, 'AGENTS.md'), 'utf8');
  await writeFile(join(root, 'AGENTS.md'), text.replace('Rules:', 'Rules (edited):'));
  const result = await doctorAgentOS({ cwd: root, json: true });
  assert.deepEqual(areas(result), []);
});

test('doctor --fix that migrates a legacy adapter says so even though the workspace is clean afterwards', async (t) => {
  const root = await workspace(t);
  await legacyAdapter(root);
  const result = await doctorAgentOS({ cwd: root, fix: true, adoptCustomAdapters: true, json: true });
  assert.deepEqual(areas(result), ['adapters']);
  assert.equal(result.migration.adapters.every((a) => a.classification === 'noop'), true, 'the migration really happened');
  const again = await doctorAgentOS({ cwd: root, fix: true, json: true });
  assert.deepEqual(areas(again), [], 'a second --fix has nothing legacy to do, so no notice');
});

test('doctor --fix --dry-run lists a legacy adapter notice and still writes nothing', async (t) => {
  const root = await workspace(t);
  await legacyAdapter(root);
  const before = await readFile(join(root, 'AGENTS.md'), 'utf8');
  const result = await doctorAgentOS({ cwd: root, fix: true, dryRun: true });
  assert.match(result.text, NOTICE);
  assert.match(result.text, /\n\nDeprecations:\n- /, 'a blank line separates the section from the preview');
  assert.deepEqual(areas(result), ['adapters']);
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), before);
});

test('using a deprecated flag warns even when there is nothing to migrate', async (t) => {
  const root = await workspace(t);
  const adopt = await doctorAgentOS({ cwd: root, fix: true, adoptCustomAdapters: true, json: true });
  assert.deepEqual(areas(adopt), ['adapters']);
  const prune = await doctorAgentOS({ cwd: root, fix: true, pruneRetired: true, json: true });
  assert.deepEqual(areas(prune), ['retired-cards']);
  const dry = await doctorAgentOS({ cwd: root, fix: true, dryRun: true, pruneRetired: true });
  assert.deepEqual(areas(dry), ['retired-cards']);
});

test('--normalize-repo-ids and migrate claude print the notice on every outcome, and still behave as before', async (t) => {
  const root = await workspace(t);
  const nothing = await normalizeRepoIdsAgentOS({ cwd: root });
  assert.equal(nothing.ok, true);
  assert.match(nothing.text, /nothing to do/i);
  assert.match(nothing.text, LINE_NOTICE);
  assert.match(nothing.text, /repository ID/i);
  const migrate = await migrateClaudeAgentOS({ cwd: root, preserve: true, dryRun: true });
  assert.match(migrate.text, LINE_NOTICE);
  assert.match(migrate.text, /migrate claude/);
  const noPreserve = await migrateClaudeAgentOS({ cwd: root });
  assert.equal(noPreserve.ok, false, 'the usage failure is unchanged');
  assert.match(noPreserve.text, NOTICE);
});

test('the CLI prints the notice, keeps its exit codes, and keeps --json parseable', async (t) => {
  const root = await workspace(t);
  await legacyAdapter(root);
  const human = await cli(root, 'doctor', '--fix', '--dry-run');
  assert.equal(human.status, 0, human.stdout + human.stderr);
  assert.match(human.stdout, NOTICE);
  const json = await cli(root, 'doctor', '--json');
  const parsed = JSON.parse(json.stdout);
  assert.deepEqual(parsed.migration.deprecations.map((d) => d.area), ['adapters']);
  const nrm = await cli(root, 'doctor', '--fix', '--normalize-repo-ids');
  assert.equal(nrm.status, 0);
  assert.match(nrm.stdout, NOTICE);
  const mig = await cli(root, 'migrate', 'claude', '--preserve', '--dry-run');
  assert.match(mig.stdout, NOTICE);
});

test('the notice never changes doctor\'s verdict', async (t) => {
  const root = await workspace(t);
  await oldCard(root);
  const result = await doctorAgentOS({ cwd: root, json: true });
  assert.equal(result.ok, true, 'a deprecation is not a problem');
  assert.equal(result.problems.length, 0);
  assert.equal(result.migration.summary.action_required, result.migration.retiredCards.length + result.migration.repoIds.length
    + result.migration.adapters.filter((a) => a.classification !== 'noop').length, 'action_required counts work, not notices');
});

test('help text marks the deprecated flags and command', async (t) => {
  const root = await workspace(t);
  const help = await cli(root, '--help');
  for (const flag of ['--adopt-custom-adapters', '--prune-retired', '--normalize-repo-ids', 'migrate claude']) {
    const line = help.stdout.split('\n').find((l) => l.includes(flag));
    assert.ok(line, `help mentions ${flag}`);
  }
  assert.match(help.stdout, /deprecated, removed in 0\.10\.0/i);
});
