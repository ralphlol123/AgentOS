// v1 closure: `agents sync claude-code` denies everything outside the edit scope (sibling enumeration), not only
// the listed repo/read paths (gap found in Phynceon's host probe, Claude Code 2.1.310, 2026-10-25), and
// `context claude-code --require-synced-config` (closure 3; was --require-enforcement) checks that the synced deny set is current.
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTOS_ENGINE: '' } });
const ok = (r) => assert.equal(r.status, 0, r.stdout + r.stderr);
const fails = (r) => assert.equal(r.status, 1, r.stdout + r.stderr);
const read = (root, rel) => readFile(join(root, rel), 'utf8');

async function snapshot(dir) {
  const result = {};
  async function walk(path, rel = '') {
    for (const name of (await readdir(path)).sort()) {
      const abs = join(path, name), key = join(rel, name), info = await lstat(abs);
      if (info.isSymbolicLink()) result[key] = ['link', await readlink(abs)];
      else if (info.isDirectory()) { result[key] = ['dir', info.mode]; await walk(abs, key); }
      else result[key] = ['file', info.mode, (await readFile(abs)).toString('base64')];
    }
  }
  await walk(dir);
  return result;
}

/** The probe fixture: web/src, web/tests, web/package.json, api/contracts, docs/adr, root .env.example, .agentos/, .claude/. */
async function workspace(t, edit = 'web/src') {
  const base = await mkdtemp(join(tmpdir(), 'agentos-v1deny-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  for (const repo of ['web', 'api']) {
    await mkdir(join(root, repo), { recursive: true });
    await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo }));
  }
  for (const dir of ['web/src', 'web/tests', 'api/contracts', 'docs/adr', '.claude', 'node_modules/x', '.git']) await mkdir(join(root, dir), { recursive: true });
  await writeFile(join(root, 'web/src/a.js'), 'a\n');
  await writeFile(join(root, 'web/tests/t.js'), 't\n');
  await writeFile(join(root, 'api/contracts/openapi.yaml'), 'openapi: 3.0.0\n');
  await writeFile(join(root, 'docs/adr/0001.md'), '# 1\n');
  await writeFile(join(root, '.env.example'), 'X=\n');
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), '# Handoff\n\n## Current objective\n\nShip the greeting feature.\n');
  await writeFile(join(root, '.agentos/project.yaml'), `${await read(root, '.agentos/project.yaml')}task_scope:\n  read: [web, api/contracts/openapi.yaml, docs/adr]\n  edit: [${edit}]\n`);
  ok(cli(['agents', 'add', 'developer'], root));
  return root;
}

const rules = (path, tools = ['Edit']) => tools.map((tool) => `${tool}(/${path})`);
const EXPECTED_DENY = [
  ...rules('.agentos/agents/**'),
  ...rules('.agentos/project.yaml'),
  ...rules('.claude/**'),
  ...rules('.claude/settings.json'),
  ...rules('.claude/settings.local.json'),
  ...rules('.env.example'),
  ...rules('.hermes.md'),
  ...rules('AGENTS.md'),
  ...rules('CLAUDE.md'),
  ...rules('api/**'),
  ...rules('api/contracts/openapi.yaml'),
  ...rules('docs/**'),
  ...rules('docs/adr/**'),
  ...rules('web/.gitignore'),
  ...rules('web/AGENTS.md'),
  ...rules('web/CLAUDE.md'),
  ...rules('web/package.json'),
  ...rules('web/tests/**'),
];

