import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parse as parseYaml } from 'yaml';
import { initAgentOS, doctorAgentOS, agentsAgentOS } from '../dist/core.js';
import { patchProjectYaml } from '../dist/project-yaml-edit.js';

// project.yaml is edited by six commands (doctor --fix, agents add, templates copy/import of an agent,
// link-obsidian, obsidian link-workspace). Each parsed the file, changed the object and re-dumped the
// WHOLE file, so a hand-formatted file lost its comments, flow style and key layout - even from a
// `doctor --fix` that had nothing to change. Observed contract:
//   * nothing to change  -> the file is returned byte-for-byte;
//   * something to change -> only that value changes; comments, key order, flow style, quoting and
//     blank lines elsewhere survive; the data always equals what the old whole-file dump produced;
//   * anything the editor cannot prove it reproduced -> it falls back to the old behavior.

const CLI = resolve('dist/cli.js');

const HAND = `# Owner notes: keep this file small.
name: shop   # product name
agentos_version: 0.1

repos:
  web: { path: web, type: app }   # flow-style entry on purpose
  api:
    path: api
engines:
  allowed:
    - claude-code
    - codex          # used on Fridays
adapters:
  child_repo_pointer_files: true

# local extras below
team: { lead: ralph, size: 2 }
quoted: "keep: me"
`;

// --- the helper ----------------------------------------------------------------------------------

test('a mutation that changes nothing returns the exact input bytes', () => {
  const out = patchProjectYaml(HAND, () => {});
  assert.equal(out, HAND);
  assert.equal(patchProjectYaml(HAND, (d) => { d.engines.allowed = [...d.engines.allowed]; }), HAND);
});

test('appending to a sequence keeps comments, flow style, quoting, blank lines and key order', () => {
  const out = patchProjectYaml(HAND, (d) => { d.engines.allowed.push('opencode'); });
  assert.equal(out, HAND.replace('    - codex          # used on Fridays\n', '    - codex          # used on Fridays\n    - opencode\n'),
    'exactly one line is added; every other byte is unchanged');
  assert.deepEqual(parseYaml(out).engines.allowed, ['claude-code', 'codex', 'opencode']);
});

