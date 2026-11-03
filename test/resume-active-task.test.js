// Bare `agentos resume` (no --task) must find the real checkpoint task, not a slug of the objective text.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS } from '../dist/core.js';

const CLI = resolve('dist/cli.js');
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
const git = (cwd, ...args) => assert.equal(spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } }).status, 0, `git ${args.join(' ')}`);

// The objective text slugs to something other than the task id, as in the Phase 5 tasktracker project.
const HANDOFF = '# Handoff\n\n## Current objective\n\nTask `task-tracker-cli`: a small TypeScript command-line task tracker.\n\n## Next exact action\n\nAdd the done command.\n';

async function project(t) {
  const base = await mkdtemp(join(tmpdir(), 'agentos-resume-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'app' }));
  git(root, 'init', '-q', '-b', 'main');
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), HANDOFF);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}
const save = (root, task, next) => assert.equal(cli(['checkpoint', '--task', task, '--progress', `${task} progress`, '--next', next], root).status, 0);

test('bare resume with one checkpoint task resumes it, exactly as --task would (not a false "no checkpoint")', async (t) => {
  const root = await project(t);
  save(root, 'task-tracker-cli', 'Add the done command.');
  const bare = cli(['resume'], root);
  const explicit = cli(['resume', '--task', 'task-tracker-cli'], root);
  assert.doesNotMatch(bare.stdout, /no checkpoint/); // 65b06c6: "clean start — no checkpoint for task task-task-tracker-cli-…"
  assert.match(bare.stdout, /^AgentOS resume: task-tracker-cli\n/);
  assert.equal(bare.status, explicit.status);
  assert.equal(bare.stdout, explicit.stdout);
});
