#!/usr/bin/env node
// Engine-invoked workspace mapping setup. No vault or user engine configuration writes.
import { parseArgs } from 'node:util';
import { setupSharedMemoryAgentOS } from '../dist/core.js';

try {
  const { values } = parseArgs({ options: {
    'project-id': { type: 'string' }, 'store-id': { type: 'string' },
    connection: { type: 'string', default: 'obsidian-brain' },
    'brain-root': { type: 'string' }, 'documents-root': { type: 'string' },
    cwd: { type: 'string' }, apply: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  }, allowPositionals: false });
  if (values.help) {
    console.log('Usage: node <agentos-package>/scripts/setup-shared-memory.mjs --project-id <stable-id> --store-id <logical-label> --brain-root <Brain/Projects/folder> --documents-root <Projects/folder> [--connection obsidian-brain] [--cwd <workspace>] [--apply]\nPreview by default. Reuse the verified registry mapping. Only project.yaml is changed; no vault discovery or MCP connection test is performed.');
  } else {
    const result = await setupSharedMemoryAgentOS({ cwd: values.cwd, apply: values.apply, config: {
      contract_version: 1, provider: 'unified-brain', project_id: values['project-id'],
      store_id: values['store-id'], connection: values.connection,
      brain_root: values['brain-root'], documents_root: values['documents-root'],
    } });
    console.log(result.text);
    if (!result.ok) process.exitCode = 1;
  }
} catch (error) { console.error(`Shared memory setup: ${error.message}`); process.exitCode = 1; }