test('changing a scalar keeps its trailing comment', () => {
  const out = patchProjectYaml(HAND, (d) => { d.name = 'shop-two'; });
  assert.match(out, /^name: shop-two +# product name$/m);
  assert.match(out, /^# Owner notes: keep this file small\.$/m);
  assert.match(out, /web: \{ path: web, type: app \} +# flow-style entry on purpose/);
  assert.equal(parseYaml(out).name, 'shop-two');
});

test('adding a new top-level key appends it and leaves the rest alone', () => {
  const out = patchProjectYaml(HAND, (d) => { d.knowledge = { obsidian: { mode: 'link-only', vault: '/v' } }; });
  assert.ok(out.startsWith(HAND.trimEnd()), 'the original text is a byte-exact prefix');
  assert.deepEqual(parseYaml(out).knowledge, { obsidian: { mode: 'link-only', vault: '/v' } });
});

test('adding a key inside a flow-style mapping keeps it a flow mapping', () => {
  const out = patchProjectYaml(HAND, (d) => { d.team.region = 'sg'; });
  assert.match(out, /^team: \{ lead: ralph, size: 2, region: sg \}$/m);
  assert.deepEqual(parseYaml(out).team, { lead: 'ralph', size: 2, region: 'sg' });
});

test('removing a key removes only that key', () => {
  const out = patchProjectYaml(HAND, (d) => { delete d.quoted; });
  assert.equal(out, HAND.replace('quoted: "keep: me"\n', ''));
});

test('replacing a sequence wholesale (reorder) still yields the right data', () => {
  const out = patchProjectYaml(HAND, (d) => { d.engines.allowed = ['codex', 'claude-code']; });
  assert.deepEqual(parseYaml(out).engines.allowed, ['codex', 'claude-code']);
  assert.match(out, /^# Owner notes/m);
  assert.match(out, /web: \{ path: web, type: app \}/);
});

test('a sequence that is not indented under its key keeps that style', () => {
  const src = 'name: x\nengines:\n  allowed:\n  - claude-code\n  - codex\nkeep: 1 # c\n';
  const out = patchProjectYaml(src, (d) => { d.engines.allowed.push('opencode'); });
  assert.equal(out, 'name: x\nengines:\n  allowed:\n  - claude-code\n  - codex\n  - opencode\nkeep: 1 # c\n');
});

test('uniform CRLF line endings are preserved', () => {
  const src = HAND.replace(/\n/g, '\r\n');
  assert.equal(patchProjectYaml(src, () => {}), src);
  const out = patchProjectYaml(src, (d) => { d.engines.allowed.push('opencode'); });
  assert.ok(out.includes('\r\n') && !/[^\r]\n/.test(out), 'no bare LF introduced');
  assert.deepEqual(parseYaml(out).engines.allowed, ['claude-code', 'codex', 'opencode']);
});

test('anchors and aliases fall back to the whole-file dump, with correct data', () => {
  const src = 'base: &b { a: 1 }\nuse: *b\nengines:\n  allowed: [codex]\n';
  const out = patchProjectYaml(src, (d) => { d.engines.allowed.push('opencode'); });
  assert.deepEqual(parseYaml(out).engines.allowed, ['codex', 'opencode']);
  assert.deepEqual(parseYaml(out).use, { a: 1 });
});

test('empty, null and non-mapping text behave as the old lenient dump did', () => {
  for (const src of ['', '\n', 'null\n', '~\n', '- a\n- b\n', 'just text\n']) {
    const out = patchProjectYaml(src, (d) => { d.engines = { allowed: ['opencode'] }; });
    assert.deepEqual(parseYaml(out), { engines: { allowed: ['opencode'] } }, JSON.stringify(src));
  }
});

test('unparsable text falls back instead of throwing', () => {
  const out = patchProjectYaml('name: [1, 2\n  bad: true\n', (d) => { d.engines = { allowed: ['codex'] }; });
  assert.deepEqual(parseYaml(out), { engines: { allowed: ['codex'] } });
});

test('the result always parses to exactly what the mutation produced (randomised edits)', () => {
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 60; i++) {
    const expected = parseYaml(HAND);
    const out = patchProjectYaml(HAND, (d) => {
      const ops = rnd(3) + 1;
      for (let k = 0; k < ops; k++) {
        const op = rnd(5);
        if (op === 0) d.engines.allowed.push(`e${rnd(9)}`);
        else if (op === 1) d.name = `n${rnd(9)}`;
        else if (op === 2) d[`extra${rnd(4)}`] = { v: rnd(9), list: [rnd(3), `s${rnd(3)}`] };
        else if (op === 3) delete d.quoted;
        else d.adapters.child_repo_pointer_files = !d.adapters.child_repo_pointer_files;
      }
      Object.keys(expected).forEach((k) => delete expected[k]);
      Object.assign(expected, structuredClone(d));
    });
    assert.deepEqual(parseYaml(out), expected, `iteration ${i}`);
  }
});

// --- through the real commands ---------------------------------------------------------------------

async function handFormatted(t) {
  const root = await mkdtemp(join(tmpdir(), 'agentos-yamlfid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const repo of ['web', 'api']) {
    await mkdir(join(root, repo));
    await writeFile(join(root, repo, 'package.json'), JSON.stringify({ name: repo, scripts: { build: 'echo b', test: 'echo t' } }));
  }
  await initAgentOS({ cwd: root, mode: 'existing', yes: true, agents: 'detected' });
  const path = join(root, '.agentos/project.yaml');
  let text = await readFile(path, 'utf8');
  text = '# Owner notes: keep this file small.\n' + text.replace(/^(name: .*)$/m, '$1   # product name')
    + '\n# local extras below\nteam: { lead: ralph, size: 2 }   # flow style on purpose\n';
  await writeFile(path, text);
  return { root, path, text };
}
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('doctor --fix on a hand-formatted file that needs no change leaves project.yaml byte-identical', async (t) => {
  const { root, path, text } = await handFormatted(t);
  const r = cli(['doctor', '--fix'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(await readFile(path, 'utf8'), text);
});

test('doctor --fix that must add opencode to engines.allowed changes only that line', async (t) => {
  const { root, path, text } = await handFormatted(t);
  const without = text.replace(/ {4}- opencode\n/, '');
  assert.notEqual(without, text, 'fixture check: opencode was listed');
  await writeFile(path, without);
  const r = cli(['doctor', '--fix'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const after = await readFile(path, 'utf8');
  assert.match(after, /^# Owner notes: keep this file small\.$/m);
  assert.match(after, /^name: .* +# product name$/m);
  assert.match(after, /team: \{ lead: ralph, size: 2 \} +# flow style on purpose/);
  assert.deepEqual(parseYaml(after).engines.allowed, parseYaml(text).engines.allowed.filter((e) => e !== 'opencode').concat('opencode'));
  const addedLines = after.split('\n').filter((l) => !without.split('\n').includes(l));
  assert.deepEqual(addedLines.map((l) => l.trim()), ['- opencode'], 'exactly one new line');
});

test('agents add keeps comments and flow style in project.yaml', async (t) => {
  const { root, path } = await handFormatted(t);
  const r = await agentsAgentOS({ cwd: root, add: 'planner' });
  assert.equal(r.ok !== false, true, r.text);
  const after = await readFile(path, 'utf8');
  assert.match(after, /^# Owner notes: keep this file small\.$/m);
  assert.match(after, /team: \{ lead: ralph, size: 2 \} +# flow style on purpose/);
  assert.ok(parseYaml(after).agents.enabled.includes('planner'));
});

test('link-obsidian keeps comments and flow style in project.yaml', async (t) => {
  const { root, path } = await handFormatted(t);
  const vault = await mkdtemp(join(tmpdir(), 'agentos-yamlfid-vault-'));
  t.after(() => rm(vault, { recursive: true, force: true }));
  const r = cli(['link-obsidian', '--vault', vault, '--dest', 'Projects/Shop/AgentOS', '--create'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const after = await readFile(path, 'utf8');
  assert.match(after, /^# Owner notes: keep this file small\.$/m);
  assert.match(after, /team: \{ lead: ralph, size: 2 \} +# flow style on purpose/);
  assert.equal(parseYaml(after).knowledge.obsidian.mode, 'link-only');
});

test('templates copy of an agent keeps comments in project.yaml', async (t) => {
  const { root, path } = await handFormatted(t);
  const r = cli(['templates', 'copy', 'agent:security-reviewer'], root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const after = await readFile(path, 'utf8');
  assert.match(after, /^# Owner notes: keep this file small\.$/m);
  assert.ok(parseYaml(after).agents.enabled.includes('security-reviewer'));
});

test('a --dry-run of each command still leaves project.yaml untouched', async (t) => {
  const { root, path, text } = await handFormatted(t);
  cli(['doctor', '--fix', '--dry-run'], root);
  cli(['agents', 'add', 'planner', '--dry-run'], root);
  assert.equal(await readFile(path, 'utf8'), text);
});

test('doctor --fix still fails closed on a malformed project.yaml with zero writes', async (t) => {
  const { root, path } = await handFormatted(t);
  const bad = 'name: x\nrepos: [1, 2\n  bad: true\n';
  await writeFile(path, bad);
  const r = cli(['doctor', '--fix'], root);
  assert.notEqual(r.status, 0);
  assert.equal(await readFile(path, 'utf8'), bad);
});
