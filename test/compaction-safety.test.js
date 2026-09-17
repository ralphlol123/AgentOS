import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, lstat, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { initAgentOS, compactAgentOS, __setAtomicWriteFaultForTests, __clearAtomicWriteFaultForTests } from '../dist/core.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-compact-safety-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initAgentOS({ cwd: root, mode: 'new', yes: true, agents: 'minimal' });
  return root;
}
async function snapshot(root) {
  const result = {};
  async function walk(path, key) {
    const info = await lstat(path);
    result[key] = { mode: info.mode, ...(info.isDirectory() ? {} : { bytes: (await readFile(path)).toString('hex') }) };
    if (info.isDirectory()) for (const name of (await readdir(path)).sort()) await walk(join(path, name), `${key}/${name}`);
  }
  await walk(root, '.');
  return result;
}

test('compact retains every original byte of safety context and unfinished work, including CRLF and custom sections', async (t) => {
  const root = await fixture(t);
  const handoff = '# Handoff\r\n\r\n## Scope\r\n' + 'Protected: secrets/.env; do not deploy.\r\n'.repeat(80) +
    '## Known warnings / failures\r\nDo not treat flaky CI as passing.\r\n## Open decisions\r\nAwait approval.\r\n' +
    '## Custom escalation\r\nCall owner before migration. [Prior archive](runs/old.md)\r\n';
  const tasks = '# Tasks\r\n\r\n## Now\r\n' + Array.from({ length: 15 }, (_, i) => `- [ ] Urgent ${i}\r\n  Keep acceptance detail ${i}.\r\n`).join('') +
    '## Now\r\n- [ ] Another current task\r\n## Blocked\r\n* [ ] Waiting on approval\r\n' +
    '## Next\r\n' + Array.from({ length: 15 }, (_, i) => `- [ ] Next ${i}\r\n`).join('') +
    '## Later\r\n1. [ ] Deferred task\r\n## Done\r\n- [x] Decision: never touch production\r\n';
  await writeFile(join(root, '.agentos/handoff.md'), handoff);
  await writeFile(join(root, '.agentos/tasks.md'), tasks);
  const result = await compactAgentOS({ cwd: root, checkpoint: true });
  assert.ok(result.proposed.handoff.startsWith(handoff), 'handoff must retain all original context without truncation');
  assert.ok(result.proposed.tasks.startsWith(tasks), 'all task sections, nested details and duplicates remain live');
  assert.ok(!(result.proposed.handoff + result.proposed.tasks).replaceAll('\r\n', '').includes('\n'), 'preserve CRLF');
  const archive = await readFile(result.archivePath, 'utf8');
  assert.ok(archive.includes(handoff));
  assert.ok(archive.includes(tasks));
});

