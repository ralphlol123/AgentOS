import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  compactAgentOS,
  initAgentOS,
  __setCompactPreflightHookForTests,
  __clearCompactPreflightHookForTests,
} from '../dist/core.js';

const CLI = resolve('dist/cli.js');

function state(handoff, tasks) {
  return createHash('sha256').update(handoff).update('\0').update(tasks).digest('hex');
}

function documents(size = 260) {
  return {
    handoff: [
      '# Handoff', '',
      '## Current objective', '', 'Ship safe compaction.', '',
      '## Scope', '', '- This workspace.', '',
      '## Next exact action', '', 'Run tests.', '',
      '## Previous objective', '', `${'x'.repeat(size)}.`,
    ].join('\n'),
    tasks: [
      '# Tasks', '',
      '## Now', '', '- [ ] Ship safe compaction.', '',
      '## Done', '', `- [x] ${'d'.repeat(size)}`,
    ].join('\n'),
  };
}

async function fixture(t, content = documents()) {
  const parent = await mkdtemp(join(tmpdir(), 'agentos-compact-default-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'workspace');
  await mkdir(root);
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  await writeFile(join(root, '.agentos/handoff.md'), content.handoff);
  await writeFile(join(root, '.agentos/tasks.md'), content.tasks);
  return { parent, root };
}

async function snapshot(root) {
  const out = {};
  async function walk(path, rel = '.') {
    const info = await lstat(path);
    out[rel] = info.isDirectory()
      ? { type: 'directory', mode: info.mode }
      : { type: info.isSymbolicLink() ? 'symlink' : 'file', mode: info.mode, bytes: (await readFile(path)).toString('hex') };
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await walk(join(path, name), `${rel}/${name}`);
    }
  }
  await walk(root);
  return out;
}

function cli(root, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
}

async function rewriteBundles(root) {
  return (await readdir(join(root, '.agentos/runs')).catch(() => []))
    .filter((name) => name.startsWith('compact-rewrite-'));
}

test('plain compact and --rewrite use the same structural planner; dry runs write nothing', async (t) => {
  const { root } = await fixture(t);
  const before = await snapshot(root);
  const plain = await compactAgentOS({ cwd: root, dryRun: true });
  const alias = await compactAgentOS({ cwd: root, rewrite: true, dryRun: true });

  assert.equal(plain.ok, true, plain.text);
  assert.equal(alias.ok, true, alias.text);
  assert.deepEqual(plain.proposed, alias.proposed);
  assert.equal(plain.stateHash, alias.stateHash);
  assert.match(plain.text, /Mode: structural rewrite/);
  assert.deepEqual(await snapshot(root), before);

  const plainCli = cli(root, ['compact', '--dry-run']);
  const aliasCli = cli(root, ['compact', '--rewrite', '--dry-run']);
  assert.equal(plainCli.status, 0, plainCli.stdout + plainCli.stderr);
  assert.equal(aliasCli.status, 0, aliasCli.stdout + aliasCli.stderr);
  assert.match(plainCli.stdout, /Mode: structural rewrite/);
  assert.equal(plainCli.stdout, aliasCli.stdout);
  assert.deepEqual(await snapshot(root), before);
});

test('plain compact applies a reducing structural plan and archives exact original bytes', async (t) => {
  const { root } = await fixture(t);
  const handoff = await readFile(join(root, '.agentos/handoff.md'));
  const tasks = await readFile(join(root, '.agentos/tasks.md'));
  const result = await compactAgentOS({ cwd: root });

  assert.equal(result.ok, true, result.text);
  assert.equal(result.changed, true);
  assert.ok(result.after < result.before);
  assert.equal((await rewriteBundles(root)).length, 1);
  assert.deepEqual(await readFile(join(result.archivePath, 'handoff.md')), handoff);
  assert.deepEqual(await readFile(join(result.archivePath, 'tasks.md')), tasks);
});

test('objective and expect-state work in normal mode and ordinary apply replans current files', async (t) => {
  const ambiguous = documents(260);
  ambiguous.handoff += `\n\n## Current objective — old\n\nOld objective.\n\n## Previous objective\n\n${'z'.repeat(260)}.\n`;
  const { root } = await fixture(t, ambiguous);
  const blocked = cli(root, ['compact', '--dry-run']);
  const ids = [...new Set(blocked.stdout.match(/obj-[a-f0-9]{10}/g) ?? [])];
  assert.equal(ids.length, 2, blocked.stdout);

  const preview = cli(root, ['compact', '--objective', ids[0], '--dry-run', '--diff']);
  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  const expected = /--expect-state ([a-f0-9]{64})/.exec(preview.stdout)?.[1];
  assert.ok(expected, preview.stdout);

  await writeFile(join(root, '.agentos/tasks.md'), `${await readFile(join(root, '.agentos/tasks.md'), 'utf8')}\n\n## Done\n\n- [x] ${'late'.repeat(100)}\n`);
  const beforeStale = await snapshot(root);
  const stale = cli(root, ['compact', '--objective', ids[0], '--expect-state', expected]);
  assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  assert.match(stale.stdout, /changed after this preview/);
  assert.deepEqual(await snapshot(root), beforeStale);

  const apply = cli(root, ['compact', '--objective', ids[0]]);
  assert.equal(apply.status, 0, apply.stdout + apply.stderr);
  assert.equal((await rewriteBundles(root)).length, 1, 'plain apply must replan and archive the current source');
});

test('checkpoint is the only legacy selector and boolean false stays in normal mode', async (t) => {
  const { root } = await fixture(t);
  const checkpoint = cli(root, ['compact', '--checkpoint']);
  assert.equal(checkpoint.status, 0, checkpoint.stdout + checkpoint.stderr);
  assert.match(checkpoint.stdout, /Mode: archival checkpoint/);
  assert.ok((await readdir(join(root, '.agentos/runs'))).some((name) => /^compact-archive-[a-f0-9]{64}\.md$/.test(name)));

  for (const args of [
    ['compact', '--rewrite=false', '--dry-run'],
    ['compact', '--checkpoint=false', '--dry-run'],
  ]) {
    const result = cli(root, args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Mode: structural rewrite/);
  }

  const allowedFalse = cli(root, ['compact', '--checkpoint', '--rewrite=false', '--dry-run']);
  assert.equal(allowedFalse.status, 0, allowedFalse.stdout + allowedFalse.stderr);
  assert.match(allowedFalse.stdout, /Mode: archival checkpoint/);
});

test('checkpoint conflicts are rejected before every workspace side effect', async (t) => {
  for (const conflicting of [
    ['--rewrite'],
    ['--objective', 'obj-0000000000'],
    ['--expect-state', '0'.repeat(64)],
    ['--diff', '--dry-run'],
  ]) {
    await t.test(conflicting.join(' '), async (t) => {
      const { root } = await fixture(t);
      const before = await snapshot(root);
      const result = cli(root, ['compact', '--checkpoint', ...conflicting]);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /--checkpoint.*conflict|cannot combine --checkpoint/i);
      assert.deepEqual(await snapshot(root), before);
    });
  }
});

