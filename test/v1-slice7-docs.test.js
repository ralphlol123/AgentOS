// v1 slice 7: the CLI usage text matches the handler table; relative links in README.md and docs/*.md resolve.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const cli = (args) => spawnSync(process.execPath, [resolve('dist/cli.js'), ...args], { encoding: 'utf8' });

test('every top-level command in the help text has a handler in src/cli.ts and vice versa', async () => {
  const source = await readFile(resolve('src/cli.ts'), 'utf8');
  const handled = new Set([...source.matchAll(/command === '([a-z][a-z-]*)'/g)].map((m) => m[1]));
  for (const alias of ['help', 'version']) handled.delete(alias);
  const help = cli(['help']);
  assert.equal(help.status, 0, help.stderr);
  const usage = new Set([...help.stdout.matchAll(/^ {2}agentos ([a-z][a-z-]*)/gm)].map((m) => m[1]));
  assert.deepEqual([...usage].sort(), [...handled].sort());
});

test('relative links in README.md and docs/*.md resolve', async () => {
  const files = ['README.md', ...(await readdir(resolve('docs'))).filter((name) => name.endsWith('.md')).map((name) => `docs/${name}`)];
  const broken = [];
  for (const file of files) {
    const text = (await readFile(resolve(file), 'utf8')).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, ''); // code is an example, not a link
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(?:[a-z]+:|#)/i.test(target)) continue;
      const path = decodeURIComponent(target.split('#')[0]);
      if (!existsSync(resolve(dirname(resolve(file)), path))) broken.push(`${file}: ${target}`);
    }
  }
  assert.deepEqual(broken, []);
  for (const doc of ['context-builder', 'checkpoints', 'brain', 'agents', 'engines', 'obsidian', 'migration', 'acceptance-matrix', 'improve-later']) {
    assert.ok(existsSync(resolve(`docs/${doc}.md`)), `docs/${doc}.md exists`);
  }
});
