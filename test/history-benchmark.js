// Advisory benchmark; no timing thresholds in CI. Always uses a disposable fixture.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { initAgentOS } from '../dist/core.js';
const root = await mkdtemp(join(tmpdir(), 'agentos-history-benchmark-'));
try {
  await initAgentOS({ cwd: root, mode: 'new' });
  const sample = 'historical context\n'.repeat(6000);
  for (let i = 0; i < 500; i++) await writeFile(join(root, '.agentos/runs', `history-${i}.md`), sample);
  const before = process.memoryUsage(), start = performance.now();
  await initAgentOS({ cwd: root });
  const after = process.memoryUsage();
  console.log(JSON.stringify({ files: 500, historyBytes: Buffer.byteLength(sample) * 500, reinitMs: Math.round(performance.now() - start), rssDeltaBytes: after.rss - before.rss, heapDeltaBytes: after.heapUsed - before.heapUsed }));
} finally { await rm(root, { recursive: true, force: true }); }
