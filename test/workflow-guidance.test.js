import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS, doctorAgentOS } from '../dist/core.js';
import { validateCommandFlags } from '../dist/cli-options.js';

// 1.1 slice 3: the generated `.agentos/guide.md` names the everyday v1 loop (status -> context ->
// checkpoint/resume -> brain propose -> agents sync), and every command/flag it names is one the CLI accepts.

const CLI = resolve('dist/cli.js');
const GUIDE = '.agentos/guide.md';
const START = '<!-- agentos:managed:start -->';
const END = '<!-- agentos:managed:end -->';
const BUDGET_BYTES = 4608; // ~4.5 KB: the guide is loaded on demand

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-guidance-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const repo of ['web', 'api']) {
    await mkdir(join(root, repo));
    await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo, scripts: { test: 'echo t' } }));
  }
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'detected' });
  return root;
}

const help = () => spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' }).stdout;

test('every `agentos <cmd>` and --flag in the guide is accepted by the CLI option allowlist', async (t) => {
  const guide = await readFile(join(await workspace(t), GUIDE), 'utf8');
  const usage = help();
  const commands = [...guide.matchAll(/`(agentos [^`]+)`/g)].map((m) => m[1]);
  assert.ok(commands.length >= 15, `found only ${commands.length} commands`);
  for (const text of commands) {
    const [, cmd, sub] = text.split(/\s+/);
    if (cmd === '--help' || cmd === '--version') continue;
    const lines = usage.split('\n').filter((line) => line.trim().startsWith(`agentos ${cmd}`));
    assert.ok(lines.length, `\`${text}\`: unknown command ${cmd}`);
    if (sub && /^[a-z][a-z-]*$/.test(sub)) assert.ok(lines.some((line) => line.includes(sub)), `\`${text}\`: ${cmd} has no ${sub}`);
    const flags = [...text.matchAll(/--([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
    assert.doesNotThrow(() => validateCommandFlags(cmd, Object.fromEntries(flags.map((f) => [f, true]))), `\`${text}\``);
  }
});

test('the guide names the everyday loop: context, checkpoint/resume, brain, agents sync, task_scope', async (t) => {
  const guide = await readFile(join(await workspace(t), GUIDE), 'utf8');
  for (const [pattern, label] of [
    [/`agentos context <engine> --task [^`]*--role/, 'context with --task and --role'],
    [/task_scope/, 'task_scope'],
    [/`agentos checkpoint --task [^`]*--progress[^`]*--next/, 'checkpoint'],
    [/`agentos resume --task/, 'resume'],
    [/`agentos brain propose /, 'brain propose'],
    [/`agentos brain preview /, 'brain preview'],
    [/`agentos brain apply /, 'brain apply'],
    [/`agentos agents sync <engine> --role/, 'agents sync'],
    [/Synced config: STALE/, 'the doctor STALE warning'],
    [/`agentos run handoff/, 'run handoff and how it differs'],
  ]) assert.match(guide, pattern, `guide must cover: ${label}`);
  // Engines propose; the owner applies. Engines never edit project.yaml themselves.
  assert.match(guide, /owner[^.\n]*task_scope|task_scope[^.\n]*owner/i);
  assert.match(guide, /never[^.\n]*apply|apply[^.\n]*owner/i);
});

test('the guide stays within its byte budget', async (t) => {
  const guide = await readFile(join(await workspace(t), GUIDE));
  assert.ok(guide.length <= BUDGET_BYTES, `guide is ${guide.length} bytes; budget ${BUDGET_BYTES}`);
});

test('doctor reports a 1.0.0 guide as stale; doctor --fix refreshes only the managed block', async (t) => {
  const root = await workspace(t);
  const fresh = await readFile(join(root, GUIDE), 'utf8');
  const old = await readFile(resolve('test/fixtures/guide-1.0.0.md'), 'utf8');
  const before = '# Team notes\n\nKeep this.\n\n', after = '\nAnd this.\n';
  await writeFile(join(root, GUIDE), before + old.trimEnd() + after);

  const report = await doctorAgentOS({ cwd: root });
  assert.ok(report.problems.some((p) => p.includes(GUIDE) && /stale/i.test(p)), JSON.stringify(report.problems));

  await doctorAgentOS({ cwd: root, fix: true });
  const repaired = await readFile(join(root, GUIDE), 'utf8');
  assert.ok(repaired.startsWith(before), 'bytes before the block preserved');
  assert.ok(repaired.endsWith(after), 'bytes after the block preserved');
  const block = (text) => text.slice(text.indexOf(START), text.indexOf(END) + END.length);
  assert.equal(block(repaired), block(fresh), 'managed block is the current generator output');
  assert.equal(repaired.length, before.length + block(fresh).length + after.length, 'nothing else added');
  assert.deepEqual((await doctorAgentOS({ cwd: root })).problems, []);
});
