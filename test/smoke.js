import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'agentos-smoke-'));
await mkdir(join(root, 'photobooth-fe'), { recursive: true });
await mkdir(join(root, 'photobooth-be'), { recursive: true });
await writeFile(join(root, 'photobooth-fe/package.json'), JSON.stringify({ dependencies: { nuxt: '^4.0.0', vue: '^3.0.0' }, scripts: { dev: 'nuxt dev', build: 'nuxt build', test: 'bun test test/' } }, null, 2));
await writeFile(join(root, 'photobooth-fe/bun.lock'), '');
await writeFile(join(root, 'photobooth-be/package.json'), JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0' }, scripts: { dev: 'nest start --watch', build: 'nest build', test: 'jest' } }, null, 2));
await writeFile(join(root, 'photobooth-be/pnpm-lock.yaml'), '');

function run(args, cwd = root) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`agentos ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

console.log('SMOKE_ROOT=' + root);
console.log('\n--- dry-run ---');
console.log(run(['init', '--existing', '--dry-run']));
console.log('\n--- init ---');
console.log(run(['init', '--existing']));
console.log('\n--- status from root ---');
console.log(run(['status']));
console.log('\n--- doctor from root ---');
console.log(run(['doctor']));
console.log('\n--- compact dry-run from root ---');
console.log(run(['compact', '--dry-run']));

console.log('\n--- compact rewrite: ambiguous objectives block with candidates ---');
await writeFile(join(root, '.agentos/handoff.md'), ['# Handoff', '', '## Scope', '', '- Workspace kind: multi-repo', '',
  '## Current objective — 2026-09-15 (latest): smoke', '', 'Do the work.', '',
  '## Current objective — 2026-09-01', '', 'Superseded narrative.', '',
  '## Previous objective — 2026-08-01', '', 'Old narrative.', '',
  '## Known failures', '', '- Do not treat flaky CI as passing.', ''].join('\n'));
await writeFile(join(root, '.agentos/tasks.md'), ['# Tasks', '', '## Now', '', '- [ ] Do the work.', '',
  '## Done', '', '- [x] Old item.', ''].join('\n'));
const blockedRewrite = spawnSync(process.execPath, [cli, 'compact', '--rewrite'], { cwd: root, encoding: 'utf8' });
if (blockedRewrite.status !== 1) throw new Error('an ambiguous rewrite must exit 1 without writing');
const objectiveIds = [...new Set(blockedRewrite.stdout.match(/obj-[a-f0-9]{10}/g) ?? [])];
if (objectiveIds.length !== 2) throw new Error(`expected two objective candidates, saw ${objectiveIds.length}`);
console.log(blockedRewrite.stdout);
console.log('\n--- compact rewrite dry-run with an explicit objective ---');
console.log(run(['compact', '--rewrite', '--objective', objectiveIds[0], '--dry-run']));
console.log('\n--- compact rewrite apply ---');
console.log(run(['compact', '--rewrite', '--objective', objectiveIds[0]]));
const liveAfterRewrite = await readFile(join(root, '.agentos/handoff.md'), 'utf8');
if (liveAfterRewrite.includes('Superseded narrative.')) throw new Error('superseded history must leave live context');
if (!liveAfterRewrite.includes('Do not treat flaky CI as passing.')) throw new Error('live warnings must survive the rewrite');
const rewriteBundles = (await readdir(join(root, '.agentos/runs'), { withFileTypes: true })).filter(entry => entry.name.startsWith('compact-rewrite-'));
if (rewriteBundles.length !== 1) throw new Error(`expected one rewrite archive bundle, saw ${rewriteBundles.length}`);
console.log('\n--- compact rewrite repeat is a write-free no-op ---');
console.log(run(['compact', '--rewrite', '--objective', objectiveIds[0]]));
console.log('\n--- run handoff dry-run from root ---');
console.log(run(['run', 'handoff', '--engine', 'claude-code', '--role', 'implementation', '--phase', 'smoke', '--reason', 'manual-pause', '--dry-run']));
console.log('\n--- link-obsidian dry-run from root ---');
await mkdir(join(root, 'obsidian-vault'), { recursive: true });
console.log(run(['link-obsidian', '--vault', join(root, 'obsidian-vault'), '--dest', 'Projects/AgentOS', '--create', '--dry-run']));
console.log('\n--- status from subrepo ---');
console.log(run(['status'], join(root, 'photobooth-fe')));
console.log('\n--- project.yaml excerpt ---');
const yaml = await readFile(join(root, '.agentos/project.yaml'), 'utf8');
console.log(yaml.split('\n').slice(0, 35).join('\n'));
