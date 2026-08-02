import { access, copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const execFileAsync = promisify(execFile);
const AGENTOS_DIR = '.agentos';
const REQUIRED_FILES = [
  '.agentos/project.yaml',
  '.agentos/memory.md',
  '.agentos/handoff.md',
  '.agentos/decisions.md',
  '.agentos/tasks.md',
  '.agentos/status.md',
  '.agentos/knowledge.md',
  'AGENTS.md',
  'CLAUDE.md',
];

export async function initAgentOS(options: any = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const mode = options.mode ?? await inferMode(cwd);
  const repos = await detectRepos(cwd);
  const workspaceKind = repos.length > 1 ? 'multi-repo' : 'single-repo';
  const projectName = basename(cwd);

  if (options.dryRun) {
    return {
      mode,
      workspaceKind,
      repos,
      planned: plannedFiles(mode, workspaceKind, repos),
      text: renderDryRun({ cwd, mode, workspaceKind, repos }),
    };
  }

  await mkdir(join(cwd, AGENTOS_DIR), { recursive: true });
  await mkdir(join(cwd, AGENTOS_DIR, 'agents'), { recursive: true });
  await mkdir(join(cwd, AGENTOS_DIR, 'engines'), { recursive: true });
  await mkdir(join(cwd, AGENTOS_DIR, 'runs'), { recursive: true });
  await mkdir(join(cwd, AGENTOS_DIR, 'repos'), { recursive: true });

  await writeIfMissing(join(cwd, AGENTOS_DIR, 'project.yaml'), projectYaml({ projectName, mode, workspaceKind, repos }));
  await writeIfMissing(join(cwd, AGENTOS_DIR, 'memory.md'), memoryMd({ mode, workspaceKind }));
  await writeIfMissing(join(cwd, AGENTOS_DIR, 'handoff.md'), handoffMd({ mode, workspaceKind, repos }));
  await writeIfMissing(join(cwd, AGENTOS_DIR, 'decisions.md'), decisionsMd());
  await writeIfMissing(join(cwd, AGENTOS_DIR, 'tasks.md'), tasksMd({ mode }));
  await writeIfMissing(join(cwd, AGENTOS_DIR, 'status.md'), statusMd({ mode, workspaceKind }));
  await writeIfMissing(join(cwd, AGENTOS_DIR, 'knowledge.md'), knowledgeMd());
  await writeIfMissing(join(cwd, AGENTOS_DIR, 'runs', 'README.md'), runsReadmeMd());

  if (mode === 'new') {
    await writeIfMissing(join(cwd, AGENTOS_DIR, 'product.md'), productMd({ projectName }));
    await writeIfMissing(join(cwd, AGENTOS_DIR, 'architecture.md'), architectureMd());
  }

  for (const agent of defaultAgents()) {
    await writeIfMissing(join(cwd, AGENTOS_DIR, 'agents', `${agent.id}.md`), agentMd(agent));
  }
  for (const engine of defaultEngines()) {
    await writeIfMissing(join(cwd, AGENTOS_DIR, 'engines', `${engine.id}.md`), engineMd(engine));
  }
  for (const repo of repos) {
    await writeIfMissing(join(cwd, AGENTOS_DIR, 'repos', `${repo.name}.md`), repoMd(repo));
  }

  await createOrPatchRootFile(join(cwd, 'AGENTS.md'), agentsBootloader({ workspaceKind, repos }));
  await createOrPatchRootFile(join(cwd, 'CLAUDE.md'), claudeAdapter());
  await createOrPatchRootFile(join(cwd, '.hermes.md'), hermesAdapter());

  if (workspaceKind === 'multi-repo') {
    for (const repo of repos) {
      await createOrPatchRootFile(join(cwd, repo.path, 'AGENTS.md'), subrepoAgentsPointer(repo));
      await createOrPatchRootFile(join(cwd, repo.path, 'CLAUDE.md'), subrepoClaudePointer(repo));
      await ensureChildRepoGitignore(join(cwd, repo.path));
    }
  }

  return { mode, workspaceKind, repos, text: `AgentOS initialized (${mode}, ${workspaceKind}) at ${cwd}` };
}

export async function statusAgentOS(options: any = {}) {
  const root = await findAgentOSRoot(options.cwd ?? process.cwd());
  if (!root) return { ok: false, text: 'AgentOS status: NOT FOUND\nNo .agentos directory found here or in parent directories.' };

  const project = await safeRead(join(root, '.agentos/project.yaml'));
  const handoff = await safeRead(join(root, '.agentos/handoff.md'));
  const missing = [];
  for (const file of REQUIRED_FILES) {
    if (!await exists(join(root, file))) missing.push(file);
  }
  const ok = missing.length === 0;
  return {
    ok,
    text: [
      `AgentOS status: ${ok ? 'OK' : 'NEEDS ATTENTION'}`,
      '',
      `Root: ${root}`,
      firstYamlValue(project, 'name') ? `Project: ${firstYamlValue(project, 'name')}` : null,
      firstYamlValue(project, 'workspace_kind') ? `Workspace kind: ${firstYamlValue(project, 'workspace_kind')}` : null,
      '',
      'Current handoff:',
      extractSection(handoff, 'Current objective') || '- No current objective found.',
      '',
      missing.length ? `Missing files:\n${missing.map((f) => `- ${f}`).join('\n')}` : 'Required files: all present',
    ].filter(Boolean).join('\n'),
  };
}

export async function promptAgentOS(options: any = {}) {
  const root = await findAgentOSRoot(options.cwd ?? process.cwd());
  if (!root) return { ok: false, text: 'AgentOS prompt: FAIL\nNo .agentos directory found here or in parent directories.' };
  const engine = normalizeEngine(options.engine ?? 'generic');
  const project = await safeRead(join(root, '.agentos/project.yaml'));
  const handoff = await safeRead(join(root, '.agentos/handoff.md'));
  const tasks = await safeRead(join(root, '.agentos/tasks.md'));
  const prompt = renderEnginePrompt({ engine, root, project, handoff, tasks });
  return { ok: true, engine, text: prompt };
}

export async function compactAgentOS(options: any = {}) {
  const root = await findAgentOSRoot(options.cwd ?? process.cwd());
  if (!root) return { ok: false, text: 'AgentOS compact: FAIL\nNo .agentos directory found.' };

  const handoffPath = join(root, '.agentos/handoff.md');
  const tasksPath = join(root, '.agentos/tasks.md');
  const runsDir = join(root, '.agentos/runs');
  const oldHandoff = await safeRead(handoffPath);
  const oldTasks = await safeRead(tasksPath);
  const before = oldHandoff.length + oldTasks.length;
  const compactHandoff = renderCompactHandoff(oldHandoff, oldTasks);
  const compactTasks = renderCompactTasks(oldTasks, oldHandoff);
  const after = compactHandoff.length + compactTasks.length;
  const archiveName = `compact-archive-${timestampForFilename(new Date())}.md`;
  const archivePath = join(runsDir, archiveName);

  const lines = [
    `AgentOS compact${options.dryRun ? ' dry run' : ''}`,
    `Root: ${root}`,
    '',
    'Live context:',
    `- handoff.md: ${oldHandoff.length} chars -> ${compactHandoff.length} chars`,
    `- tasks.md: ${oldTasks.length} chars -> ${compactTasks.length} chars`,
    `- total: ${before} chars -> ${after} chars (${before > 0 ? Math.round(((before - after) / before) * 1000) / 10 : 0}% smaller)`,
    '',
    `${options.dryRun ? 'Would archive' : 'Archived'}: .agentos/runs/${archiveName}`,
    `${options.dryRun ? 'Would rewrite' : 'Rewrote'}: .agentos/handoff.md`,
    `${options.dryRun ? 'Would rewrite' : 'Rewrote'}: .agentos/tasks.md`,
  ];

  if (!options.dryRun) {
    await mkdir(runsDir, { recursive: true });
    await writeFile(archivePath, renderCompactArchive({ oldHandoff, oldTasks, compactHandoff, compactTasks }), 'utf8');
    await writeFile(handoffPath, compactHandoff, 'utf8');
    await writeFile(tasksPath, compactTasks, 'utf8');
    const doctor = await doctorAgentOS({ cwd: root });
    lines.push('', doctor.text);
  }

  return { ok: true, dryRun: Boolean(options.dryRun), archivePath, before, after, text: lines.join('\n') };
}

export async function linkObsidianAgentOS(options: any = {}) {
  const root = await findAgentOSRoot(options.cwd ?? process.cwd());
  if (!root) return { ok: false, text: 'AgentOS link-obsidian: FAIL\nNo .agentos directory found.' };
  const project = await safeRead(join(root, '.agentos/project.yaml'));
  const projectName = firstYamlValue(project, 'name') ?? basename(root);
  const rawVault = String(options.vault || '').trim();
  if (!rawVault) return { ok: false, text: 'AgentOS link-obsidian: FAIL\nMissing --vault <path>.' };
  const vault = resolve(rawVault);
  const destination = normalizeVaultRelativePath(options.dest || `Projects/${title(projectName).replace(/\s+/g, ' ')}`);
  const rawLink = options.link ? normalizeVaultRelativePath(options.link) : '';
  const create = Boolean(options.create);
  const dryRun = Boolean(options.dryRun);

  if (!await exists(vault)) return { ok: false, text: `AgentOS link-obsidian: FAIL\nVault path does not exist: ${vault}` };
  const linked = rawLink ? (rawLink.toLowerCase().endsWith('.md') ? [rawLink] : defaultObsidianNotes(rawLink, projectName)) : defaultObsidianNotes(destination, projectName);
  const missing = [];
  for (const note of linked) {
    const notePath = join(vault, note);
    if (!await exists(notePath)) missing.push(note);
  }
  if (missing.length && !create) {
    return { ok: false, text: `AgentOS link-obsidian: FAIL\nMissing linked notes. Re-run with --create to create them:\n${missing.map((n) => `- ${n}`).join('\n')}` };
  }

  const knowledge = knowledgeMd({ vault, destination, linked });
  const projectPatched = ensureObsidianProjectConfig(project, { vault, destination, linked });
  const lines = [
    `AgentOS link-obsidian${dryRun ? ' dry run' : ''}`,
    `Root: ${root}`,
    `Vault: ${vault}`,
    `Destination: ${destination}`,
    'Mode: link-only',
    '',
    `${dryRun ? 'Would write' : 'Wrote'}: .agentos/knowledge.md`,
    `${dryRun ? 'Would patch' : 'Patched'}: .agentos/project.yaml`,
    `${dryRun ? 'Would ensure' : 'Ensured'} Obsidian notes:
${linked.map((n) => `- ${n}`).join('\n')}`,
    '',
    'Safety: AgentOS links specific notes only. It does not bulk-load the Obsidian vault.',
  ];

  if (!dryRun) {
    await mkdir(join(root, '.agentos'), { recursive: true });
    await writeFile(join(root, '.agentos/knowledge.md'), knowledge, 'utf8');
    await writeFile(join(root, '.agentos/project.yaml'), projectPatched, 'utf8');
    for (const note of linked) {
      const notePath = join(vault, note);
      if (!await exists(notePath)) {
        await mkdir(dirname(notePath), { recursive: true });
        await writeFile(notePath, obsidianNoteTemplate(note, projectName, linked), 'utf8');
      }
    }
    await fixAgentOSAdapters(root);
    const doctor = await doctorAgentOS({ cwd: root });
    lines.push('', doctor.text);
  }

  return { ok: true, vault, destination, linked, text: lines.join('\n') };
}

export async function handoffAgentOS(options: any = {}) {
  const root = await findAgentOSRoot(options.cwd ?? process.cwd());
  if (!root) return { ok: false, text: 'No AgentOS root found.' };
  const project = await safeRead(join(root, '.agentos/project.yaml'));
  const handoff = await safeRead(join(root, '.agentos/handoff.md'));
  return {
    ok: true,
    text: [
      'Read these before continuing:',
      '1. AGENTS.md',
      '2. .agentos/project.yaml',
      '3. .agentos/memory.md',
      '4. .agentos/handoff.md',
      '5. .agentos/tasks.md',
      '6. .agentos/knowledge.md when linked notes are relevant',
      '7. relevant .agentos/agents/<role>.md',
      '8. relevant .agentos/engines/<engine>.md',
      '',
      `Project: ${firstYamlValue(project, 'name') ?? basename(root)}`,
      '',
      'Current handoff excerpt:',
      handoff.trim() || '(empty)',
    ].join('\n'),
  };
}

export async function doctorAgentOS(options: any = {}) {
  const root = await findAgentOSRoot(options.cwd ?? process.cwd());
  if (!root) {
    const result = doctorResult({ root: null, fix: Boolean(options.fix), problems: ['No .agentos directory found.'], warnings: [], diagnostics: [] });
    return options.json ? withJsonText(result) : { ...result, text: 'AgentOS doctor: FAIL\nNo .agentos directory found.' };
  }

  if (options.fix) await fixAgentOSAdapters(root);

  const problems = [];
  const warnings = [];
  for (const file of REQUIRED_FILES) {
    if (!await exists(join(root, file))) problems.push(`Missing ${file}`);
  }

  const agents = await safeRead(join(root, 'AGENTS.md'));
  const claude = await safeRead(join(root, 'CLAUDE.md'));
  const hermes = await safeRead(join(root, '.hermes.md'));
  const knowledge = await safeRead(join(root, '.agentos/knowledge.md'));
  const project = await safeRead(join(root, '.agentos/project.yaml'));
  const repos = parseReposFromProjectYaml(project);

  if (!agents.includes('AgentOS for Projects')) problems.push('AGENTS.md is missing AgentOS bootloader text');
  if (!agents.includes('.agentos/project.yaml')) problems.push('AGENTS.md does not point to .agentos/project.yaml');
  if (!agents.includes('.agentos/handoff.md')) problems.push('AGENTS.md does not point to .agentos/handoff.md');
  if (!agents.includes('Declare') && !agents.includes('declare')) problems.push('AGENTS.md does not require repo-scope declaration');
  if (!claude.includes('AGENTS.md')) problems.push('CLAUDE.md does not point to AGENTS.md');
  if (!claude.includes('.agentos/project.yaml')) problems.push('CLAUDE.md does not point to .agentos/project.yaml');
  if (!claude.includes('.agentos/handoff.md')) problems.push('CLAUDE.md does not point to .agentos/handoff.md');
  if (!/^name:/m.test(project)) problems.push('.agentos/project.yaml missing name');
  if (!/^workspace_kind:/m.test(project)) warnings.push('.agentos/project.yaml missing workspace_kind');
  if (!hermes.includes('AgentOS for Projects')) warnings.push('Optional .hermes.md adapter is missing or does not mention AgentOS');
  if (!knowledge.includes('Do not bulk-load')) warnings.push('.agentos/knowledge.md missing link-only safety rule');
  if (!project.includes('- opencode')) warnings.push('.agentos/project.yaml engines.allowed does not list opencode');
  if (!await exists(join(root, '.agentos/engines/opencode.md'))) warnings.push('.agentos/engines/opencode.md is missing; run `agentos doctor --fix` to create it');

  for (const repo of repos) {
    const agentsPath = join(root, repo.path, 'AGENTS.md');
    const claudePath = join(root, repo.path, 'CLAUDE.md');
    const subAgents = await safeRead(agentsPath);
    const subClaude = await safeRead(claudePath);
    if (!subAgents.includes('../.agentos/project.yaml')) problems.push(`${repo.path}/AGENTS.md does not point to parent AgentOS project.yaml`);
    if (!subAgents.includes(`../.agentos/repos/${repo.name}.md`)) problems.push(`${repo.path}/AGENTS.md does not point to its repo context`);
    if (!subClaude.includes('../CLAUDE.md') || !subClaude.includes('../.agentos/handoff.md')) problems.push(`${repo.path}/CLAUDE.md does not point to parent Claude/AgentOS context`);
  }

  const diagnostics = [];
  await checkTasksAndHandoff(root, problems, warnings, diagnostics);
  await checkRepoCommands(repos, warnings, diagnostics);
  await checkGitState(root, repos, warnings, diagnostics);
  await checkPorts(repos, warnings, diagnostics);

  const result = doctorResult({ root, fix: Boolean(options.fix), problems, warnings, diagnostics });
  return options.json ? withJsonText(result) : result;
}

function doctorResult({ root, fix, problems, warnings, diagnostics }) {
  const ok = problems.length === 0;
  const status = ok ? 'OK' : 'FAIL';
  return {
    ok,
    status,
    root,
    fix,
    problems,
    warnings,
    diagnostics,
    summary: {
      problem_count: problems.length,
      warning_count: warnings.length,
      diagnostic_count: diagnostics.length,
    },
    text: renderDoctorText({ status, fix, problems, warnings, diagnostics }),
  };
}

function withJsonText(result) {
  return { ...result, text: `${JSON.stringify(result, null, 2)}\n` };
}

function renderDoctorText({ status, fix, problems, warnings, diagnostics }) {
  return [
    `AgentOS doctor: ${status}`,
    fix ? 'Fix mode: checked/repaired adapter files before validation' : null,
    '',
    problems.length ? `Problems:\n${problems.map((p) => `✗ ${p}`).join('\n')}` : '✓ Required files and adapter pointers are present',
    warnings.length ? `\nWarnings:\n${warnings.map((w) => `- ${w}`).join('\n')}` : '',
    diagnostics.length ? `\nDiagnostics:\n${diagnostics.map((d) => `- ${d}`).join('\n')}` : '',
  ].filter(Boolean).join('\n').trim();
}


async function checkTasksAndHandoff(root, problems, warnings, diagnostics) {
  const tasks = await safeRead(join(root, '.agentos/tasks.md'));
  const handoff = await safeRead(join(root, '.agentos/handoff.md'));
  for (const heading of duplicateMarkdownHeadings(tasks, ['Done', 'Now', 'Next', 'Later'])) {
    problems.push(`.agentos/tasks.md has duplicate ## ${heading} sections`);
  }
  const now = extractSection(tasks, 'Now');
  const objective = extractSection(handoff, 'Current objective');
  const nextAction = extractSection(handoff, 'Next exact action');
  if (!now || !/- \[[ xX]\]/.test(now)) warnings.push('.agentos/tasks.md has no actionable ## Now checkbox');
  if (!objective) warnings.push('.agentos/handoff.md has no ## Current objective');
  if (now && objective && !sectionsOverlap(now, `${objective}\n${nextAction || ''}`)) {
    warnings.push('.agentos/tasks.md ## Now may not match .agentos/handoff.md current objective/next action');
  }
  if (/not pushed|needs push|push pending/i.test(handoff)) {
    diagnostics.push('handoff mentions pending push; compare with git ahead/behind diagnostics below');
  }
}

function duplicateMarkdownHeadings(text, names) {
  const seen = new Map();
  for (const match of text.matchAll(/^##\s+(.+?)\s*$/gm)) {
    const name = match[1].trim();
    if (!names.includes(name)) continue;
    seen.set(name, (seen.get(name) || 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name);
}

function sectionsOverlap(a, b) {
  const wordsA = keywords(a);
  const wordsB = keywords(b);
  if (!wordsA.size || !wordsB.size) return true;
  return [...wordsA].some((word) => wordsB.has(word));
}

function keywords(text) {
  const stop = new Set(['the','and','that','this','with','from','into','agentos','repo','repos','task','tasks','decide','whether','current','next','now','done']);
  return new Set(String(text).toLowerCase().match(/[a-z0-9][a-z0-9_-]{3,}/g)?.filter((w) => !stop.has(w)) || []);
}

async function checkRepoCommands(repos, warnings, diagnostics) {
  for (const repo of repos) {
    const commands = repo.commands || {};
    for (const key of ['build_command', 'dev_command', 'test_command']) {
      if (!commands[key] || commands[key] === 'unknown') warnings.push(`${repo.name} missing ${key} in project.yaml`);
    }
    diagnostics.push(`${repo.name} commands: build=${commands.build_command || 'unknown'}, dev=${commands.dev_command || 'unknown'}, test=${commands.test_command || 'unknown'}`);
  }
}

async function checkGitState(root, repos, warnings, diagnostics) {
  for (const repo of repos) {
    const abs = join(root, repo.path);
    if (!await exists(join(abs, '.git'))) {
      const inside = await runGit(abs, ['rev-parse', '--is-inside-work-tree']);
      if (!inside.ok) {
        warnings.push(`${repo.name} is not a git worktree (${repo.path})`);
        continue;
      }
    }
    const branch = await runGit(abs, ['branch', '--show-current']);
    const status = await runGit(abs, ['status', '--short', '--branch']);
    if (!status.ok) {
      warnings.push(`${repo.name} git status failed: ${status.error}`);
      continue;
    }
    diagnostics.push(`${repo.name} git: ${status.stdout.split(/\r?\n/)[0] || '(no branch line)'}`);
    const dirty = status.stdout.split(/\r?\n/).slice(1).filter(Boolean);
    const trackedDirty = dirty.filter((line) => !line.startsWith('??'));
    if (trackedDirty.length) warnings.push(`${repo.name} has tracked working-tree changes (${trackedDirty.length})`);
    await checkUntrackedAdapters(abs, repo, dirty, warnings, diagnostics);
    const upstream = await runGit(abs, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
    if (!upstream.ok) {
      warnings.push(`${repo.name} branch ${branch.stdout || '(detached)'} has no upstream`);
      continue;
    }
    const aheadBehind = await runGit(abs, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']);
    if (aheadBehind.ok) {
      const [ahead = '0', behind = '0'] = aheadBehind.stdout.trim().split(/\s+/);
      diagnostics.push(`${repo.name} ahead/behind vs ${upstream.stdout}: ahead ${ahead}, behind ${behind}`);
      if (ahead !== '0' || behind !== '0') warnings.push(`${repo.name} is ahead/behind ${upstream.stdout}: ahead ${ahead}, behind ${behind}`);
    }
  }
}

async function checkUntrackedAdapters(abs, repo, dirty, warnings, diagnostics) {
  const adapters = dirty.filter((line) => /^\?\?\s+(.hermes\/|\.hermes\.md$|AGENTS\.md$|CLAUDE\.md$)/.test(line));
  if (adapters.length) {
    warnings.push(`${repo.name} has untracked AgentOS adapter files: ${adapters.map((line) => line.replace(/^\?\?\s+/, '')).join(', ')}`);
  } else {
    diagnostics.push(`${repo.name} has no untracked adapter files`);
  }
}

async function checkPorts(repos, warnings, diagnostics) {
  const ports = [];
  for (const repo of repos) {
    for (const [name, raw] of Object.entries(repo.ports || {})) {
      const port = Number.parseInt(String(raw), 10);
      if (Number.isInteger(port) && port > 0) ports.push({ repo: repo.name, name, port });
    }
  }
  if (!ports.length) {
    diagnostics.push('ports: none defined in project.yaml');
    return;
  }
  const ss = await runCommand('ss', ['-ltnp']);
  if (!ss.ok) {
    warnings.push(`could not check ports with ss: ${ss.error}`);
    return;
  }
  for (const item of ports) {
    const inUse = new RegExp(`:${item.port}\\b`).test(ss.stdout);
    diagnostics.push(`${item.repo} ${item.name} ${item.port}: ${inUse ? 'IN USE' : 'free'}`);
    if (inUse) warnings.push(`port ${item.port} (${item.repo}.${item.name}) is already in use`);
  }
}

async function runGit(cwd, args) {
  return runCommand('git', args, cwd);
}

async function runCommand(command: string, args: string[], cwd?: string) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { cwd, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim(), error: '' };
  } catch (error) {
    return { ok: false, stdout: (error.stdout || '').trim(), stderr: (error.stderr || '').trim(), error: error.message };
  }
}


async function fixAgentOSAdapters(root) {
  const projectPath = join(root, '.agentos/project.yaml');
  const project = await safeRead(projectPath);
  const repos = parseReposFromProjectYaml(project);
  await ensureProjectYamlEngine(projectPath, 'opencode');
  await writeIfMissing(join(root, '.agentos/knowledge.md'), knowledgeMd());
  for (const engine of defaultEngines()) {
    await writeIfMissing(join(root, '.agentos/engines', `${engine.id}.md`), engineMd(engine));
  }
  await ensureAgentOSSection(join(root, 'AGENTS.md'), agentsBootloader({ workspaceKind: firstYamlValue(project, 'workspace_kind') ?? 'unknown', repos }));
  await ensureAgentOSSection(join(root, 'CLAUDE.md'), claudeAdapter());
  await ensureAgentOSSection(join(root, '.hermes.md'), hermesAdapter());
  for (const repo of repos) {
    await ensureAgentOSSection(join(root, repo.path, 'AGENTS.md'), subrepoAgentsPointer(repo));
    await ensureAgentOSSection(join(root, repo.path, 'CLAUDE.md'), subrepoClaudePointer(repo));
    await ensureChildRepoGitignore(join(root, repo.path));
  }
}

const CHILD_REPO_GITIGNORE_BLOCK = `# AgentOS parent-workspace pointer files
/AGENTS.md
/CLAUDE.md
/.hermes.md
# End AgentOS parent-workspace pointer files
`;

async function ensureChildRepoGitignore(repoRoot) {
  const gitignorePath = join(repoRoot, '.gitignore');
  const content = await safeRead(gitignorePath);
  const next = ensureManagedBlock(content, 'AgentOS parent-workspace pointer files', CHILD_REPO_GITIGNORE_BLOCK);
  if (next !== content) await writeFile(gitignorePath, next, 'utf8');
}

function ensureManagedBlock(content, title, block) {
  const start = `# ${title}`;
  const end = `# End ${title}`;
  const normalizedBlock = `${block.trimEnd()}\n`;
  if (content.includes(start) && content.includes(end)) {
    const re = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, 'm');
    return content.replace(re, normalizedBlock);
  }
  if (content.includes(start)) {
    const legacy = new RegExp(`${escapeRegExp(start)}\\n/AGENTS\\.md\\n/CLAUDE\\.md\\n/\\.hermes\\.md\\n?`, 'm');
    return content.replace(legacy, normalizedBlock);
  }
  const trimmed = content.trimEnd();
  return `${trimmed}${trimmed ? '\n\n' : ''}${normalizedBlock}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureAgentOSSection(path, section) {
  if (!await exists(path)) return writeFile(path, section, 'utf8');
  const content = await readFile(path, 'utf8');
  if (adapterLooksCurrent(content, section)) return;
  if (!hasAgentOSMarker(content) && !content.includes('AgentOS for Projects')) {
    await copyFile(path, `${path}.agentos.bak`);
    return writeFile(path, `${content.trim()}\n\n---\n\n${section}`, 'utf8');
  }
  await writeFile(path, replaceAgentOSSection(content, section), 'utf8');
}

function hasAgentOSMarker(content) {
  return ['AgentOS for Projects bootloader.', 'AgentOS child repo:', 'This workspace uses **AgentOS for Projects**.', 'This project uses **AgentOS for Projects**.', 'This repo is part of a parent'].some((m) => content.includes(m));
}

function adapterLooksCurrent(content, section) {
  const required = ['AgentOS for Projects', '.agentos/project.yaml', '.agentos/handoff.md'];
  const stale = [
    '## Core rules',
    '## First action for every task',
    '## Required behavior',
    'Before acting on project work, read:',
    'This repo is part of a parent **AgentOS for Projects** workspace.',
    'This repo is part of a parent AgentOS workspace.',
    'This repo is part of a parent AgentOS for Projects workspace.',
    'AgentOS child repo:',
    'This project uses AgentOS for Projects.',
  ];
  if (content.includes('undefined/undefined/undefined')) return false;
  if (content.includes('AgentOS child repo:') && section.startsWith('# CLAUDE.md')) return content.includes('../.agentos/handoff.md') && !content.includes('---');
  if (content.includes('AgentOS child repo:') && section.startsWith('# AGENTS.md')) return content.includes('../.agentos/repos/') && !content.includes('---');
  if (stale.some((token) => content.includes(token))) return false;
  if (section.startsWith('# CLAUDE.md') && !content.includes('.agentos/engines/claude-code.md')) return false;
  if (section.startsWith('# AGENTS.md') && !content.includes('.agentos/tasks.md')) return false;
  if (section.startsWith('# Hermes Agent Adapter') && !content.includes('Hermes rules:')) return false;
  return required.every((token) => content.includes(token));
}

function replaceAgentOSSection(content, section) {
  const markers = [
    'AgentOS for Projects bootloader.',
    'AgentOS child repo:',
    'This workspace uses **AgentOS for Projects**.',
    'This project uses **AgentOS for Projects**.',
    'This project uses AgentOS for Projects.',
    'This repo is part of a parent **AgentOS for Projects** workspace.',
    'This repo is part of a parent AgentOS workspace.',
    'This repo is part of a parent AgentOS for Projects workspace.',
  ];
  const idxs = markers.map((m) => content.indexOf(m)).filter((i) => i >= 0);
  const idx = idxs.length ? Math.min(...idxs) : -1;
  if (idx < 0) return `${content.trim()}\n\n---\n\n${section}`;
  const headingStart = content.lastIndexOf('#', idx);
  const prefix = headingStart > 0 ? content.slice(0, headingStart).trimEnd() + '\n\n---\n\n' : '';
  return `${prefix}${section}`;
}

function parseReposFromProjectYaml(project) {
  const data = parseProjectYaml(project);
  const repos = data.repos && typeof data.repos === 'object' ? data.repos : {};
  return Object.entries(repos).map(([name, raw]: any) => {
    const repo = raw && typeof raw === 'object' ? raw : {};
    const commands = {};
    const ports = {};
    for (const [key, value] of Object.entries(repo)) {
      if (key.endsWith('_command')) commands[key] = String(value);
      if (key === 'port' || key.endsWith('_port')) ports[key] = String(value);
    }
    return {
      name,
      path: stringValue(repo.path, '.'),
      type: stringValue(repo.type, 'unknown'),
      framework: stringValue(repo.framework, 'unknown'),
      packageManager: stringValue(repo.package_manager, 'unknown'),
      commands,
      ports,
    };
  }).filter((r) => r.path && r.path !== '.');
}

async function inferMode(cwd) {
  if (await exists(join(cwd, 'package.json')) || await exists(join(cwd, 'README.md'))) return 'existing';
  const repos = await detectRepos(cwd);
  return repos.length ? 'existing' : 'new';
}

async function detectRepos(cwd) {
  const repos = [];
  if (await exists(join(cwd, 'package.json'))) {
    repos.push(await repoInfo(cwd, '.', basename(cwd)));
  }
  let entries = [];
  try { entries = await readdir(cwd, { withFileTypes: true }); } catch { return repos; }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const packagePath = join(cwd, entry.name, 'package.json');
    if (await exists(packagePath)) repos.push(await repoInfo(join(cwd, entry.name), `./${entry.name}`, entry.name));
  }
  return repos.length ? repos : [{ name: 'app', path: '.', type: 'app', framework: 'unknown', packageManager: 'unknown' }];
}

async function repoInfo(abs: string, rel: string, name: string) {
  let pkg: any = {};
  try { pkg = JSON.parse(await readFile(join(abs, 'package.json'), 'utf8')); } catch {}
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const packageManager = await detectPackageManager(abs);
  const scripts = pkg.scripts ?? {};
  const command = (script) => scripts[script] ? `${packageManager} run ${script}` : '';
  return {
    name: classifyRepoName(name, deps),
    path: rel,
    type: classifyRepoType(name, deps),
    framework: detectFramework(deps),
    packageManager,
    buildCommand: command('build'),
    devCommand: command('dev') || command('start:dev') || command('start'),
    testCommand: command('test'),
    testE2eCommand: command('test:e2e') || command('e2e'),
    generateCommand: command('generate'),
    previewCommand: command('preview'),
  };
}

function classifyRepoName(name, deps) {
  const lower = name.toLowerCase();
  if (lower.includes('front') || lower.includes('-fe') || deps.nuxt || deps.vue || deps.react || deps.vite) return 'frontend';
  if (lower.includes('back') || lower.includes('-be') || deps['@nestjs/core'] || deps.express || deps.fastify) return 'backend';
  return safeId(name);
}

function classifyRepoType(name, deps) {
  const n = classifyRepoName(name, deps);
  if (n === 'frontend') return 'frontend';
  if (n === 'backend') return 'backend';
  return 'app';
}

function detectFramework(deps) {
  if (deps.nuxt) return 'nuxt';
  if (deps['@nestjs/core']) return 'nestjs';
  if (deps.next) return 'nextjs';
  if (deps.vue || deps.vite || deps['@vitejs/plugin-vue']) return 'vite/vue';
  if (deps.react) return 'react';
  if (deps.express) return 'express';
  return 'unknown';
}

async function detectPackageManager(abs) {
  if (await exists(join(abs, 'bun.lock')) || await exists(join(abs, 'bun.lockb'))) return 'bun';
  if (await exists(join(abs, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await exists(join(abs, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function projectYaml({ projectName, mode, workspaceKind, repos }) {
  return dumpProjectYaml({
    name: safeId(projectName),
    agentos_version: 0.1,
    mode,
    workspace_kind: workspaceKind,
    source_of_truth: '.agentos/',
    principles: [
      'One AgentOS per product/workspace.',
      'Many repos inside it.',
      'Each task declares which repo(s) are in scope.',
    ],
    repos: Object.fromEntries(repos.map((repo) => [repo.name, repoYamlObject(repo)])),
    agents: {
      frontend: 'frontend-engineer',
      backend: 'backend-engineer',
      qa: 'qa-engineer',
      review: 'code-reviewer',
      release: 'release-manager',
    },
    engines: {
      allowed: ['claude-code', 'codex', 'hermes', 'opencode', 'chatgpt'],
    },
    adapters: {
      child_repo_pointer_files: true,
      child_repo_gitignore_policy: workspaceKind === 'multi-repo' ? 'ignore' : 'none',
    },
  });
}

function repoYamlObject(r) {
  return Object.fromEntries([
    ['path', r.path],
    ['type', r.type],
    ['framework', r.framework],
    ['package_manager', r.packageManager],
    ['build_command', r.buildCommand || 'unknown'],
    ['dev_command', r.devCommand || 'unknown'],
    ['test_command', r.testCommand || 'unknown'],
    r.testE2eCommand ? ['test_e2e_command', r.testE2eCommand] : null,
    r.generateCommand ? ['generate_command', r.generateCommand] : null,
    r.previewCommand ? ['preview_command', r.previewCommand] : null,
  ].filter(Boolean));
}

function agentsBootloader({ workspaceKind, repos }) {
  return [
    '# AGENTS.md',
    '',
    'AgentOS for Projects bootloader.',
    '',
    `Workspace: ${workspaceKind}`,
    `Repos: ${repos.map((r) => `${r.name}=${r.path} (${r.type}/${r.framework}/${r.packageManager})`).join('; ') || 'none'}`,
    '',
    'Read first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, relevant `.agentos/repos/*`, `.agentos/agents/*`, `.agentos/engines/*`.',
    '',
    'Rules: declare role + repo scope before editing; edit only in scope; never touch secrets/.env/migrations/prod config without approval; do not commit/push unless explicitly asked; verify; update handoff/tasks before stopping.',
    '',
  ].join('\n');
}

function claudeAdapter() {
  return [
    '# CLAUDE.md',
    '',
    'AgentOS for Projects. Read `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, relevant `.agentos/repos/*`, `.agentos/agents/*`, and `.agentos/engines/claude-code.md` before acting.',
    '',
    'Rules: declare role + repo scope before editing; edit only in scope; backend only if in scope; no secrets/.env/migrations/prod config without approval; no commit/push unless explicitly asked; verify; update handoff/tasks before stopping.',
    '',
    'If launched from a child repo, follow pointer files back to the parent AgentOS root.',
    '',
  ].join('\n');
}

function subrepoAgentsPointer(repo) {
  return [
    '# AGENTS.md',
    '',
    `AgentOS child repo: ${repo.name} (${repo.path}).`,
    'Parent context: `../AGENTS.md`, `../.agentos/project.yaml`, `../.agentos/memory.md`, `../.agentos/handoff.md`, `../.agentos/tasks.md`, `../.agentos/knowledge.md`, relevant `../.agentos/agents/*`, `../.agentos/engines/*`, and `../.agentos/repos/' + repo.name + '.md`.',
    'Rules: do not treat this repo as the whole product; declare scope; edit only in scope; no commit/push unless asked; update parent handoff/tasks.',
    '',
  ].join('\n');
}

function subrepoClaudePointer(repo) {
  return [
    '# CLAUDE.md',
    '',
    `AgentOS child repo: ${repo.name} (${repo.path}).`,
    'Before acting read `../CLAUDE.md`, `../AGENTS.md`, `../.agentos/project.yaml`, `../.agentos/handoff.md`, `../.agentos/tasks.md`, `../.agentos/knowledge.md`, relevant `../.agentos/agents/*`, and `../.agentos/repos/' + repo.name + '.md`.',
    'Declare scope; edit only in scope; no commit/push unless asked; update parent handoff/tasks.',
    '',
  ].join('\n');
}

function hermesAdapter() {
  return [
    '# Hermes Agent Adapter',
    '',
    'AgentOS for Projects. Read `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, relevant `.agentos/repos/*` and `.agentos/agents/*` before work.',
    'Hermes rules: load relevant skills; verify real file/git/terminal/browser state; do not trust subagent reports without checking; update handoff/tasks when state changes.',
    '',
  ].join('\n');
}

function handoffMd({ mode, workspaceKind, repos }) {
  return `# Handoff\n\n## Current objective\n\n${mode === 'new' ? 'Define the project before scaffolding code.' : 'No active AgentOS task yet. Existing project imported into AgentOS.'}\n\n## Scope\n\nWorkspace kind: ${workspaceKind}\nRepos:\n${repos.map((r) => `- ${r.name}: \`${r.path}\``).join('\n')}\n\n## Current state\n\nAgentOS initialized. No implementation task is active yet.\n\n## Last completed step\n\nAgentOS context layer created.\n\n## Files changed\n\nAgentOS files only.\n\n## Tests run\n\nNot run yet.\n\n## Known failures\n\nNone recorded.\n\n## Next exact action\n\nChoose a task, declare repo scope, then select the responsible agent role and engine.\n\n## Protected files / do not touch\n\n- .env files\n- production secrets\n- database migrations unless explicitly approved\n- repos outside declared task scope\n\n## Open decisions\n\n- Confirm preferred execution engine for first task.\n`;
}

function memoryMd({ mode, workspaceKind }) {
  return `# Memory\n\nStable project facts only. Do not dump execution logs here.\n\n- AgentOS initialized in ${mode} mode.\n- Workspace kind: ${workspaceKind}.\n- Core rule: one AgentOS per product/workspace; many repos inside it; each task declares repo scope.\n`;
}
function knowledgeMd(options: any = {}) {
  const linked = options.linked || [];
  const obsidian = options.vault ? `\n## Obsidian\n\nVault: \`${options.vault}\`\nDestination: \`${options.destination}\`\nMode: \`link-only\`\n\nLinked notes:\n${linked.map((note) => `- [[${note.replace(/\.md$/, '')}]]`).join('\n') || '- None linked yet.'}\n` : '';
  return `# Knowledge\n\nLong-term knowledge links for this project.\n\nRules:\n- Do not bulk-load external vaults or folders.\n- Read only linked notes relevant to the current task.\n- Keep runtime context small; use handoff/tasks for current state.\n${obsidian}`;
}
function decisionsMd() { return '# Decisions\n\nDurable decisions go here with date, reason, alternatives, and status.\n'; }
function tasksMd({ mode }) { return `# Tasks\n\n## Now\n\n- [ ] ${mode === 'new' ? 'Define MVP scope before scaffolding code.' : 'Choose the first AgentOS-managed task.'}\n\n## Next\n\n- [ ] Run \`agentos status\` and \`agentos doctor\`.\n\n## Later\n\n- [ ] Add run logs under \`.agentos/runs/\` as work happens.\n`; }
function statusMd({ mode, workspaceKind }) { return `# Status\n\nMode: ${mode}\nWorkspace kind: ${workspaceKind}\nCurrent phase: context-layer initialized\n`; }
function productMd({ projectName }) { return `# Product\n\nProject: ${projectName}\n\n## Problem\n\nTBD\n\n## Users\n\nTBD\n\n## MVP\n\nTBD\n`; }
function architectureMd() { return '# Architecture\n\nDefine stack, boundaries, data model, and deployment before scaffolding code.\n'; }
function runsReadmeMd() { return '# Runs\n\nStore per-task briefs, results, verification logs, and diff summaries here.\n'; }

function defaultAgents() {
  return [
    { id: 'frontend-engineer', mandate: 'Own frontend implementation within declared frontend repo scope.' },
    { id: 'backend-engineer', mandate: 'Own backend implementation within declared backend repo scope.' },
    { id: 'qa-engineer', mandate: 'Verify changed behavior with real commands and browser checks when UI is touched.' },
    { id: 'code-reviewer', mandate: 'Review diffs for correctness, security, scope, and project consistency.' },
    { id: 'release-manager', mandate: 'Coordinate commit, push, merge, and release mechanics after verification and approval.' },
  ];
}
function agentMd(agent) { return `# ${title(agent.id)}\n\nMandate: ${agent.mandate}\nRules: read project/handoff/tasks first; work only in declared scope; update handoff before stopping; escalate destructive/prod/credential/cross-scope actions.\n`; }
function defaultEngines() { return ['claude-code', 'codex', 'opencode', 'hermes', 'chatgpt'].map((id) => ({ id })); }
function engineMd(engine) { return `# ${title(engine.id)} Adapter\n\nRead AGENTS.md + .agentos context first. Before stopping: handoff current state, files changed, tests, failures, next action.\n`; }
function repoMd(repo) { return `# ${title(repo.name)} Repo\n\nPath: \`${repo.path}\`; type: ${repo.type}; framework: ${repo.framework}; package manager: ${repo.packageManager}.\nCommands: dev=\`${repo.devCommand || 'unknown'}\`; build=\`${repo.buildCommand || 'unknown'}\`; test=\`${repo.testCommand || 'unknown'}\`${repo.testE2eCommand ? `; e2e=\`${repo.testE2eCommand}\`` : ''}${repo.generateCommand ? `; generate=\`${repo.generateCommand}\`` : ''}${repo.previewCommand ? `; preview=\`${repo.previewCommand}\`` : ''}.\nScope: edit only when task includes \`${repo.name}\`.\n`; }


async function ensureProjectYamlEngine(path, engine) {
  if (!await exists(path)) return;
  const content = await readFile(path, 'utf8');
  const data = parseProjectYaml(content);
  data.engines = data.engines && typeof data.engines === 'object' ? data.engines : {};
  data.engines.allowed = Array.isArray(data.engines.allowed) ? data.engines.allowed : [];
  if (!data.engines.allowed.includes(engine)) data.engines.allowed.push(engine);
  await writeFile(path, dumpProjectYaml(data), 'utf8');
}

async function createOrPatchRootFile(path, section) {
  if (!await exists(path)) return writeFile(path, section, 'utf8');
  const content = await readFile(path, 'utf8');
  if (content.includes('AgentOS for Projects')) return;
  await copyFile(path, `${path}.agentos.bak`);
  await writeFile(path, `${content.trim()}\n\n---\n\n${section}`, 'utf8');
}
async function writeIfMissing(path, content) { if (!await exists(path)) await writeFile(path, content, 'utf8'); }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function safeRead(path) { try { return await readFile(path, 'utf8'); } catch { return ''; } }
async function findAgentOSRoot(start) {
  let dir = resolve(start);
  while (true) {
    if (await exists(join(dir, '.agentos'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function normalizeEngine(engine) {
  const value = String(engine || 'generic').toLowerCase();
  if (['claude', 'claude-code', 'claudecode'].includes(value)) return 'claude-code';
  if (['codex', 'openai-codex'].includes(value)) return 'codex';
  if (['opencode', 'open-code'].includes(value)) return 'opencode';
  if (['hermes', 'hermes-agent'].includes(value)) return 'hermes';
  return value === 'generic' ? 'generic' : value;
}

function renderEnginePrompt({ engine, root, project, handoff, tasks }) {
  const projectName = firstYamlValue(project, 'name') ?? basename(root);
  const workspaceKind = firstYamlValue(project, 'workspace_kind') ?? 'unknown';
  const currentObjective = extractSection(handoff, 'Current objective') || '(none)';
  const now = extractSection(tasks, 'Now') || '(none)';
  return [
    'Follow AgentOS for Projects.',
    `Project: ${projectName}; root: ${root}; kind: ${workspaceKind}; engine: ${engine}.`,
    `Read: AGENTS.md; ${engineAdapterLine(engine)}; .agentos/project.yaml; memory.md; handoff.md; tasks.md; relevant repos/*, agents/*, engines/*.`,
    'Rules: declare role + scope before editing; edit only in scope; no secrets/.env/migrations/prod config without approval; no commit/push unless asked; verify; update handoff/tasks if state changes.',
    ...engineSpecificRules(engine),
    `Current objective: ${oneLine(currentObjective)}`,
    `Now: ${oneLine(now)}`,
    'If a user task is included, perform only that task under these rules; otherwise wait for the task.',
  ].join('\n');
}

function engineAdapterLine(engine) {
  if (engine === 'claude-code') return 'CLAUDE.md + engines/claude-code.md';
  if (engine === 'codex') return 'engines/codex.md';
  if (engine === 'opencode') return 'engines/opencode.md';
  if (engine === 'hermes') return '.hermes.md + engines/hermes.md';
  return 'matching engines/<engine>.md if present';
}

function engineSpecificRules(engine) {
  if (engine === 'opencode') return [
    `- OpenCode read-only smoke tests must not modify files; report if you cannot access required files.`,
    `- Keep output concise: role, scope, files read, current task, and whether any files changed.`,
  ];
  if (engine === 'codex') return [
    `- Codex must explicitly list files it read before recommending edits.`,
  ];
  if (engine === 'claude-code') return [
    `- Claude Code should follow \`CLAUDE.md\` as the bootloader and still verify ground truth before reporting success.`,
  ];
  if (engine === 'hermes') return [
    `- Hermes should load relevant skills before coding/review/verification work.`,
  ];
  return [];
}


function renderCompactHandoff(handoff, tasks) {
  const currentObjective = extractSection(handoff, 'Current objective') || firstUncheckedTask(tasks) || 'No active objective recorded.';
  const scope = extractSection(handoff, 'Scope') || 'Use `.agentos/project.yaml` for workspace/repo scope. Declare task repo scope before editing.';
  const currentState = extractSection(handoff, 'Current state') || 'See `.agentos/tasks.md` for current task state.';
  const lastCompleted = extractSection(handoff, 'Last completed step') || latestCheckedTask(tasks) || 'No completed step recorded.';
  const filesChanged = extractSection(handoff, 'Files changed') || 'No file-change summary recorded.';
  const testsRun = extractSection(handoff, 'Tests run') || 'No verification recorded.';
  const known = extractSection(handoff, 'Known failures') || extractSection(handoff, 'Known warnings') || 'None recorded.';
  const nextAction = extractSection(handoff, 'Next exact action') || firstUncheckedTask(tasks) || 'Choose the next AgentOS-managed task.';
  const openDecisions = extractSection(handoff, 'Open decisions') || '- None recorded.';
  return `# Handoff

## Current objective

${trimSection(currentObjective)}

## Scope

${trimSection(scope)}

## Current state

${trimSection(currentState)}

## Last completed step

${trimSection(lastCompleted)}

## Files changed

${trimSection(filesChanged)}

## Tests run

${trimSection(testsRun)}

## Known warnings / failures

${trimSection(known)}

## Next exact action

${trimSection(nextAction)}

## Open decisions

${trimSection(openDecisions)}
`;
}

function renderCompactTasks(tasks, handoff) {
  const done = uniqueTaskLines(extractSection(tasks, 'Done')).filter(isCheckedTask).slice(-12);
  const nowCandidates = uniqueTaskLines(extractSection(tasks, 'Now')).filter(isUncheckedTask);
  const nextCandidates = uniqueTaskLines(extractSection(tasks, 'Next')).filter(isUncheckedTask);
  const laterCandidates = uniqueTaskLines(extractSection(tasks, 'Later')).filter(isUncheckedTask);
  const fallbackNow = firstUncheckedTask(tasks) || extractSection(handoff, 'Next exact action') || 'Choose the next AgentOS-managed task.';
  const now = nowCandidates[0] || checkboxLine(fallbackNow);
  const next = nextCandidates.filter((line) => line !== now).slice(0, 8);
  const later = laterCandidates.filter((line) => line !== now && !next.includes(line)).slice(0, 8);
  return `# Tasks

## Done

${done.length ? done.join('\n') : '- [x] AgentOS context initialized.'}

## Now

${now}

## Next

${next.length ? next.join('\n') : '- [ ] Run `agentos doctor` before the next handoff.'}

## Later

${later.length ? later.join('\n') : '- [ ] Add more AgentOS improvements as needed.'}
`;
}

function renderCompactArchive({ oldHandoff, oldTasks, compactHandoff, compactTasks }) {
  return `# AgentOS Compact Archive

Created: ${new Date().toISOString()}

This archive preserves pre-compaction live state. The live files were rewritten deterministically; no LLM summarization was used.

## Previous handoff.md

${oldHandoff.trim() || '(empty)'}

## Previous tasks.md

${oldTasks.trim() || '(empty)'}

## Compact handoff.md written

${compactHandoff.trim()}

## Compact tasks.md written

${compactTasks.trim()}
`;
}

function uniqueTaskLines(section) {
  const seen = new Set();
  const lines = String(section || '').split(/\r?\n/).map((line) => line.trim()).filter((line) => /^- \[[ xX]\]/.test(line));
  const result = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }
  return result;
}
function isCheckedTask(line) { return /^- \[[xX]\]/.test(line); }
function isUncheckedTask(line) { return /^- \[ \]/.test(line); }
function firstUncheckedTask(text) { return uniqueTaskLines(text).find(isUncheckedTask); }
function latestCheckedTask(text) { return uniqueTaskLines(text).filter(isCheckedTask).pop(); }
function checkboxLine(text) {
  const line = oneLine(String(text).replace(/^- \[[ xX]\]\s*/, ''), 180) || 'Choose the next AgentOS-managed task.';
  return `- [ ] ${line}`;
}
function trimSection(text, max = 1600) {
  const value = String(text || '').trim() || '- Not recorded.';
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}
function timestampForFilename(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}


function defaultObsidianNotes(destination, projectName) {
  const base = normalizeVaultRelativePath(destination);
  return [
    `${base}/${title(projectName)} Overview.md`,
    `${base}/${title(projectName)} Architecture.md`,
    `${base}/${title(projectName)} Decisions.md`,
    `${base}/${title(projectName)} Roadmap.md`,
  ];
}

function normalizeVaultRelativePath(value) {
  return String(value || '').replace(/^['"]|['"]$/g, '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/g, '');
}

function obsidianNoteTemplate(note, projectName, linked) {
  const titleText = basename(note, '.md');
  const isOverview = /overview/i.test(titleText);
  const body = isOverview
    ? `## Purpose\n\nLong-term knowledge for ${projectName}.\n\n## Key links\n\n${linked.filter((n) => n !== note).map((n) => `- [[${n.replace(/\.md$/, '')}]]`).join('\n')}`
    : `## Notes\n\nAdd durable knowledge here. Keep execution logs in AgentOS runs/handoff, not this note.\n`;
  return `# ${titleText}\n\n${body}\n`;
}

function ensureObsidianProjectConfig(project, { vault, destination, linked }) {
  const data = parseProjectYaml(project);
  data.knowledge = data.knowledge && typeof data.knowledge === 'object' ? data.knowledge : {};
  data.knowledge.obsidian = {
    mode: 'link-only',
    vault,
    destination,
    linked,
  };
  return dumpProjectYaml(data);
}

function firstYamlValue(text, key) {
  const value = parseProjectYaml(text)[key];
  return value === undefined || value === null ? undefined : String(value);
}

function parseProjectYaml(text) {
  try {
    const parsed = parseYaml(String(text || ''));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function dumpProjectYaml(data) {
  return stringifyYaml(data, { indent: 2, lineWidth: 0 }).replace(/\n*$/, '\n');
}

function stringValue(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}
function extractSection(text, heading) {
  const re = new RegExp(`## ${escapeRegex(heading)}\\n\\n([\\s\\S]*?)(?=\\n## |$)`);
  return text.match(re)?.[1]?.trim();
}
function oneLine(text, max = 700) {
  const compact = String(text).replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function safeId(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'; }
function title(s) { return s.split('-').map((p) => p[0]?.toUpperCase() + p.slice(1)).join(' '); }
function plannedFiles(mode, workspaceKind, repos) { return ['.agentos/project.yaml', '.agentos/memory.md', '.agentos/handoff.md', '.agentos/tasks.md', 'AGENTS.md', 'CLAUDE.md']; }
function renderDryRun({ cwd, mode, workspaceKind, repos }) {
  return `AgentOS dry run\nRoot: ${cwd}\nMode: ${mode}\nWorkspace: ${workspaceKind}\nRepos:\n${repos.map((r) => `- ${r.name}: ${r.path}`).join('\n')}\nWould create/patch AgentOS context files. App source files would not be touched.`;
}
