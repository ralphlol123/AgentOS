// `agentos upgrade`: version lookup, install detection, and the guarded install → verify → doctor --fix flow.
// No network and no real installs: a local HTTP registry stub, and stub bun/npm/pnpm first on PATH that log
// their argv and "install" by writing a stub `agentos` that prints the target version.
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { compareVersions, detectInstall, installCommand, latestVersion } from '../dist/upgrade.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const { version: current } = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
const [maj, min] = current.split('.').map(Number);
const minor = `${maj}.${min + 1}.0`, major = `${maj + 1}.0.0`;
const SPAWN_SKIP = process.platform === 'win32' && 'stub package managers are POSIX sh scripts; detection and registry tests still run on Windows';

test('detectInstall: bun, pnpm, npm, project-local and unknown install shapes', () => {
  const cases = [
    ['/home/app/.bun/install/global/node_modules/agentos-for-projects/dist/cli.js', {}, 'bun'],
    ['/opt/bun/install/global/node_modules/agentos-for-projects/dist/cli.js', { BUN_INSTALL: '/opt/bun' }, 'bun'],
    ['C:\\Users\\r\\.bun\\install\\global\\node_modules\\agentos-for-projects\\dist\\cli.js', {}, 'bun'],
    ['/home/u/.local/share/pnpm/global/5/node_modules/.pnpm/agentos-for-projects@3.0.0/node_modules/agentos-for-projects/dist/cli.js', {}, 'pnpm'],
    ['/srv/pn/5/node_modules/agentos-for-projects/dist/cli.js', { PNPM_HOME: '/srv/pn' }, 'pnpm'],
    ['C:\\Users\\r\\AppData\\Local\\pnpm\\global\\5\\node_modules\\agentos-for-projects\\dist\\cli.js', {}, 'pnpm'],
    ['/usr/lib/node_modules/agentos-for-projects/dist/cli.js', {}, 'npm'],
    ['/home/u/.npm-global/lib/node_modules/agentos-for-projects/dist/cli.js', {}, 'npm'],
    ['C:\\Users\\r\\AppData\\Roaming\\npm\\node_modules\\agentos-for-projects\\dist\\cli.js', {}, 'npm'],
    ['/custom/prefix/lib/node_modules/agentos-for-projects/dist/cli.js', { npm_config_prefix: '/custom/prefix' }, 'npm'],
    ['/work/app/node_modules/agentos-for-projects/dist/cli.js', {}, 'local'],
    ['/work/app/node_modules/.pnpm/agentos-for-projects@3.0.0/node_modules/agentos-for-projects/dist/cli.js', {}, 'local'],
    ['/home/dev/AgentOS/dist/cli.js', {}, 'unknown'],
  ];
  for (const [path, env, method] of cases) assert.equal(detectInstall(path, env).method, method, path);
  assert.equal(detectInstall('/work/app/node_modules/.pnpm/agentos-for-projects@3.0.0/node_modules/agentos-for-projects/dist/cli.js', {}).project, '/work/app');
});