test('normal compaction refusals are zero-write for ambiguous, missing, empty and stale selectors', async (t) => {
  const cases = [
    ['ambiguous', { ...documents(), handoff: `${documents().handoff}\n\n## Current objective — old\n\nOld.\n` }, []],
    ['missing', { ...documents(), handoff: '# Handoff\n\n## Scope\n\n- one\n' }, []],
    ['empty', { ...documents(), handoff: '# Handoff\n\n## Current objective\n\n## Scope\n\n- one\n' }, []],
    ['invalid selector', documents(), ['--objective', 'obj-0000000000']],
  ];
  for (const [name, content, args] of cases) {
    await t.test(name, async (t) => {
      const { root } = await fixture(t, content);
      const before = await snapshot(root);
      const result = cli(root, ['compact', ...args]);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /blocked/i);
      assert.deepEqual(await snapshot(root), before);
    });
  }
});

test('equal and growing plans perform zero writes and report that no apply would occur', async (t) => {
  for (const [name, size, expectedDelta] of [['equal', 177, 0], ['growing', 50, 254]]) {
    await t.test(name, async (t) => {
      const { root } = await fixture(t, documents(size));
      const before = await snapshot(root);
      const preview = await compactAgentOS({ cwd: root, dryRun: true });
      assert.equal(preview.after - preview.before, expectedDelta);
      assert.match(preview.text, /No safe reduction found; files unchanged\./);
      assert.match(preview.text, /no apply would occur/i);
      assert.deepEqual(await snapshot(root), before);

      const applied = await compactAgentOS({ cwd: root });
      assert.equal(applied.changed, false);
      assert.match(applied.text, /No safe reduction found; files unchanged\./);
      assert.equal((await rewriteBundles(root)).length, 0);
      assert.deepEqual(await snapshot(root), before, 'bytes, entries, modes, locks, archives, backups and temps must all remain identical');
    });
  }
});