test('sibling enumeration: sync claude-code denies every entry outside the edit scope at each ancestor level, exact sorted list', async (t) => {
  const root = await workspace(t);
  const before = await snapshot(root);
  const dry = cli(['agents', 'sync', 'claude-code', '--dry-run'], root);
  ok(dry);
  assert.deepEqual(await snapshot(root), before, 'dry run writes nothing');
  assert.match(dry.stdout, /re-run `agentos agents sync claude-code` after adding top-level directories/);
  assert.match(dry.stdout, /advisory: shell writes/);
  assert.match(dry.stdout, /until the workspace is trusted/);

  ok(cli(['agents', 'sync', 'claude-code'], root));
  const { permissions } = JSON.parse(await read(root, '.claude/settings.local.json'));
  assert.deepEqual(permissions.allow, ['Edit(/web/src/**)']);
  assert.deepEqual(permissions.deny, EXPECTED_DENY);
  for (const rule of permissions.deny) {
    assert.doesNotMatch(rule, /\(\/web\/src|\(\/web\/\*\*|\(\/\*\*\)|\.agentos\/handoff\.md|\.agentos\/\*\*|\.git\/|node_modules/, rule);
  }
  ok(cli(['agents', 'sync', 'claude-code'], root)); // re-sync after its own .claude/agents write is a no-op
});

test('sibling enumeration: read-only role keeps deny-all with no allow', async (t) => {
  const root = await workspace(t);
  ok(cli(['agents', 'add', 'reviewer', '--replace'], root));
  ok(cli(['agents', 'sync', 'claude-code', '--role', 'reviewer'], root));
  assert.deepEqual(JSON.parse(await read(root, '.claude/settings.local.json')), { permissions: { deny: ['Edit(/**)'] } });
});

test('sibling enumeration: an existing different deny list refuses with zero writes', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.claude/settings.local.json'), JSON.stringify({ permissions: { deny: ['Edit(/api/**)'] } }));
  const before = await snapshot(root);
  const r = cli(['agents', 'sync', 'claude-code'], root);
  fails(r);
  assert.match(r.stdout, /no sync record owns permissions\.deny/);
  assert.match(r.stdout, /Nothing was written/);
  assert.deepEqual(await snapshot(root), before);
});

test('context claude-code --require-synced-config: MISSING without synced rules, OK when current, STALE after a new top-level dir; codex MISSING until synced, others UNSUPPORTED (closure 3: renamed from --require-enforcement)', async (t) => {
  const root = await workspace(t);
  const strict = (engine = 'claude-code') => cli(['context', engine, '--task', 'greeting', '--require-synced-config'], root);
  let r = strict();
  fails(r);
  assert.match(r.stdout, /^Synced config: MISSING/m);
  assert.doesNotMatch(r.stdout, /## Objective/);

  ok(cli(['agents', 'sync', 'claude-code'], root));
  r = strict();
  ok(r);
  assert.match(r.stdout, /## Objective/);
  assert.match(r.stdout, /^Synced config: OK \(claude-code, role developer, sha256 [0-9a-f]{8}\)$/m);

  await mkdir(join(root, 'scripts'));
  r = strict();
  fails(r);
  assert.match(r.stdout, /^Synced config: STALE — re-run agentos agents sync claude-code/m);
  assert.doesNotMatch(r.stdout, /## Objective/);

  assert.match(strict('codex').stdout, /^Synced config: MISSING — run agentos agents sync codex$/m); // 1.1: the codex role block is checked
  for (const engine of ['opencode', 'hermes', 'generic']) {
    r = strict(engine);
    fails(r);
    assert.match(r.stdout, /^Synced config: UNSUPPORTED/m);
  }
});


// --- closure 2 (host re-trial T6b/T6c/T8, 2026-10-25) ------------------------------------------------

/** Does a generated rule `Tool(/pattern)` cover the workspace path `rel`? Only exact paths and `<dir>/**` occur. */
const covers = (rule, rel) => {
  const pattern = /^\w+\(\/(.*)\)$/.exec(rule)[1];
  return pattern === '**' || pattern === rel || (pattern.endsWith('/**') && rel.startsWith(pattern.slice(0, -2)));
};

test('closure 2: no (/*) rule is ever generated (Claude Code matches it recursively, T6b) and web/src is never denied', async (t) => {
  for (const edit of ['web/src', 'web', 'web/src/a.js', '.']) {
    const root = await workspace(t, edit);
    ok(cli(['agents', 'sync', 'claude-code'], root));
    const { deny } = JSON.parse(await read(root, '.claude/settings.local.json')).permissions;
    for (const rule of deny) {
      assert.doesNotMatch(rule, /\(\/\*\)/, `${edit}: ${rule}`);
      assert.match(rule, /^(Edit|Write|NotebookEdit)\(\/[^*]*(\/\*\*)?\)$/, `${edit}: only exact paths and <dir>/** (${rule})`);
      for (const rel of ['web/src/a.js', 'web/src/new/deep.js']) if (rel.startsWith(edit === '.' ? '' : edit)) assert.ok(!covers(rule, rel), `${edit}: ${rule} denies ${rel}`);
    }
  }
});

const setTools = async (root, role, tools) => {
  const path = `.agentos/agents/${role}.md`;
  const card = await read(root, path);
  assert.match(card, /^tools_requested: \[\]$/m);
  await writeFile(join(root, path), card.replace(/^tools_requested: \[\]$/m, `tools_requested: [${tools.join(', ')}]`));
};
const front = async (root, role) => /^---\n([\s\S]*?)\n---\n/.exec(await read(root, `.claude/agents/${role}.md`))[1];

test('closure 2: tools_requested renders the Claude subagent tools: frontmatter (AgentOS names mapped, unknown passed through with a warning)', async (t) => {
  const root = await workspace(t);
  await setTools(root, 'developer', ['read', 'Edit', 'write', 'bash', 'grep', 'glob', 'GREP', 'mcp__fs__list']);
  const r = cli(['agents', 'sync', 'claude-code'], root);
  ok(r);
  assert.equal(await front(root, 'developer'), 'name: developer\ndescription: "Implement scoped changes and their tests inside the assigned repo, using the relevant frontend or backend skills."\ntools: Read, Edit, Write, Bash, Grep, Glob, mcp__fs__list');
  assert.match(r.stdout, /^Warning: tools_requested "mcp__fs__list" is not a known AgentOS tool name; passed through verbatim to \.claude\/agents\/developer\.md tools:$/m);
  assert.doesNotMatch(r.stdout, /Warning: tools_requested "(read|Edit|GREP)"/);
});

test('closure 2: no tools: line without tools_requested; read-only roles default to Read, Grep, Glob unless the manifest says otherwise', async (t) => {
  const root = await workspace(t);
  ok(cli(['agents', 'sync', 'claude-code'], root));
  assert.doesNotMatch(await front(root, 'developer'), /^tools:/m, 'edit role without tools_requested: Claude default (all tools)');
  ok(cli(['agents', 'add', 'reviewer', '--replace'], root));
  await rm(join(root, '.claude'), { recursive: true });
  ok(cli(['agents', 'sync', 'claude-code', '--role', 'reviewer'], root));
  assert.match(await front(root, 'reviewer'), /\ntools: Read, Grep, Glob$/);
  await setTools(root, 'reviewer', ['read', 'bash']);
  await rm(join(root, '.claude'), { recursive: true });
  ok(cli(['agents', 'sync', 'claude-code', '--role', 'reviewer'], root));
  assert.match(await front(root, 'reviewer'), /\ntools: Read, Bash$/);
});