test('compact dry-run exposes exact proposals through the API and a concise CLI summary without writes', async (t) => {
  const root = await fixture(t);
  const before = await snapshot(root);
  const dry = await compactAgentOS({ cwd: root, checkpoint: true, dryRun: true });
  assert.equal(typeof dry.proposed?.handoff, 'string');
  assert.equal(typeof dry.proposed?.tasks, 'string');
  assert.doesNotMatch(dry.text, /--- Proposed|--- End proposed/);
  assert.ok(!dry.text.includes(dry.proposed.handoff));
  assert.ok(!dry.text.includes(dry.proposed.tasks));
  const cli = spawnSync(process.execPath, [resolve('dist/cli.js'), 'compact', '--checkpoint', '--dry-run'], { cwd: root, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /Mode: archival checkpoint/);
  assert.doesNotMatch(cli.stdout, /--- Proposed|--- End proposed/);
  assert.ok(!cli.stdout.includes(dry.proposed.handoff));
  assert.ok(!cli.stdout.includes(dry.proposed.tasks));
  assert.deepEqual(await snapshot(root), before);
  await compactAgentOS({ cwd: root, checkpoint: true });
  assert.equal(await readFile(join(root, '.agentos/handoff.md'), 'utf8'), dry.proposed.handoff);
  assert.equal(await readFile(join(root, '.agentos/tasks.md'), 'utf8'), dry.proposed.tasks);
});

test('compact previews deterministic archive links that resolve to exact previous content', async (t) => {
  const root = await fixture(t);
  const dry = await compactAgentOS({ cwd: root, checkpoint: true, dryRun: true });
  const archiveName = dry.archivePath.split('/').at(-1);
  assert.match(archiveName, /^compact-archive-[a-f0-9]{64}\.md$/);
  for (const [name, anchor] of [['handoff', 'previous-handoff'], ['tasks', 'previous-tasks']]) {
    assert.ok(dry.proposed[name].includes(`(runs/${archiveName}#${anchor})`));
  }
  const again = await compactAgentOS({ cwd: root, checkpoint: true, dryRun: true });
  assert.equal(again.archivePath, dry.archivePath);
  assert.deepEqual(again.proposed, dry.proposed);
  const result = await compactAgentOS({ cwd: root, checkpoint: true });
  assert.equal(result.archivePath, dry.archivePath);
  const archive = await readFile(result.archivePath, 'utf8');
  assert.ok(archive.includes('<a id="previous-handoff"></a>'));
  assert.ok(archive.includes('<a id="previous-tasks"></a>'));
});

test('compact is a write-free no-op on unchanged state and keeps archive chains after edits', async (t) => {
  const root = await fixture(t);
  const first = await compactAgentOS({ cwd: root, checkpoint: true });
  const before = await snapshot(root);
  const second = await compactAgentOS({ cwd: root, checkpoint: true });
  assert.equal(second.changed, false);
  assert.equal(second.archivePath, first.archivePath);
  assert.deepEqual(await snapshot(root), before);
  const dry = await compactAgentOS({ cwd: root, checkpoint: true, dryRun: true });
  assert.equal(dry.changed, false);
  assert.deepEqual(dry.proposed, first.proposed);
  const tasksPath = join(root, '.agentos/tasks.md');
  await writeFile(tasksPath, (await readFile(tasksPath, 'utf8')) + '\n## New blocker\n- [ ] Wait for approval\n');
  const third = await compactAgentOS({ cwd: root, checkpoint: true });
  assert.notEqual(third.archivePath, first.archivePath);
  assert.ok(third.proposed.tasks.includes(first.archivePath.split('/').at(-1)));
  assert.match(third.proposed.tasks, /Wait for approval/);
  assert.equal(await readFile(first.archivePath, 'utf8'), Buffer.from(before['./.agentos/runs/' + first.archivePath.split('/').at(-1)].bytes, 'hex').toString());
  assert.equal((await compactAgentOS({ cwd: root, checkpoint: true })).changed, false);
});

test('compact never overwrites archive-name collisions and previews the selected suffix', async (t) => {
  const root = await fixture(t);
  const first = await compactAgentOS({ cwd: root, checkpoint: true, dryRun: true });
  await writeFile(first.archivePath, 'Existing historical archive; do not replace.\n');
  const collision2 = first.archivePath.replace(/\.md$/, '-1.md');
  await writeFile(collision2, 'Second historical archive.\n');
  const before = await snapshot(root);
  const dry = await compactAgentOS({ cwd: root, checkpoint: true, dryRun: true });
  assert.equal(dry.archivePath, first.archivePath.replace(/\.md$/, '-2.md'));
  assert.deepEqual(await snapshot(root), before);
  const result = await compactAgentOS({ cwd: root, checkpoint: true });
  assert.equal(result.archivePath, dry.archivePath);
  assert.deepEqual(result.proposed, dry.proposed);
  assert.equal(await readFile(first.archivePath, 'utf8'), 'Existing historical archive; do not replace.\n');
  assert.equal(await readFile(collision2, 'utf8'), 'Second historical archive.\n');
  assert.equal((await compactAgentOS({ cwd: root, checkpoint: true })).changed, false);
});

test('compact failure restores the whole tree including absent runs directory', async (t) => {
  const root = await fixture(t);
  await rm(join(root, '.agentos/runs'), { recursive: true });
  await chmod(join(root, '.agentos/handoff.md'), 0o640);
  const before = await snapshot(root);
  const preview = await compactAgentOS({ cwd: root, checkpoint: true, dryRun: true });
  __setAtomicWriteFaultForTests(preview.archivePath, 'before-rename');
  t.after(__clearAtomicWriteFaultForTests);
  await assert.rejects(compactAgentOS({ cwd: root, checkpoint: true }), /Injected atomic-write test fault/);
  assert.deepEqual(await snapshot(root), before);
});

test('compact refuses invalid UTF-8 without rewriting replacement characters into state', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, '.agentos/handoff.md'), Buffer.from([0x23, 0x20, 0xff, 0x0a]));
  const before = await snapshot(root);
  await assert.rejects(compactAgentOS({ cwd: root, checkpoint: true, dryRun: true }), /handoff\.md.*UTF-8/);
  await assert.rejects(compactAgentOS({ cwd: root, checkpoint: true }), /handoff\.md.*UTF-8/);
  assert.deepEqual(await snapshot(root), before);
});

