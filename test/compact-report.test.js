import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { renderUnifiedDiff } from '../dist/compact-report.js';

const NO_DIFFERENCES = 'No differences: proposed live files are unchanged.';
const render = (before, after, path = 'state.md') => renderUnifiedDiff([{ path, before, after }]);

function git(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

test('returned non-empty patch applies unchanged and reproduces exact bytes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'agentos-unified-diff-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'state.md'), '');
  const patch = render('', 'alpha\n');
  await writeFile(join(root, 'change.diff'), patch);

  const check = git(root, ['apply', '--check', 'change.diff']);
  assert.equal(check.status, 0, check.stderr || check.stdout);
  const apply = git(root, ['apply', 'change.diff']);
  assert.equal(apply.status, 0, apply.stderr || apply.stdout);
  assert.equal(await readFile(join(root, 'state.md'), 'utf8'), 'alpha\n');
});

test('returned patches apply unchanged across line-ending and EOF transitions', async (t) => {
  const cases = [
    { name: 'remove all content', before: 'alpha\n', after: '' },
    { name: 'add final LF', before: 'alpha', after: 'alpha\n' },
    { name: 'remove final LF', before: 'alpha\n', after: 'alpha' },
    { name: 'CRLF to LF', before: 'alpha\r\n', after: 'alpha\n' },
    { name: 'LF to CRLF', before: 'alpha\n', after: 'alpha\r\n' },
  ];

  for (const entry of cases) {
    const root = await mkdtemp(join(tmpdir(), 'agentos-unified-diff-edge-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await writeFile(join(root, 'state.md'), entry.before);
    await writeFile(join(root, 'change.diff'), render(entry.before, entry.after));
    const check = git(root, ['apply', '--check', 'change.diff']);
    assert.equal(check.status, 0, `${entry.name}: ${check.stderr || check.stdout}`);
    const apply = git(root, ['apply', 'change.diff']);
    assert.equal(apply.status, 0, `${entry.name}: ${apply.stderr || apply.stdout}`);
    assert.equal(await readFile(join(root, 'state.md'), 'utf8'), entry.after, entry.name);
  }
});

test('large high-distance replacement stays within a bounded heap and applies exactly', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'agentos-unified-diff-large-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const before = ['# Stable heading', ...Array.from({ length: 501 }, (_, index) => `old-${index}`), '# Stable footer', ''].join('\n');
  const after = ['# Stable heading', ...Array.from({ length: 501 }, (_, index) => `new-${index}`), '# Stable footer', ''].join('\n');
  await writeFile(join(root, 'state.md'), before);

  const moduleUrl = pathToFileURL(resolve('dist/compact-report.js')).href;
  const script = `
    import { renderUnifiedDiff } from ${JSON.stringify(moduleUrl)};
    const before = ['# Stable heading', ...Array.from({ length: 501 }, (_, index) => \`old-\${index}\`), '# Stable footer', ''].join('\\n');
    const after = ['# Stable heading', ...Array.from({ length: 501 }, (_, index) => \`new-\${index}\`), '# Stable footer', ''].join('\\n');
    process.stdout.write(renderUnifiedDiff([{ path: 'state.md', before, after }]));
  `;
  const rendered = spawnSync(process.execPath, ['--max-old-space-size=32', '--input-type=module', '--eval', script], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(rendered.status, 0, rendered.stderr || rendered.stdout);
  assert.match(rendered.stdout, /^ # Stable heading$/m);
  assert.match(rendered.stdout, /^ # Stable footer$/m);
  await writeFile(join(root, 'change.diff'), rendered.stdout);

  const check = git(root, ['apply', '--check', 'change.diff']);
  assert.equal(check.status, 0, check.stderr || check.stdout);
  const apply = git(root, ['apply', 'change.diff']);
  assert.equal(apply.status, 0, apply.stderr || apply.stdout);
  assert.equal(await readFile(join(root, 'state.md'), 'utf8'), after);
});

test('renderer models empty input as zero lines when content is added or removed', () => {
  assert.equal(render('', 'alpha\n'), [
    '--- a/state.md',
    '+++ b/state.md',
    '@@ -0,0 +1 @@',
    '+alpha',
  ].join('\n') + '\n');
  assert.equal(render('alpha\n', ''), [
    '--- a/state.md',
    '+++ b/state.md',
    '@@ -1 +0,0 @@',
    '-alpha',
  ].join('\n') + '\n');
});

test('renderer marks adding and removing a final newline', () => {
  assert.equal(render('alpha', 'alpha\n'), [
    '--- a/state.md',
    '+++ b/state.md',
    '@@ -1 +1 @@',
    '-alpha',
    '\\ No newline at end of file',
    '+alpha',
  ].join('\n') + '\n');
  assert.equal(render('alpha\n', 'alpha'), [
    '--- a/state.md',
    '+++ b/state.md',
    '@@ -1 +1 @@',
    '-alpha',
    '+alpha',
    '\\ No newline at end of file',
  ].join('\n') + '\n');
});

test('renderer preserves CRLF versus LF as a real line-ending-only change', () => {
  assert.equal(render('alpha\r\n', 'alpha\n'), [
    '--- a/state.md',
    '+++ b/state.md',
    '@@ -1 +1 @@',
    '-alpha\r',
    '+alpha',
  ].join('\n') + '\n');
  assert.equal(render('alpha\n', 'alpha\r\n'), [
    '--- a/state.md',
    '+++ b/state.md',
    '@@ -1 +1 @@',
    '-alpha',
    '+alpha\r',
  ].join('\n') + '\n');
});

test('renderer reports no differences only for byte-identical input', () => {
  assert.equal(render('café ☕\r\n', 'café ☕\r\n'), NO_DIFFERENCES);
  assert.notEqual(render('café ☕\r\n', 'café ☕\n'), NO_DIFFERENCES);
  assert.notEqual(render('café ☕\n', 'café ☕'), NO_DIFFERENCES);
});

test('renderer aligns unchanged lines and splits distant edits into context hunks', () => {
  const beforeLines = Array.from({ length: 20 }, (_, index) => `line-${index + 1}`);
  const afterLines = [...beforeLines];
  afterLines[1] = 'line-2 edited';
  afterLines[16] = 'line-17 edited';

  const diff = render(`${beforeLines.join('\n')}\n`, `${afterLines.join('\n')}\n`);

  assert.equal((diff.match(/^@@ /gm) ?? []).length, 2, diff);
  assert.match(diff, /^-line-2$/m);
  assert.match(diff, /^\+line-2 edited$/m);
  assert.match(diff, /^-line-17$/m);
  assert.match(diff, /^\+line-17 edited$/m);
  assert.doesNotMatch(diff, /^[+-]line-10$/m);
  assert.doesNotMatch(diff, /^[+-]line-11$/m);
});
