import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const packDir = await mkdtemp(join(tmpdir(), 'agentos-pack-'));

function run(command, args, options = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'npm_config_allow_scripts') delete env[key];
  }
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    env,
  });
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(' ')} failed`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

function has(command) {
  return spawnSync(command, ['--version'], { encoding: 'utf8', stdio: 'pipe' }).status === 0;
}

const packOutput = run('npm', ['pack', '--pack-destination', packDir]);
const tarball = join(packDir, packOutput.split(/\r?\n/).at(-1));
const managers = [
  {
    name: 'npm',
    command: 'npm',
    install: ['install', tarball],
    exec: ['exec', 'agentos', '--', 'init', '--new', '--dry-run'],
  },
  {
    name: 'pnpm',
    command: 'pnpm',
    install: ['add', tarball],
    exec: ['exec', 'agentos', 'init', '--new', '--dry-run'],
  },
  {
    name: 'bun',
    command: 'bun',
    install: ['add', tarball],
    exec: ['run', 'agentos', 'init', '--new', '--dry-run'],
  },
];

console.log(`TARBALL=${tarball}`);

for (const manager of managers) {
  if (!has(manager.command)) {
    console.log(`SKIP ${manager.name}: command not found`);
    continue;
  }
  const cwd = await mkdtemp(join(tmpdir(), `agentos-${manager.name}-`));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2));
  run(manager.command, manager.install, { cwd });
  const output = run(manager.command, manager.exec, { cwd });
  if (!/AgentOS dry run/.test(output)) throw new Error(`${manager.name} did not execute agentos dry-run`);
  console.log(`PASS ${manager.name}: installed tarball and executed agentos bin`);
}
