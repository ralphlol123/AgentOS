import { get as httpGet, type ClientRequest } from 'node:http';
import { get as httpsGet } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export interface ImportSource { source: string; content: string; sha256: string }
export interface FetchLimits { timeoutMs?: number; maxRedirects?: number; maxBytes?: number }
export async function fetchTemplateText(source: string, limits: FetchLimits = {}): Promise<string> {
  const deadline = Date.now() + (limits.timeoutMs ?? 15000), maxRedirects = limits.maxRedirects ?? 5, maxBytes = limits.maxBytes ?? 100000;
  async function request(url: URL, hops: number): Promise<string> {
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Template URLs must use HTTP or HTTPS.');
    if (url.username || url.password) throw new Error('Credentials in template URLs are not supported.');
    if (hops > maxRedirects) throw new Error(`Template redirect limit exceeded (${maxRedirects}).`);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Template fetch deadline exceeded.');
    const response = await new Promise<{ body?: string; redirect?: string }>((resolvePromise, reject) => {
      let req: ClientRequest;
      const timer = setTimeout(() => { reject(new Error('Template fetch deadline exceeded.')); req?.destroy(); }, remaining);
      req = (url.protocol === 'https:' ? httpsGet : httpGet)(url, { headers: { 'User-Agent': 'agentos-for-projects' } }, res => {
        res.on('error', reject);
        res.on('aborted', () => reject(new Error('Template response aborted.')));
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirect = res.headers.location;
          // Settle before destroying so an intentional abort cannot reject a valid redirect.
          resolvePromise({ redirect }); clearTimeout(timer); res.destroy(); return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} fetching template.`)); clearTimeout(timer); res.destroy(); return; }
        const chunks: Buffer[] = []; let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > maxBytes) { reject(new Error(`Imported template is too large (>${maxBytes} bytes).`)); clearTimeout(timer); res.destroy(); req.destroy(); } else chunks.push(chunk);
        });
        res.on('end', () => {
          clearTimeout(timer);
          try { resolvePromise({ body: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) }); }
          catch { reject(new Error('Template is not valid UTF-8.')); }
        });
        res.on('close', () => clearTimeout(timer));
      });
      req.on('error', error => { clearTimeout(timer); reject(error); });
    });
    if (response.redirect) {
      const next = new URL(response.redirect, url);
      if (url.protocol === 'https:' && next.protocol !== 'https:') throw new Error('Refusing HTTPS template redirect downgrade.');
      return request(next, hops + 1);
    }
    return response.body ?? '';
  }
  return request(new URL(source), 0);
}
export async function readImportSource(source: string): Promise<ImportSource> {
  let content: string;
  if (/^https?:\/\//i.test(source)) content = await fetchTemplateText(source);
  else {
    const path = resolve(source);
    if ((await stat(path)).size > 100000) throw new Error('Imported template is too large (>100000 bytes).');
    content = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path));
  }
  if (Buffer.byteLength(content) > 100000) throw new Error('Imported template is too large (>100000 bytes).');
  return { source, content, sha256: createHash('sha256').update(content).digest('hex') };
}
