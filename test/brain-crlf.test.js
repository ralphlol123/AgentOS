// A Windows checkout (core.autocrlf=true) turns a record's LF line endings into CRLF. The text is the same, so a
// record verified on LF must still check ok (no false "source changed since verification" in brain check/doctor).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const CLI = resolve('dist/cli.js');
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const cli = (args, cwd, env = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV, ...env } });
const ok = (r) => { assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const git = (cwd, ...args) => ok(spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } }));

test('brain: a record verified with LF endings stays ok in an autocrlf=true clone (CRLF on disk)', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'agentos-crlf-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'ws');
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"demo"}\n');
  await writeFile(join(root, 'docs/0001.md'), '# Decision 0001: Persimmon rounding\n\n- Status: accepted\n\nLedger amounts use persimmon rounding.\n');
  git(root, 'init', '-q', '-b', 'main');
  ok(cli(['init', '--existing', '--yes', '--agents', 'minimal'], root));
  ok(cli(['brain', 'register', 'docs/0001.md', '--kind', 'decision', '--status', 'accepted', '--by', 'owner'], root));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  const clone = join(base, 'clone');
  git(base, '-c', 'core.autocrlf=true', 'clone', '-q', root, clone);
  assert.match(await readFile(join(clone, 'docs/0001.md'), 'utf8'), /\r\n/); // the checkout really is CRLF
  const crlf = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'true' };
  const check = ok(cli(['brain', 'check'], clone, crlf));
  assert.doesNotMatch(check.stdout, /changed brain:/);
  assert.match(check.stdout, /- ok brain:0001/);
  const doctor = ok(cli(['doctor'], clone, crlf)).stdout;
  assert.doesNotMatch(doctor, /source changed since verification/);
  assert.doesNotMatch(doctor, /agent card .* changed since install/); // installed cards are CRLF on disk too
  assert.doesNotMatch(cli(['context', 'generic', '--task', 't', '--about', 'persimmon rounding'], clone, crlf).stdout, /\[source changed since verification\]/);
  const verify = ok(cli(['brain', 'verify', 'brain:0001', '--by', 'owner', '--dry-run'], clone, crlf));
  assert.match(verify.stdout, /\(unchanged\)/);
  const add = ok(cli(['agents', 'add', 'developer', '--dry-run'], clone, crlf)); // an unmodified card is a no-op, not a refusal
  assert.match(add.stdout, /already installed and unmodified/);
});