test('installCommand and compareVersions', async (t) => {
  assert.deepEqual(installCommand('bun', '3.1.0'), ['bun', 'add', '-g', 'agentos-for-projects@3.1.0']);
  assert.deepEqual(installCommand('npm', '3.1.0'), ['npm', 'install', '-g', 'agentos-for-projects@3.1.0']);
  assert.deepEqual(installCommand('pnpm', '3.1.0'), ['pnpm', 'add', '-g', 'agentos-for-projects@3.1.0']);
  const project = await mkdtemp(join(tmpdir(), 'agentos-upgrade-proj-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  assert.deepEqual(installCommand('local', '3.1.0', project), ['npm', 'install', 'agentos-for-projects@3.1.0']);
  await writeFile(join(project, 'pnpm-lock.yaml'), '');
  assert.deepEqual(installCommand('local', '3.1.0', project), ['pnpm', 'add', 'agentos-for-projects@3.1.0']);
  assert.equal(compareVersions('3.0.0', '3.0.0'), 0);
  assert.equal(compareVersions('3.0.10', '3.0.9'), 1);
  assert.equal(compareVersions('3.1.0-rc.1', '3.1.0'), -1);
  assert.equal(compareVersions('2.9.9', '10.0.0'), -1);
  assert.throws(() => compareVersions('banana', '1.0.0'), /Not a semver version/);
});

/** A registry stub: `answer` is a version, an HTTP status number, or 'hang'. */
async function registry(t, answer) {
  const hits = [];
  const server = createServer((req, res) => {
    hits.push(req.url);
    if (answer === 'hang') return;
    if (typeof answer === 'number') { res.writeHead(answer); return res.end('nope'); }
    res.setHeader('content-type', 'application/json');
    res.end(answer === 'garbage' ? '{"name":"x"}' : JSON.stringify({ name: 'agentos-for-projects', version: answer }));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { url: `http://127.0.0.1:${server.address().port}`, hits };
}

test('latestVersion: version, timeout, HTTP error and malformed answers', async (t) => {
  assert.equal(await latestVersion((await registry(t, '9.8.7')).url), '9.8.7');
  await assert.rejects(latestVersion((await registry(t, 'hang')).url, 200), /Could not reach the npm registry .*timed out after 0\.2s/);
  await assert.rejects(latestVersion((await registry(t, 500)).url), /answered 500/);
  await assert.rejects(latestVersion((await registry(t, 'garbage')).url), /no valid version/);
});

const PM_STUB = `#!/bin/sh
echo "$(basename "$0") $*" >> "$STUB_LOG"
if [ -n "$STUB_FAIL" ]; then echo "stub install failed" >&2; exit 3; fi
for a in "$@"; do case "$a" in agentos-for-projects@*) v="\${a#agentos-for-projects@}";; esac; done
if [ -n "$STUB_REPORT" ]; then v="$STUB_REPORT"; fi
cat > "$(dirname "$0")/agentos" <<EOF
#!/bin/sh
if [ "\\$1" = "--version" ]; then echo $v; exit 0; fi
echo "agentos \\$* in \\$(pwd)" >> "$STUB_LOG"
echo "stub doctor: ok"
EOF
chmod +x "$(dirname "$0")/agentos"
echo "stub installed agentos-for-projects@$v"
`;

/** A sandbox: HOME, a copy of this build installed in `shape`, stub managers on PATH, an optional workspace. */
async function sandbox(t, shape) {
  const home = await mkdtemp(join(tmpdir(), 'agentos-upgrade-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const modules = join(home, {
    bun: '.bun/install/global/node_modules',
    npm: 'prefix/lib/node_modules',
    pnpm: '.local/share/pnpm/global/5/node_modules',
    local: 'project/node_modules',
    unknown: 'checkout/x/node_modules',
  }[shape]);
  const pkg = shape === 'unknown' ? join(home, 'checkout/agentos') : join(modules, 'agentos-for-projects');
  await cp(join(repo, 'dist'), join(pkg, 'dist'), { recursive: true });
  await cp(join(repo, 'templates'), join(pkg, 'templates'), { recursive: true }); // the catalog loads at import
  await cp(join(repo, 'package.json'), join(pkg, 'package.json'));
  await cp(join(repo, 'node_modules/yaml'), join(shape === 'unknown' ? join(pkg, 'node_modules') : modules, 'yaml'), { recursive: true });
  if (shape === 'local') await writeFile(join(home, 'project/bun.lock'), '');
  const bin = join(home, 'stub-bin');
  await mkdir(bin);
  for (const name of ['bun', 'npm', 'pnpm']) { await writeFile(join(bin, name), PM_STUB); await chmod(join(bin, name), 0o755); }
  const workspace = join(home, 'ws');
  await mkdir(join(workspace, '.agentos'), { recursive: true });
  await mkdir(join(workspace, 'sub'));
  const log = join(home, 'stub.log');
  const env = { HOME: home, USERPROFILE: home, PATH: [bin, '/usr/bin', '/bin', dirname(process.execPath)].join(delimiter), STUB_LOG: log, npm_config_prefix: join(home, 'prefix') };
  const run = (args, { cwd = home, extra = {} } = {}) => new Promise((done) => {
    execFile(process.execPath, [join(pkg, 'dist/cli.js'), 'upgrade', ...args], { cwd, env: { ...env, ...extra } }, (error, stdout, stderr) => done({ code: error ? error.code : 0, stdout, stderr }));
  });
  const calls = async () => (await readFile(log, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean);
  return { home, run, calls, workspace };
}

test('--check: exit 0 when up to date, 10 when an update exists; reads only', { skip: SPAWN_SKIP }, async (t) => {
  const box = await sandbox(t, 'bun');
  const same = await box.run(['--check'], { extra: { AGENTOS_REGISTRY_URL: (await registry(t, current)).url } });
  assert.equal(same.code, 0, same.stderr);
  assert.match(same.stdout, new RegExp(`AgentOS ${current.replace(/\./g, '\\.')} is the latest\\.`));
  assert.match(same.stdout, /agentos doctor --fix/);
  const reg = await registry(t, minor);
  const newer = await box.run(['--check', '--json'], { extra: { AGENTOS_REGISTRY_URL: reg.url } });
  assert.equal(newer.code, 10, newer.stderr);
  const plan = JSON.parse(newer.stdout);
  assert.equal(plan.status, 'update-available');
  assert.equal(plan.method, 'bun');
  assert.equal(plan.target, minor);
  assert.equal(plan.upgradeCommand, `bun add -g agentos-for-projects@${minor}`);
  assert.deepEqual(reg.hits, ['/agentos-for-projects/latest']);
  assert.deepEqual(await box.calls(), [], '--check runs no installer');
});

test('--dry-run plans both commands and runs nothing; non-TTY without --yes refuses', { skip: SPAWN_SKIP }, async (t) => {
  const box = await sandbox(t, 'bun');
  const extra = { AGENTOS_REGISTRY_URL: (await registry(t, minor)).url };
  const dry = await box.run(['--dry-run'], { cwd: join(box.workspace, 'sub'), extra });
  assert.equal(dry.code, 0, dry.stderr);
  assert.match(dry.stdout, /Install: bun global/);
  assert.match(dry.stdout, new RegExp(`Upgrade: bun add -g agentos-for-projects@${minor}`));
  assert.match(dry.stdout, /Refresh: agentos doctor --fix \(workspace .*ws\)/);
  assert.match(dry.stdout, /Dry run: nothing installed/);
  const refused = await box.run([], { extra });
  assert.equal(refused.code, 1);
  assert.match(refused.stdout, /re-run with --yes/);
  assert.deepEqual(await box.calls(), []);
});

test('--yes in a workspace: installs with bun, verifies the new version, runs the NEW binary\'s doctor --fix', { skip: SPAWN_SKIP }, async (t) => {
  const box = await sandbox(t, 'bun');
  const r = await box.run(['--yes'], { cwd: join(box.workspace, 'sub'), extra: { AGENTOS_REGISTRY_URL: (await registry(t, minor)).url } });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /stub installed/);
  assert.match(r.stdout, /stub doctor: ok/);
  assert.match(r.stdout, new RegExp(`refreshed with AgentOS ${minor}`));
  const calls = await box.calls();
  assert.equal(calls.length, 2, calls.join('\n'));
  assert.equal(calls[0], `bun add -g agentos-for-projects@${minor}`);
  assert.match(calls[1], /^agentos doctor --fix in .*ws\/sub$/);
});

test('npm and pnpm installs run their own command; outside a workspace prints the doctor hint', { skip: SPAWN_SKIP }, async (t) => {
  for (const [shape, command] of [['npm', 'npm install -g'], ['pnpm', 'pnpm add -g']]) {
    const box = await sandbox(t, shape);
    const r = await box.run(['--yes', '--json'], { extra: { AGENTOS_REGISTRY_URL: (await registry(t, minor)).url } });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const result = JSON.parse(r.stdout);
    assert.equal(result.method, shape);
    assert.equal(result.status, 'upgraded');
    assert.equal(result.installed, minor);
    assert.match(result.message, /Run `agentos doctor --fix` in each workspace/);
    assert.match(r.stderr, /stub installed/, '--json keeps installer output off stdout');
    assert.deepEqual(await box.calls(), [`${command} agentos-for-projects@${minor}`]);
  }
});

test('major bump needs --yes and names the migration notes; --to pins without asking the registry', { skip: SPAWN_SKIP }, async (t) => {
  const box = await sandbox(t, 'bun');
  const dead = { AGENTOS_REGISTRY_URL: 'http://127.0.0.1:9' };
  const ask = await box.run(['--to', major], { extra: dead });
  assert.equal(ask.code, 1);
  assert.match(ask.stdout, /Major: .* has breaking changes; read CHANGELOG\.md and docs\/migration-\*\.md/);
  assert.match(ask.stdout, /--yes \(required for a major upgrade\)/);
  assert.deepEqual(await box.calls(), []);
  const go = await box.run(['--to', major, '--yes'], { extra: dead });
  assert.equal(go.code, 0, go.stdout + go.stderr);
  assert.deepEqual(await box.calls(), [`bun add -g agentos-for-projects@${major}`]);
  const bad = await box.run(['--to', 'latest'], { extra: dead });
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /Not a semver version: latest/);
});

test('a registry older than the running version is not a downgrade; an explicit --to downgrade is allowed', { skip: SPAWN_SKIP }, async (t) => {
  const box = await sandbox(t, 'bun');
  const r = await box.run(['--yes'], { extra: { AGENTOS_REGISTRY_URL: (await registry(t, '0.1.0')).url } });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /is newer than the registry's latest 0\.1\.0; nothing to do/);
  assert.deepEqual(await box.calls(), []);
  const down = await box.run(['--to', `${maj}.0.0-rc.0`, '--yes'], { extra: { AGENTOS_REGISTRY_URL: 'http://127.0.0.1:9' } });
  assert.equal(down.code, 0, down.stdout + down.stderr);
  assert.deepEqual(await box.calls(), [`bun add -g agentos-for-projects@${maj}.0.0-rc.0`]);
});

test('installer failure stops before doctor; a version mismatch after install stops before doctor', { skip: SPAWN_SKIP }, async (t) => {
  const box = await sandbox(t, 'bun');
  const extra = { AGENTOS_REGISTRY_URL: (await registry(t, minor)).url };
  const failed = await box.run(['--yes'], { cwd: box.workspace, extra: { ...extra, STUB_FAIL: '1' } });
  assert.equal(failed.code, 1);
  assert.match(failed.stdout, /exited 3; stopped, nothing else done/);
  assert.deepEqual(await box.calls(), [`bun add -g agentos-for-projects@${minor}`]);
  const mismatch = await box.run(['--yes'], { cwd: box.workspace, extra: { ...extra, STUB_REPORT: '1.2.3' } });
  assert.equal(mismatch.code, 1);
  assert.match(mismatch.stdout, /`agentos --version` on PATH reports 1\.2\.3; PATH likely points at another install.*Workspace not refreshed/);
  assert.equal((await box.calls()).filter((line) => line.startsWith('agentos ')).length, 0, 'doctor never ran');
});

test('project-local and unknown installs refuse and print the commands; registry errors exit 1', { skip: SPAWN_SKIP }, async (t) => {
  const extra = { AGENTOS_REGISTRY_URL: (await registry(t, minor)).url };
  const local = await sandbox(t, 'local');
  const l = await local.run(['--yes'], { extra });
  assert.equal(l.code, 1);
  assert.match(l.stdout, new RegExp(`installed inside the project .*project; .* Run there: bun add agentos-for-projects@${minor}`));
  assert.deepEqual(await local.calls(), []);
  const unknown = await sandbox(t, 'unknown');
  const u = await unknown.run(['--yes'], { extra });
  assert.equal(u.code, 1);
  assert.match(u.stdout, /Install: unknown/);
  for (const command of ['bun add -g', 'pnpm add -g', 'npm install -g']) assert.match(u.stdout, new RegExp(`${command} agentos-for-projects@${minor}`));
  assert.deepEqual(await unknown.calls(), []);
  const down = await unknown.run(['--check'], { extra: { AGENTOS_REGISTRY_URL: (await registry(t, 503)).url } });
  assert.equal(down.code, 1);
  assert.match(down.stdout, /agentos upgrade failed: The npm registry answered 503/);
});