test('an unlocked non-writing preflight cannot turn into an unlocked apply when sources change', async (t) => {
  const cases = [
    ['non-reducing', documents(177)],
    ['blocked', { ...documents(), handoff: `${documents().handoff}\n\n## Current objective — old\n\nOld objective.\n` }],
  ];
  for (const [name, initial] of cases) {
    await t.test(name, async (t) => {
      const { root } = await fixture(t, initial);
      const expected = await compactAgentOS({ cwd: root, dryRun: true });
      const reducing = documents(260);
      let hookCalls = 0;
      let afterHook;
      __setCompactPreflightHookForTests(async () => {
        hookCalls += 1;
        await writeFile(join(root, '.agentos/handoff.md'), reducing.handoff);
        await writeFile(join(root, '.agentos/tasks.md'), reducing.tasks);
        afterHook = await snapshot(root);
      });
      t.after(__clearCompactPreflightHookForTests);

      const result = await compactAgentOS({ cwd: root });

      assert.equal(hookCalls, 1);
      assert.equal(result.dryRun, false, 'internal preflight must render an apply-style result');
      assert.equal(result.ok, expected.ok);
      if (name === 'non-reducing') {
        assert.equal(result.stateHash, expected.stateHash, 'must return the original preflight plan');
        assert.equal(result.changed, false);
        assert.match(result.text, /^AgentOS compact\n/);
        assert.doesNotMatch(result.text, /Preview only:/);
      } else {
        assert.deepEqual(result.blockedReasons, expected.blockedReasons);
        assert.deepEqual(result.objectiveCandidates, expected.objectiveCandidates);
        assert.match(result.text, /^AgentOS compact: blocked/);
      }
      assert.deepEqual(await snapshot(root), afterHook,
        'routing after preflight must not re-read, write, archive, create temps, or acquire a lock');
      assert.equal((await rewriteBundles(root)).length, 0);

      await compactAgentOS({ cwd: root, dryRun: true });
      assert.equal(hookCalls, 1, 'the scheduling hook must reset after one invocation');
    });
  }
});

test('an identical proposal performs zero writes', async (t) => {
  const { root } = await fixture(t);
  const proposal = await compactAgentOS({ cwd: root, dryRun: true });
  assert.ok(proposal.after < proposal.before);
  await writeFile(join(root, '.agentos/handoff.md'), proposal.proposed.handoff);
  await writeFile(join(root, '.agentos/tasks.md'), proposal.proposed.tasks);
  const before = await snapshot(root);

  const result = await compactAgentOS({ cwd: root });
  assert.equal(result.before, result.after);
  assert.equal(result.changed, false);
  assert.match(result.text, /No safe reduction found; files unchanged\./);
  assert.deepEqual(await snapshot(root), before);
});

test('combined reduction may apply when one file grows and reports both deltas honestly', async (t) => {
  const { root } = await fixture(t, documents(178));
  const preview = await compactAgentOS({ cwd: root, dryRun: true });
  assert.equal(preview.after - preview.before, -2);
  assert.equal(preview.proposed.handoff.length - (await readFile(join(root, '.agentos/handoff.md'), 'utf8')).length, 2);
  assert.equal(preview.proposed.tasks.length - (await readFile(join(root, '.agentos/tasks.md'), 'utf8')).length, -4);
  assert.match(preview.text, /handoff\.md: \d+ chars -> \d+ chars/);
  assert.match(preview.text, /tasks\.md: \d+ chars -> \d+ chars/);

  const result = await compactAgentOS({ cwd: root });
  assert.equal(result.changed, true, result.text);
  assert.equal((await rewriteBundles(root)).length, 1);
});

test('compact help advertises structural default, checkpoint, alias and normal selectors', () => {
  const result = spawnSync(process.execPath, [CLI, 'help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /agentos compact \[--objective <id>\] \[--expect-state <sha256>\]/);
  assert.match(result.stdout, /--checkpoint/);
  assert.match(result.stdout, /--rewrite.*compatibility alias/i);
});