// Broader controls for the already-proven transactional and retention behavior.
for (const runsExists of [true, false]) {
  for (const target of ['archive', 'handoff.md', 'tasks.md']) {
    for (const point of ['before-sync', 'before-rename']) {
      test(`compact rollback: runs=${runsExists}, target=${target}, point=${point}`, async (t) => {
        const root = await fixture(t);
        if (!runsExists) await rm(join(root, '.agentos/runs'), { recursive: true });
        else await writeFile(join(root, '.agentos/runs/prior.md'), 'Keep prior history.\n');
        await chmod(join(root, '.agentos/handoff.md'), 0o640);
        await chmod(join(root, '.agentos/tasks.md'), 0o600);
        const before = await snapshot(root);
        const dry = await compactAgentOS({ cwd: root, checkpoint: true, dryRun: true });
        __setAtomicWriteFaultForTests(target === 'archive' ? dry.archivePath : join(root, '.agentos', target), point);
        t.after(__clearAtomicWriteFaultForTests);
        await assert.rejects(compactAgentOS({ cwd: root, checkpoint: true }), /Injected atomic-write test fault/);
        assert.deepEqual(await snapshot(root), before);
      });
    }
  }
}

test('compact handles CRLF repeats, missing/empty files and missing archives conservatively', async (t) => {
  for (const mode of ['crlf', 'empty', 'missing']) {
    await t.test(mode, async (t) => {
      const root = await fixture(t);
      const handoffPath = join(root, '.agentos/handoff.md');
      const tasksPath = join(root, '.agentos/tasks.md');
      if (mode === 'missing') { await rm(handoffPath); await rm(tasksPath); }
      else for (const path of [handoffPath, tasksPath]) await writeFile(path, mode === 'empty' ? '' : (await readFile(path, 'utf8')).replaceAll('\n', '\r\n'));
      const first = await compactAgentOS({ cwd: root, checkpoint: true });
      const before = await snapshot(root);
      __setAtomicWriteFaultForTests(tasksPath, 'before-rename');
      t.after(__clearAtomicWriteFaultForTests);
      assert.equal((await compactAgentOS({ cwd: root, checkpoint: true })).changed, false);
      __clearAtomicWriteFaultForTests();
      assert.deepEqual(await snapshot(root), before);
      await rm(first.archivePath);
      const recovered = await compactAgentOS({ cwd: root, checkpoint: true });
      assert.equal(recovered.changed, true);
      assert.ok(recovered.proposed.tasks.startsWith(first.proposed.tasks));
      assert.equal((await compactAgentOS({ cwd: root, checkpoint: true })).changed, false);
    });
  }
});

test('compact archive isolates arbitrary Markdown so source fences cannot hide archive targets', async (t) => {
  const root = await fixture(t);
  const handoff = '# Handoff\n\n`````text\nAn unfinished fenced example\n';
  await writeFile(join(root, '.agentos/handoff.md'), handoff);
  const result = await compactAgentOS({ cwd: root, checkpoint: true });
  const archive = await readFile(result.archivePath, 'utf8');
  assert.ok(archive.includes('``````markdown\n' + handoff + '\n``````\n'), 'source must be wrapped in a longer fence');
  assert.ok(result.proposed.handoff.startsWith(handoff));
  assert.match(result.text, /unclosed Markdown fence can render appended archive links as literal text/i);
  assert.ok(result.text.includes(`.agentos/runs/${result.archivePath.split('/').at(-1)}#previous-handoff`));
  const preview = await compactAgentOS({ cwd: root, checkpoint: true, dryRun: true });
  assert.match(preview.text, /unclosed Markdown fence can render appended archive links as literal text/i);
  assert.equal((await compactAgentOS({ cwd: root, checkpoint: true })).changed, false);
});

test('compact reports retained context and size growth instead of claiming negative savings', async (t) => {
  const root = await fixture(t);
  const result = await compactAgentOS({ cwd: root, checkpoint: true, dryRun: true });
  assert.match(result.text, /original live text retained/i);
  assert.match(result.text, /chars added/);
  assert.ok(result.text.includes(`(${result.after - result.before} chars added)`));
  assert.doesNotMatch(result.text, /-\d.*% smaller/);
  const applied = await compactAgentOS({ cwd: root, checkpoint: true });
  assert.ok(applied.text.includes(`(${applied.after - applied.before} chars added)`));
  const unchanged = await compactAgentOS({ cwd: root, checkpoint: true });
  assert.equal(unchanged.after, unchanged.before);
  assert.match(unchanged.text, /\(0 chars added\)/);
});
