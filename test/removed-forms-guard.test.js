// Guard: no user-facing output or generated file names a form removed in 3.0.0 as something to run. The forms come
// from src/removed-forms.ts, the same table the CLI refuses them with.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { REMOVED_FORMS } from '../dist/removed-forms.js';

const CLI = resolve('dist/cli.js');
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENTOS_ENGINE: '' } });
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// `agentos <form>` or `` `<form> `` ending at a token boundary; `brain init --location vault` is still a command.
const MENTION = REMOVED_FORMS.map((form) => [form, new RegExp(`(?:agentos |\`)${escape(form)}(?=$|[\\s\`'")\\]])${form === 'brain init' ? '(?! --location vault)' : ''}`, 'm')]);
const stale = (text) => MENTION.filter(([, re]) => re.test(text)).map(([form]) => form);

test('help, every command --help, init dry-run, empty brain list, doctor, status and the generated workspace name no removed form', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'agentos-guard-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  await mkdir(root);
  const outputs = {};
  const capture = (args) => { const r = run(args, root); outputs[args.join(' ')] = r.stdout + r.stderr; return r; };

  const help = capture(['help']);
  const commands = [...new Set([...help.stdout.matchAll(/^ {2}agentos ([a-z]+)/gm)].map((m) => m[1]))];
  assert.ok(commands.length >= 11, commands.join(' '));
  capture(['init', '--existing', '--dry-run']);
  assert.equal(capture(['init', '--existing', '--yes']).status, 0, outputs['init --existing --yes']);
  for (const command of commands) capture([command, '--help']);
  capture(['init', '--existing', '--dry-run']);
  capture(['brain', 'list', '--kind', 'none-such']); // the empty-list hint
  capture(['doctor']);
  capture(['status', '--full']);
  capture(['context', 'claude', '--brief']);
  capture(['agents']);
  capture(['skills']);
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const abs = join(entry.parentPath ?? entry.path, entry.name);
    outputs[relative(root, abs)] = await readFile(abs, 'utf8');
  }

  assert.match(outputs['brain list --kind none-such'], /No Brain records/);
  const found = Object.entries(outputs).flatMap(([where, text]) => stale(text).map((form) => `${where}: ${form}`));
  assert.deepEqual(found, []);
});

test('the guard recognises a removed form and lets the kept vault form through', () => {
  assert.deepEqual(stale('Start with `agentos brain init` or …'), ['brain init']);
  assert.deepEqual(stale('preview with `agentos brain init --dry-run`'), ['brain init']);
  assert.deepEqual(stale('agentos brain init --location vault [--dry-run]'), []);
  assert.deepEqual(stale('see .agentos/handoff.md; run agentos status --full'), []);
  assert.deepEqual(stale('agentos run handoff'), ['run handoff']);
});
